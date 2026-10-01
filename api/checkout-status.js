import Stripe from 'stripe';
import { json } from '../server/book-order.js';

export default async function handler(request, response) {
  if (request.method !== 'GET') return json(response, 405, { message: 'Method not allowed.' });
  if (!process.env.STRIPE_SECRET_KEY) return json(response, 503, { message: 'Secure checkout is not configured yet.' });
  const sessionId = String(request.query?.session_id || new URL(request.url, 'https://checkout.invalid').searchParams.get('session_id') || '');
  if (!/^cs_(test_|live_)?[A-Za-z0-9_]+$/.test(sessionId)) return json(response, 400, { message: 'Invalid checkout session.' });
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    return json(response, 200, {
      paid: session.payment_status === 'paid' || session.payment_status === 'no_payment_required',
      paymentStatus: session.payment_status,
      status: session.status,
    });
  } catch {
    return json(response, 404, { message: 'Checkout session was not found.' });
  }
}
