import { expiredSessionCookie, hasSameOrigin } from '../../server/admin-auth.js';
import { methodNotAllowed, sendJson } from '../../server/http.js';

export default function handler(request, response) {
  if (request.method !== 'POST') return methodNotAllowed(response, ['POST']);
  if (!hasSameOrigin(request)) return sendJson(response, 403, { message: 'Request rejected.' });
  response.setHeader('Set-Cookie', expiredSessionCookie());
  sendJson(response, 200, { authenticated: false });
}
