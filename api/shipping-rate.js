import { json, normalizeBookOrder, quoteShippoOrder, readJsonBody } from '../server/book-order.js';

export default async function handler(request, response) {
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (request.method === 'OPTIONS') {
    response.statusCode = 204;
    response.end();
    return;
  }
  if (request.method !== 'POST') return json(response, 405, { message: 'Method not allowed.' });

  try {
    const body = await readJsonBody(request);
    const order = normalizeBookOrder(body);
    const rate = await quoteShippoOrder(order, {
      apiToken: process.env.SHIPPO_API_TOKEN || process.env.SHIPPO_API_KEY || process.env.SHIPPO_TOKEN,
    });
    return json(response, 200, rate);
  } catch (error) {
    return json(response, error.status || 400, { message: error.message || 'Please check the shipping details and try again.' });
  }
}
