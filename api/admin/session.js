import { adminConfigured, isAuthenticated } from '../../server/admin-auth.js';
import { methodNotAllowed, sendJson } from '../../server/http.js';

export default function handler(request, response) {
  if (request.method !== 'GET') return methodNotAllowed(response, ['GET']);
  sendJson(response, 200, { authenticated: isAuthenticated(request), configured: adminConfigured() });
}
