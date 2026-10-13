import { VisitError } from './visit-model.js';
export function siteOrigin() {
  try {
    const url = new URL(process.env.SCHOOL_VISIT_SITE_URL);
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error();
    return url.origin;
  } catch { throw new VisitError('School visit review is not configured yet.', 503); }
}
export function requireVisitOrigin(request) {
  if (request.headers.origin !== siteOrigin()) throw new VisitError('Request rejected. Please open the review page on the website.', 403);
  if (!String(request.headers['content-type'] || '').toLowerCase().startsWith('application/json')) throw new VisitError('JSON is required.', 415);
}
export async function readVisitJson(request) {
  if (request.body && typeof request.body === 'object') {
    if (Buffer.byteLength(JSON.stringify(request.body)) > 16000) throw new VisitError('This request is too large.', 413);
    return request.body;
  }
  if (typeof request.body === 'string') {
    if (Buffer.byteLength(request.body) > 16000) throw new VisitError('This request is too large.', 413);
    try { return JSON.parse(request.body); } catch { throw new VisitError('Please check the form.'); }
  }
  let size = 0; const chunks = [];
  for await (const chunk of request) { const buffer = Buffer.from(chunk); size += buffer.length; if (size > 16000) throw new VisitError('This request is too large.', 413); chunks.push(buffer); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { throw new VisitError('Please check the form.'); }
}
export function visitConfigured() {
  return process.env.SCHOOL_VISIT_APPROVAL_ENABLED === 'true' && Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
}
