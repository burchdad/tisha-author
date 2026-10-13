import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultContent, normalizeContent, writeContent, restoreContentRevision } from '../server/content-store.js';
import { preserveLegacyGallery, validateContentRevision } from '../server/gallery-model.js';
import { isReadOnlyPreview } from '../server/preview-safety.js';
import { createSession } from '../server/admin-auth.js';
import contentHandler from '../api/admin/content.js';
import uploadHandler from '../api/admin/upload.js';
import revisionHandler from '../api/admin/revisions.js';
import sessionHandler from '../api/admin/session.js';

const album = (id = 'album_reading01') => ({ id, title: 'Library <reading>', date: '', coverPhotoId: '' });
const photo = (id = 'photo_reading01', eventId = '') => ({ id, eventId, title: 'Reading', url: '/api/media?pathname=uploads%2Fexisting.jpg', alt: '<script>literal text</script>' });
const source = () => ({ ...defaultContent(), eventAlbums: [album()], gallery: [photo()] });
const invalid = (fn, message) => assert.throws(fn, (error) => error.code === 'INVALID_CONTENT' && (!message || message.test(error.message)));

test('legacy photos keep URL, description and date with stable IDs; no event invented', () => {
  const input = defaultContent(); delete input.eventAlbums;
  input.gallery = [{ title: 'Original caption', description: 'Original details', date: '2026-10-01', url: '/uploads/photo.jpg' }, { url: '/uploads/photo.jpg' }];
  const one = normalizeContent(input), two = normalizeContent(input);
  assert.deepEqual(one, two); assert.deepEqual(one.eventAlbums, []);
  assert.equal(one.gallery.length, 2); assert.notEqual(one.gallery[0].id, one.gallery[1].id);
  assert.equal(one.gallery[0].url, input.gallery[0].url); assert.equal(one.gallery[0].title, 'Original caption');
  assert.equal(one.gallery[0].description, 'Original details'); assert.equal(one.gallery[0].date, '2026-10-01');
  assert.equal(one.gallery[0].eventId, '');
  assert.deepEqual(normalizeContent(one), one);
});

test('event albums and explicit own-photo cover round-trip', () => {
  const input = source(); input.gallery[0].eventId = input.eventAlbums[0].id;
  input.eventAlbums[0].coverPhotoId = input.gallery[0].id; input.eventAlbums[0].date = '2028-02-29';
  const result = normalizeContent(input);
  assert.deepEqual(result.eventAlbums, input.eventAlbums); assert.equal(result.gallery[0].id, input.gallery[0].id);
  assert.equal(result.gallery[0].alt, input.gallery[0].alt);
});

for (const value of ['bad/id', '../escape', 'album_x', '<img>', 1]) {
  test(`reject invalid album ID ${JSON.stringify(value)}`, () => { const input = source(); input.eventAlbums[0].id = value; invalid(() => normalizeContent(input)); });
}
for (const value of ['2026-02-29', '2026-13-01', '2026-00-01', '2026-04-31', 'next week']) {
  test(`reject invalid event date ${value}`, () => { const input = source(); input.eventAlbums[0].date = value; invalid(() => normalizeContent(input), /valid event date/); });
}
test('reject duplicate album or photo IDs', () => {
  let input = source(); input.eventAlbums.push(album()); invalid(() => normalizeContent(input));
  input = source(); input.gallery.push(photo()); invalid(() => normalizeContent(input));
});
test('reject unknown event association and cross-event or unknown covers', () => {
  let input = source(); input.gallery[0].eventId = 'album_unknown1'; invalid(() => normalizeContent(input));
  input = source(); input.eventAlbums[0].coverPhotoId = input.gallery[0].id; invalid(() => normalizeContent(input), /event cover/);
  input.gallery[0].eventId = 'album_other001'; input.eventAlbums.push(album('album_other001')); invalid(() => normalizeContent(input), /event cover/);
  input.eventAlbums[0].coverPhotoId = 'photo_unknown1'; invalid(() => normalizeContent(input), /event cover/);
});
test('removing an event with explicit reassignment keeps its photo and URL', () => {
  const input = source(); input.eventAlbums = []; const result = normalizeContent(input);
  assert.equal(result.gallery.length, 1); assert.equal(result.gallery[0].url, input.gallery[0].url); assert.equal(result.gallery[0].eventId, '');
});
test('gallery over old 100-photo limit is preserved; excessive collections fail without truncation', () => {
  const input = source(); input.gallery = Array.from({ length: 101 }, (_, n) => photo('photo_' + String(n).padStart(8, '0')));
  assert.equal(normalizeContent(input).gallery.length, 101);
  input.gallery = Array.from({ length: 1001 }, (_, n) => photo('photo_' + String(n).padStart(8, '0')));
  invalid(() => normalizeContent(input), /No photos were saved or removed/);
});
test('invalid URLs cannot be stored under an identified photo; empty identified cards cannot silently vanish', () => {
  for (const url of ['', 'javascript:alert(1)', '//evil.example/a', '/\\evil.example/a', 'https://user:password@example.com/a']) {
    const input = source(); input.gallery[0].url = url; invalid(() => normalizeContent(input));
  }
});
test('old editor payload preserves album association, covers, and omitted existing photos', () => {
  const saved = source(); saved.gallery[0].eventId = saved.eventAlbums[0].id; saved.eventAlbums[0].coverPhotoId = saved.gallery[0].id;
  const old = { ...defaultContent(), gallery: [{ title: 'Updated caption', url: saved.gallery[0].url }] }; delete old.eventAlbums;
  const merged = normalizeContent(preserveLegacyGallery(old, saved));
  assert.deepEqual(merged.eventAlbums, saved.eventAlbums); assert.equal(merged.gallery[0].eventId, saved.eventAlbums[0].id);
  assert.equal(merged.gallery[0].id, saved.gallery[0].id); assert.equal(merged.gallery[0].title, 'Updated caption');
  old.gallery = []; const missing = normalizeContent(preserveLegacyGallery(old, saved));
  assert.equal(missing.gallery.length, 1); assert.equal(missing.gallery[0].url, saved.gallery[0].url);
});
test('album-aware payload allows intentional photo removal, but cannot leave a dangling cover', () => {
  const saved = source(); const input = { ...saved, gallery: [] };
  assert.equal(normalizeContent(preserveLegacyGallery(input, saved)).gallery.length, 0);
  input.eventAlbums[0].coverPhotoId = saved.gallery[0].id; invalid(() => normalizeContent(input));
});
test('stale revision is rejected; unchanged revision and legacy payload accepted', () => {
  validateContentRevision({ revision: null }, { revision: null });
  validateContentRevision({ revision: 'site-content/1.json' }, { revision: 'site-content/1.json' });
  validateContentRevision({}, { revision: 'site-content/2.json' });
  assert.throws(() => validateContentRevision({ revision: 'site-content/1.json' }, { revision: 'site-content/2.json' }), { code: 'CONTENT_CONFLICT' });
});

