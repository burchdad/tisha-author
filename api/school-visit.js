const RESEND_API_URL = 'https://api.resend.com/emails';

function json(response, status, payload) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify(payload));
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function isValidEmail(value = '') {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value).trim());
}

async function readBody(request) {
  if (request.body && typeof request.body === 'object') return request.body;
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const rawBody = Buffer.concat(chunks).toString('utf8');
  return rawBody ? JSON.parse(rawBody) : {};
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

  const apiKey = process.env.RESEND_API_KEY;
  const toEmail = process.env.INVITE_TO_EMAIL || process.env.RESEND_TO_EMAIL || 'ridersmagicmark@gmail.com';
  const fromEmail = process.env.RESEND_FROM_EMAIL || "Rider's Magic Mark <onboarding@resend.dev>";

  if (!apiKey || !toEmail) {
    json(response, 500, { message: 'Email delivery is not configured yet.' });
    return;
  }

  let body;
  try {
    body = await readBody(request);
  } catch {
    json(response, 400, { message: 'Please check the form and try again.' });
    return;
  }

  if (body.website) {
    json(response, 200, { message: 'Thanks! We received your request.' });
    return;
  }

  const fields = {
    name: String(body.name || '').trim(),
    school: String(body.school || '').trim(),
    email: String(body.email || '').trim(),
    interest: String(body.interest || '').trim(),
    preferredDate: String(body.preferredDate || '').trim(),
    preferredTime: String(body.preferredTime || '').trim(),
    notes: String(body.notes || '').trim(),
  };

  if (!fields.name || !fields.school || !isValidEmail(fields.email) || !fields.interest || !fields.preferredDate || !fields.preferredTime) {
    json(response, 400, { message: 'Please complete the required fields before submitting.' });
    return;
  }

  const subject = `School visit inquiry from ${fields.school}`;
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#172033">
      <h1 style="font-size:24px">New Rider's Magic Mark school visit inquiry</h1>
      <p><strong>Name:</strong> ${escapeHtml(fields.name)}</p>
      <p><strong>School or organization:</strong> ${escapeHtml(fields.school)}</p>
      <p><strong>Email:</strong> ${escapeHtml(fields.email)}</p>
      <p><strong>Visit interest:</strong> ${escapeHtml(fields.interest)}</p>
      <p><strong>Preferred date:</strong> ${escapeHtml(fields.preferredDate)}</p>
      <p><strong>Preferred time:</strong> ${escapeHtml(fields.preferredTime)}</p>
      ${fields.notes ? `<p><strong>Notes:</strong><br />${escapeHtml(fields.notes).replaceAll('\n', '<br />')}</p>` : ''}
    </div>
  `;

  const text = [
    "New Rider's Magic Mark school visit inquiry",
    `Name: ${fields.name}`,
    `School or organization: ${fields.school}`,
    `Email: ${fields.email}`,
    `Visit interest: ${fields.interest}`,
    `Preferred date: ${fields.preferredDate}`,
    `Preferred time: ${fields.preferredTime}`,
    fields.notes ? `Notes: ${fields.notes}` : '',
  ].filter(Boolean).join('\n');

  const resendResponse = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [toEmail],
      reply_to: fields.email,
      subject,
      html,
      text,
    }),
  });

  if (!resendResponse.ok) {
    json(response, 502, { message: 'The message could not be sent yet. Please try again soon.' });
    return;
  }

  json(response, 200, { message: 'Thanks! We received your request and will follow up soon.' });
}
