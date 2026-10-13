import { hasSameOrigin, isAuthenticated } from '../../server/admin-auth.js';
import { listContentRevisions, restoreContentRevision } from '../../server/content-store.js';
import { methodNotAllowed, readJson, sendJson } from '../../server/http.js';

export default async function handler(request, response) {
  if (!['GET', 'POST'].includes(request.method)) return methodNotAllowed(response, ['GET', 'POST']);
  if (!isAuthenticated(request)) return sendJson(response, 401, { message: 'Please sign in again.' });
  if (request.method === 'POST' && !hasSameOrigin(request)) return sendJson(response, 403, { message: 'Request rejected.' });
  try {
    if (request.method === 'GET') return sendJson(response, 200, { revisions: await listContentRevisions() });
    const body = await readJson(request);
    const content = await restoreContentRevision(body.id, body.revision);
    sendJson(response, 200, content);
  } catch (error) {
    sendJson(response, error.code === 'READ_ONLY_PREVIEW' ? 403 : error.code === 'CONTENT_CONFLICT' ? 409 : /Invalid|no longer/.test(error.message) ? 400 : 503, { message: error.message || 'Revision could not be restored.' });
  }
}
