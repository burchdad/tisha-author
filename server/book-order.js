const SHIPPO_SHIPMENTS_URL = 'https://api.goshippo.com/shipments/';

export const ORIGIN_ADDRESS = {
  name: "Rider's Magic Mark",
  street1: '641 Winding Brook Ln.',
  city: 'Tyler',
  state: 'TX',
  zip: '75703',
  country: 'US',
};

export const PRODUCTS = {
  paperback: { name: "Rider's Magic Mark — Soft-cover", unitAmount: 1399, weightEach: 0.55, heightEach: 0.35 },
  hardcover: { name: "Rider's Magic Mark — Hard-cover", unitAmount: 1599, weightEach: 0.85, heightEach: 0.55 },
};

function cleanText(value, maxLength = 160) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

function cleanZip(value = '') {
  return String(value).replace(/[^\d-]/g, '').slice(0, 10);
}

function cleanState(value = '') {
  return String(value).trim().toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2);
}

function normalizeQuantity(value) {
  const quantity = Number.parseInt(value ?? '1', 10);
  if (Number.isNaN(quantity)) return 1;
  return Math.min(Math.max(quantity, 1), 10);
}

function isValidEmail(value = '') {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function inputError(message) {
  return Object.assign(new Error(message), { status: 400 });
}

export function normalizeBookOrder(body = {}, { requireAddress = false } = {}) {
  const format = body.format === 'hardcover' ? 'hardcover' : 'paperback';
  const order = {
    format,
    quantity: normalizeQuantity(body.quantity),
    firstName: cleanText(body.firstName, 80),
    lastName: cleanText(body.lastName, 80),
    email: cleanText(body.email, 160).toLowerCase(),
    phone: cleanText(body.phone, 40),
    street: cleanText(body.street, 180),
    street2: cleanText(body.street2, 120),
    city: cleanText(body.city, 100),
    state: cleanState(body.state),
    zip: cleanZip(body.zip),
    country: 'US',
  };
  order.name = [order.firstName, order.lastName].filter(Boolean).join(' ') || cleanText(body.name, 160);

  if (!order.state || order.zip.length < 5) throw inputError('Please enter a valid destination state and ZIP code.');
  if (requireAddress) {
    if (!order.firstName || !order.lastName || !order.street || !order.city) {
      throw inputError('Please complete the shipping name and address.');
    }
    if (!isValidEmail(order.email)) throw inputError('Please enter a valid email address.');
  }
  return order;
}

export function getProduct(order) {
  return PRODUCTS[order.format] || PRODUCTS.paperback;
}

export async function getCheckoutProduct(order, fetchImpl = fetch) {
  const product = { ...getProduct(order) };
  const projectId = process.env.SANITY_PROJECT_ID || process.env.VITE_SANITY_PROJECT_ID;
  const dataset = process.env.SANITY_DATASET || process.env.VITE_SANITY_DATASET || 'production';
  if (!projectId) return product;
  if (!/^[a-z0-9-]+$/i.test(projectId) || !/^[a-z0-9_-]+$/i.test(dataset)) {
    throw Object.assign(new Error('Published book pricing is not configured correctly.'), { status: 503 });
  }
  const query = encodeURIComponent('*[_id == "siteSettings"][0]{paperbackPrice, hardcoverPrice}');
  const response = await fetchImpl(`https://${projectId}.apicdn.sanity.io/v2025-02-19/data/query/${dataset}?perspective=published&query=${query}`);
  const payload = await response.json().catch(() => ({}));
  const price = payload.result?.[`${order.format}Price`];
  if (!response.ok || !Number.isFinite(price) || price <= 0 || price > 1000) {
    throw Object.assign(new Error('Published book pricing could not be verified.'), { status: 503 });
  }
  product.unitAmount = Math.round(price * 100);
  return product;
}

export function buildParcel(order) {
  const product = getProduct(order);
  const weight = product.weightEach * order.quantity + 0.22;
  const height = Math.max(product.heightEach * order.quantity, product.heightEach);
  return {
    length: '10',
    width: '8',
    height: height.toFixed(2),
    distance_unit: 'in',
    weight: weight.toFixed(2),
    mass_unit: 'lb',
  };
}

function chooseBestRate(rates = []) {
  return rates
    .filter((rate) => rate.currency === 'USD' && Number.isFinite(Number.parseFloat(rate.amount)))
    .sort((first, second) => Number.parseFloat(first.amount) - Number.parseFloat(second.amount))[0] || null;
}

export async function quoteShippoOrder(order, { apiToken, fetchImpl = fetch } = {}) {
  if (!apiToken) throw Object.assign(new Error('Live shipping is not configured yet.'), { status: 503 });
  const addressTo = {
    name: order.name || "Rider's Magic Mark reader",
    street1: order.street || undefined,
    street2: order.street2 || undefined,
    city: order.city || undefined,
    state: order.state,
    zip: order.zip,
    country: 'US',
    email: order.email || undefined,
    phone: order.phone || undefined,
  };
  Object.keys(addressTo).forEach((key) => addressTo[key] === undefined && delete addressTo[key]);

  const shippoResponse = await fetchImpl(SHIPPO_SHIPMENTS_URL, {
    method: 'POST',
    headers: { Authorization: `ShippoToken ${apiToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ address_from: ORIGIN_ADDRESS, address_to: addressTo, parcels: [buildParcel(order)], async: false }),
  });
  const payload = await shippoResponse.json().catch(() => ({}));
  if (!shippoResponse.ok) {
    throw Object.assign(new Error(payload.detail || payload.message || 'Shippo could not return a live rate yet.'), { status: 502 });
  }
  const bestRate = chooseBestRate(payload.rates);
  if (!bestRate) throw Object.assign(new Error('No live shipping rates were returned for that destination.'), { status: 502 });
  return {
    amount: Number.parseFloat(bestRate.amount),
    amountCents: Math.round(Number.parseFloat(bestRate.amount) * 100),
    currency: bestRate.currency,
    provider: bestRate.provider || 'Carrier',
    service: bestRate.servicelevel?.name || bestRate.servicelevel?.token || 'Shipping',
    estimatedDays: bestRate.estimated_days ?? null,
    rateId: bestRate.object_id || '',
    source: 'shippo',
  };
}

export async function readJsonBody(request, maxBytes = 32 * 1024) {
  if (request.body !== undefined) {
    const raw = Buffer.isBuffer(request.body) ? request.body.toString('utf8')
      : typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
    if (Buffer.byteLength(raw) > maxBytes) throw Object.assign(new Error('Request is too large.'), { status: 413 });
    return JSON.parse(raw || '{}');
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBytes) throw Object.assign(new Error('Request is too large.'), { status: 413 });
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

export function json(response, status, payload) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(payload));
}
