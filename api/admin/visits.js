import { isAuthenticated, authenticatedEmail } from '../../server/admin-auth.js';
import { methodNotAllowed, sendJson } from '../../server/http.js';
import { createVisitStore } from '../../server/visit-store.js';
import { applyVisitAction, calendarExport, publicReview, validId, VisitError } from '../../server/visit-model.js';
import { readVisitJson, requireVisitOrigin, visitConfigured } from '../../server/visit-http.js';
import { isReadOnlyPreview } from '../../server/preview-safety.js';

export function createVisitsHandler({ store = createVisitStore(), now = () => Date.now() } = {}) {
  return async (request, response) => {
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('Referrer-Policy', 'no-referrer');
    if (!['GET', 'POST'].includes(request.method)) return methodNotAllowed(response, ['GET', 'POST']);
    if (!isAuthenticated(request)) return sendJson(response, 401, { message: 'Sign in to review this visit request.' });
    // Never load real school/contact data or mutate live records from a preview.
    if (isReadOnlyPreview()) return sendJson(response, 403, { message: 'Visit records and calendar exports are unavailable in this review preview. Use the live website after this feature is approved and configured.' });
    try {
      if (!visitConfigured()) throw new VisitError('School visit review is not configured yet.', 503);
      let body;
      if (request.method === 'POST') { requireVisitOrigin(request); body = await readVisitJson(request); }
      const query = request.query || Object.fromEntries(new URL(request.url, 'https://local.invalid').searchParams);
      const id = request.method === 'POST' ? body?.id : query.id;
      if (!validId(id)) throw new VisitError('Invalid request ID.');
      const saved = await store.read(id);
      if (!saved) throw new VisitError('Visit request not found.', 404);
      if (request.method === 'GET') {
        // Opening a link, previewing email or downloading an export never changes state.
        if (query.format === 'ics') {
          const calendar = calendarExport(saved.record);
          response.statusCode = 200;
          response.setHeader('Content-Type', 'text/calendar; charset=utf-8');
          response.setHeader('Content-Disposition', `attachment; filename="school-visit-${id}.ics"`);
          response.end(calendar); return;
        }
        return sendJson(response, 200, { visit: publicReview(saved.record), calendarIntegration: 'manual' });
      }
      const next = applyVisitAction(saved.record, body, authenticatedEmail(request), now());
      if (next !== saved.record) await store.write(next, saved.etag);
      return sendJson(response, 200, { visit: publicReview(next), calendarIntegration: 'manual' });
    } catch (error) {
      return sendJson(response, error instanceof VisitError ? error.status : 503, { message: error instanceof VisitError ? error.message : 'Unable to load or save the request. Reload to check its current status.' });
    }
  };
}
export default createVisitsHandler();
