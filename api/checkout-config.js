import { json } from '../server/book-order.js';

export default function handler(request, response) {
  if (request.method !== 'GET') return json(response, 405, { message: 'Method not allowed.' });
  const required = [
    process.env.STRIPE_SECRET_KEY,
    process.env.STRIPE_PUBLISHABLE_KEY,
    process.env.STRIPE_WEBHOOK_SECRET,
    process.env.SHIPPO_API_TOKEN || process.env.SHIPPO_API_KEY || process.env.SHIPPO_TOKEN,
    process.env.RESEND_API_KEY,
  ];
  return json(response, 200, { available: required.every(Boolean) });
}
