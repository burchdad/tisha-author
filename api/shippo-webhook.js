import { timingSafeEqual } from 'node:crypto';

const MAX_BODY_BYTES = 256 * 1024;
const EVENTS = new Set(['transaction_created', 'transaction_updated', 'track_updated', 'batch_created', 'batch_purchased']);

function reply(response, status, body) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(body));
}

async function readPayload(request) {
  if (request.body !== undefined) {
    const raw = Buffer.isBuffer(request.body) ? request.body.toString('utf8')
      : typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
    if (Buffer.byteLength(raw) > MAX_BODY_BYTES) throw Object.assign(new Error('Too large'), { status: 413 });
    return JSON.parse(raw);
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error('Too large'), { status: 413 });
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export default async function handler(request, response) {
  response.setHeader('Allow', 'GET, HEAD, POST');
  if (request.method === 'GET' || request.method === 'HEAD') {
    response.statusCode = 200;
    response.setHeader('Cache-Control', 'no-store');
    if (request.method === 'HEAD') return response.end();
    return reply(response, 200, { service: 'shippo-webhook', mode: 'receipt-only', message: 'Send Shippo webhook events here using POST.' });
  }
  if (request.method !== 'POST') return reply(response, 405, { error: 'Use POST for Shippo events.' });

  // Shippo supports a shared token in the configured webhook URL. With no token,
  // this route is an untrusted diagnostic receiver only, never a fulfillment trigger.
  const expected = process.env.SHIPPO_WEBHOOK_TOKEN;
  if (expected) {
    const supplied = new URL(request.url, 'https://webhook.invalid').searchParams.get('token') || '';
    const left = Buffer.from(supplied);
    const right = Buffer.from(expected);
    if (left.length !== right.length || !timingSafeEqual(left, right)) {
      return reply(response, 401, { error: 'Invalid webhook token.' });
    }
  }

  let payload;
  try {
    payload = await readPayload(request);
  } catch (error) {
    return reply(response, error.status || 400, { error: error.status === 413 ? 'Payload too large.' : 'Invalid JSON payload.' });
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) ||
      typeof payload.event !== 'string' || !Object.hasOwn(payload, 'data')) {
    return reply(response, 400, { error: 'Expected a Shippo event with event and data fields.' });
  }
  if (!EVENTS.has(payload.event)) return reply(response, 200, { received: true, ignored: true, mode: 'receipt-only' });

  // Record minimal delivery metadata, not customer addresses, email, label URLs,
  // tracking numbers, credentials, or arbitrary payload content.
  console.info('shippo_webhook_received', JSON.stringify({
    event: payload.event,
    test: payload.test === true,
    authentication: expected ? 'shared-token' : 'unverified',
  }));
  return reply(response, 200, { received: true, mode: 'receipt-only' });
}
