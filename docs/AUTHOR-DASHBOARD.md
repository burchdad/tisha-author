# Author dashboard

The site embeds Sanity Studio at /admin. Sanity handles sign-in, account invitations,
drafts, publishing, file storage, and permissions. It is not a custom password system.
The initial testing account is stephen.burch@ghostai.solutions.

## One-time activation

1. Create or select a Sanity project at https://www.sanity.io/manage and create a
   **public** dataset named production. Only website content belongs here, never
   customer addresses, orders, credentials, or payment details.
2. Add the exact live website origins to the project's API CORS settings, allowing
   credentials for origins hosting /admin. Add http://127.0.0.1:4175 for local testing
   if needed. Do not allow platform-wide wildcards.
3. Invite stephen.burch@ghostai.solutions using the least-privileged available role
   that can edit and publish content. Invite Tisha separately when testing is complete.
   Removing a member revokes access through Sanity.
4. Set these nonsecret build variables in Vercel and locally:
   - VITE_SANITY_PROJECT_ID: the project's ID
   - VITE_SANITY_DATASET: production
5. Generate a temporary Sanity write token for initialization. Set SANITY_API_TOKEN
   in the local environment only. Run npm run cms:seed with Node 22.12+.
   The seed creates missing documents and never overwrites existing edits. It uses
   the existing public curriculum PDFs and photo URLs, so no re-upload is required.
   Revoke the temporary token after seeding. Never prefix a secret with VITE_.
6. Redeploy after setting the build variables. Open /admin, sign in, and verify
   an edit, draft, publish, image upload, and PDF upload with the real account.
   Until these steps are complete, the dashboard is not activated.

No Sanity token is needed by public readers. Only published documents are queried.
The ordinary site retains its original content if Sanity is unavailable; once CMS
is configured, payment links stay disabled if current prices cannot be verified.
Without a project ID, the original checkout continues working normally.

## Tisha's workflow

- **Website text:** edit the main home-page and curriculum-page headings and paragraphs.
- **Prices & shipping:** edit the two book prices and shared shipping announcement.
- **Curriculum PDFs:** replace a PDF, edit its description, or add another curriculum.
  Choose Companion, Gratitude, or More curriculum downloads for placement.
- **Podcasts, blogs & features:** add a title, HTTPS link, category, and optional description.
- **Website photos:** replace the author portrait, illustrator portrait, or school visit photo.
- **In the Wild: photos:** add event photos with captions and accessible descriptions.

Changes remain drafts until Publish. Refresh the public website after publishing;
the content CDN may take a short time to update. Drafts never appear publicly.
Review changes before publishing. Sanity provides discard/restore actions.
Layouts, animations, and payment-account destinations stay in code.

## Square

The Square connection is pending the client's public checkout link.
Ask for the link and confirm:
- Does it cover soft-cover, hard-cover, and quantities?
- Does Square collect the buyer's email and complete shipping address?
- How are shipping and tax configured?
- Is the November 20 preorder shipping message shown?

A static Square link does not automatically inherit this site's calculated total.
With a static link, Square is the authoritative checkout and its item prices must
be kept in sync manually. Do not label a static link as carrying the calculated total.

For a dynamic Square-hosted checkout matching this site's cart, configure a
server-only production access token, location ID, and catalog variation IDs if using
Square's catalog. The server must read authoritative published prices, validate
quantity, and recalculate shipping; never trust totals from the browser.
Use a unique idempotency key per checkout attempt. If the website tracks paid orders,
add payment/order webhooks and signature verification. A return URL is not proof
of payment. No Square secrets belong in browser code or Sanity content.

## Validation and limits

- npm run build builds both the public site and the separately loaded admin app.
- Test both without CMS variables and with a configured project.
- Test CMS downtime and malformed prices: payment must remain disabled.
- Hosted login, actual asset upload, and persistence require a real Sanity project
  and cannot be certified using mocked API responses.
- Content is loaded in the browser. Initial HTML remains the original copy, so
  search crawlers that do not execute JavaScript may see that original copy.
- This dashboard edits website content; order management remains in the payment
  provider. It does not process or store payment cards.

## Pending tax and shipping-email configuration

- Current requested book prices: soft-cover $13.99; hard-cover $16.99.
- Temporary shipping/fulfillment email recipient: stephen.burch@ghostai.solutions.
  This request does not change the school-inquiry recipient or public customer-support address.
- Confirm Tisha's Square sales-tax settings and collection jurisdictions before enabling tax.
  Do not assume a flat tax rate or treat an unavailable tax calculation as zero.
- Confirm whether the email should contain paid-order details for manual label creation,
  or an automatically purchased label. No label purchases or automated fulfillment
  emails are currently connected.
- The Square checkout link and payment-confirmation integration are still pending.
