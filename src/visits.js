import './visits.css';
const $ = (selector) => document.querySelector(selector);
const id = new URL(location.href).searchParams.get('id');
let visit; let busy = false;
const form = $('#review-form');
function status(message, error = false) { $('#status').textContent = message; $('#status').dataset.error = String(error); }
async function api(path, options = {}) {
  const response = await fetch(path, { credentials: 'same-origin', cache: 'no-store', ...options });
  const result = await response.json().catch(() => ({}));
  if (response.status === 401) { visit = undefined; $('#review-panel').hidden = true; $('#login-panel').hidden = false; }
  if (!response.ok) throw new Error(result.message || 'Unable to complete this step.');
  return result;
}
function summary(schedule) { return `${schedule.preferredDate} at ${schedule.preferredTime} (${schedule.timeZone}), ${schedule.durationMinutes} minutes. ${schedule.location}`; }
function detail(label, value) {
  const term = document.createElement('dt'); term.textContent = label;
  const description = document.createElement('dd'); description.textContent = value;
  $('#request-details').append(term, description);
}
function render() {
  $('#login-panel').hidden = true; $('#review-panel').hidden = false;
  $('#school').textContent = visit.requested.school;
  $('#state').textContent = visit.status === 'approved' ? 'Approved by author. School confirmation is a separate step.' : visit.status === 'declined' ? 'Declined by author. Contact the school separately.' : 'Pending author review';
  $('#request-details').replaceChildren();
  detail('Contact', `${visit.requested.name} (${visit.requested.email})`); detail('Interest', visit.requested.interest); detail('Originally requested', summary(visit.requested));
  $('#request-notes').textContent = visit.requested.notes ? `Notes: ${visit.requested.notes}` : '';
  for (const name of ['preferredDate', 'preferredTime', 'timeZone', 'durationMinutes', 'location']) form.elements[name].value = visit.schedule[name];
  form.elements.availabilityChecked.checked = false;
  form.hidden = visit.status !== 'pending';
  $('#calendar-panel').hidden = visit.status !== 'approved';
  $('#approved-summary').textContent = summary(visit.schedule);
  $('#calendar-download').href = `/api/admin/visits?id=${encodeURIComponent(id)}&format=ics`;
  $('#calendar-form').hidden = visit.calendar.status === 'manually_recorded';
  $('#calendar-state').textContent = visit.calendar.status === 'manually_recorded' ? `Marked as saved to ${visit.calendar.label} on ${new Date(visit.calendar.recordedAt).toLocaleString()}. This is your manual confirmation; the website has not verified the calendar entry.` : 'Calendar entry has not yet been recorded.';
  const reply = visit.status === 'approved' ? `Hello ${visit.requested.name},\n\nI have approved the visit request for ${visit.requested.school}.\n\n${summary(visit.schedule)}\n\nPlease confirm these details work for your school.` : `Hello ${visit.requested.name},\n\nThank you for your school visit request for ${visit.requested.school}.\n\n`;
  $('#school-reply').href = `mailto:${encodeURIComponent(visit.requested.email)}?subject=${encodeURIComponent(`School visit: ${visit.requested.school}`)}&body=${encodeURIComponent(reply)}`;
  $('#school-reply').textContent = `Draft reply to ${visit.requested.email}`;
}
async function load() { const result = await api(`/api/admin/visits?id=${encodeURIComponent(id || '')}`); visit = result.visit; render(); }
async function run(work) {
  if (busy) return; busy = true;
  document.querySelectorAll('button').forEach((button) => { button.disabled = true; });
  try { await work(); } catch (error) { status(error.message, true); }
  finally { busy = false; document.querySelectorAll('button').forEach((button) => { button.disabled = false; }); }
}
async function action(fields) {
  const body = { id, version: visit.version, operationId: crypto.randomUUID(), ...fields };
  status('Saving…');
  try {
    const result = await api('/api/admin/visits', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    visit = result.visit; render(); status('Saved. No email or calendar invitation was sent.');
  } catch (error) {
    // If the response was interrupted, read the durable result before any retry.
    try { await load(); } catch { /* Keep the original action error. */ }
    throw error;
  }
}
$('#login-form').addEventListener('submit', (event) => { event.preventDefault(); run(async () => {
  const data = Object.fromEntries(new FormData(event.currentTarget));
  try { await api('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); }
  finally { $('#login-form').elements.password.value = ''; }
  await load(); status('Review the details below.');
}); });
form.addEventListener('input', () => { form.elements.availabilityChecked.checked = false; });
// Clicking the availability checkbox is itself the explicit acknowledgement.
form.elements.availabilityChecked.addEventListener('input', (event) => event.stopPropagation());
form.addEventListener('submit', (event) => { event.preventDefault(); const actionName = event.submitter?.value; run(async () => {
  if (!['save', 'approve'].includes(actionName)) return;
  if (actionName === 'approve' && !form.elements.availabilityChecked.checked) throw new Error('Check your calendar and confirm availability first.');
  await action({ action: actionName, schedule: Object.fromEntries(new FormData(form)), availabilityChecked: form.elements.availabilityChecked.checked });
}); });
$('#decline').addEventListener('click', () => run(async () => { if (confirm('Decline this request? This records the decision only. Contact the school separately.')) await action({ action: 'decline' }); }));
$('#calendar-form').addEventListener('submit', (event) => { event.preventDefault(); const calendarForm = event.currentTarget; run(() => action({ action: 'record-calendar', calendarLabel: calendarForm.elements.calendarLabel.value, calendarSaved: calendarForm.elements.calendarSaved.checked })); });
$('#reload').addEventListener('click', () => run(async () => { await load(); status('Showing the latest saved status.'); }));
$('#logout').addEventListener('click', () => run(async () => { await api('/api/admin/logout', { method: 'POST' }); visit = undefined; $('#review-panel').hidden = true; $('#login-panel').hidden = false; status('Signed out.'); }));
async function initialize() {
  $('#review-panel').hidden = true;
  const session = await api('/api/admin/session');
  if (!session.authenticated) { $('#login-panel').hidden = false; status('Sign in to review this request.'); return; }
  await load(); status('Review the details below.');
}
run(initialize);
window.addEventListener('pageshow', (event) => { if (event.persisted) run(initialize); });
