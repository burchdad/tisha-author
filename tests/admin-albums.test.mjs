import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';

const source = await readFile(new URL('../src/admin.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../admin/index.html', import.meta.url), 'utf8');
const fields = JSON.parse(await readFile(new URL('../cms/text-fields.json', import.meta.url), 'utf8'));
const controlsSelector = 'input:not([type="file"]), textarea, select';

class Element {
  constructor(values = {}) {
    Object.assign(this, { dataset: {}, hidden: false, disabled: false, value: '', innerHTML: '', textContent: '', queries: new Map(), listeners: new Map(), attributes: {} }, values);
    this.classList = { add() {}, remove() {} };
  }
  querySelectorAll(selector) { return this.queries.get(selector) || []; }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  map(selector, ...nodes) { this.queries.set(selector, nodes); return nodes[0]; }
  setAttribute(name, value) { this.attributes[name] = value; }
  hasAttribute(name) { return Object.hasOwn(this.attributes, name); }
  addEventListener(name, listener) { this.listeners.set(name, [...(this.listeners.get(name) || []), listener]); }
  async fire(name, values = {}) { for (const listener of this.listeners.get(name) || []) await listener({ preventDefault() {}, ...values }); }
  focus() { this.focused = true; }
  scrollIntoView() { this.scrolled = true; }
  reportValidity() { return true; }
  closest(selector) { return this.closestMap?.[selector] || null; }
  after() {}
  replaceWith() {}
}

function card(values) {
  const node = new Element();
  const inputs = Object.entries(values).map(([name, value]) => new Element({ name, value }));
  node.map(controlsSelector, ...inputs);
  for (const input of inputs) { node.map(`input[name="${input.name}"]`, input); node.map(`select[name="${input.name}"]`, input); }
  return node;
}

function setup({ fetchImpl, uploadImpl } = {}) {
  const document = new Element(); document.body = new Element(); document.createElement = () => new Element();
  const ids = ['login-panel', 'login-form', 'dashboard', 'logout', 'preview-notice', 'content-form', 'purchase-popup-fields', 'copy-fields', 'invite-fields', 'toolkit-copy-fields', 'curricula-list', 'media-list', 'events-list', 'social-list', 'revisions-list', 'photos-list', 'gallery-list', 'toolkit-list', 'event-albums-list'];
  for (const id of ids) document.map(`#${id}`, new Element());
  const form = document.querySelector('#content-form');
  form.elements = Object.fromEntries(['paperbackPrice', 'hardcoverPrice', 'shippingMessage', ...fields.map((field) => field.name)].map((name) => [name, new Element({ value: name.includes('Price') ? '20' : 'Fixture text' })]));
  const saveStatus = document.map('[data-save-status]', new Element());
  const save = document.map('[data-save]', new Element());
  const unassigned = document.map('[data-unassigned-count]', new Element());
  const context = vm.createContext({ document, window: new Element(), IntersectionObserver: class { observe() {} }, URL, crypto: webcrypto, AbortSignal, console: { error() {} }, textFields: fields, confirm: () => true, fetch: fetchImpl || (async () => { throw new Error('Unexpected fetch'); }), uploadPresigned: uploadImpl || (async () => { throw new Error('Unexpected upload'); }) });
  const executable = source.replace(/^import .*;\n/gm, '').slice(0, source.replace(/^import .*;\n/gm, '').lastIndexOf('\ntry {\n  const session'));
  vm.runInContext(executable + `\nglobalThis.admin = { normalizeAlbumFields, albumOptions, coverOptions, albumSummary, viewableUrl, renderAlbums, renderGallery, collect, refreshAlbumControls, saveChanges, restoreRevision, syncInteractivity, beginOperation, endOperation, getContent: () => content, getOperation: () => operation, setState: (data, preview = false) => { content = data; readOnly = preview; savedSnapshot = ''; }, setSnapshot: (value) => { savedSnapshot = value; } };`, context);
  return { admin: context.admin, context, document, form, saveStatus, save, unassigned };
}

