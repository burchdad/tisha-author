import Stripe from 'stripe';
import { json } from '../server/book-order.js';

export const config = { api: { bodyParser: false } };

const RESEND_API_URL = 'https://api.resend.com/emails';

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function money(amount = 0, currency = 'usd') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(amount / 100);
}

async function readRawBody(request) {
  if (Buffer.isBuffer(request.rawBody)) return request.rawBody;
  if (Buffer.isBuffer(request.body)) return request.body;
  if (typeof request.body === 'string') return Buffer.from(request.body);
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > 1024 * 1024) throw new Error('Webhook payload is too large.');
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

function addressLines(address = {}, name = '') {
  return [
    name,
    address.line1,
    address.line2,
    [address.city, address.state, address.postal_code].filter(Boolean).join(', '),
    address.country,
  ].filter(Boolean);
}

async function sendEmail(apiKey, idempotencyKey, payload) {
  const result = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(payload),
  });
  if (!result.ok) {
    const detail = await result.text().catch(() => '');
    throw new Error(`Email delivery failed (${result.status}): ${detail.slice(0, 200)}`);
  }
}

async function fulfillPaidSession(stripe, sessionId) {
  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ['line_items', 'customer', 'payment_intent'],
  });
  if (!['paid', 'no_payment_required'].includes(session.payment_status)) return;
  if (session.metadata?.fulfillment_notified === 'true') return;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY is not configured.');
  const fromEmail = process.env.RESEND_FROM_EMAIL || "Rider's Magic Mark <onboarding@resend.dev>";
  const merchantEmail = process.env.ORDER_NOTIFICATION_EMAIL || process.env.RESEND_TO_EMAIL || 'stephen.burch@ghostai.solutions';
  const customer = typeof session.customer === 'object' ? session.customer : null;
  const collectedShipping = session.collected_information?.shipping_details || session.shipping_details;
  const shipping = collectedShipping || customer?.shipping || {};
  const recipientName = shipping.name || session.customer_details?.name || customer?.name || '';
  const recipientAddress = shipping.address || customer?.shipping?.address || customer?.address || {};
  const buyerEmail = session.customer_details?.email || customer?.email || '';
  const buyerPhone = shipping.phone || session.customer_details?.phone || customer?.phone || '';
  const items = session.line_items?.data || [];
  const orderId = session.client_reference_id || session.id;
  const itemLines = items.map((item) => `${item.quantity || 1} × ${item.description || "Rider's Magic Mark"} — ${money(item.amount_total || 0, session.currency)}`);
  const destination = addressLines(recipientAddress, recipientName);
  const paymentIntent = typeof session.payment_intent === 'object' ? session.payment_intent : null;
  const paymentId = paymentIntent?.id || session.payment_intent || '';
  const dashboardBase = session.livemode ? 'https://dashboard.stripe.com/payments/' : 'https://dashboard.stripe.com/test/payments/';
  const paymentUrl = paymentId ? `${dashboardBase}${paymentId}` : 'https://dashboard.stripe.com/payments';
  const totals = {
    subtotal: money(session.amount_subtotal || 0, session.currency),
    shipping: money(session.total_details?.amount_shipping || 0, session.currency),
    tax: money(session.total_details?.amount_tax || 0, session.currency),
    total: money(session.amount_total || 0, session.currency),
  };
  const carrier = [session.metadata?.shipping_provider, session.metadata?.shipping_service].filter(Boolean).join(' ');
  const subject = `Paid book order ${orderId} — ${totals.total}`;
  const merchantText = [
    "New paid Rider's Magic Mark order",
    `Order: ${orderId}`,
    `Stripe payment: ${paymentId || 'available in Stripe Dashboard'}`,
    '',
    ...itemLines,
    '',
    `Subtotal: ${totals.subtotal}`,
    `Shipping: ${totals.shipping}${carrier ? ` (${carrier})` : ''}`,
    `Tax: ${totals.tax}`,
    `Total paid: ${totals.total}`,
    '',
    'Ship to:',
    ...destination,
    buyerEmail ? `Email: ${buyerEmail}` : '',
    buyerPhone ? `Phone: ${buyerPhone}` : '',
    '',
    `View payment: ${paymentUrl}`,
    'The shipping label has not been purchased yet. Review the address, then create the label in Shippo.',
  ].filter(Boolean).join('\n');
  const merchantHtml = `
    <div style="font-family:Arial,sans-serif;line-height:1.55;color:#172033;max-width:680px">
      <h1 style="font-size:24px">New paid Rider's Magic Mark order</h1>
      <p><strong>Order:</strong> ${escapeHtml(orderId)}<br><strong>Total paid:</strong> ${escapeHtml(totals.total)}</p>
      <h2 style="font-size:18px">Books</h2>
      <ul>${itemLines.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>
      <p>Subtotal: ${escapeHtml(totals.subtotal)}<br>Shipping: ${escapeHtml(totals.shipping)}${carrier ? ` (${escapeHtml(carrier)})` : ''}<br>Tax: ${escapeHtml(totals.tax)}<br><strong>Total: ${escapeHtml(totals.total)}</strong></p>
      <h2 style="font-size:18px">Ship to</h2>
      <p>${destination.map(escapeHtml).join('<br>')}</p>
      ${buyerEmail ? `<p><strong>Email:</strong> ${escapeHtml(buyerEmail)}</p>` : ''}
      ${buyerPhone ? `<p><strong>Phone:</strong> ${escapeHtml(buyerPhone)}</p>` : ''}
      <p><a href="${escapeHtml(paymentUrl)}">View the verified payment in Stripe</a></p>
      <p><strong>Next step:</strong> Review the address, then create the shipping label in Shippo. No label has been purchased automatically.</p>
    </div>`;

  await sendEmail(apiKey, `merchant-order/${session.id}`, {
    from: fromEmail,
    to: [merchantEmail],
    reply_to: buyerEmail || undefined,
    subject,
    text: merchantText,
    html: merchantHtml,
  });

  if (buyerEmail && process.env.SEND_CUSTOMER_CONFIRMATION !== 'false') {
    const buyerText = [
      `Thank you for ordering Rider's Magic Mark.`,
      `Order: ${orderId}`,
      ...itemLines,
      `Total paid: ${totals.total}`,
      'Books will ship the week of November 20th.',
      'Questions: ridersmagicmark@gmail.com',
    ].join('\n');
    await sendEmail(apiKey, `customer-order/${session.id}`, {
      from: fromEmail,
      to: [buyerEmail],
      reply_to: 'ridersmagicmark@gmail.com',
      subject: `Your Rider's Magic Mark order is confirmed`,
      text: buyerText,
      html: `<div style="font-family:Arial,sans-serif;line-height:1.55;color:#172033;max-width:680px"><h1 style="font-size:24px">Thank you for your order!</h1><p>Your payment is confirmed for order <strong>${escapeHtml(orderId)}</strong>.</p><ul>${itemLines.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul><p><strong>Total paid:</strong> ${escapeHtml(totals.total)}</p><p>Books will ship the week of November 20th.</p><p>Questions? Reply to this email or contact ridersmagicmark@gmail.com.</p></div>`,
    });
  }

  await stripe.checkout.sessions.update(session.id, {
    metadata: { ...session.metadata, fulfillment_notified: 'true', fulfillment_notified_at: new Date().toISOString() },
  });
}

export default async function handler(request, response) {
  if (request.method !== 'POST') return json(response, 405, { message: 'Method not allowed.' });
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secretKey || !webhookSecret) return json(response, 503, { message: 'Stripe webhook is not configured yet.' });

  try {
    const rawBody = await readRawBody(request);
    const signature = request.headers['stripe-signature'];
    if (!signature) return json(response, 400, { message: 'Missing Stripe signature.' });
    const stripe = new Stripe(secretKey);
    const event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      await fulfillPaidSession(stripe, event.data.object.id);
    }
    return json(response, 200, { received: true });
  } catch (error) {
    console.error('stripe_webhook_error', error?.type || error?.name || 'Error', error?.message || 'Unknown error');
    return json(response, 400, { message: 'Webhook could not be processed.' });
  }
}
