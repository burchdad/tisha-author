# School-visit review and calendar workflow

## Delivered behavior

A new inquiry captures contact, school, visit interest, requested local date/time,
IANA time zone, duration, location/virtual details and optional notes. It is saved
privately before notification delivery. The email uses the display name
**Rider's Magic Mark**, keeps Reply-To set to the validated school contact, and
links to `/visits.html?id=<random-request-id>`.

The review link is not a login credential. Tisha signs in with the existing author
dashboard account. She can edit a pending request, save it for later, check her
own calendar and approve it, or decline it. Approval requires an explicit
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

Do not deploy this patch until these are verified by the owner/operator:

1. **Approved branded sender.** Set server-only `SCHOOL_VISIT_FROM_EMAIL` to a bare,
   approved mailbox on a Resend-verified sending domain. Verify the mailbox/domain
   and authorization in Resend, including relevant DNS authentication. The code
   fixes the display name, but does not prove domain ownership. Do not merely use
   Stephen's personal address under a different label, invent an unverified
   address, or use `onboarding@resend.dev`. No production sender value was read or
   changed during preparation. The actual approved mailbox is still needed.
2. **Intentional sender migration.** `SCHOOL_VISIT_FROM_EMAIL` is required even if
   the approval feature is off. Existing `RESEND_FROM_EMAIL` alone is no longer
   sufficient. A missing new setting returns 503 rather than silently sending as
   the personal administrator. Set and verify it before deploying; toggling the
   approval flag off is not a complete rollback of this sender requirement.
3. **Trusted website origin.** Set `SCHOOL_VISIT_SITE_URL` to the canonical HTTPS
   origin, e.g. the actual published domain, with no path/query. Review POSTs must
   use exactly this origin. Redirect aliases to the canonical domain. Preview
   environments need their own matching origin and separate private fixture
   storage/recipient settings before authorized smoke testing.
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
   calendar tests require appropriate authorization. This package was not pushed
   or deployed, and no real message, invite or calendar event was sent.

## Calendar account still to establish

Before any live calendar integration, establish Tisha's provider, exact account
and calendar, appropriate access, typical time zone/duration, travel buffers, and
who may approve or notify the school. Do not use Stephen's connected calendar as
Tisha's. OAuth consent, credentials and persistent grants are not implemented or
silently created by this patch. The manual export workflow can operate without
calendar credentials, but cannot confirm availability programmatically.

## Retry and recovery behavior

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
- Existing email-only inquiries are not retroactively imported; there is no
  durable historic request data to back their old email links.

## Local checks

Run `npm ci --ignore-scripts`, `npm run build`, and `npm run test:api`.
Run browser checks with `npx playwright test` in the repository's normal Edge
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
