import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createSession } from '../server/admin-auth.js';
import { normalizeInquiry, resolveSchedule, createVisit, applyVisitAction, calendarExport, VisitError } from '../server/visit-model.js';
import { createVisitStore } from '../server/visit-store.js';
import { createSchoolVisitHandler } from '../api/school-visit.js';
import { createVisitsHandler } from '../api/admin/visits.js';
import { inquiryEmail } from '../server/visit-email.js';
import { schoolVisitSender } from '../server/visit-sender.js';

const now = Date.parse('2026-10-12T12:00:00Z');
const fields = { name: 'School Coordinator', school: 'Test School', email: 'teacher@example.com', interest: 'Classroom reading', preferredDate: '2026-11-10', preferredTime: '10:00', timeZone: 'America/Chicago', durationMinutes: '45', location: 'Example City Library', notes: 'Local fixture only' };
Object.assign(process.env, { ADMIN_EMAIL: 'author@example.com', ADMIN_PASSWORD: 'a-secure-fixture-password', ADMIN_AUTH_SECRET: 'a-long-32-character-fixture-secret-for-tests', SCHOOL_VISIT_APPROVAL_ENABLED: 'true', SCHOOL_VISIT_SITE_URL: 'https://school.example.com', SCHOOL_VISIT_FROM_EMAIL: 'visits@school.example.com', BLOB_STORE_ID: 'fixture', RESEND_API_KEY: 'not-a-real-key' });
const cookie = `rmm_admin_session=${createSession('author@example.com')}`;
function request(method, body = {}, extra = {}) { return { method, body, query: {}, headers: { host: 'school.example.com', origin: 'https://school.example.com', 'content-type': 'application/json', cookie }, ...extra }; }
function response() { return { headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, end(value) { this.text = value; }, json() { return JSON.parse(this.text); } }; }
function memoryStore() {
  const values = new Map(); let writes = 0;
  return { values, get writes() { return writes; }, async read(id) { return values.has(id) ? structuredClone(values.get(id)) : null; }, async write(record, etag) { const current = values.get(record.id); if ((!etag && current) || (etag && current?.etag !== etag)) throw new VisitError('Conflict', 409); writes++; values.set(record.id, { record: structuredClone(record), etag: String(writes) }); } };
}
const inquiry = () => normalizeInquiry(fields, now);
const approved = () => applyVisitAction(createVisit(randomUUID(), inquiry(), now), { version: 1, operationId: randomUUID(), action: 'approve', availabilityChecked: true, schedule: fields }, 'author@example.com', now);

