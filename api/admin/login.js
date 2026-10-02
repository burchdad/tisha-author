import { createSession, hasSameOrigin, sessionCookie, validateCredentials } from '../../server/admin-auth.js';
import { methodNotAllowed, readJson, sendJson } from '../../server/http.js';

export default async function handler(request, response) {
  if (request.method !== 'POST') return methodNotAllowed(response, ['POST']);
  if (!hasSameOrigin(request)) return sendJson(response, 403, { message: 'Request rejected.' });
  try {
    const body = await readJson(request);
    if (!validateCredentials(body.email, body.password)) return sendJson(response, 401, { message: 'Email or password is incorrect.' });
    response.setHeader('Set-Cookie', sessionCookie(createSession()));
    sendJson(response, 200, { authenticated: true });
  } catch {
    sendJson(response, 400, { message: 'Please check the form and try again.' });
  }
}
