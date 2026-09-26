import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import handler from '../api/shippo-webhook.js';

async function invoke({ method = 'POST', body = { event: 'transaction_created', test: true, data: { status: 'SUCCESS' } }, raw, url = '/api/shippo-webhook' } = {}) {
  const request = raw === undefined ? { method, body, url } : Object.assign(Readable.from([raw]), { method, url });
  const headers = {};
  const response = { setHeader: (key, value) => { headers[key] = value; }, end: (value) => { response.body = value ? JSON.parse(value) : null; } };
  await handler(request, response);
  return { status: response.statusCode, body: response.body, headers };
}

test('receipt-only receiver acknowledges Shippo samples and live event envelopes', async () => {
  for (const event of ['transaction_created', 'transaction_updated', 'track_updated', 'batch_created', 'batch_purchased']) {
    for (const testMode of [true, false]) {
      const result = await invoke({ body: { event, test: testMode, data: event.startsWith('batch') ? 'batch completed' : {} } });
      assert.equal(result.status, 200);
      assert.equal(result.body.mode, 'receipt-only');
    }
  }
});

test('raw JSON, health checks, invalid payloads and method restrictions', async () => {
  assert.equal((await invoke({ raw: JSON.stringify({ event: 'track_updated', data: {} }) })).status, 200);
  assert.equal((await invoke({ method: 'GET' })).status, 200);
  assert.equal((await invoke({ method: 'HEAD' })).body, null);
  assert.equal((await invoke({ method: 'PUT' })).status, 405);
  assert.equal((await invoke({ raw: '{broken' })).status, 400);
  assert.equal((await invoke({ body: {} })).status, 400);
  assert.equal((await invoke({ raw: 'x'.repeat(256 * 1024 + 1) })).status, 413);
  assert.equal((await invoke({ body: { event: 'future_event', data: {} } })).body.ignored, true);
});

test('configured shared token rejects absent and wrong tokens', async () => {
  const previous = process.env.SHIPPO_WEBHOOK_TOKEN;
  process.env.SHIPPO_WEBHOOK_TOKEN = 'unit-test-secret';
  try {
    assert.equal((await invoke()).status, 401);
    assert.equal((await invoke({ url: '/api/shippo-webhook?token=wrong' })).status, 401);
    assert.equal((await invoke({ url: '/api/shippo-webhook?token=unit-test-secret' })).status, 200);
  } finally {
    if (previous === undefined) delete process.env.SHIPPO_WEBHOOK_TOKEN;
    else process.env.SHIPPO_WEBHOOK_TOKEN = previous;
  }
});