test('timezone conversion handles winter, summer, duration and non-US offsets', () => {
  assert.equal(inquiry().startAt, '2026-11-10T16:00:00.000Z');
  assert.equal(inquiry().endAt, '2026-11-10T16:45:00.000Z');
  assert.equal(resolveSchedule({ ...fields, preferredDate: '2027-07-10' }, now).startAt, '2027-07-10T15:00:00.000Z');
  assert.equal(resolveSchedule({ ...fields, timeZone: 'Asia/Kathmandu' }, now).startAt, '2026-11-10T04:15:00.000Z');
});
test('rejects DST gap, repeated time, invalid dates, past dates, zone and duration', () => {
  for (const override of [ { preferredDate: '2027-03-14', preferredTime: '02:30' }, { preferredDate: '2026-11-01', preferredTime: '01:30' }, { preferredDate: '2027-02-30' }, { preferredDate: '2026-01-01' }, { timeZone: 'Not/AZone' }, { durationMinutes: 0 }, { durationMinutes: 481 }, { durationMinutes: '30.5' } ]) assert.throws(() => resolveSchedule({ ...fields, ...override }, now), VisitError);
});
test('input validation rejects email injection, overlong and empty fields', () => {
  for (const override of [{ email: 'a@example.com\r\nBcc: x@example.com' }, { notes: 'x'.repeat(3001) }, { name: '' }, { location: '' }]) assert.throws(() => normalizeInquiry({ ...fields, ...override }, now), VisitError);
});
test('approval requires explicit availability and durable action deduplication', () => {
  const record = createVisit(randomUUID(), inquiry(), now);
  const body = { version: 1, operationId: randomUUID(), action: 'approve', schedule: fields };
  assert.throws(() => applyVisitAction(record, body, 'author@example.com', now), /calendar/);
  body.availabilityChecked = true;
  const next = applyVisitAction(record, body, 'author@example.com', now);
  assert.equal(next.status, 'approved'); assert.equal(next.calendar.status, 'not_recorded'); assert.equal(next.version, 2);
  assert.equal(applyVisitAction(next, body, 'author@example.com', now), next);
  assert.throws(() => applyVisitAction(next, { ...body, action: 'decline' }, 'author@example.com', now), /already used/);
  assert.throws(() => applyVisitAction(next, { ...body, operationId: randomUUID() }, 'author@example.com', now), /changed/);
});
test('manual calendar confirmation is separate and cannot happen before approval', () => {
  const body = { version: 1, operationId: randomUUID(), action: 'record-calendar', calendarLabel: 'Author calendar', calendarSaved: true };
  assert.throws(() => applyVisitAction(createVisit(randomUUID(), inquiry(), now), body, 'author@example.com', now), /Approve/);
  const record = approved(); const next = applyVisitAction(record, { ...body, version: 2 }, 'author@example.com', now);
  assert.equal(next.calendar.status, 'manually_recorded'); assert.equal(next.calendar.recordedBy, 'author@example.com');
});
test('calendar export is approval-only, stable UID, UTC, escaped and no invitation', () => {
  assert.throws(() => calendarExport(createVisit(randomUUID(), inquiry(), now)), /Approve/);
  const record = approved(); record.requested.school = 'A, B; C\nBEGIN:VEVENT';
  const first = calendarExport(record); const second = calendarExport(record);
  assert.equal(first, second); assert.match(first, /DTSTART:20261110T160000Z/); assert.match(first, /DTEND:20261110T164500Z/);
  assert.match(first, /A\\, B\\; C\\nBEGIN:VEVENT/); assert.doesNotMatch(first, /ATTENDEE|ORGANIZER|METHOD:REQUEST/);
  assert.equal(first.match(/\r\nBEGIN:VEVENT\r\n/g).length, 1);
  for (const line of first.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75);
});
test('sender uses canonical display name and requires separate approved mailbox', () => {
  const saved = process.env.SCHOOL_VISIT_FROM_EMAIL;
  assert.equal(schoolVisitSender(), "Rider's Magic Mark <visits@school.example.com>");
  for (const unsafe of ['', 'Stephen <stephen@example.com>', 'x@example.com\r\nBcc: y@example.com', 'onboarding@resend.dev']) { process.env.SCHOOL_VISIT_FROM_EMAIL = unsafe; assert.throws(schoolVisitSender, VisitError); }
  process.env.SCHOOL_VISIT_FROM_EMAIL = saved;
});
test('email contains authenticated review link, no action token or secrets, safe user HTML', () => {
  const record = createVisit(randomUUID(), { ...inquiry(), school: '<script>alert(1)</script>' }, now);
  const email = inquiryEmail(record, 'https://school.example.com');
  assert.match(email.html, /visits.html\?id=/); assert.doesNotMatch(email.html, /<script>|token=|approve=/); assert.match(email.html, /&lt;script&gt;/); assert.match(email.text, /not booked/);
});
test('public request persists before email, retries do not duplicate and reply-to is requester', async () => {
  const store = memoryStore(); const calls = [];
  const handler = createSchoolVisitHandler({ store, now: () => now, send: async (...args) => { assert.equal(store.values.size, 1); calls.push(args); return { ok: true, json: async () => ({ id: 'fixture-email' }) }; } });
  const body = { ...fields, requestId: randomUUID() };
  for (let i = 0; i < 2; i++) { const res = response(); await handler(request('POST', body), res); assert.equal(res.statusCode, 200, res.text); }
  assert.equal(calls.length, 1);
  const email = JSON.parse(calls[0][1].body); assert.equal(email.reply_to, fields.email); assert.equal(email.from, "Rider's Magic Mark <visits@school.example.com>"); assert.equal(calls[0][1].headers['Idempotency-Key'], `school-visit-${body.requestId}`);
  const res = response(); await handler(request('POST', { ...body, school: 'Different' }), res); assert.equal(res.statusCode, 409);
});
test('uncertain delivery retries same provider key; does not report success on failure', async () => {
  const store = memoryStore(); const keys = []; let count = 0;
  const handler = createSchoolVisitHandler({ store, now: () => now, send: async (_url, options) => { keys.push(options.headers['Idempotency-Key']); if (!count++) throw new Error('timeout'); return { ok: true, json: async () => ({ id: 'fixture-email' }) }; } });
  const body = { ...fields, requestId: randomUUID() };
  const first = response(); await handler(request('POST', body), first); assert.equal(first.statusCode, 503);
  const second = response(); await handler(request('POST', body), second); assert.equal(second.statusCode, 200); assert.equal(keys[0], keys[1]); assert.equal(store.values.size, 1);
});
test('anonymous/scanner requests cannot read, export or approve', async () => {
  const store = memoryStore(); const record = approved(); await store.write(record);
  const handler = createVisitsHandler({ store, now: () => now }); const before = store.writes;
  for (const method of ['GET', 'POST']) { const res = response(); await handler(request(method, { id: record.id }, { query: { id: record.id, action: 'approve', format: 'ics' }, headers: {} }), res); assert.equal(res.statusCode, 401); }
  const res = response(); await handler(request('GET', {}, { query: { id: record.id, action: 'decline' } }), res); assert.equal(res.statusCode, 200); assert.equal(store.writes, before); assert.equal(res.json().visit.status, 'approved');
});
test('mutation requires exact trusted origin and JSON; Host cannot override trust', async () => {
  const store = memoryStore(); const record = createVisit(randomUUID(), inquiry(), now); await store.write(record);
  const handler = createVisitsHandler({ store, now: () => now });
  for (const origin of [undefined, 'https://evil.example', 'http://school.example.com']) { const res = response(); await handler(request('POST', { id: record.id }, { headers: { cookie, origin, host: 'evil.example', 'content-type': 'application/json' } }), res); assert.equal(res.statusCode, 403); }
  const res = response(); await handler(request('POST', { id: record.id }, { headers: { cookie, origin: 'https://school.example.com', 'content-type': 'text/plain' } }), res); assert.equal(res.statusCode, 415);
});
test('authenticated POST approval and repeated POST are idempotent; stale edits conflict', async () => {
  const store = memoryStore(); const record = createVisit(randomUUID(), inquiry(), now); await store.write(record);
  const handler = createVisitsHandler({ store, now: () => now });
  const body = { id: record.id, version: 1, operationId: randomUUID(), action: 'approve', availabilityChecked: true, schedule: fields };
  for (let i = 0; i < 2; i++) { const res = response(); await handler(request('POST', body), res); assert.equal(res.statusCode, 200, res.text); }
  assert.equal(store.writes, 2); assert.equal(store.values.get(record.id).record.audit.length, 1);
  const stale = response(); await handler(request('POST', { ...body, operationId: randomUUID(), action: 'save' }), stale); assert.equal(stale.statusCode, 409);
});
test('Blob adapter uses private uncached reads and conditional writes; never overwrites blindly', async () => {
  const record = createVisit(randomUUID(), inquiry(), now); const calls = [];
  const store = createVisitStore(async () => ({ get: async (path, options) => { calls.push(['get', path, options]); return { statusCode: 200, blob: { etag: 'revision-1' }, stream: new Blob([JSON.stringify(record)]).stream() }; }, put: async (path, body, options) => { calls.push(['put', path, options]); return {}; } }));
  const read = await store.read(record.id); assert.equal(read.etag, 'revision-1'); assert.equal(calls[0][2].access, 'private'); assert.equal(calls[0][2].useCache, false);
  await store.write(record); assert.equal(calls[1][2].allowOverwrite, false);
  await store.write(record, 'revision-1'); assert.equal(calls[2][2].ifMatch, 'revision-1'); assert.equal(calls[2][2].access, 'private');
});
test('oversized public body and invalid UUID are rejected without writes or mail', async () => {
  const store = memoryStore(); const handler = createSchoolVisitHandler({ store, now: () => now, send: () => { throw new Error('must not send'); } });
  const res = response(); await handler(request('POST', { ...fields, notes: 'x'.repeat(17000) }), res); assert.equal(res.statusCode, 413);
  const invalid = response(); await handler(request('POST', { ...fields, requestId: '../secret' }), invalid); assert.equal(invalid.statusCode, 400); assert.equal(store.writes, 0);
});
test('real SDK precondition failure maps to conflict; unknown errors fail closed', async () => {
  const { BlobPreconditionFailedError } = await import('@vercel/blob');
  const record = approved();
  const store = createVisitStore(async () => ({ BlobPreconditionFailedError, put: async () => { throw new BlobPreconditionFailedError(); } }));
  await assert.rejects(store.write(record, 'old'), (error) => error.status === 409);
});
test('concurrent initial submissions retain one record and same provider idempotency key', async () => {
  const store = memoryStore(); const keys = [];
  const handler = createSchoolVisitHandler({ store, now: () => now, send: async (_url, options) => { keys.push(options.headers['Idempotency-Key']); return { ok: true, json: async () => ({ id: 'same-provider-id' }) }; } });
  const body = { ...fields, requestId: randomUUID() }; const a = response(); const b = response();
  await Promise.all([handler(request('POST', body), a), handler(request('POST', body), b)]);
  assert.equal(a.statusCode, 200, a.text); assert.equal(b.statusCode, 200, b.text); assert.equal(store.values.size, 1); assert.equal(new Set(keys).size, 1);
});
test('two simultaneous approval/decline operations cannot both overwrite one revision', async () => {
  const store = memoryStore(); const record = createVisit(randomUUID(), inquiry(), now); await store.write(record);
  const handler = createVisitsHandler({ store, now: () => now }); const a = response(); const b = response();
  await Promise.all([
    handler(request('POST', { id: record.id, version: 1, operationId: randomUUID(), action: 'approve', schedule: fields, availabilityChecked: true }), a),
    handler(request('POST', { id: record.id, version: 1, operationId: randomUUID(), action: 'decline' }), b),
  ]);
  assert.deepEqual([a.statusCode, b.statusCode].sort(), [200, 409]); assert.equal(store.writes, 2); assert.equal(store.values.get(record.id).record.audit.length, 1);
});
test('old uncertain email is not retried beyond provider idempotency window', async () => {
  const store = memoryStore(); const record = createVisit(randomUUID(), inquiry(), now - 24 * 3600000); await store.write(record);
  const handler = createSchoolVisitHandler({ store, now: () => now, send: () => { throw new Error('must not send'); } });
  const res = response(); await handler(request('POST', { ...fields, requestId: record.id }), res); assert.equal(res.statusCode, 503); assert.match(res.text, /delivery check/);
});
test('turning feature off does not bypass the required branded-sender migration', async () => {
  const flag = process.env.SCHOOL_VISIT_APPROVAL_ENABLED; const from = process.env.SCHOOL_VISIT_FROM_EMAIL;
  try {
    delete process.env.SCHOOL_VISIT_APPROVAL_ENABLED; delete process.env.SCHOOL_VISIT_FROM_EMAIL;
    const res = response(); await createSchoolVisitHandler()(request('POST', fields), res); assert.equal(res.statusCode, 503); assert.match(res.text, /being configured/);
  } finally { process.env.SCHOOL_VISIT_APPROVAL_ENABLED = flag; process.env.SCHOOL_VISIT_FROM_EMAIL = from; }
});
test('UTF-8 calendar folding preserves long school names without extra events', () => {
  const record = approved(); record.requested.school = '👩‍🏫 École '.repeat(40);
  const ics = calendarExport(record); for (const line of ics.split('\r\n')) assert.ok(Buffer.byteLength(line, 'utf8') <= 75);
  assert.match(ics.replace(/\r\n /g, ''), /SUMMARY:School visit: 👩‍🏫 École/);
});
