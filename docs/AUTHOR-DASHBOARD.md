# Author dashboard

The private dashboard at `/admin` is part of this website. It uses a single author
login, an HMAC-signed HTTP-only session cookie, Vercel Functions, and Vercel Blob.
There is no third-party CMS account or separate editing website.

## One-time activation

Set these server-only variables for Production, Preview, and Development in Vercel:

- `ADMIN_EMAIL`: initially `stephen.burch@ghostai.solutions`
- `ADMIN_PASSWORD`: a unique password stored in a password manager
- `ADMIN_AUTH_SECRET`: at least 32 cryptographically random bytes
- A Vercel Blob store connected to the project. Current Vercel projects receive
  `BLOB_STORE_ID`, `BLOB_WEBHOOK_PUBLIC_KEY`, and a short-lived OIDC token at runtime.
  A legacy `BLOB_READ_WRITE_TOKEN` also works if the project uses token authentication.

Never prefix these variables with `VITE_`, commit them, or place them in browser
code. Redeploy after changing them. Test login, an edit, and one small upload before
handing the account to Tisha. At handoff, change `ADMIN_EMAIL` and `ADMIN_PASSWORD`
together and redeploy. Changing either immediately invalidates existing sessions.

## What the author can update

- Website headings, introductions, biographies, and checkout description
- Soft-cover and hard-cover prices displayed on the website
- The shared shipping announcement
- Curriculum titles, descriptions, placements, and PDF files
- Podcast, blog, article, and feature links
- Author, illustrator, and school-visit photographs
- “Rider's Magic Mark in the Wild” photographs and captions

The dashboard validates prices, URLs, content length, file types, and file size.
Uploads accept JPEG, PNG, WebP, GIF, and PDF files up to 15 MB. The public site reads
the latest saved content through `/api/content`; the original website content is the
fallback before the first save.

The dashboard does not store orders, customer addresses, or payment-card data.

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
Mutations require a matching request origin. Files are public because the public site
must display them; dashboard credentials and content-management tokens stay on the
server. To revoke access, rotate `ADMIN_PASSWORD` or `ADMIN_AUTH_SECRET` and redeploy.

Each save writes a complete, validated content snapshot and removes the previous
snapshot. Source-controlled defaults remain available for recovery. Uploaded files
are retained even if an editor removes their URL from the page; delete unused files
from the Vercel Blob dashboard during periodic maintenance.
