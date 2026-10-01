import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import test from 'node:test';
import checkoutHandler from '../api/create-checkout-session.js';
import configHandler from '../api/checkout-config.js';
import statusHandler from '../api/checkout-status.js';
import webhookHandler from '../api/stripe-webhook.js';
import { buildParcel, getCheckoutProduct, getProduct, normalizeBookOrder, quoteShippoOrder } from '../server/book-order.js';

function responseRecorder() {
  return {
    statusCode: 200,
    headers: {},
    body: '',
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    end(value = '') { this.body = value; },
  };
}

function request(method, body, url = '/') {
  const stream = Readable.from(body === undefined ? [] : [typeof body === 'string' ? body : JSON.stringify(body)]);
  stream.method = method;
  stream.url = url;
  stream.headers = {};
  return stream;
}

async function invoke(handler, req) {
  const response = responseRecorder();
  await handler(req, response);
  return { status: response.statusCode, payload: response.body ? JSON.parse(response.body) : null };
}

test('server catalog and shipping quote use authoritative order details', async () => {
  const order = normalizeBookOrder({
    format: 'hardcover', quantity: 2, firstName: ' Jamie ', lastName: ' Reader ',
    email: 'READER@example.com', street: '123 Test Street', city: 'Tyler', state: 'tx', zip: '75703',
  }, { requireAddress: true });
  assert.equal(getProduct(order).unitAmount, 1599);
  assert.equal(order.name, 'Jamie Reader');
  assert.equal(order.email, 'reader@example.com');
  assert.equal(buildParcel(order).mass_unit, 'lb');

  let shippoRequest;
  const rate = await quoteShippoOrder(order, {
    apiToken: 'test-token',
    fetchImpl: async (_url, options) => {
      shippoRequest = JSON.parse(options.body);
      return new Response(JSON.stringify({ rates: [
        { amount: '9.25', currency: 'USD', provider: 'UPS', object_id: 'rate_high', servicelevel: { name: 'Ground' } },
        { amount: '6.10', currency: 'USD', provider: 'USPS', object_id: 'rate_best', estimated_days: 4, servicelevel: { name: 'Ground Advantage' } },
      ] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    },
  });
  assert.equal(rate.amountCents, 610);
  assert.equal(rate.rateId, 'rate_best');
  assert.equal(shippoRequest.address_to.name, 'Jamie Reader');
  assert.equal(shippoRequest.address_to.street1, '123 Test Street');

  const originalProject = process.env.VITE_SANITY_PROJECT_ID;
  process.env.VITE_SANITY_PROJECT_ID = 'dashboardtest';
  try {
    const publishedProduct = await getCheckoutProduct(order, async () => new Response(JSON.stringify({
      result: { paperbackPrice: 13.99, hardcoverPrice: 17.25 },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    assert.equal(publishedProduct.unitAmount, 1725);
  } finally {
    if (originalProject === undefined) delete process.env.VITE_SANITY_PROJECT_ID; else process.env.VITE_SANITY_PROJECT_ID = originalProject;
  }
});

test('invalid address and unconfigured secure checkout fail closed', async () => {
  assert.throws(() => normalizeBookOrder({ state: 'TX', zip: '75703' }, { requireAddress: true }), /complete the shipping/i);
  const saved = {
    stripeSecret: process.env.STRIPE_SECRET_KEY,
    stripePublishable: process.env.STRIPE_PUBLISHABLE_KEY,
    shippo: process.env.SHIPPO_API_TOKEN,
  };
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_PUBLISHABLE_KEY;
  delete process.env.SHIPPO_API_TOKEN;
  try {
    const result = await invoke(checkoutHandler, request('POST', { attemptId: '1234567890123456' }));
    assert.equal(result.status, 503);
    assert.match(result.payload.message, /not configured/i);
    const config = await invoke(configHandler, request('GET'));
    assert.deepEqual(config.payload, { available: false });
  } finally {
    if (saved.stripeSecret === undefined) delete process.env.STRIPE_SECRET_KEY; else process.env.STRIPE_SECRET_KEY = saved.stripeSecret;
    if (saved.stripePublishable === undefined) delete process.env.STRIPE_PUBLISHABLE_KEY; else process.env.STRIPE_PUBLISHABLE_KEY = saved.stripePublishable;
    if (saved.shippo === undefined) delete process.env.SHIPPO_API_TOKEN; else process.env.SHIPPO_API_TOKEN = saved.shippo;
  }
});

test('status and webhook endpoints reject invalid requests', async () => {
  const originalSecret = process.env.STRIPE_SECRET_KEY;
  const originalWebhook = process.env.STRIPE_WEBHOOK_SECRET;
  process.env.STRIPE_SECRET_KEY = 'sk_test_placeholder';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_placeholder';
  try {
    const status = await invoke(statusHandler, request('GET', undefined, '/api/checkout-status?session_id=wrong'));
    assert.equal(status.status, 400);
    const webhookRequest = request('POST', '{}', '/api/stripe-webhook');
    const webhook = await invoke(webhookHandler, webhookRequest);
    assert.equal(webhook.status, 400);
    assert.match(webhook.payload.message, /signature/i);
  } finally {
    if (originalSecret === undefined) delete process.env.STRIPE_SECRET_KEY; else process.env.STRIPE_SECRET_KEY = originalSecret;
    if (originalWebhook === undefined) delete process.env.STRIPE_WEBHOOK_SECRET; else process.env.STRIPE_WEBHOOK_SECRET = originalWebhook;
  }
});
