import { hasSameOrigin, isAuthenticated } from '../../server/admin-auth.js';
import { readContent, writeContent } from '../../server/content-store.js';
import { methodNotAllowed, readJson, sendJson } from '../../server/http.js';

export default async function handler(request, response) {
  if (!['GET', 'PUT'].includes(request.method)) return methodNotAllowed(response, ['GET', 'PUT']);
  if (!isAuthenticated(request)) return sendJson(response, 401, { message: 'Please sign in again.' });
  if (request.method === 'PUT' && !hasSameOrigin(request)) return sendJson(response, 403, { message: 'Request rejected.' });
  try {
    const content = request.method === 'GET' ? await readContent() : await writeContent(await readJson(request));
    sendJson(response, 200, content);
  } catch (error) {
    sendJson(response, error instanceof SyntaxError || error.code === 'INVALID_CONTENT' ? 400 : 503, { message: error.message || 'Content could not be saved.' });
  }
}
