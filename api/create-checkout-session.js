import Stripe from 'stripe';
import { getCheckoutProduct, json, normalizeBookOrder, quoteShippoOrder, readJsonBody } from '../server/book-order.js';

function getSiteUrl() {
  return String(process.env.PUBLIC_SITE_URL || 'https://www.ridersmagicmark.com').replace(/\/$/, '');
}

function validAttemptId(value = '') {
  return /^[A-Za-z0-9_-]{16,80}$/.test(String(value));
}

export default async function handler(request, response) {
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (request.method === 'OPTIONS') {
    response.statusCode = 204;
    response.end();
    return;
  }
  if (request.method !== 'POST') return json(response, 405, { message: 'Method not allowed.' });

  const secretKey = process.env.STRIPE_SECRET_KEY;
  const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY;
  const shippoToken = process.env.SHIPPO_API_TOKEN || process.env.SHIPPO_API_KEY || process.env.SHIPPO_TOKEN;
  if (!secretKey || !publishableKey || !shippoToken) {
    return json(response, 503, { message: 'Secure checkout is not configured yet.' });
  }

  try {
    const body = await readJsonBody(request);
    if (!validAttemptId(body.attemptId)) return json(response, 400, { message: 'Please restart checkout and try again.' });
    const order = normalizeBookOrder(body, { requireAddress: true });
    const product = await getCheckoutProduct(order);
    const rate = await quoteShippoOrder(order, { apiToken: shippoToken });
    const stripe = new Stripe(secretKey);
    const commonMetadata = {
      checkout_attempt: body.attemptId,
      book_format: order.format,
      book_quantity: String(order.quantity),
      shippo_rate_id: rate.rateId,
      shipping_provider: rate.provider,
      shipping_service: rate.service,
      shipping_quote_cents: String(rate.amountCents),
    };

    const customer = await stripe.customers.create({
      name: order.name,
      email: order.email,
      phone: order.phone || undefined,
      address: {
        line1: order.street,
        line2: order.street2 || undefined,
        city: order.city,
        state: order.state,
        postal_code: order.zip,
        country: 'US',
      },
      shipping: {
        name: order.name,
        phone: order.phone || undefined,
        address: {
          line1: order.street,
          line2: order.street2 || undefined,
          city: order.city,
          state: order.state,
          postal_code: order.zip,
          country: 'US',
        },
      },
      metadata: commonMetadata,
    }, { idempotencyKey: `customer-${body.attemptId}` });

    const productData = { name: product.name };
    if (process.env.STRIPE_BOOK_TAX_CODE) productData.tax_code = process.env.STRIPE_BOOK_TAX_CODE;
    const returnUrl = `${getSiteUrl()}/?checkout=complete&session_id={CHECKOUT_SESSION_ID}#purchase-book`;
    const session = await stripe.checkout.sessions.create({
      ui_mode: 'embedded',
      mode: 'payment',
      customer: customer.id,
      customer_update: { address: 'auto', name: 'auto', shipping: 'auto' },
      client_reference_id: body.attemptId,
      line_items: [{
        quantity: order.quantity,
        price_data: { currency: 'usd', unit_amount: product.unitAmount, product_data: productData },
      }],
      shipping_address_collection: { allowed_countries: ['US'] },
      shipping_options: [{
        shipping_rate_data: {
          type: 'fixed_amount',
          fixed_amount: { amount: rate.amountCents, currency: 'usd' },
          display_name: `${rate.provider} ${rate.service}`.trim(),
          delivery_estimate: rate.estimatedDays
            ? { maximum: { unit: 'business_day', value: Math.max(1, Number(rate.estimatedDays)) } }
            : undefined,
        },
      }],
      automatic_tax: { enabled: process.env.STRIPE_AUTOMATIC_TAX !== 'false' },
      billing_address_collection: 'auto',
      phone_number_collection: { enabled: true },
      allow_promotion_codes: process.env.STRIPE_ALLOW_PROMOTION_CODES === 'true',
      submit_type: 'pay',
      return_url: returnUrl,
      redirect_on_completion: 'always',
      metadata: commonMetadata,
      payment_intent_data: { metadata: commonMetadata },
      custom_text: {
        shipping_address: { message: 'Confirm the delivery address for your book order.' },
        submit: { message: 'Books will ship the week of November 20th.' },
      },
    }, { idempotencyKey: `checkout-${body.attemptId}` });

    return json(response, 200, {
      clientSecret: session.client_secret,
      publishableKey,
      sessionId: session.id,
    });
  } catch (error) {
    console.error('stripe_checkout_session_error', error?.type || error?.name || 'Error', error?.message || 'Unknown error');
    return json(response, error.status || error.statusCode || 502, {
      message: error.status === 400 ? error.message : 'Secure checkout could not start. Please try again.',
    });
  }
}
