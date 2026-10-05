import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession, hasSameOrigin, isAuthenticated, validateCredentials } from '../server/admin-auth.js';
import { defaultContent, normalizeContent } from '../server/content-store.js';
import mediaHandler from '../api/media.js';

test('admin credentials create a signed session and reject tampering', () => {
  process.env.ADMIN_EMAIL = 'stephen.burch@ghostai.solutions';
  process.env.ADMIN_EMAILS = 'ridersmagicmark@gmail.com';
  process.env.ADMIN_PASSWORD = 'correct horse battery staple';
  process.env.ADMIN_AUTH_SECRET = 'a-long-random-test-secret';
  assert.equal(validateCredentials('STEPHEN.BURCH@GHOSTAI.SOLUTIONS', 'correct horse battery staple'), true);
  assert.equal(validateCredentials('RidersMagicMark@gmail.com', 'correct horse battery staple'), true);
  assert.equal(validateCredentials('other@example.com', 'correct horse battery staple'), false);
  assert.equal(validateCredentials('stephen.burch@ghostai.solutions', 'wrong'), false);
  const token = createSession();
  assert.equal(isAuthenticated({ headers: { cookie: `rmm_admin_session=${token}` } }), true);
  assert.equal(isAuthenticated({ headers: { cookie: `rmm_admin_session=${token}x` } }), false);
  const clientToken = createSession('ridersmagicmark@gmail.com');
  assert.equal(isAuthenticated({ headers: { cookie: `rmm_admin_session=${clientToken}` } }), true);
});

test('mutation origin must match the requested host', () => {
  assert.equal(hasSameOrigin({ headers: { origin: 'https://www.ridersmagicmark.com', host: 'www.ridersmagicmark.com' } }), true);
  assert.equal(hasSameOrigin({ headers: { origin: 'https://example.com', host: 'www.ridersmagicmark.com' } }), false);
});

test('content is normalized and unsafe URLs are removed', () => {
  const source = defaultContent();
  source.settings.hardcoverPrice = 15.99;
  source.media.push({ title: 'Bad link', category: 'podcast', url: 'javascript:alert(1)' });
  source.gallery.push({ title: 'Reading', url: 'https://example.com/photo.jpg', date: '2026-10-02' });
  source.social.push({ platform: 'Unsafe', url: 'javascript:alert(1)' });
  source.events.push({ title: 'Library reading', date: 'October 12', location: 'City Library', url: 'https://example.com/event' });
  const result = normalizeContent(source);
  assert.equal(result.settings.hardcoverPrice, 15.99);
  assert.equal(result.media.some((item) => item.title === 'Bad link'), false);
  assert.equal(result.gallery[0].date, '2026-10-02');
  assert.equal(result.social.some((item) => item.platform === 'Unsafe'), false);
  assert.equal(result.events.at(-1).title, 'Library reading');
  assert.ok(result.toolkit.length > 50);
});

test('invalid catalog prices are rejected', () => {
  const source = defaultContent(); source.settings.paperbackPrice = -1;
  assert.throws(() => normalizeContent(source), /valid prices/);
});

test('private media proxy rejects paths outside the upload folder', async () => {
  let body = '';
  const response = {
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    end(value = '') { body += value; },
  };
  await mediaHandler({ method: 'GET', query: { pathname: '../site-content/secret.json' } }, response);
  assert.equal(response.statusCode, 400);
  assert.match(body, /Invalid media path/);
});