function base(overrides = {}) {
  return { revision: 'site-content/123.json', settings: { paperbackPrice: 20, hardcoverPrice: 22, shippingMessage: 'Soon' }, copy: {}, curricula: [], media: [], photos: [], toolkit: [], events: [{ title: 'Separate upcoming event' }], social: [], eventAlbums: [], gallery: [], ...overrides };
}

function plain(value) { return JSON.parse(JSON.stringify(value)); }
function deferred() { let resolve; let reject; const promise = new Promise((res, rej) => { resolve = res; reject = rej; }); return { promise, resolve, reject }; }

test('legacy photos gain stable IDs without dropping any original fields or assets', () => {
  const { admin } = setup();
  const original = base({ gallery: [{ url: '/story/old.jpg', title: 'Existing photo', alt: 'Existing alt', description: 'Original caption' }] });
  delete original.eventAlbums;
  const normalized = admin.normalizeAlbumFields(original);
  assert.deepEqual(plain(normalized.eventAlbums), []);
  assert.match(normalized.gallery[0].id, /^photo_[0-9a-f-]{36}$/);
  assert.equal(normalized.gallery[0].eventId, '');
  assert.equal(normalized.gallery[0].url, '/story/old.jpg');
  assert.equal(normalized.gallery[0].description, 'Original caption');
  assert.equal(admin.normalizeAlbumFields(normalized).gallery[0].id, normalized.gallery[0].id);
  assert.equal(original.gallery[0].id, undefined);
  assert.deepEqual(plain(normalized.events), original.events);
});

test('normalization preserves IDs, separates unknown albums, and rejects foreign covers', () => {
  const { admin } = setup();
  const data = admin.normalizeAlbumFields(base({ eventAlbums: [{ id: 'album_a', title: 'A', coverPhotoId: 'photo_b' }, { id: 'album_b', title: 'B', coverPhotoId: 'photo_b' }], gallery: [{ id: 'photo_a', eventId: 'album_missing', url: '/a.jpg' }, { id: 'photo_b', eventId: 'album_b', url: '/b.jpg' }] }));
  assert.equal(data.gallery[0].id, 'photo_a');
  assert.equal(data.gallery[0].eventId, '');
  assert.equal(data.eventAlbums[0].coverPhotoId, '');
  assert.equal(data.eventAlbums[1].coverPhotoId, 'photo_b');
  assert.equal(data.revision, 'site-content/123.json');
});

test('folder and photo HTML escape all editable labels and identifiers', () => {
  const { admin, document } = setup();
  const attack = '\"><img src=x onerror=alert(1)>';
  admin.setState(base({ eventAlbums: [{ id: `album_${attack}`, title: attack, date: '', coverPhotoId: '' }], gallery: [{ id: `photo_${attack}`, eventId: '', title: attack, alt: attack, description: attack, date: '', url: 'javascript:alert(1)' }] }));
  admin.renderAlbums(); admin.renderGallery();
  const albumHtml = document.querySelector('#event-albums-list').innerHTML;
  const photoHtml = document.querySelector('#gallery-list').innerHTML;
  assert.ok(albumHtml.includes('&quot;&gt;&lt;img'));
  assert.ok(photoHtml.includes('&quot;&gt;&lt;img'));
  assert.ok(!albumHtml.includes('<img src=x'));
  assert.ok(!photoHtml.includes('href="javascript:'));
  assert.ok(!photoHtml.includes('src="javascript:'));
  assert.ok(photoHtml.includes('Unassigned photos'));
  assert.ok(albumHtml.includes('data-add="gallery" data-event-id="album_'));
  assert.ok(html.includes('separate from Upcoming events'));
});

