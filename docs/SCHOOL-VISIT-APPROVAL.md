# School-visit review and calendar workflow

## Delivered behavior

A new inquiry captures contact, school, visit interest, requested local date/time,
IANA time zone, duration, location/virtual details and optional notes. It is saved
privately before notification delivery. The email uses the display name
**Rider's Magic Mark**, keeps Reply-To set to the validated school contact, and
links to `/visits.html?id=<random-request-id>`.

The review link is not a login credential. Tisha signs in with the existing author
dashboard account. She can edit a pending request, save it for later, check her
own calendar and approve it, request changes, or decline it. A change request
requires a note, records a proposed schedule, and keeps the request open. Its
mailto reply draft must be reviewed and sent manually; saving a change request
does not email the school or book a visit. Pending and changes-requested visits
can still be edited and later approved or declined. Approval requires an explicit
availability acknowledgement. GET requests and email scanners cannot approve,
decline, create a calendar event or change any state.

After approval, she can download an ICS file, open it in her chosen calendar and
save it. A separate action records her manual confirmation and which calendar
she used. The website clearly labels this as manual/unverified. It does not read
availability, create a live calendar event, send an invitation or send a school
confirmation. A mailto link opens a draft reply for her to review and send.

Approved and declined requests are intentionally locked against schedule edits.
For a changed confirmed visit, coordinate with the school and update the actual
calendar directly; do not treat a new form submission as an automatic reschedule.

## Required deployment gates

Do not release this feature to production until these are verified by the owner/operator:

1. **Approved branded sender.** Set server-only `SCHOOL_VISIT_FROM_EMAIL` to a bare,
   approved mailbox on a Resend-verified sending domain. Verify the mailbox/domain
   and authorization in Resend, including relevant DNS authentication. The code
   fixes the display name, but does not prove domain ownership. Do not merely use
   Stephen's personal address under a different label, invent an unverified
   address, use the brand Gmail inbox as From, or use `onboarding@resend.dev`.
   Shared-provider sender domains such as gmail.com are rejected by the code.
   No production sender setting was changed. The approved mailbox is still needed.
2. **Intentional sender migration.** `SCHOOL_VISIT_FROM_EMAIL` is required even if
   the approval feature is off. Existing `RESEND_FROM_EMAIL` alone is no longer
   sufficient. A missing new setting returns 503 rather than silently sending as
   the personal administrator. Set and verify it before deploying; toggling the
   approval flag off is not a complete rollback of this sender requirement.
3. **Trusted website origin.** Set `SCHOOL_VISIT_SITE_URL` to the canonical HTTPS
   origin, e.g. the actual published domain, with no path/query. Review POSTs must
   use exactly this origin. Redirect aliases to the canonical domain. Preview
   deployments block school-visit submissions, authenticated visit reads/exports,
   and all visit mutations before any Blob or provider call, even if they inherit
   production environment values. Use local mocked tests for review. A separate
   authorized staging design is required for any real provider/storage smoke test.
4. **Private storage.** Confirm the connected Blob store is private and runtime
   OIDC or a server-only Blob credential works. Records live under
   `school-visits/<uuid>.json`, outside the public media proxy's upload prefix.
   Reads bypass cache; writes use ETag compare-and-swap. Never expose that prefix
   through a public download proxy or client upload permission. No credentials
   were generated or copied while preparing this patch.
5. **Author login.** Verify Tisha's authorized account in `ADMIN_EMAIL`/
   `ADMIN_EMAILS`, a strong unique `ADMIN_PASSWORD`, and at least 32 random bytes
   for `ADMIN_AUTH_SECRET`. Existing secure, HTTP-only, SameSite=Strict sessions
   expire after eight hours. The shared author login has no distinct approver
   role: every allowlisted admin can approve. Verify that this is the intended
   audience. Establish login rate limiting before launch.
6. **Delivery and abuse controls.** Verify `RESEND_API_KEY` and the intended
   `INVITE_TO_EMAIL`/`RESEND_TO_EMAIL` (fallback: ridersmagicmark@gmail.com).
   Set a Vercel firewall/rate-limit rule for POST `/api/school-visit` and
   `/api/admin/login` before launch. The honeypot and origin check are not bot
   protection; direct automated clients can otherwise fill storage and send spam.
   Establish a retention policy for private inquiry data and avoid student PII.
