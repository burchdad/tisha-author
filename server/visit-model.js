import { createHash } from 'node:crypto';

export class VisitError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
export const validId = (value) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const escapeHtml = (value = '') => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
function field(value, name, max, required = true) {
  const result = typeof value === 'string' ? value.trim() : '';
  if ((required && !result) || result.length > max || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(result)) throw new VisitError(`Please check ${name}.`);
  return result;
}

// Derive UTC from the explicitly chosen IANA zone. Reject DST gaps and repeated
// local times rather than silently changing the requested date or offset.
export function resolveSchedule(input, now = Date.now()) {
  const date = field(input.preferredDate, 'the date', 10);
  const time = field(input.preferredTime, 'the time', 5);
  const timeZone = field(input.timeZone, 'the time zone', 80);
  const durationMinutes = Number(input.durationMinutes);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new VisitError('Enter a valid date and time.');
  const target = Date.parse(`${date}T${time}:00Z`);
  if (!Number.isFinite(target) || new Date(target).toISOString().slice(0, 10) !== date) throw new VisitError('Enter a valid date.');
  if (!Number.isInteger(durationMinutes) || durationMinutes < 15 || durationMinutes > 480) throw new VisitError('Choose a duration between 15 and 480 minutes.');
  let formatter;
  try { formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); }
  catch { throw new VisitError('Choose a valid IANA time zone, such as America/Chicago.'); }
  const parts = (stamp) => Object.fromEntries(formatter.formatToParts(stamp).filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]));
  const localStamp = (stamp) => { const p = parts(stamp); return Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:00Z`); };
  const candidates = new Set();
  for (let hours = -36; hours <= 36; hours += 6) {
    const probe = target + hours * 3600000;
    const candidate = target - (localStamp(probe) - probe);
    if (localStamp(candidate) === target) candidates.add(candidate);
  }
  if (candidates.size !== 1) throw new VisitError('This time is skipped or repeated by daylight saving. Choose another time.');
  const start = [...candidates][0];
  if (start <= now) throw new VisitError('Choose a future date and time.');
  return { preferredDate: date, preferredTime: time, timeZone, durationMinutes, startAt: new Date(start).toISOString(), endAt: new Date(start + durationMinutes * 60000).toISOString(), location: field(input.location, 'the visit location or virtual details', 500) };
}

export function normalizeInquiry(body, now) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new VisitError('Please check the form.');
  const email = field(body.email, 'the contact email', 254);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new VisitError('Enter a valid contact email.');
  return { name: field(body.name, 'the contact name', 150), school: field(body.school, 'the school or organization', 200), email, interest: field(body.interest, 'the visit interest', 200), notes: field(body.notes, 'the notes', 3000, false), ...resolveSchedule(body, now) };
}

export function createVisit(id, fields, now) {
  return { id, version: 1, createdAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString(), requestDigest: digest(fields), requested: fields, schedule: fields, status: 'pending', calendar: { status: 'not_recorded' }, notification: { status: 'pending' }, operations: [], audit: [] };
}

export function applyVisitAction(record, body, actor, now = Date.now()) {
  if (!validId(body.operationId)) throw new VisitError('A valid action ID is required.');
  const fingerprint = digest(body);
  const previous = record.operations.find((item) => item.id === body.operationId);
  if (previous) {
    if (previous.fingerprint !== fingerprint) throw new VisitError('This action ID was already used. Reload the request.', 409);
    return record;
  }
  if (body.version !== record.version) throw new VisitError('This request changed in another window. Reload before continuing.', 409);
  const next = structuredClone(record);
  if (body.action === 'save' || body.action === 'approve') {
    if (record.status !== 'pending') throw new VisitError('Only pending requests can be edited or approved.', 409);
    next.schedule = resolveSchedule(body.schedule || {}, now);
    if (body.action === 'approve') {
      if (body.availabilityChecked !== true) throw new VisitError('Check your own calendar and confirm availability before approving.');
      next.status = 'approved';
      next.approvedAt = new Date(now).toISOString();
      next.availabilityCheckedBy = actor;
    }
  } else if (body.action === 'decline') {
    if (record.status !== 'pending') throw new VisitError('Only pending requests can be declined.', 409);
    next.status = 'declined';
  } else if (body.action === 'record-calendar') {
    if (record.status !== 'approved' || record.calendar.status !== 'not_recorded') throw new VisitError('Approve the request first, or reload its current calendar status.', 409);
    if (body.calendarSaved !== true) throw new VisitError('Confirm you saved the event in your calendar.');
    next.calendar = { status: 'manually_recorded', label: field(body.calendarLabel, 'the calendar name or account', 200), recordedAt: new Date(now).toISOString(), recordedBy: actor };
  } else throw new VisitError('Unknown action.');
  if (record.operations.length >= 100) throw new VisitError('This request needs administrator review before further changes.', 409);
  next.version += 1;
  next.updatedAt = new Date(now).toISOString();
  next.operations.push({ id: body.operationId, fingerprint });
  next.audit.push({ action: body.action, actor, at: next.updatedAt, version: next.version });
  return next;
}

export function publicReview(record) {
  const { requestDigest, operations, notification, ...review } = record;
  return review;
}

function icsText(value) { return String(value).replaceAll('\\', '\\\\').replaceAll(/\r\n|\r|\n/g, '\\n').replaceAll(';', '\\;').replaceAll(',', '\\,'); }
function fold(line) {
  const result = []; let current = '';
  for (const character of line) {
    if (Buffer.byteLength(current + character, 'utf8') > 75) { result.push(current); current = ' '; }
    current += character;
  }
  result.push(current); return result.join('\r\n');
}
export function calendarExport(record) {
  if (record.status !== 'approved') throw new VisitError('Approve the visit before exporting it.', 409);
  const stamp = (date) => date.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Riders Magic Mark//School Visits//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT', `UID:school-visit-${record.id}@ridersmagicmark.com`, `DTSTAMP:${stamp(record.approvedAt)}`, `DTSTART:${stamp(record.schedule.startAt)}`, `DTEND:${stamp(record.schedule.endAt)}`, `SUMMARY:${icsText(`School visit: ${record.requested.school}`)}`, `LOCATION:${icsText(record.schedule.location)}`, `DESCRIPTION:${icsText(`${record.requested.interest}\nContact: ${record.requested.name} (${record.requested.email})\nTime zone: ${record.schedule.timeZone}\nSchool confirmation must be sent separately.`)}`, 'END:VEVENT', 'END:VCALENDAR'];
  return lines.map(fold).join('\r\n') + '\r\n';
}