test('cover options exclude drafts and collection preserves every association, cover, and revision', () => {
  const { admin, document } = setup();
  const album = { id: 'album_a', title: 'Reading', date: '2026-10-12', coverPhotoId: 'photo_a' };
  const photo = { id: 'photo_a', eventId: 'album_a', title: 'First', date: '', description: 'Caption', alt: 'Alt', url: '/a.jpg' };
  admin.setState(base());
  document.map('[data-kind="eventAlbums"]', card(album));
  document.map('[data-kind="gallery"]', card(photo));
  const result = admin.collect();
  assert.deepEqual(plain(result.eventAlbums), [album]);
  assert.deepEqual(plain(result.gallery), [photo]);
  assert.equal(result.revision, 'site-content/123.json');
  assert.ok(!admin.coverOptions([{ id: 'draft', title: 'Not uploaded', url: '' }]).includes('value="draft"'));
});

test('reassignment clears only the invalid cover and leaves other photo fields intact', () => {
  const { admin, document, unassigned } = setup();
  admin.setState(base());
  const album = card({ id: 'album_a', title: 'New title', date: '', coverPhotoId: 'photo_a' });
  album.map('[data-album-heading]', new Element()); album.map('[data-album-count]', new Element());
  const photo = card({ id: 'photo_a', eventId: '', title: 'Unsaved title', description: 'Unsaved caption', url: '/a.jpg' });
  const file = new Element({ files: [{ name: 'selection.jpg' }] });
  photo.map('input[type="file"]', file);
  document.map('[data-kind="eventAlbums"]', album); document.map('[data-kind="gallery"]', photo);
  admin.refreshAlbumControls();
  assert.ok(!album.querySelector('select[name="coverPhotoId"]').innerHTML.includes('value="photo_a"'));
  assert.ok(album.querySelector('select[name="coverPhotoId"]').innerHTML.includes('value="" selected'));
  assert.equal(photo.querySelector('input[name="title"]').value, 'Unsaved title');
  assert.equal(photo.querySelector('input[type="file"]'), file);
  assert.equal(unassigned.textContent, '1 photo');
});

test('blank photo drafts block saves without silently discarding the draft', async () => {
  const { admin, document, saveStatus } = setup();
  const data = base({ gallery: [{ id: 'photo_draft', eventId: '', url: '' }] });
  admin.setState(data);
  const draft = card(data.gallery[0]); const file = draft.map('input[type="file"]', new Element());
  document.map('[data-kind="gallery"]', draft);
  await admin.saveChanges();
  assert.match(saveStatus.textContent, /awaiting upload/);
  assert.equal(admin.getContent().gallery.length, 1);
  assert.equal(file.focused, true);
  assert.equal(admin.getOperation(), '');
});

test('read-only preview disables writes, uploads, and restores while local fields remain editable', async () => {
  let calls = 0;
  const { admin, document, save } = setup({ fetchImpl: async () => { calls++; }, uploadImpl: async () => { calls++; } });
  admin.setState(base(), true);
  const title = new Element({ type: 'text' }); const file = new Element({ type: 'file', files: [{ name: 'test.jpg', size: 1 }] });
  file.closestMap = { '[data-upload-kind]': file };
  const restore = new Element({ attributes: { 'data-restore-revision': 'old' } });
  const add = new Element();
  document.map('#content-form input, #content-form textarea, #content-form select', title, file);
  document.map('#content-form button', restore, add);
  admin.syncInteractivity();
  assert.equal(document.querySelector('#preview-notice').hidden, false);
  assert.equal(save.disabled, true); assert.equal(file.disabled, true); assert.equal(restore.disabled, true);
  assert.equal(title.disabled, false); assert.equal(add.disabled, false);
  await admin.saveChanges(); await admin.restoreRevision('old'); await document.fire('change', { target: file });
  assert.equal(calls, 0);
});