7. **Activation and approval.** Set `SCHOOL_VISIT_APPROVAL_ENABLED=true` only after
   these gates are met. Publishing/pushing/deployment and live smoke emails or
   calendar tests require appropriate authorization. Publishing a review branch
   does not authorize production activation. No real message, invitation, calendar
   event or school-visit record is required for the mocked test suite.

## Calendar account still to establish

Before any live calendar integration, establish Tisha's provider, exact account
and calendar, appropriate access, typical time zone/duration, travel buffers, and
who may approve or notify the school. Do not use Stephen's connected calendar as
Tisha's. OAuth consent, credentials and persistent grants are not implemented or
silently created by this patch. The manual export workflow can operate without
calendar credentials, but cannot confirm availability programmatically.

## Retry and recovery behavior

- Same-tab browser retries retain a UUID and SHA-256 payload fingerprint through
  reload using sessionStorage; no contact fields are stored there. Retry identity
  expires after 23 hours and then fails closed for an operator delivery check.
  The visitor must re-enter the same details after reload. Closing the tab,
  clearing storage, or deliberately changing details can start a new request.
  Storage or hashing failures stop before sending.
- Same browser request retries retain a UUID. The server binds that UUID to a
  digest of the original fields; changed data with the same UUID is rejected.
- Provider calls use one Resend idempotency key per request. Resend retains keys
  for 24 hours; retries stop after 23 hours if email status is uncertain. A saved
  request is never deleted after an email failure. Operators must reconcile an
  uncertain email against Resend logs before re-sending after this window.
- Approval operations carry unique IDs and a visible revision. Retries replay
  safely; concurrent or stale writes fail rather than overwriting another decision.
  The review UI reloads durable state after an interrupted action response.
- ICS exports have a stable event UID and UTC timestamps derived from the chosen
  IANA zone. DST gaps/repeated wall times are rejected for explicit correction.
  ICS import behavior varies by calendar app; inspect an existing entry before
  importing again. Export carries no ATTENDEE or meeting REQUEST semantics.
- No background notification queue is installed. A notification failure returns
  a retryable error while preserving the request. If the visitor does not retry,
  an operator needs to inspect private saved requests/provider logs. Configure
  operational alerting/queueing before assuming unattended email recovery.
- The feature-off legacy email path now bounds/validates input, escapes both email
  representations, injects the same testable provider client, sets a timeout and
  applies a Resend idempotency key when a request UUID is present. It has no durable
  visit store or historical delivery reconciliation; requests without UUIDs and
  clients that bypass the same-tab 23-hour retry guard cannot gain that protection.
- Existing email-only inquiries are not retroactively imported; there is no
  durable historic request data to back their old email links.

## Local checks

Run `npm ci --ignore-scripts`, `npm run build`, and `npm run test:api`.
Local source snapshots may omit public binary assets; the Git-based Vercel build
uses the complete repository. Run browser checks with `npx playwright test` in the repository's normal Edge
setup, or `npx playwright test --config playwright.review.config.js` with
`PLAYWRIGHT_CHROMIUM_PATH` pointing to an installed Chromium binary.

Visit API tests inject in-memory storage and an email stub. Browser visit tests
intercept API traffic and use fictional contacts. These tests do not verify
production Resend deliverability, real Blob access, an actual calendar import,
Tisha's credentials or live calendar availability.

References:
- https://vercel.com/docs/vercel-blob/using-blob-sdk
- https://vercel.com/docs/vercel-blob#conditional-writes
- https://resend.com/docs/dashboard/emails/idempotency-keys

## Review on current production albums

The visit feature is based on production commit
`b904931038136ac3a6619b64d2cf8d923a4d1ee6`. Album storage, public album rendering,
author album controls and public binary assets are retained unchanged.

Release review must separately verify desktop/mobile interactions, interrupted
actions, duplicate submissions, sign-out/session expiry and the final email in an
authorized recipient inbox. Passing local model/API mocks does not establish live
email deliverability, actual storage access or a calendar import.
