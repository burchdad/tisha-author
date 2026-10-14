# Author dashboard

The private dashboard at `/admin` is part of this website. It uses a single author
login, an HMAC-signed HTTP-only session cookie, Vercel Functions, and Vercel Blob.
There is no third-party CMS account or separate editing website.

## One-time activation

Set these server-only variables for Production, Preview, and Development in Vercel:

- `ADMIN_EMAIL`: initially `stephen.burch@ghostai.solutions`
- `ADMIN_EMAILS`: optional comma-separated additional login emails, currently
  `ridersmagicmark@gmail.com`
- `ADMIN_PASSWORD`: a unique password stored in a password manager
- `ADMIN_AUTH_SECRET`: at least 32 cryptographically random bytes
- A Vercel Blob store connected to the project. Current Vercel projects receive
  `BLOB_STORE_ID`, `BLOB_WEBHOOK_PUBLIC_KEY`, and a short-lived OIDC token at runtime.
  A legacy `BLOB_READ_WRITE_TOKEN` also works if the project uses token authentication.

Never prefix these variables with `VITE_`, commit them, or place them in browser
code. Redeploy after changing them. Test login, an edit, and one small upload before
handing the account to Tisha. Add or remove addresses in `ADMIN_EMAILS` and redeploy.
Removing an address immediately invalidates sessions created for that address.

## What the author can update

- Website headings, introductions, and biographies
- Purchase pop-up badge, author label, heading, description, book-choice label,
  Square instructions, contact wording, prices, shipping notice, and headshot
- Soft-cover and hard-cover prices displayed on the website
- The shared shipping announcement
- Curriculum titles, descriptions, placements, and PDF files
- Teacher Toolkit wording, resource categories, links, and downloadable files
- Invite the Author wording and the four school-visit options
- Podcast, blog, article, and feature links
- Upcoming events, locations, and event-detail links
- Facebook, TikTok, Instagram, and other social links
- Author, illustrator, and school-visit photographs
- “Rider's Magic Mark in the Wild” photographs and captions

The dashboard validates prices, URLs, content length, file types, and file size.
Uploads accept JPEG, PNG, WebP, GIF, PDF, DOC, DOCX, and ZIP files up to 15 MB. The public site reads
the latest saved content through `/api/content`; the original website content is the
fallback before the first save.

The dashboard does not store orders, customer addresses, or payment-card data.
School-visit inquiries continue to be delivered by the server to
`ridersmagicmark@gmail.com`; the public dashboard content cannot redirect them.

## Square

The website sends soft-cover orders to `https://square.link/u/ZV1vr14t` and hard-cover
orders to `https://square.link/u/uq2dEXqy`. Square remains authoritative for quantity,
shipping, tax, customer information, payment, and receipts. A price change in this
dashboard changes only the price displayed on the website. Update the corresponding
Square item before saving the website change.

Each Square item must have Shipping enabled so checkout requires a delivery address.
Enable new-order emails for the appropriate Square owner or full-access team member.
Pirate Ship can import paid Square orders and their delivery addresses for label
purchase. See `docs/SQUARE-PIRATE-SHIP.md` for the account-side checklist.

## Security and recovery

Sessions expire after eight hours and use `HttpOnly`, `Secure`, and `SameSite=Strict`.
Mutations require a matching request origin. The Blob store remains private. Public
pages receive uploaded photos and documents through `/api/media`, which streams only
validated upload paths without exposing Blob credentials. Dashboard credentials and
storage tokens stay on the server. To revoke access, rotate `ADMIN_PASSWORD` or
`ADMIN_AUTH_SECRET` and redeploy.

Each save writes a complete, validated content snapshot. The dashboard keeps the ten
most recent saved versions and can restore any of them from Revision history. It also
warns before leaving or signing out with unsaved edits. Source-controlled defaults
remain available for recovery. Uploaded files
are retained even if an editor removes their URL from the page; delete unused files
from the Vercel Blob dashboard during periodic maintenance.

## Past-event photo folders

The Past Events tab now opens a grid of event folders. In the dashboard, use
**Past-event albums → Create event folder**, enter the event title, and optionally
choose a date. Choose **Add photo to this event** on that folder, upload its photo,
and save the website changes. Each photo can be reassigned using its Event folder
selector. Choose an optional cover from photos already assigned to that event;
otherwise the public site shows a folder illustration.

Existing gallery photos are preserved in **Unassigned photos** until you explicitly
assign them. No event names or dates are inferred. Removing a folder moves its
photos to Unassigned; it does not delete photos or uploaded files. Photo removal
removes the selected gallery entry only. The file remains in Blob storage as before.
Upcoming events remain a separate editor and are not automatically turned into albums.

The editor blocks saving a photo card without an uploaded image. Gallery saves
validate unique IDs, real event dates, valid event associations, and cover ownership.
A detected stale snapshot is rejected so you can refresh before overwriting another
session's changes. The snapshot check is not a distributed transaction lock; avoid
saving from multiple author sessions at exactly the same time.

### Review previews

Vercel Preview deployments are read-only for content saves, uploads, and revision
restores, even when they share Production's private Blob store. The session endpoint
exposes this mode to show a dashboard notice; server-side guards enforce it. An
existing author login can view/edit a local review draft, but cannot publish it from
the preview. Use production only after the review branch has been approved and
released. Never test uploads or saves against the live store without authorization.

## School-visit review

School inquiries can be reviewed at the authenticated link in the owner email after
the visit feature is configured and released. Sign in with the existing author
account, review or edit the date, time, time zone, duration and location, then
choose **Approve visit**, **Request changes**, **Save details for later**, or
**Decline request**. Request changes requires a note and opens a separate reply
draft for you to review and send. Recording that proposal does not contact the
school, approve the request, or book a calendar event.

Approval requires checking your own calendar. Calendar export and recording a
manual import are separate steps. There is no automatic booking, school email,
or calendar invitation. Visit records and exports are unavailable in Preview,
and all Preview inquiry submissions are blocked before storage or email.
See `docs/SCHOOL-VISIT-APPROVAL.md` for the release checklist.