test('save in progress locks controls and suppresses additional save, restore, add, and remove actions', async () => {
  const pending = deferred(); let calls = 0;
  const { admin, document, save, form, saveStatus } = setup({ fetchImpl: async () => { calls++; return pending.promise; } });
  const original = base(); admin.setState(original);
  const title = new Element({ type: 'text' }); const action = new Element();
  document.map('#content-form input, #content-form textarea, #content-form select', title);
  document.map('#content-form button', action);
  const first = admin.saveChanges();
  assert.equal(admin.getOperation(), 'save');
  assert.equal(title.disabled, true); assert.equal(action.disabled, true); assert.equal(save.disabled, true);
  assert.equal(form.attributes['aria-busy'], 'true');
  const add = new Element({ dataset: { add: 'eventAlbums' } }); add.closestMap = { '[data-add]': add };
  const remove = new Element({ dataset: { remove: 'gallery', index: '0' } }); remove.closestMap = { '[data-remove]': remove };
  await document.fire('click', { target: add }); await document.fire('click', { target: remove });
  await admin.saveChanges(); await admin.restoreRevision('old');
  assert.equal(calls, 1); assert.equal(admin.getContent(), original);
  pending.resolve({ ok: false, json: async () => ({ message: 'Newer changes exist. Refresh before saving.' }) });
  await first;
  assert.match(saveStatus.textContent, /Newer changes/);
  assert.equal(admin.getContent(), original);
  assert.equal(admin.getOperation(), ''); assert.equal(title.disabled, false); assert.equal(save.disabled, false);
});

test('an upload retains its target photo and locks edits until the fixture upload completes', async () => {
  const pending = deferred(); let uploads = 0;
  const { admin, document, save } = setup({ uploadImpl: async () => { uploads++; return pending.promise; } });
  admin.setState(base());
  const photo = card({ id: 'photo_a', eventId: '', title: 'Preserved title', url: '/old.jpg' });
  photo.map('.preview', new Element());
  const progress = new Element(); const parent = new Element(); parent.map('.upload-progress', progress);
  const file = new Element({ type: 'file', accept: 'image/jpeg', value: 'fixture.jpg', files: [{ name: 'fixture.jpg', size: 5 }], parentElement: parent });
  file.closestMap = { '[data-upload-kind]': file, '.editor-card': photo };
  document.map('[data-kind="gallery"]', photo);
  document.map('#content-form input, #content-form textarea, #content-form select', file);
  const upload = document.fire('change', { target: file });
  assert.equal(admin.getOperation(), 'upload'); assert.equal(file.disabled, true); assert.equal(save.disabled, true);
  await admin.saveChanges();
  const add = new Element({ dataset: { add: 'gallery' } }); add.closestMap = { '[data-add]': add };
  await document.fire('click', { target: add });
  assert.equal(uploads, 1); assert.equal(document.querySelector('#gallery-list').innerHTML, '');
  pending.resolve({ pathname: 'uploads/fixture.jpg' }); await upload;
  assert.equal(photo.querySelector('input[name="url"]').value, '/api/media?pathname=uploads%2Ffixture.jpg');
  assert.equal(photo.querySelector('input[name="title"]').value, 'Preserved title');
  assert.equal(admin.getOperation(), ''); assert.equal(file.value, ''); assert.equal(file.disabled, false);
});

test('failed replacement uploads retain their original asset and prevent an accidental save', async () => {
  const { admin, document, saveStatus } = setup({ uploadImpl: async () => { throw new Error('Fixture upload failed'); } });
  admin.setState(base());
  const photo = card({ id: 'photo_a', eventId: '', url: '/old.jpg' });
  const parent = new Element(); parent.map('.upload-progress', new Element());
  const file = new Element({ type: 'file', accept: 'image/jpeg', files: [{ name: 'fixture.jpg', size: 5 }], parentElement: parent });
  file.closestMap = { '[data-upload-kind]': file, '.editor-card': photo };
  document.map('[data-kind="gallery"]', photo); document.map('#content-form input[type="file"]', file);
  await document.fire('change', { target: file });
  assert.equal(photo.querySelector('input[name="url"]').value, '/old.jpg');
  assert.match(saveStatus.textContent, /Fixture upload failed/);
  await admin.saveChanges(); assert.match(saveStatus.textContent, /has not uploaded successfully/);
});