function response() { return { headers: {}, setHeader(key, value) { this.headers[key] = value; }, end(value) { this.body = JSON.parse(value); } }; }

test('preview content writes, restore, and upload signing are blocked before any Blob operation', async () => {
  const previous = { ...process.env }; process.env.VERCEL_ENV = 'preview';
  process.env.ADMIN_EMAIL = 'fixture@example.test'; process.env.ADMIN_PASSWORD = 'synthetic fixture'; process.env.ADMIN_AUTH_SECRET = 'a-long-synthetic-fixture-secret';
  try {
    assert.equal(isReadOnlyPreview(), true);
    await assert.rejects(writeContent(source()), { code: 'READ_ONLY_PREVIEW' });
    await assert.rejects(restoreContentRevision('site-content/1.json'), { code: 'READ_ONLY_PREVIEW' });
    const headers = { cookie: `rmm_admin_session=${createSession()}`, origin: 'https://preview.example.test', host: 'preview.example.test' };
    for (const [handler, method, body] of [[contentHandler, 'PUT', source()], [uploadHandler, 'POST', {}], [revisionHandler, 'POST', { id: 'site-content/1.json' }]]) {
      const result = response(); await handler({ method, headers, body }, result);
      assert.equal(result.statusCode, 403); assert.match(result.body.message, /read-only/);
    }
    const session = response(); sessionHandler({ method: 'GET', headers }, session);
    assert.equal(session.body.readOnly, true);
    const unauthenticated = response(); await contentHandler({ method: 'PUT', headers: {}, body: source() }, unauthenticated);
    assert.equal(unauthenticated.statusCode, 401);
    const crossOrigin = response(); await contentHandler({ method: 'PUT', headers: { ...headers, origin: 'https://elsewhere.example' }, body: source() }, crossOrigin);
    assert.equal(crossOrigin.statusCode, 403); assert.equal(crossOrigin.body.message, 'Request rejected.');
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key];
    Object.assign(process.env, previous);
  }
});

test('Vercel deployments fail closed without explicit production identity', () => {
  const vercel = process.env.VERCEL, env = process.env.VERCEL_ENV;
  try {
    process.env.VERCEL = '1'; delete process.env.VERCEL_ENV; assert.equal(isReadOnlyPreview(), true);
    process.env.VERCEL_ENV = 'production'; assert.equal(isReadOnlyPreview(), false);
    process.env.VERCEL_ENV = 'preview'; assert.equal(isReadOnlyPreview(), true);
  } finally {
    if (vercel === undefined) delete process.env.VERCEL; else process.env.VERCEL = vercel;
    if (env === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = env;
  }
});

test('legacy paths containing spaces remain present with safely encoded URLs', () => {
  const input = defaultContent(); input.gallery = [{ url: '/uploads/school visit.jpg', title: 'Original photo' }];
  const result = normalizeContent(input);
  assert.equal(result.gallery.length, 1); assert.equal(result.gallery[0].url, '/uploads/school%20visit.jpg');
  assert.equal(result.gallery[0].title, 'Original photo');
});
test('album and photo IDs must be primitive strings, never coercible arrays', () => {
  const input = source(); input.eventAlbums[0].id = ['album_reading01']; invalid(() => normalizeContent(input));
  input.eventAlbums[0].id = 'album_reading01'; input.gallery[0].id = ['photo_reading01']; invalid(() => normalizeContent(input));
});

test('an old editor can save a legacy space URL without duplicating the saved photo', () => {
  const original = defaultContent(); delete original.eventAlbums;
  original.gallery = [{ url: '/uploads/school visit.jpg', title: 'Original' }];
  const current = normalizeContent(original);
  original.gallery[0].title = 'Updated caption';
  const result = normalizeContent(preserveLegacyGallery(original, current));
  assert.equal(result.gallery.length, 1); assert.equal(result.gallery[0].id, current.gallery[0].id);
  assert.equal(result.gallery[0].title, 'Updated caption');
});
