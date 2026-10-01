# Stripe + Shippo checkout activation

The implementation is fail-closed. It does not accept payment until Stripe, Shippo,
and email delivery are configured. Never commit or send secret keys in chat.

## Required Vercel environment variables

- `STRIPE_SECRET_KEY`: server-only Stripe test or live secret key.
- `STRIPE_PUBLISHABLE_KEY`: matching Stripe publishable key.
- `STRIPE_WEBHOOK_SECRET`: signing secret for this endpoint and environment.
- `SHIPPO_API_TOKEN`: existing server-only Shippo token.
- `RESEND_API_KEY`: existing server-only Resend key.
- `RESEND_FROM_EMAIL`: verified sender, such as `Rider's Magic Mark <orders@ridersmagicmark.com>`.
- `ORDER_NOTIFICATION_EMAIL`: fulfillment recipient. It temporarily defaults to
  `stephen.burch@ghostai.solutions` when omitted.
- `PUBLIC_SITE_URL`: `https://www.ridersmagicmark.com`.

If Sanity is activated, keep `VITE_SANITY_PROJECT_ID` and `VITE_SANITY_DATASET`
available to the Vercel functions. The server reads the same published prices shown
by the website. Without Sanity, the authoritative defaults are $13.99 and $15.99.

Optional:

- `STRIPE_BOOK_TAX_CODE`: Stripe Tax code for the physical book product.
- `STRIPE_AUTOMATIC_TAX=false`: disables automatic tax. Do this only for deliberate
  testing; never treat a failed tax calculation as zero.
- `STRIPE_ALLOW_PROMOTION_CODES=true`: enables Stripe promotion codes.
- `SEND_CUSTOMER_CONFIRMATION=false`: disables the custom buyer confirmation email.

## Stripe configuration

1. Activate Stripe Tax only after confirming where the business is registered to collect.
2. In Stripe Workbench, create an event destination for:
   `https://www.ridersmagicmark.com/api/stripe-webhook`
3. Subscribe to `checkout.session.completed` and
   `checkout.session.async_payment_succeeded`.
4. Copy that endpoint's signing secret into `STRIPE_WEBHOOK_SECRET` in the matching
   Vercel environment. Test and live endpoints have different secrets.
5. Enable only the payment methods Tisha intends to support.

## What happens after payment

The webhook verifies Stripe's signature, retrieves the paid Checkout Session, and
sends idempotent emails through Resend. Tisha's email contains the books, totals,
verified payment link, customer contact information, and shipping address. The buyer
receives a confirmation. The Stripe session is marked after successful notification
to prevent repeat fulfillment emails.

No postage is purchased automatically in this first version. The email tells Tisha to
review the address and create the label in Shippo. This avoids purchasing duplicate or
incorrect postage before a durable order database and label idempotency are in place.

## Activation gate

Run a full Stripe test-mode order before adding live keys:

1. Confirm the website requires the complete address and a live Shippo quote.
2. Confirm the embedded Stripe form shows the right item, quantity, shipping, and tax.
3. Pay with a Stripe test card.
4. Confirm the site shows the verified completion state.
5. Confirm exactly one fulfillment email and one buyer email arrive.
6. Confirm the order, address, tax, and payment appear in Stripe Dashboard.
7. Replay the webhook and confirm no duplicate email is sent.

Only after this passes should test keys be replaced with live keys.
