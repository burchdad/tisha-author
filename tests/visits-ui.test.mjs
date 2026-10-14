import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createVisit, normalizeInquiry, applyVisitAction } from '../server/visit-model.js';

const script = (await readFile(new URL('../src/visits.js', import.meta.url), 'utf8')).replace(/^import .*;\n/gm, '');
const now = Date.parse('2026-10-13T20:00:00Z');
const fields = { name: 'Fixture Coordinator', school: 'Fixture School', email: 'fixture@example.com', interest: 'Classroom workshop', preferredDate: '2026-11-10', preferredTime: '10:00', timeZone: 'America/Chicago', durationMinutes: '45', location: 'Fixture Library', notes: 'Offline fixture' };
class Element {
  constructor() { this.listeners = new Map(); this.dataset = {}; this.children = []; this.value = ''; this.checked = false; this.hidden = false; }
  addEventListener(name, callback) { this.listeners.set(name, callback); }
  fire(name, extra = {}) { this.listeners.get(name)?.({ preventDefault() {}, stopPropagation() {}, currentTarget: this, ...extra }); }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  focus() { this.focused = true; }
  removeAttribute(name) { delete this[name]; }
  reset() { for (const node of Object.values(this.elements || {})) { node.value = ''; node.checked = false; } }
}
async function fixture({ expireOnMutation = false, loseChangesResponse = false, readOnly = false, signedIn = true } = {}) {
  let record = createVisit(randomUUID(), normalizeInquiry(fields, now), now); let authenticated = signedIn;
  const elements = new Map();
  for (const [, id] of script.matchAll(/\$\('#([^']+)'\)/g)) if (!elements.has(id)) elements.set(id, new Element());
  const form = elements.get('review-form');
  form.elements = Object.fromEntries(['preferredDate', 'preferredTime', 'timeZone', 'durationMinutes', 'location', 'availabilityChecked', 'changeMessage'].map((name) => [name, new Element()]));
  elements.get('login-form').elements = { email: new Element(), password: new Element() };
  elements.get('calendar-form').elements = { calendarLabel: new Element(), calendarSaved: new Element() };
  const calls = []; const buttons = [new Element(), new Element()]; const window = new Element();
  const response = (status, result) => ({ status, ok: status >= 200 && status < 300, json: async () => structuredClone(result) });
  const context = vm.createContext({
    document: { querySelector: (selector) => elements.get(selector.slice(1)), querySelectorAll: () => buttons, createElement: () => new Element() },
    window, URL, location: { href: `https://fixture.example/visits.html?id=${record.id}` }, crypto: { randomUUID }, confirm: () => true,
    FormData: class {
      constructor(form) { this.form = form; }
      *[Symbol.iterator]() { for (const [name, node] of Object.entries(this.form.elements)) if (name !== 'availabilityChecked' || node.checked) yield [name, name === 'availabilityChecked' ? 'on' : node.value]; }
    },
    fetch: async (path, options = {}) => {
      calls.push({ path, method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : null });
      if (path === '/api/admin/session') return response(200, { authenticated, readOnly });
      if (path === '/api/admin/logout') { authenticated = false; return response(200, { authenticated }); }
      if (options.method === 'POST' && expireOnMutation) authenticated = false;
      if (!authenticated) return response(401, { message: 'Sign in to review this visit request.' });
      if (options.method === 'POST') {
        const body = JSON.parse(options.body);
        try { record = applyVisitAction(record, body, 'author@example.com', now); }
        catch (error) { return response(error.status || 400, { message: error.message }); }
        if (loseChangesResponse && body.action === 'request-changes') { loseChangesResponse = false; throw new Error('Fixture response lost'); }
      }
      return response(200, { visit: record, calendarIntegration: 'manual' });
    },
  });
  vm.runInContext(script, context);
  async function idle() {
    for (let i = 0; i < 20; i++) {
      if (!vm.runInContext('busy', context)) return;
      await new Promise(setImmediate);
    }
    assert.fail('Fixture did not become idle');
  }
  await idle();
  return { elements, form, calls, buttons, window, idle, expire: () => { authenticated = false; }, get record() { return record; }, posts: () => calls.filter((call) => call.method === 'POST') };
}

function assertPrivateReviewCleared(page) {
  for (const id of ['school', 'state', 'request-notes', 'change-request-summary', 'approved-summary', 'calendar-state']) assert.equal(page.elements.get(id).textContent, '', id);
  assert.equal(page.elements.get('request-details').children.length, 0);
  for (const node of Object.values(page.form.elements)) { assert.equal(node.value, ''); assert.equal(node.checked, false); }
  for (const node of Object.values(page.elements.get('calendar-form').elements)) { assert.equal(node.value, ''); assert.equal(node.checked, false); }
  assert.equal(page.elements.get('calendar-download').href, undefined); assert.equal(page.elements.get('school-reply').href, undefined);
  assert.equal(page.elements.get('school-reply').textContent, 'Draft a reply to the school');
}

test('request-changes UI requires a message, keeps editing open, and prepares only a separate school draft', async () => {
  const page = await fixture();
  page.form.fire('submit', { submitter: { value: 'request-changes' } }); await page.idle();
  assert.equal(page.posts().length, 0); assert.equal(page.form.elements.changeMessage.focused, true);
  assert.match(page.elements.get('status').textContent, /Describe the changes/);
  page.form.elements.preferredTime.value = '11:00';
  page.form.elements.changeMessage.value = 'Could we start later? <img src=x onerror=alert(1)>';
  page.form.fire('submit', { submitter: { value: 'request-changes' } }); await page.idle();
  assert.equal(page.posts().length, 1); assert.equal(page.posts()[0].body.action, 'request-changes');
  assert.equal(page.record.status, 'changes_requested'); assert.equal(page.record.calendar.status, 'not_recorded');
  assert.equal(page.form.hidden, false); assert.equal(page.elements.get('calendar-panel').hidden, true);
  assert.match(page.elements.get('state').textContent, /not approved or booked/);
  assert.equal(page.elements.get('change-request-summary').children.length, 0);
  assert.match(page.elements.get('change-request-summary').textContent, /<img src=x/);
  const draft = new URL(page.elements.get('school-reply').href);
  assert.equal(draft.protocol, 'mailto:'); assert.equal(decodeURIComponent(draft.pathname), fields.email);
  assert.match(draft.searchParams.get('body'), /Could we start later/); assert.match(draft.searchParams.get('body'), /11:00/);
  assert.match(draft.searchParams.get('body'), /not booked yet/);
  assert.match(page.elements.get('status').textContent, /No email was sent/);
  assert.ok(page.calls.every((call) => call.path.startsWith('/api/admin/')));
});

test('interrupted request-changes response reloads durable state without a second mutation', async () => {
  const page = await fixture({ loseChangesResponse: true });
  page.form.elements.changeMessage.value = 'Please choose a smaller group.';
  page.form.fire('submit', { submitter: { value: 'request-changes' } }); await page.idle();
  assert.equal(page.posts().length, 1); assert.equal(page.record.status, 'changes_requested');
  assert.match(page.elements.get('state').textContent, /Changes requested/);
  assert.equal(page.form.hidden, false); assert.equal(page.elements.get('calendar-panel').hidden, true);
  assert.equal(page.form.elements.changeMessage.value, 'Please choose a smaller group.');
});

test('late session expiration during mutation hides private review and restores sign-in without changing the record', async () => {
  const page = await fixture({ expireOnMutation: true });
  assert.equal(page.elements.get('review-panel').hidden, false);
  page.form.elements.changeMessage.value = 'Please confirm the address.';
  page.form.fire('submit', { submitter: { value: 'request-changes' } }); await page.idle();
  assert.equal(page.posts().length, 1); assert.equal(page.record.status, 'pending');
  assert.equal(page.elements.get('review-panel').hidden, true); assert.equal(page.elements.get('login-panel').hidden, false);
  assert.match(page.elements.get('status').textContent, /Sign in/);
  assert.ok(page.buttons.every((button) => !button.disabled));
  assertPrivateReviewCleared(page);
});

test('preview never prompts author login or requests real visit records, regardless of session state', async () => {
  for (const signedIn of [true, false]) {
    const page = await fixture({ readOnly: true, signedIn });
    assert.equal(page.elements.get('review-panel').hidden, true); assert.equal(page.elements.get('login-panel').hidden, true);
    assert.match(page.elements.get('status').textContent, /review preview/);
    assert.match(page.elements.get('status').textContent, /No author sign-in is needed/);
    assert.deepEqual(page.calls.map((call) => call.path), ['/api/admin/session']);
    assertPrivateReviewCleared(page);
  }
});

test('sign-out removes school contact text, schedule fields, calendar label, and private links from DOM', async () => {
  const page = await fixture();
  page.elements.get('calendar-form').elements.calendarLabel.value = 'Private author calendar';
  assert.match(page.elements.get('school-reply').href, /fixture%40example.com/);
  page.elements.get('logout').fire('click'); await page.idle();
  assert.equal(page.elements.get('review-panel').hidden, true); assert.equal(page.elements.get('login-panel').hidden, false);
  assert.match(page.elements.get('status').textContent, /Signed out/); assertPrivateReviewCleared(page);
});

test('restored browser page clears private DOM before showing a now-expired session', async () => {
  const page = await fixture(); page.expire();
  page.window.fire('pageshow', { persisted: true });
  assertPrivateReviewCleared(page);
  await page.idle();
  assert.equal(page.elements.get('review-panel').hidden, true); assert.equal(page.elements.get('login-panel').hidden, false);
  assert.equal(page.calls.filter((call) => call.path.includes('/visits')).length, 1);
});
