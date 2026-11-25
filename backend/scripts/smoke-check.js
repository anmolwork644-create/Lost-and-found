import assert from "node:assert/strict";
import { app } from "../src/app.js";
import { env } from "../src/config/env.js";

const server = app.listen(0, async () => {
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;

  try {
    const health = await fetch(`${baseUrl}/health`);
    assert.equal(health.status, 200);
    assert.equal((await health.json()).status, "ok");

    const invalidQuery = await fetch(`${baseUrl}/health?unexpected=yes`);
    assert.equal(invalidQuery.status, 400);

    const invalidRegistration = await fetch(`${baseUrl}/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: env.CLIENT_ORIGIN },
      body: JSON.stringify({
        name: "Campus Admin",
        email: "person@college.edu",
        password: "long-enough-password",
        role: "admin",
      }),
    });
    assert.equal(invalidRegistration.status, 400);
    const invalidRegistrationBody = await invalidRegistration.json();
    assert.equal(invalidRegistrationBody.error.code, "VALIDATION_ERROR");
    assert.equal(Object.hasOwn(invalidRegistrationBody.error, "stack"), false);

    const unavailableLogin = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: env.CLIENT_ORIGIN },
      body: JSON.stringify({ email: "person@college.edu", password: "long-enough-password" }),
    });
    assert.equal(unavailableLogin.status, 503);
    assert.equal((await unavailableLogin.json()).error.code, "DATABASE_UNAVAILABLE");

    const oversizedPassword = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: env.CLIENT_ORIGIN },
      body: JSON.stringify({ email: "person@college.edu", password: "\u{1F600}".repeat(20) }),
    });
    assert.equal(oversizedPassword.status, 400);

    const unavailableItems = await fetch(`${baseUrl}/items`);
    assert.equal(unavailableItems.status, 503);
    assert.equal((await unavailableItems.json()).error.code, "DATABASE_UNAVAILABLE");

    const unavailableCreate = await fetch(`${baseUrl}/items/lost`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: env.CLIENT_ORIGIN },
      body: JSON.stringify({}),
    });
    assert.equal(unavailableCreate.status, 503);

    const missingOrigin = await fetch(`${baseUrl}/auth/logout`, { method: "POST" });
    assert.equal(missingOrigin.status, 403);
    assert.equal((await missingOrigin.json()).error.code, "CSRF_ORIGIN_REJECTED");

    const authPreflight = await fetch(`${baseUrl}/auth/me`, {
      method: "OPTIONS",
      headers: {
        origin: env.CLIENT_ORIGIN,
        "access-control-request-method": "GET",
        "access-control-request-headers": "content-type",
      },
    });
    assert.equal(authPreflight.status, 204);
    assert.equal(authPreflight.headers.get("access-control-allow-origin"), env.CLIENT_ORIGIN);
    assert.equal(authPreflight.headers.get("access-control-allow-credentials"), "true");

    if (env.NODE_ENV !== "production") {
      const alternateLocalPreflight = await fetch(`${baseUrl}/auth/me`, {
        method: "OPTIONS",
        headers: {
          origin: "http://localhost:8081",
          "access-control-request-method": "GET",
          "access-control-request-headers": "content-type",
        },
      });
      assert.equal(alternateLocalPreflight.status, 204);
      assert.equal(
        alternateLocalPreflight.headers.get("access-control-allow-origin"),
        "http://localhost:8081",
      );
    }

    const unavailableLogout = await fetch(`${baseUrl}/auth/logout`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: env.CLIENT_ORIGIN,
        cookie: "campusfind_refresh=sample-token",
      },
    });
    assert.equal(unavailableLogout.status, 503);
    assert.equal((await unavailableLogout.json()).error.code, "DATABASE_UNAVAILABLE");
    const clearedCookies = unavailableLogout.headers.getSetCookie().join(" ");
    assert.match(clearedCookies, /campusfind_access=/);
    assert.match(clearedCookies, /campusfind_refresh=/);

    const crossOriginLogin = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://attacker.example" },
      body: JSON.stringify({ email: "person@college.edu", password: "long-enough-password" }),
    });
    assert.equal(crossOriginLogin.status, 403);
    assert.equal(crossOriginLogin.headers.get("access-control-allow-origin"), null);

    // The auth limiter allows ten attempts per IP during its window, then rejects the next.
    for (let attempt = 4; attempt <= 10; attempt += 1) {
      const rateLimitedRequest = await fetch(`${baseUrl}/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: env.CLIENT_ORIGIN },
        body: JSON.stringify({ email: "person@college.edu", password: "long-enough-password" }),
      });
      assert.equal(rateLimitedRequest.status, 503);
    }
    const rateLimited = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: env.CLIENT_ORIGIN },
      body: JSON.stringify({ email: "person@college.edu", password: "long-enough-password" }),
    });
    assert.equal(rateLimited.status, 429);
    assert.equal((await rateLimited.json()).error.code, "AUTH_RATE_LIMITED");

    const missingRoute = await fetch(`${baseUrl}/missing`);
    assert.equal(missingRoute.status, 404);

    const readiness = await fetch(`${baseUrl}/health/ready`);
    assert.equal(readiness.status, 503);

    console.info(
      "Backend smoke check passed: health, listing routes, validation, database-offline handling, logout cleanup, origin protection, and not-found handling.",
    );
  } catch (error) {
    console.error("Backend smoke check failed:", error);
    process.exitCode = 1;
  } finally {
    server.close();
  }
});
