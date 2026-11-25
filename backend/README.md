# CampusFind API

## Run locally

1. Copy `.env.example` to `.env` and set `MONGODB_URI` and `JWT_SECRET`. Use a unique random JWT secret with at least 32 characters. `MONGODB_DB` defaults to `campusfind`.
2. Install packages with `npm install`.
3. Start the API with `npm run dev`.
4. Check `http://localhost:5000/api/v1/health`.

Set `CLIENT_ORIGIN` to the exact frontend origin. Set `COLLEGE_EMAIL_DOMAINS` to a comma-separated allow-list when registration should be limited to campus email domains. To require email verification, configure `SMTP_HOST`, `SMTP_PORT`, optional SMTP credentials, `EMAIL_FROM`, and set `EMAIL_VERIFICATION_REQUIRED=true`.

When deploying behind a trusted reverse proxy, set `TRUST_PROXY_HOPS` to the number of proxy hops so rate limits use the real client address. Leave it at `0` for local development.

Optional listing photos are stored on the backend filesystem in `UPLOAD_DIR` (defaults to `uploads`) and served from `/uploads/`. Use a persistent directory on hosted deployments.

The frontend may set `VITE_API_URL` to the API origin; it defaults to `http://localhost:5000`. Production cookies require HTTPS. Admin accounts are not self-registerable: grant the `admin` role only through a trusted database administration process.

## Authentication endpoints

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/logout`
- `POST /api/v1/auth/refresh`
- `GET /api/v1/auth/me`
- `POST /api/v1/auth/verify-email`
- `POST /api/v1/auth/verification/resend`
- `GET /api/v1/auth/admin/access` (admin role required)

## Listing endpoints

- `POST /api/v1/items/lost` and `POST /api/v1/items/found` (authenticated; multipart form data)
- `GET /api/v1/items` (open listings by default; supports `type`, `category`, `location`, `status`, `from`, `to`, `since`, `q`, `page`, and `limit` filters; keyword search covers name, category, description, and location)
- `GET /api/v1/items/:id` (public fields; owner-only fields are included only for the owner)
- `GET /api/v1/items/:id/matches` (ranked opposite-type suggestions; scores are not ownership approval)
- `GET /api/v1/items/mine` (authenticated; includes the user's private contact data)
- `PATCH /api/v1/items/:id` (owner or admin; supports listing fields, status, image replacement, or image removal)
- `DELETE /api/v1/items/:id` (owner or admin)
- `GET /api/v1/items/:id/claim-prompt` (authenticated claimant; prompt is not part of public listing data)
- `POST /api/v1/items/:id/claims` (authenticated; private verification answer and contact)
- `GET /api/v1/claims/submitted` and `GET /api/v1/claims/received` (private to the signed-in claimant or listing owner)
- `PATCH /api/v1/claims/:claimId/decision` with `approve` or `reject` (listing owner only)
- `POST /api/v1/claims/:claimId/cancel` (claimant only, pending requests)
- `POST /api/v1/claims/:claimId/complete` (listing owner marks an approved recovery as returned)
- `GET /api/v1/notifications` and `PATCH /api/v1/notifications/:notificationId/read` (receiver only)
- `GET /api/v1/notifications/unread-count` (signed-in user)
- `POST /api/v1/items/:id/reports` (authenticated user; one open report per user and listing)

## Administrator endpoints

All `/api/v1/admin/*` endpoints require an authenticated account with the `admin` role. Admin claim listings intentionally omit verification answers and private contact details.

- `GET /api/v1/admin/overview` (user, listing, returned-item, pending-claim and reported-category counts)
- `GET /api/v1/admin/listings` (search, status/type filters, pagination, report counts)
- `PATCH /api/v1/admin/listings/:itemId/action` (`close`, `remove`, `archive`, or `restore`; requires a reason)
- `POST /api/v1/admin/listings/archive-expired` (archives expired listings without active claims)
- `GET /api/v1/admin/reports` and `PATCH /api/v1/admin/reports/:reportId` (review or dismiss a report)
- `GET /api/v1/admin/users` and `PATCH /api/v1/admin/users/:userId/status` (suspend or reactivate; suspension revokes sessions)
- `GET /api/v1/admin/claims` and `PATCH /api/v1/admin/claims/:claimId/action` (reject a pending claim or revoke an approved one)
- `GET /api/v1/admin/audit` (paginated administrative action history)

Moderation changes and decisions are written to the audit log. Listing and account actions also create in-app notifications. Notifications are in-app only; email and push delivery are not configured.

Images are limited to JPEG, PNG, or WebP and 5 MB. Image files are saved in `UPLOAD_DIR`; MongoDB stores their relative URL and server-side storage key. Replacing or removing a photo deletes the previous local file. Private contact details and verification questions are excluded from public listing responses.

`from` and `to` filter item dates inclusively. `status` accepts `open`, `pending`, `returned`, `closed`, or `all`; it defaults to `open`. Results use page based pagination with a maximum page size of 100.

Claims require a found listing to be open. Answers and contacts are stored on the private claims collection. Only the claimant and listing owner can view answers; contact details are shared after approval. Claim approval and item reservation are committed in a MongoDB transaction. Competing pending claims are rejected with a decision record and notification when one claim is approved. Approved claims can be marked completed, which changes the item status to `returned`.

Access tokens are short-lived JWTs in HttpOnly cookies. Rotating refresh tokens are opaque, stored as hashes in MongoDB, and revoked on logout. Apply `authenticate`, `authorize`, and `authorizeOwnerOrAdmin` to protected resource routes as those routes are added.
