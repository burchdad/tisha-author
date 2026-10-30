import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/school-visit.js';

test('school visit sender is branded without changing recipient or reply routing', async (t) => {
  const keys = ['RESEND_API_KEY', 'INVITE_TO_EMAIL', 'RESEND_TO_EMAIL', 'RESEND_FROM_EMAIL', 'SCHOOL_VISIT_FROM_EMAIL'];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  });
  process.env.RESEND_API_KEY = 'mock-only-not-a-real-key';
  process.env.INVITE_TO_EMAIL = 'owner@example.com';
  process.env.RESEND_TO_EMAIL = 'fallback@example.com';
  process.env.RESEND_FROM_EMAIL = 'legacy@example.com';
  process.env.SCHOOL_VISIT_FROM_EMAIL = ' notifications@ridersmagicmark.com ';
  const payloads = [];
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://api.resend.com/emails');
    payloads.push(JSON.parse(options.body));
    return { ok: true };
  };
  async function submit() {
    const response = { setHeader() {}, end() {} };
    await handler({ method: 'POST', body: { name: 'Test Adult', school: 'Example School', email: 'teacher@example.com', interest: 'Author Readings', preferredDate: '2026-12-01', preferredTime: '13:00' } }, response);
    assert.equal(response.statusCode, 200);
    const payload = payloads.at(-1);
    assert.deepEqual(payload.to, ['owner@example.com']);
    assert.equal(payload.reply_to, 'teacher@example.com');
    assert.equal(payload.cc, undefined);
    assert.equal(payload.bcc, undefined);
    return payload;
  }
  assert.equal((await submit()).from, "Rider's Magic Mark School Visits <notifications@ridersmagicmark.com>");
  delete process.env.SCHOOL_VISIT_FROM_EMAIL;
  assert.equal((await submit()).from, 'legacy@example.com');
  process.env.SCHOOL_VISIT_FROM_EMAIL = '   ';
  assert.equal((await submit()).from, 'legacy@example.com');
  delete process.env.RESEND_FROM_EMAIL;
  assert.equal((await submit()).from, "Rider's Magic Mark <onboarding@resend.dev>");
  assert.equal(payloads.length, 4);
});
