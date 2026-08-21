const SHIPPO_SHIPMENTS_URL = 'https://api.goshippo.com/shipments/';

const ORIGIN_ADDRESS = {
  name: "Rider's Magic Mark",
  street1: '641 Winding Brook Ln.',
  city: 'Tyler',
  state: 'TX',
  zip: '75703',
  country: 'US',
};

const PACKAGE_PROFILES = {
  paperback: {
    weightEach: 0.55,
    heightEach: 0.35,
  },
  hardcover: {
    weightEach: 0.85,
    heightEach: 0.55,
  },
};

function json(response, status, payload) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify(payload));
}

async function readBody(request) {
  if (request.body && typeof request.body === 'object') return request.body;
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const rawBody = Buffer.concat(chunks).toString('utf8');
  return rawBody ? JSON.parse(rawBody) : {};
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

function buildParcel(format, quantity) {
  const profile = PACKAGE_PROFILES[format] ?? PACKAGE_PROFILES.paperback;
  const weight = profile.weightEach * quantity + 0.22;
  const height = Math.max(profile.heightEach * quantity, profile.heightEach);

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
  const validRates = rates
    .filter((rate) => rate.currency === 'USD' && !Number.isNaN(Number.parseFloat(rate.amount)))
    .sort((first, second) => Number.parseFloat(first.amount) - Number.parseFloat(second.amount));

  return validRates[0] ?? null;
}

export default async function handler(request, response) {
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (request.method === 'OPTIONS') {
    response.statusCode = 204;
    response.end();
    return;
  }

  if (request.method !== 'POST') {
    json(response, 405, { message: 'Method not allowed.' });
    return;
  }

  const apiToken = process.env.SHIPPO_API_TOKEN;
  if (!apiToken) {
    json(response, 503, { message: 'Live shipping is not configured yet.' });
    return;
  }

  let body;
  try {
    body = await readBody(request);
  } catch {
    json(response, 400, { message: 'Please check the shipping details and try again.' });
    return;
  }

  const format = body.format === 'hardcover' ? 'hardcover' : 'paperback';
  const quantity = normalizeQuantity(body.quantity);
  const state = cleanState(body.state);
  const zip = cleanZip(body.zip);

  if (!state || zip.length < 5) {
    json(response, 400, { message: 'Please enter a destination state and ZIP code.' });
    return;
  }

  const addressTo = {
    name: String(body.name || "Rider's Magic Mark reader").trim(),
    street1: String(body.street || '').trim(),
    city: String(body.city || '').trim(),
    state,
    zip,
    country: 'US',
    email: String(body.email || '').trim(),
  };

  Object.keys(addressTo).forEach((key) => {
    if (!addressTo[key]) delete addressTo[key];
  });

  const shippoResponse = await fetch(SHIPPO_SHIPMENTS_URL, {
    method: 'POST',
    headers: {
      Authorization: `ShippoToken ${apiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      address_from: ORIGIN_ADDRESS,
      address_to: addressTo,
      parcels: [buildParcel(format, quantity)],
      async: false,
    }),
  });

  let payload = {};
  try {
    payload = await shippoResponse.json();
  } catch {
    payload = {};
  }

  if (!shippoResponse.ok) {
    json(response, 502, { message: payload.detail || payload.message || 'Shippo could not return a live rate yet.' });
    return;
  }

  const bestRate = chooseBestRate(payload.rates);
  if (!bestRate) {
    json(response, 502, { message: 'No live shipping rates were returned for that destination.' });
    return;
  }

  json(response, 200, {
    amount: Number.parseFloat(bestRate.amount),
    currency: bestRate.currency,
    provider: bestRate.provider || 'Carrier',
    service: bestRate.servicelevel?.name || bestRate.servicelevel?.token || 'Shipping',
    estimatedDays: bestRate.estimated_days ?? null,
    rateId: bestRate.object_id || '',
    source: 'shippo',
  });
}
