import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { app } from "../src/app.js";
import { deleteItemImage } from "../src/config/uploads.js";
import { env } from "../src/config/env.js";
import { AuditLog } from "../src/models/AuditLog.js";
import { Claim } from "../src/models/Claim.js";
import { Item } from "../src/models/Item.js";
import { Notification } from "../src/models/Notification.js";
import { Report } from "../src/models/Report.js";
import { Session } from "../src/models/Session.js";
import { User } from "../src/models/User.js";
import { MIN_POSSIBLE_MATCH_SCORE, scoreMatch } from "../src/utils/match-scoring.js";

let apiBase;
let server;
const userIds = [];

async function request(path, { method = "GET", body, cookie, formData, origin = env.CLIENT_ORIGIN, skipOrigin = false } = {}) {
  const headers = {};
  if (!skipOrigin) headers.origin = origin;
  if (body !== undefined) headers["content-type"] = "application/json";
  if (cookie) headers.cookie = cookie;
  const response = await fetch(`${apiBase}${path}`, {
    method,
    headers,
    ...(formData ? { body: formData } : body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const data = response.status === 204 ? undefined : await response.json();
  return { response, data };
}

async function createTestUser(email, role = "student") {
  const user = await User.create({
    name: "Temporary Listing Check",
    email,
    passwordHash: await bcrypt.hash("temporary-check-password-123", 4),
    role,
    emailVerifiedAt: new Date(),
  });
  userIds.push(user._id);
  const session = await Session.create({
    userId: user._id,
    refreshTokenHash: createHash("sha256").update(randomBytes(48)).digest("hex"),
    expiresAt: new Date(Date.now() + 10 * 60_000),
  });
  const token = jwt.sign({ sid: String(session._id), role: user.role }, env.JWT_SECRET, {
    subject: String(user._id),
    expiresIn: "10m",
    issuer: "campusfind-api",
    audience: "campusfind-web",
  });
  return `campusfind_access=${token}`;
}

async function createListing(cookie, type, name) {
  const body = {
    name,
    category: "Other",
    description: "Temporary integration check listing. It is deleted automatically.",
    location: "Library",
    itemDate: "2000-01-01",
    privateContact: "Temporary private contact",
    ...(type === "found" ? { verificationQuestion: "What test word was used?" } : {}),
  };
  const { response, data } = await request(`/items/${type}`, { method: "POST", body, cookie });
  assert.equal(response.status, 201, data?.error?.code ?? `${type} listing creation failed`);
  return data.item;
}

try {
  const matchTarget = { name: "Black leather wallet", category: "Wallet", description: "Slim leather wallet found near the library", location: "Library", itemDate: "2026-11-24" };
  const likelyMatch = { name: "Leather wallet", category: "Wallet", description: "Black slim wallet located by library entrance", location: "Library Entrance", itemDate: "2026-11-25" };
  const clearMismatch = { name: "USB charger", category: "Charger", description: "White charger at sports field", location: "Sports Ground", itemDate: "2026-10-01" };
  assert.ok(scoreMatch(matchTarget, likelyMatch).score >= MIN_POSSIBLE_MATCH_SCORE);
  assert.ok(scoreMatch(matchTarget, clearMismatch).score < MIN_POSSIBLE_MATCH_SCORE);

  assert.ok(env.MONGODB_URI, "MONGODB_URI is required for this integration check");
  await mongoose.connect(env.MONGODB_URI, { dbName: env.MONGODB_DB, serverSelectionTimeoutMS: 10_000 });
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  apiBase = `http://127.0.0.1:${server.address().port}/api/v1`;

  const testMarker = randomUUID();
  if (!env.EMAIL_VERIFICATION_REQUIRED) {
    const domain = env.COLLEGE_EMAIL_DOMAINS.split(",").map((value) => value.trim()).filter(Boolean)[0] ?? "example.test";
    const email = `campusfind-auth-${testMarker}@${domain}`;
    const password = "temporary-integration-password-123";
    const invalidEmail = await request("/auth/register", {
      method: "POST", body: { name: "Temporary Auth Check", email: "not-an-email", password, role: "student" },
    });
    assert.equal(invalidEmail.response.status, 400);
    const registration = await request("/auth/register", {
      method: "POST", body: { name: "Temporary Auth Check", email, password, role: "student" },
    });
    assert.equal(registration.response.status, 201, registration.data?.error?.code ?? "registration failed");
    assert.equal(Object.hasOwn(registration.data.user, "passwordHash"), false);
    const registrationCookie = registration.response.headers.getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ");
    assert.match(registrationCookie, /campusfind_access=/);
    assert.match(registrationCookie, /campusfind_refresh=/);
    const registrationSession = await request("/auth/me", { cookie: registrationCookie });
    assert.equal(registrationSession.response.status, 200);
    assert.equal(registrationSession.data.user.id, registration.data.user.id);
    userIds.push(new mongoose.Types.ObjectId(registration.data.user.id));
    const registeredUser = await User.findById(registration.data.user.id).select("+passwordHash");
    assert.ok(registeredUser.passwordHash.startsWith("$2"));
    assert.notEqual(registeredUser.passwordHash, password);
    const duplicateRegistration = await request("/auth/register", {
      method: "POST", body: { name: "Temporary Auth Check", email, password, role: "student" },
    });
    assert.equal(duplicateRegistration.response.status, 409);
    const wrongPassword = await request("/auth/login", { method: "POST", body: { email, password: "incorrect-password" } });
    assert.equal(wrongPassword.response.status, 401);
    const login = await request("/auth/login", { method: "POST", body: { email, password } });
    assert.equal(login.response.status, 200, login.data?.error?.code ?? "login failed");
    const originalCookies = login.response.headers.getSetCookie();
    assert.ok(originalCookies.every((value) => /HttpOnly/i.test(value)));
    if (env.NODE_ENV === "production") assert.ok(originalCookies.every((value) => /Secure/i.test(value) && /SameSite=None/i.test(value)));
    else assert.ok(originalCookies.every((value) => /SameSite=Lax/i.test(value)));
    const authCookie = originalCookies.map((value) => value.split(";", 1)[0]).join("; ");
    assert.ok(authCookie.includes("campusfind_access="));
    const currentUser = await request("/auth/me", { cookie: authCookie });
    assert.equal(currentUser.response.status, 200);
    assert.equal(currentUser.data.user.email, email);
    const refreshed = await request("/auth/refresh", { method: "POST", cookie: authCookie });
    assert.equal(refreshed.response.status, 200);
    const rotatedCookie = refreshed.response.headers.getSetCookie().map((value) => value.split(";", 1)[0]).join("; ");
    assert.ok(rotatedCookie.includes("campusfind_refresh="));
    assert.equal((await request("/auth/refresh", { method: "POST", cookie: authCookie })).response.status, 401, "old refresh token must not be reusable");
    assert.equal((await request("/auth/logout", { method: "POST", cookie: rotatedCookie })).response.status, 204);
    assert.equal((await request("/auth/me", { cookie: rotatedCookie })).response.status, 401);
  }

  const ownerCookie = await createTestUser(`campusfind-owner-${testMarker}@example.com`);
  const otherCookie = await createTestUser(`campusfind-other-${testMarker}@example.com`);
  const thirdCookie = await createTestUser(`campusfind-third-${testMarker}@example.com`);
  const adminCookie = await createTestUser(`campusfind-admin-${testMarker}@example.com`, "admin");

  const lost = await createListing(ownerCookie, "lost", `Temporary lost item ${testMarker}`);
  const found = await createListing(ownerCookie, "found", `Temporary found item ${testMarker}`);
  const foundForCancel = await createListing(ownerCookie, "found", `Temporary cancel item ${testMarker}`);

  assert.equal((await request("/items/mine")).response.status, 401);
  const invalidListing = await request("/items/lost", {
    method: "POST", cookie: ownerCookie,
    body: { name: "Invalid listing", category: "Not a category", description: "Bad category", location: "Library", itemDate: "2026-11-25", privateContact: "owner@example.test" },
  });
  assert.equal(invalidListing.response.status, 400);
  const missingOriginCreate = await request("/items/lost", {
    method: "POST", cookie: ownerCookie, skipOrigin: true,
    body: { name: "Origin check", category: "Other", description: "Missing origin", location: "Library", itemDate: "2026-11-25", privateContact: "owner@example.test" },
  });
  assert.equal(missingOriginCreate.response.status, 403);
  assert.equal(missingOriginCreate.data.error.code, "CSRF_ORIGIN_REJECTED");
  const strangerUpdate = await request(`/items/${lost.id}`, {
    method: "PATCH", cookie: otherCookie, body: { name: "Unauthorized update" },
  });
  assert.equal(strangerUpdate.response.status, 403);
  const badImageTypeForm = new FormData();
  badImageTypeForm.set("name", "Invalid image type");
  badImageTypeForm.set("category", "Other");
  badImageTypeForm.set("description", "Test image rejection");
  badImageTypeForm.set("location", "Library");
  badImageTypeForm.set("itemDate", "2026-11-25");
  badImageTypeForm.set("privateContact", "owner@example.test");
  badImageTypeForm.set("image", new Blob(["not an image"], { type: "text/plain" }), "not-image.txt");
  const badImageType = await request("/items/lost", { method: "POST", cookie: ownerCookie, formData: badImageTypeForm });
  assert.equal(badImageType.response.status, 400);
  assert.equal(badImageType.data.error.code, "INVALID_IMAGE_TYPE");
  const badImageContentForm = new FormData();
  for (const [key, value] of Object.entries({ name: "Invalid image content", category: "Other", description: "Test image rejection", location: "Library", itemDate: "2026-11-25", privateContact: "owner@example.test" })) badImageContentForm.set(key, value);
  badImageContentForm.set("image", new Blob(["not a png"], { type: "image/png" }), "not-image.png");
  const badImageContent = await request("/items/lost", { method: "POST", cookie: ownerCookie, formData: badImageContentForm });
  assert.equal(badImageContent.response.status, 400);
  assert.equal(badImageContent.data.error.code, "INVALID_IMAGE_CONTENT");
  const imageTooLargeForm = new FormData();
  for (const [key, value] of Object.entries({ name: "Oversized image", category: "Other", description: "Test image rejection", location: "Library", itemDate: "2026-11-25", privateContact: "owner@example.test" })) imageTooLargeForm.set(key, value);
  imageTooLargeForm.set("image", new Blob([new Uint8Array(5 * 1024 * 1024 + 1)], { type: "image/png" }), "large.png");
  const imageTooLarge = await request("/items/lost", { method: "POST", cookie: ownerCookie, formData: imageTooLargeForm });
  assert.equal(imageTooLarge.response.status, 413);
  const validPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXioAAAAASUVORK5CYII=", "base64");
  const uploadForm = new FormData();
  for (const [key, value] of Object.entries({ name: "Local upload check", category: "Other", description: "Verifies local photo storage", location: "Library", itemDate: "2026-11-25", privateContact: "owner@example.test" })) uploadForm.set(key, value);
  uploadForm.set("image", new Blob([validPng], { type: "image/png" }), "pixel.png");
  const uploaded = await request("/items/lost", { method: "POST", cookie: ownerCookie, formData: uploadForm });
  assert.equal(uploaded.response.status, 201, uploaded.data?.error?.code ?? "local image upload failed");
  const uploadedItemId = uploaded.data.item.id;
  const firstImageUrl = uploaded.data.item.image;
  assert.match(firstImageUrl, /^\/uploads\/[0-9a-f-]{36}\.png$/i);
  const apiOrigin = apiBase.replace(/\/api\/v1$/, "");
  const firstImageResponse = await fetch(`${apiOrigin}${firstImageUrl}`);
  assert.equal(firstImageResponse.status, 200);
  assert.match(firstImageResponse.headers.get("content-type"), /^image\/png/);
  assert.deepEqual(Buffer.from(await firstImageResponse.arrayBuffer()), validPng);

  const replacementForm = new FormData();
  replacementForm.set("name", "Local upload check updated");
  replacementForm.set("image", new Blob([validPng], { type: "image/png" }), "replacement.png");
  const replaced = await request(`/items/${uploadedItemId}`, { method: "PATCH", cookie: ownerCookie, formData: replacementForm });
  assert.equal(replaced.response.status, 200);
  assert.notEqual(replaced.data.item.image, firstImageUrl);
  assert.equal((await fetch(`${apiOrigin}${firstImageUrl}`)).status, 404);

  const removeImageForm = new FormData();
  removeImageForm.set("removeImage", "true");
  const imageRemoved = await request(`/items/${uploadedItemId}`, { method: "PATCH", cookie: ownerCookie, formData: removeImageForm });
  assert.equal(imageRemoved.response.status, 200);
  assert.equal(imageRemoved.data.item.image, undefined);
  assert.equal((await fetch(`${apiOrigin}${replaced.data.item.image}`)).status, 404);

  const publicLost = await request(`/items/${lost.id}`);
  assert.equal(publicLost.response.status, 200);
  assert.equal(Object.hasOwn(publicLost.data.item, "contact"), false);
  assert.equal(Object.hasOwn(publicLost.data.item, "verificationQuestion"), false);
  assert.equal(Object.hasOwn(publicLost.data.item, "reporterId"), false);

  const ownerFound = await request(`/items/${found.id}`, { cookie: ownerCookie });
  assert.equal(ownerFound.response.status, 200);
  assert.equal(ownerFound.data.item.contact, "Temporary private contact");
  assert.equal(ownerFound.data.item.verificationQuestion, "What test word was used?");

  const ownerItems = await request("/items/mine", { cookie: ownerCookie });
  assert.equal(ownerItems.response.status, 200);
  assert.equal(ownerItems.data.items.length, 4);
  assert.ok(ownerItems.data.items.every((item) => item.mine));

  const publicItems = await request(`/items?type=lost&q=${encodeURIComponent(testMarker)}&limit=100`);
  assert.ok(publicItems.data.items.some((item) => item.id === lost.id));
  assert.ok(publicItems.data.items.every((item) => !Object.hasOwn(item, "contact")));
  const categoryFilter = await request(`/items?type=lost&category=Other&q=${encodeURIComponent(testMarker)}&limit=100`);
  assert.ok(categoryFilter.data.items.some((item) => item.id === lost.id));
  const emptyResults = await request(`/items?q=${encodeURIComponent(`no-result-${testMarker}`)}`);
  assert.equal(emptyResults.data.items.length, 0);
  assert.equal(emptyResults.data.pagination.total, 0);
  const escapedRegex = await request("/items?q=%2E%2A");
  assert.equal(escapedRegex.data.pagination.total, 0, "search input must be treated as literal text, not regex syntax");
  const firstPage = await request(`/items?q=${encodeURIComponent(testMarker)}&limit=1&page=1`);
  const secondPage = await request(`/items?q=${encodeURIComponent(testMarker)}&limit=1&page=2`);
  assert.ok(firstPage.data.pagination.pages >= 3);
  assert.equal(firstPage.data.items.length, 1);
  assert.equal(secondPage.data.items.length, 1);
  assert.notEqual(firstPage.data.items[0].id, secondPage.data.items[0].id);

  const byLocation = await request(`/items?q=${encodeURIComponent("Library")}&category=Other&location=Library&from=${lost.date}&to=${lost.date}&status=open&limit=100`);
  assert.ok(byLocation.data.items.some((item) => item.id === lost.id), "category/location/date filters did not find the listing");
  assert.ok(byLocation.data.pagination.total >= 2);
  assert.ok(byLocation.data.items.length <= byLocation.data.pagination.limit);
  const invalidRange = await request("/items?from=2026-12-31&to=2026-01-01");
  assert.equal(invalidRange.response.status, 400);

  const possibleMatches = await request(`/items/${lost.id}/matches`);
  assert.equal(possibleMatches.response.status, 200);
  const foundMatch = possibleMatches.data.matches.find((match) => match.item.id === found.id);
  assert.ok(foundMatch, "same-category, same-location, same-date opposite listing was not matched");
  assert.ok(foundMatch.score >= 25);
  assert.ok(foundMatch.reasons.includes("Same category"));
  assert.equal(Object.hasOwn(foundMatch.item, "contact"), false);

  const publicFound = await request(`/items/${found.id}`);
  assert.equal(Object.hasOwn(publicFound.data.item, "verificationQuestion"), false);
  const unauthenticatedPrompt = await request(`/items/${found.id}/claim-prompt`);
  assert.equal(unauthenticatedPrompt.response.status, 401);
  const prompt = await request(`/items/${found.id}/claim-prompt`, { cookie: otherCookie });
  assert.equal(prompt.response.status, 200);
  assert.equal(prompt.data.prompt, "What test word was used?");

  const submitted = await request(`/items/${found.id}/claims`, {
    method: "POST",
    cookie: otherCookie,
    body: { contact: "claimant@example.test", answer: `Private answer ${testMarker}`, message: "I can verify this item." },
  });
  assert.equal(submitted.response.status, 201);
  const claimId = submitted.data.claim.id;
  assert.equal(submitted.data.claim.answer, `Private answer ${testMarker}`);
  assert.equal(Object.hasOwn(submitted.data.claim, "ownerContact"), false);
  const claimNotification = await request("/notifications", { cookie: ownerCookie });
  const ownerNotice = claimNotification.data.notifications.find((notification) => notification.claimId === claimId);
  assert.ok(ownerNotice);
  assert.equal(ownerNotice.read, false);
  const markReadByOther = await request(`/notifications/${ownerNotice.id}/read`, { method: "PATCH", cookie: otherCookie });
  assert.equal(markReadByOther.response.status, 404);
  const markRead = await request(`/notifications/${ownerNotice.id}/read`, { method: "PATCH", cookie: ownerCookie });
  assert.equal(markRead.response.status, 200);
  assert.equal(markRead.data.notification.read, true);
  const receivedPending = await request("/claims/received", { cookie: ownerCookie });
  const ownerPendingClaim = receivedPending.data.claims.find((claim) => claim.id === claimId);
  assert.equal(receivedPending.data.pagination.page, 1);
  const claimPage = await request("/claims/received?page=1&limit=1", { cookie: ownerCookie });
  assert.equal(claimPage.response.status, 200);
  assert.equal(claimPage.data.claims.length, 1);
  assert.equal(claimPage.data.pagination.limit, 1);
  assert.equal((await request("/claims/received?page=1&limit=101", { cookie: ownerCookie })).response.status, 400);
  assert.equal(ownerPendingClaim.answer, `Private answer ${testMarker}`);
  assert.equal(Object.hasOwn(ownerPendingClaim, "contact"), false);
  const claimantClaims = await request("/claims/submitted", { cookie: otherCookie });
  assert.ok(claimantClaims.data.claims.some((claim) => claim.id === claimId));
  const claimantCannotApprove = await request(`/claims/${claimId}/decision`, {
    method: "PATCH", cookie: otherCookie, body: { action: "approve" },
  });
  assert.equal(claimantCannotApprove.response.status, 403);
  const strangerCannotApprove = await request(`/claims/${claimId}/decision`, {
    method: "PATCH", cookie: thirdCookie, body: { action: "approve" },
  });
  assert.equal(strangerCannotApprove.response.status, 403);

  const secondClaim = await request(`/items/${found.id}/claims`, {
    method: "POST", cookie: thirdCookie, body: { contact: "third@example.test", answer: "Another private answer" },
  });
  assert.equal(secondClaim.response.status, 201);
  const approved = await request(`/claims/${claimId}/decision`, {
    method: "PATCH", cookie: ownerCookie, body: { action: "approve", note: "Answer matched." },
  });
  assert.equal(approved.response.status, 200);
  assert.equal(approved.data.claim.status, "approved");
  assert.equal(approved.data.claim.contact, "claimant@example.test");
  const winnerView = await request("/claims/submitted", { cookie: otherCookie });
  assert.equal(winnerView.data.claims.find((claim) => claim.id === claimId).ownerContact, "Temporary private contact");
  const loserView = await request("/claims/submitted", { cookie: thirdCookie });
  assert.equal(loserView.data.claims.find((claim) => claim.id === secondClaim.data.claim.id).status, "rejected");
  const claimedItem = await request(`/items/${found.id}`);
  assert.equal(claimedItem.data.item.status, "pending");
  const reopenClaimedItem = await request(`/items/${found.id}`, { method: "PATCH", cookie: ownerCookie, body: { status: "open" } });
  assert.equal(reopenClaimedItem.response.status, 409);
  const lateClaim = await request(`/items/${found.id}/claims`, {
    method: "POST", cookie: otherCookie, body: { contact: "claimant@example.test", answer: "Too late" },
  });
  assert.equal(lateClaim.response.status, 409);
  const completed = await request(`/claims/${claimId}/complete`, { method: "POST", cookie: ownerCookie });
  assert.equal(completed.response.status, 200);
  assert.equal(completed.data.claim.status, "completed");
  const returnedItem = await request(`/items/${found.id}`);
  assert.equal(returnedItem.data.item.status, "returned");
  const reopenReturnedItem = await request(`/items/${found.id}`, { method: "PATCH", cookie: ownerCookie, body: { status: "open" } });
  assert.equal(reopenReturnedItem.response.status, 409);

  const cancellable = await request(`/items/${foundForCancel.id}/claims`, {
    method: "POST", cookie: otherCookie, body: { contact: "claimant@example.test", answer: "Private cancel answer" },
  });
  assert.equal(cancellable.response.status, 201);
  const cancelled = await request(`/claims/${cancellable.data.claim.id}/cancel`, { method: "POST", cookie: otherCookie });
  assert.equal(cancelled.response.status, 200);
  assert.equal(cancelled.data.claim.status, "cancelled");
  const rejectedRequest = await request(`/items/${foundForCancel.id}/claims`, {
    method: "POST", cookie: thirdCookie, body: { contact: "third@example.test", answer: "Private reject answer" },
  });
  assert.equal(rejectedRequest.response.status, 201);
  const rejected = await request(`/claims/${rejectedRequest.data.claim.id}/decision`, {
    method: "PATCH", cookie: ownerCookie, body: { action: "reject", note: "Details did not match." },
  });
  assert.equal(rejected.response.status, 200);
  assert.equal(rejected.data.claim.status, "rejected");

  const returnedNotification = await request("/notifications", { cookie: otherCookie });
  assert.ok(returnedNotification.data.notifications.some((notification) => notification.type === "item_returned" && notification.claimId === claimId));

  const moderationItem = await createListing(ownerCookie, "lost", `Temporary moderation item ${testMarker}`);
  const report = await request(`/items/${moderationItem.id}/reports`, {
    method: "POST", cookie: otherCookie, body: { reason: "inappropriate", details: "Temporary integration report." },
  });
  assert.equal(report.response.status, 201);
  const duplicateReport = await request(`/items/${moderationItem.id}/reports`, {
    method: "POST", cookie: otherCookie, body: { reason: "other" },
  });
  assert.equal(duplicateReport.response.status, 409);

  assert.equal((await request("/admin/overview")).response.status, 401);
  assert.equal((await request("/admin/overview", { cookie: ownerCookie })).response.status, 403);
  const ownerPayload = jwt.decode(ownerCookie.split("=", 2)[1]);
  const expiredToken = jwt.sign({ sid: ownerPayload.sid, role: "student" }, env.JWT_SECRET, {
    subject: ownerPayload.sub, expiresIn: "-10s", issuer: "campusfind-api", audience: "campusfind-web",
  });
  const expiredAccess = await request("/items/mine", { cookie: `campusfind_access=${expiredToken}` });
  assert.equal(expiredAccess.response.status, 401);
  assert.equal(expiredAccess.data.error.code, "SESSION_EXPIRED");
  const forgedAdminToken = jwt.sign({ sid: ownerPayload.sid, role: "admin" }, env.JWT_SECRET, {
    subject: ownerPayload.sub, expiresIn: "10m", issuer: "campusfind-api", audience: "campusfind-web",
  });
  assert.equal((await request("/admin/overview", { cookie: `campusfind_access=${forgedAdminToken}` })).response.status, 403);
  const crossOriginListingUpdate = await request(`/items/${lost.id}`, {
    method: "PATCH", cookie: ownerCookie, body: { name: "Cross-origin update" }, origin: "https://attacker.example",
  });
  assert.equal(crossOriginListingUpdate.response.status, 403);
  assert.equal(crossOriginListingUpdate.data.error.code, "CSRF_ORIGIN_REJECTED");
  const adminOverview = await request("/admin/overview", { cookie: adminCookie });
  assert.equal(adminOverview.response.status, 200);
  assert.ok(adminOverview.data.overview.totalUsers >= 4);
  const reportedListings = await request("/admin/listings?reported=true&limit=100", { cookie: adminCookie });
  const reportedItem = reportedListings.data.items.find((item) => item.id === moderationItem.id);
  assert.equal(reportedItem.reportCount, 1);
  const adminReportQueue = await request("/admin/reports", { cookie: adminCookie });
  assert.ok(adminReportQueue.data.reports.some((entry) => entry.id === report.data.report.id));
  const reportReviewed = await request(`/admin/reports/${report.data.report.id}`, {
    method: "PATCH", cookie: adminCookie, body: { status: "reviewed", note: "Reviewed by test." },
  });
  assert.equal(reportReviewed.response.status, 200, JSON.stringify(reportReviewed.data));

  const adminClose = await request(`/admin/listings/${moderationItem.id}/action`, {
    method: "PATCH", cookie: adminCookie, body: { action: "close", reason: "Temporary integration review." },
  });
  assert.equal(adminClose.response.status, 200);
  assert.equal(adminClose.data.item.status, "closed");
  const adminRemove = await request(`/admin/listings/${moderationItem.id}/action`, {
    method: "PATCH", cookie: adminCookie, body: { action: "remove", reason: "Temporary integration removal." },
  });
  assert.equal(adminRemove.response.status, 200);
  assert.equal(adminRemove.data.item.status, "removed");
  assert.equal((await request(`/items/${moderationItem.id}`)).response.status, 404);
  const adminRemovedDetail = await request(`/items/${moderationItem.id}`, { cookie: adminCookie });
  assert.equal(adminRemovedDetail.response.status, 200);
  assert.equal(Object.hasOwn(adminRemovedDetail.data.item, "contact"), false);
  const ownerModNotice = await request("/notifications", { cookie: ownerCookie });
  assert.ok(ownerModNotice.data.notifications.some((notification) => notification.type === "moderation_action" && notification.itemId === moderationItem.id));

  const adminUsers = await request(`/admin/users?q=${encodeURIComponent(testMarker)}`, { cookie: adminCookie });
  assert.ok(adminUsers.data.users.some((person) => person.email.endsWith(`${testMarker}@example.com`)));
  const pendingForAdmin = await request(`/items/${foundForCancel.id}/claims`, {
    method: "POST", cookie: thirdCookie, body: { contact: "third@example.test", answer: "Review without disclosing to admins." },
  });
  assert.equal(pendingForAdmin.response.status, 201);
  const adminClaims = await request(`/admin/claims?status=pending&q=${encodeURIComponent(testMarker)}`, { cookie: adminCookie });
  const adminClaimView = adminClaims.data.claims.find((claim) => claim.id === pendingForAdmin.data.claim.id);
  assert.ok(adminClaimView);
  assert.equal(Object.hasOwn(adminClaimView, "answer"), false);
  assert.equal(Object.hasOwn(adminClaimView, "contact"), false);
  const adminReject = await request(`/admin/claims/${pendingForAdmin.data.claim.id}/action`, {
    method: "PATCH", cookie: adminCookie, body: { action: "reject", reason: "Temporary integration claim review." },
  });
  assert.equal(adminReject.response.status, 200);
  assert.equal(adminReject.data.claim.status, "rejected");
  const thirdUser = await User.findOne({ email: `campusfind-third-${testMarker}@example.com` });
  const suspend = await request(`/admin/users/${String(thirdUser._id)}/status`, {
    method: "PATCH", cookie: adminCookie, body: { status: "suspended", reason: "Temporary integration suspension." },
  });
  assert.equal(suspend.response.status, 200);
  assert.equal((await request("/claims/submitted", { cookie: thirdCookie })).response.status, 401);
  const reactivate = await request(`/admin/users/${String(thirdUser._id)}/status`, {
    method: "PATCH", cookie: adminCookie, body: { status: "active", reason: "Temporary integration reactivation." },
  });
  assert.equal(reactivate.response.status, 200);
  const auditLog = await request("/admin/audit?limit=100", { cookie: adminCookie });
  assert.ok(auditLog.data.logs.some((entry) => entry.action === "listing.remove" && entry.targetId === moderationItem.id));

  const forbiddenUpdate = await request(`/items/${lost.id}`, {
    method: "PATCH",
    cookie: otherCookie,
    body: { name: "Unauthorized update" },
  });
  assert.equal(forbiddenUpdate.response.status, 403);

  const updated = await request(`/items/${lost.id}`, {
    method: "PATCH",
    cookie: ownerCookie,
    body: { name: `Updated lost item ${testMarker}` },
  });
  assert.equal(updated.response.status, 200);
  assert.equal(updated.data.item.name, `Updated lost item ${testMarker}`);

  const closed = await request(`/items/${lost.id}`, {
    method: "PATCH",
    cookie: ownerCookie,
    body: { status: "closed" },
  });
  assert.equal(closed.response.status, 200);
  assert.equal(closed.data.item.status, "closed");
  const publicClosed = await request(`/items/${lost.id}`);
  assert.equal(publicClosed.response.status, 200);
  assert.equal(publicClosed.data.item.status, "closed");
  const closedFilter = await request(`/items?status=closed&q=${encodeURIComponent(testMarker)}&limit=100`);
  assert.ok(closedFilter.data.items.some((item) => item.id === lost.id));

  const reopened = await request(`/items/${lost.id}`, {
    method: "PATCH",
    cookie: ownerCookie,
    body: { status: "open" },
  });
  assert.equal(reopened.response.status, 200);

  const deletedLost = await request(`/items/${lost.id}`, { method: "DELETE", cookie: ownerCookie });
  assert.equal(deletedLost.response.status, 204);
  assert.equal((await request(`/items/${lost.id}`)).response.status, 404);
  for (const listing of [found, foundForCancel]) {
    const protectedDelete = await request(`/items/${listing.id}`, { method: "DELETE", cookie: ownerCookie });
    assert.equal(protectedDelete.response.status, 409, "claim history should prevent hard deletion");
  }

  console.info("CampusFind integration check passed: registration, login/logout, listings, local image upload/replacement/removal, search, matches, claims, notifications, reports, admin moderation, audit log, account status, privacy, and cleanup.");
} catch (error) {
  console.error("Listing integration check failed:", error);
  process.exitCode = 1;
} finally {
  if (mongoose.connection.readyState === 1 && userIds.length) {
    const ownedItems = await Item.find({ reporterId: { $in: userIds } }).select("+imageStorageKey");
    const ownedItemIds = ownedItems.map((item) => item._id);
    await Promise.all(ownedItems.map((item) => deleteItemImage(item.imageStorageKey)));
    await Promise.all([
      Claim.deleteMany({ $or: [{ itemId: { $in: ownedItemIds } }, { claimantId: { $in: userIds } }] }),
      Report.deleteMany({ $or: [{ itemId: { $in: ownedItemIds } }, { reporterId: { $in: userIds } }] }),
      AuditLog.deleteMany({ actorId: { $in: userIds } }),
      Notification.deleteMany({ $or: [{ receiverId: { $in: userIds } }, { senderId: { $in: userIds } }, { itemId: { $in: ownedItemIds } }, { relatedItemId: { $in: ownedItemIds } }] }),
      Item.deleteMany({ _id: { $in: ownedItemIds } }),
      Session.deleteMany({ userId: { $in: userIds } }),
      User.deleteMany({ _id: { $in: userIds } }),
    ]);
  }
  if (server?.listening) await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
}
