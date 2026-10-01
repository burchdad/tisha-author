# Shippo webhook receiver

Set the Shippo webhook URL to:

https://www.ridersmagicmark.com/api/shippo-webhook

Use the www hostname to avoid a domain redirect. The site homepage and
/api/shipping-rate are not webhook receivers.

In Shippo, edit the existing webhook, replace its URL, save, and send a sample
Transaction Created event. A valid event receives HTTP 200. A browser GET also
returns a health response; GET alone does not test webhook delivery.

## Scope

This endpoint is currently **receipt-only**. It records the event name, test flag,
and authentication mode in Vercel function logs and promptly acknowledges delivery.
It does not persist the complete event, save customer addresses, buy labels,
send emails, or mark book orders paid. Duplicate events have no fulfillment effects.
Without a token, logged deliveries are explicitly unverified diagnostics.

Shippo transaction events concern shipping-label transactions, not Square book
purchases. Purchase confirmations and order-address emails still need the
Square payment integration.

## Authentication before adding fulfillment actions

Set a randomly generated SHIPPO_WEBHOOK_TOKEN in Vercel's server environment and
redeploy. Append the matching token to the Shippo webhook URL as ?token=VALUE.
Once configured, the endpoint rejects absent or incorrect tokens with HTTP 401.
Keep the token out of source control, screenshots, browser code, and public messages.
Do not use the Shippo API token as the webhook token.

Before adding real processing, require authenticated events and add a durable
event queue with idempotent handling. A successful receipt-only response is not
evidence that an order email was sent or that a customer paid.

References:
- https://docs.goshippo.com/tracking/webhooks
- https://docs.goshippo.com/tracking/webhook-security

Run receiver tests with: node --test tests/shippo-webhook.test.mjs
