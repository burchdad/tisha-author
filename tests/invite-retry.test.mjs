import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { createHash, webcrypto } from 'node:crypto';

const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
const code = main.slice(main.indexOf('function initializeInviteForm()'), main.indexOf('\ninitializeCharacterCarousel();'));
const key = 'rmm_school_visit_retry_v1';
const start = Date.parse('2026-10-13T20:00:00Z');
const fixtureFields = { name: 'Fixture Coordinator', school: 'Fixture School', email: 'fixture@example.com', interest: 'Classroom workshop', preferredDate: '2026-11-10', preferredTime: '10:00', timeZone: 'America/Chicago', durationMinutes: '45', location: 'Fixture Library', notes: 'Offline fixture only', website: '' };
const success = () => ({ ok: true, json: async () => ({ message: 'Request received for review. Not booked.' }) });
function storage() {
  const values = new Map();
  return { values, getItem: (name) => values.get(name) ?? null, setItem: (name, value) => values.set(name, value), removeItem: (name) => values.delete(name) };
}
function mount({ saved = storage(), fields = { ...fixtureFields }, now = start, crypto = webcrypto, send = async () => { throw new Error('Response lost'); } } = {}) {
  let listener; let resets = 0;
  const status = { dataset: {} }; const button = {};
  const calls = [];
  const form = {
    elements: { timeZone: {} }, querySelector: (selector) => selector === '[data-form-status]' ? status : button,
    addEventListener: (_name, callback) => { listener = callback; }, reportValidity: () => true,
    reset: () => { resets++; },
  };
  class FixtureDate extends Date { static now() { return now; } }
  const context = vm.createContext({
    document: { querySelector: () => form }, Intl, Date: FixtureDate, sessionStorage: saved, crypto, TextEncoder, Uint8Array,
    FormData: class { entries() { return Object.entries(fields); } },
    fetch: async (_url, options) => { calls.push(JSON.parse(options.body)); return send(options); },
  });
  vm.runInContext(`${code}\ninitializeInviteForm();`, context);
  return { saved, fields, calls, status, button, get resets() { return resets; }, submit: () => listener({ preventDefault() {} }) };
}

test('uncertain public submission survives reload with only ID, SHA-256 fingerprint and original timestamp', async () => {
  const saved = storage(); const first = mount({ saved }); await first.submit();
  const original = JSON.parse(saved.getItem(key));
  assert.deepEqual(Object.keys(original).sort(), ['createdAt', 'fingerprint', 'id']);
  assert.equal(original.fingerprint, createHash('sha256').update(JSON.stringify(fixtureFields)).digest('hex'));
  assert.equal(original.createdAt, start); assert.doesNotMatch(saved.getItem(key), /Fixture|fixture@example.com|2026-11-10/);
  const reload = mount({ saved, now: start + 1000 });
  assert.match(reload.status.textContent, /previous submission/); assert.match(reload.status.textContent, /23 hours/);
  await reload.submit(); assert.equal(reload.calls[0].requestId, first.calls[0].requestId);
  assert.equal(JSON.parse(saved.getItem(key)).createdAt, start);
  reload.fields.school = 'Changed Fixture School'; await reload.submit();
  assert.notEqual(reload.calls[1].requestId, first.calls[0].requestId);
});

test('success alone clears the pending retry; malformed success leaves it available', async () => {
  const saved = storage(); const first = mount({ saved, send: async () => ({ ok: true, json: async () => { throw new Error('Truncated JSON'); } }) });
  await first.submit(); assert.equal(first.resets, 0); assert.ok(saved.getItem(key)); assert.equal(first.status.dataset.state, 'error');
  const next = mount({ saved, send: success }); await next.submit();
  assert.equal(next.calls[0].requestId, first.calls[0].requestId); assert.equal(saved.getItem(key), null);
  assert.equal(next.resets, 1); assert.equal(next.status.dataset.state, 'success');
});

test('unavailable or silently rejected storage prevents any submission and unlocks the button', async () => {
  for (const saved of [
    { getItem() { throw new Error('Storage denied'); } },
    { getItem: () => null, setItem() { throw new Error('Quota exceeded'); } },
    { getItem: () => null, setItem() {} },
  ]) {
    const page = mount({ saved }); await page.submit();
    assert.equal(page.calls.length, 0); assert.equal(page.button.disabled, false);
    assert.match(page.status.textContent, /Nothing new was sent/);
  }
});

test('corrupt or future-dated retry is retained and fails closed', async () => {
  for (const raw of ['{broken', JSON.stringify({ id: webcrypto.randomUUID(), fingerprint: 'a'.repeat(64), createdAt: start + 1 })]) {
    const saved = storage(); saved.setItem(key, raw); const page = mount({ saved }); await page.submit();
    assert.equal(page.calls.length, 0); assert.equal(saved.getItem(key), raw);
  }
});

test('same request is not resent beyond the 23-hour window or assigned a replacement ID', async () => {
  const saved = storage(); const first = mount({ saved }); await first.submit();
  const original = saved.getItem(key);
  const expired = mount({ saved, now: start + 23 * 60 * 60 * 1000 }); await expired.submit();
  assert.equal(expired.calls.length, 0); assert.equal(saved.getItem(key), original);
  assert.match(expired.status.textContent, /retry window has ended/);
});

test('duplicate submit while asynchronous hashing runs sends only one request', async () => {
  let finishHash; let started;
  const hashing = new Promise((resolve) => { started = resolve; });
  const crypto = { randomUUID: () => webcrypto.randomUUID(), subtle: { digest: async () => { started(); return new Promise((resolve) => { finishHash = resolve; }); } } };
  const page = mount({ crypto, send: success });
  const first = page.submit(); await hashing; const second = page.submit();
  assert.equal(page.button.disabled, true); finishHash(new Uint8Array(32).buffer);
  await Promise.all([first, second]); assert.equal(page.calls.length, 1); assert.equal(page.button.disabled, false);
});

test('hashing failure preserves any saved retry and sends nothing', async () => {
  const saved = storage(); const first = mount({ saved }); await first.submit(); const original = saved.getItem(key);
  const page = mount({ saved, crypto: { subtle: { digest: async () => { throw new Error('Unavailable'); } } } });
  await page.submit(); assert.equal(page.calls.length, 0); assert.equal(saved.getItem(key), original); assert.equal(page.button.disabled, false);
  assert.match(page.status.textContent, /Nothing was sent/);
});

test('failure clearing a confirmed retry does not turn successful delivery into a retry prompt', async () => {
  const saved = storage(); saved.removeItem = () => { throw new Error('Storage denied'); };
  const page = mount({ saved, send: success }); await page.submit();
  assert.equal(page.status.dataset.state, 'success'); assert.match(page.status.textContent, /received/);
  assert.match(page.status.textContent, /could not clear/); assert.ok(saved.getItem(key)); assert.equal(page.calls.length, 1);
});
