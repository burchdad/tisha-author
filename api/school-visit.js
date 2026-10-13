import legacyHandler from '../server/legacy-school-visit.js';
import { randomUUID } from 'node:crypto';
import { adminConfigured } from '../server/admin-auth.js';
import { methodNotAllowed, sendJson } from '../server/http.js';
import { createVisitStore } from '../server/visit-store.js';
import { createVisit, digest, normalizeInquiry, validId, VisitError } from '../server/visit-model.js';
import { readVisitJson, requireVisitOrigin, siteOrigin, visitConfigured } from '../server/visit-http.js';
import { inquiryEmail } from '../server/visit-email.js';
import { schoolVisitSender } from '../server/visit-sender.js';

export function createSchoolVisitHandler({ store = createVisitStore(), send = (...args) => fetch(...args), now = () => Date.now() } = {}) {
  return async function handler(request, response) {
    if (process.env.SCHOOL_VISIT_APPROVAL_ENABLED !== 'true') return legacyHandler(request, response);
    if (request.method !== 'POST') return methodNotAllowed(response, ['POST']);
    try {
      requireVisitOrigin(request);
      if (!visitConfigured() || !adminConfigured() || !process.env.RESEND_API_KEY) throw new VisitError('School visit review is being configured. Please contact us directly.', 503);
      const from = schoolVisitSender();
      const body = await readVisitJson(request);
      if (body?.website) return sendJson(response, 200, { message: 'Thanks! We received your request.' });
      const fields = normalizeInquiry(body, now());
      const id = body.requestId || randomUUID();
      if (!validId(id)) throw new VisitError('Please refresh the form and try again.');
      let saved = await store.read(id);
      if (!saved) {
        try { await store.write(createVisit(id, fields, now())); }
        catch (error) {
          // A concurrent create or an interrupted response may already have saved
          // the record. Re-read instead of interpreting SDK error message text.
          if (!await store.read(id)) throw error;
        }
        saved = await store.read(id);
      }
      if (!saved) throw new Error('Unable to read saved request.');
      if (saved.record.requestDigest !== digest(fields)) throw new VisitError('The submitted details changed. Refresh the page to send a new request.', 409);
      if (saved.record.notification.status !== 'sent') {
        // Resend retains idempotency keys for 24 hours. Never retry an uncertain
        // send after that window; preserve the request for operator recovery.
        if (now() - Date.parse(saved.record.createdAt) > 23 * 3600000) throw new VisitError('Your request is saved, but its email needs a delivery check. Please contact us directly.', 503);
        const result = await send('https://api.resend.com/emails', {
          method: 'POST', headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': `school-visit-${id}` },
          body: JSON.stringify({ from, to: [process.env.INVITE_TO_EMAIL || process.env.RESEND_TO_EMAIL || 'ridersmagicmark@gmail.com'], reply_to: fields.email, ...inquiryEmail(saved.record, siteOrigin()) }),
          signal: AbortSignal.timeout(10000),
        });
        if (!result.ok) throw new VisitError('Your request is saved, but the notification could not be sent. Try again with the same details.', 502);
        const delivery = await result.json();
        if (typeof delivery.id !== 'string') throw new Error('Email provider did not confirm acceptance.');
        for (let attempt = 0; attempt < 3; attempt++) {
          saved = await store.read(id);
          if (saved.record.notification.status === 'sent') break;
          const record = { ...saved.record, notification: { status: 'sent', providerId: delivery.id, sentAt: new Date(now()).toISOString() } };
          try { await store.write(record, saved.etag); break; }
          catch (error) { if (error.status !== 409 || attempt === 2) throw error; }
        }
      }
      return sendJson(response, 200, { message: 'Thanks! Your visit request has been sent for review. The date is not booked until the author confirms it with you.' });
    } catch (error) {
      return sendJson(response, error instanceof VisitError ? error.status : 503, { message: error instanceof VisitError ? error.message : 'We could not confirm delivery yet. Please retry with the same details.' });
    }
  };
}
export default createSchoolVisitHandler();