test('view links reject credentials, whitespace, controls, backslashes, and unsupported protocols', () => {
  const { admin } = setup();
  for (const value of ['javascript:alert(1)', '//other.example/file', '/\\other.example/file', '/file name.jpg', 'https://user:pass@example.com/file', 'https://example.com/\nfile', 'data:image/png;base64,AAAA']) assert.equal(admin.viewableUrl(value), '', value);
  assert.equal(admin.viewableUrl('/api/media?pathname=uploads%2Ffile.jpg'), '/api/media?pathname=uploads%2Ffile.jpg');
  assert.equal(admin.viewableUrl('https://example.com/photo.jpg'), 'https://example.com/photo.jpg');
});

test('removing a folder requires confirmation and moves its photos without removing their assets or edits', async () => {
  const { admin, context, document } = setup();
  const data = base({ eventAlbums: [{ id: 'album_a', title: 'Reading', date: '', coverPhotoId: 'photo_a' }], gallery: [{ id: 'photo_a', eventId: 'album_a', title: 'Unsaved title', description: 'Unsaved caption', url: '/old.jpg' }] });
  admin.setState(data);
  const album = card(data.eventAlbums[0]); const photo = card(data.gallery[0]);
  document.map('[data-kind="eventAlbums"]', album); document.map('[data-kind="gallery"]', photo);
  document.map('[data-kind="gallery"] select[name="eventId"]', photo.querySelector('select[name="eventId"]'));
  // The mock does not parse new HTML into nodes. Option refresh is tested above.
  vm.runInContext('refreshAlbumControls = () => {};', context);
  const button = new Element({ dataset: { remove: 'eventAlbums', index: '0' } }); button.closestMap = { '[data-remove]': button };
  context.confirm = () => false;
  await document.fire('click', { target: button });
  assert.equal(admin.getContent(), data);
  let prompt;
  context.confirm = (message) => { prompt = message; return true; };
  await document.fire('click', { target: button });
  assert.match(prompt, /No photo files will be deleted/);
  assert.deepEqual(plain(admin.getContent().eventAlbums), []);
  assert.deepEqual(plain(admin.getContent().gallery), [{ ...data.gallery[0], eventId: '' }]);
  assert.equal(photo.querySelector('select[name="eventId"]').value, '');
  assert.equal(photo.querySelector('input[name="description"]').value, 'Unsaved caption');
});

test('a failed photo upload can explicitly retry the same selected file', async () => {
  let attempts = 0;
  const { admin, document } = setup({ uploadImpl: async () => { if (++attempts === 1) throw new Error('Try again'); return { pathname: 'uploads/retry.jpg' }; } });
  admin.setState(base());
  const photo = card({ id: 'photo_a', eventId: '', url: '/old.jpg' });
  photo.map('.preview', new Element());
  const progress = photo.map('.upload-progress', new Element());
  const recovery = photo.map('.upload-recovery', new Element({ hidden: true }));
  const parent = new Element(); parent.map('.upload-progress', progress);
  const file = photo.map('input[type="file"]', new Element({ type: 'file', accept: 'image/jpeg', value: 'same.jpg', files: [{ name: 'same.jpg', size: 2 }], parentElement: parent }));
  file.closestMap = { '[data-upload-kind]': file, '.editor-card': photo };
  document.map('[data-kind="gallery"]', photo);
  await document.fire('change', { target: file });
  assert.equal(recovery.hidden, false); assert.equal(file.value, 'same.jpg');
  const retry = new Element(); retry.closestMap = { '[data-retry-upload]': retry, '.editor-card': photo };
  await document.fire('click', { target: retry });
  assert.equal(attempts, 2); assert.equal(recovery.hidden, true); assert.equal(file.value, '');
  assert.equal(photo.querySelector('input[name="url"]').value, '/api/media?pathname=uploads%2Fretry.jpg');
});
