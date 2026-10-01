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

The website sends soft-cover orders to `https://square.link/u/ZV1vr14t` and hard-cover
orders to `https://square.link/u/uq2dEXqy`. Square is the authoritative checkout for
quantity, shipping, tax, customer information, payment, and receipts. Prices edited
in Sanity must also be updated in the matching Square item before publishing.

Each Square item must have **Shipping** enabled as its fulfillment method so checkout
requires a complete delivery address. Configure the quantity option, shipping charge,
automatic tax settings, and new-order email notifications in Square Dashboard.

Pirate Ship connects directly to Square. It imports paid Square orders and their
delivery addresses; after a label is purchased, Pirate Ship sends tracking and the
fulfillment update back to Square. Pirate Ship does not calculate or display live
shipping rates during Square checkout. Setup instructions are in
`docs/SQUARE-PIRATE-SHIP.md`.

## Validation and limits

- npm run build builds both the public site and the separately loaded admin app.
- Test both without CMS variables and with a configured project.
- Test CMS downtime and malformed prices: the Square links must remain disabled.
- Hosted login, actual asset upload, and persistence require a real Sanity project
  and cannot be certified using mocked API responses.
- Content is loaded in the browser. Initial HTML remains the original copy, so
  search crawlers that do not execute JavaScript may see that original copy.
- This dashboard edits website content; order management remains in the payment
  provider. It does not process or store payment cards.

## Checkout configuration

- Current requested book prices: soft-cover $13.99; hard-cover $15.99.
- Square should send new-order notifications to Tisha's chosen fulfillment email.
- Confirm Tisha's Square sales-tax enrollments and collection jurisdictions before
  enabling automatic tax. Tax enrollment does not register the business with a state.
- Pirate Ship imports paid orders for manual label purchase and printing. It does not
  purchase labels automatically.
