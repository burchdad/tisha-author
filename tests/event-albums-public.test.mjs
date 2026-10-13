import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { defaultSettings, photoSlots } from '../cms/defaults.js';

const source = (await readFile(new URL('../src/site-content.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
const css = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');

function fixture() {
  let document;
  class Element {
    constructor(tag = 'div', dataset = {}) {
      this.tagName = tag; this.dataset = dataset; this.children = []; this.attributes = {};
      this.listeners = new Map(); this.queries = new Map(); this.textContent = ''; this.className = '';
      this.hidden = false; this.open = false;
      this.classList = {
        add: (name) => { this.className = [...new Set([...this.className.split(' '), name])].filter(Boolean).join(' '); },
        remove: (name) => { this.className = this.className.split(' ').filter((item) => item !== name).join(' '); },
        contains: (name) => this.className.split(' ').includes(name),
      };
    }
    get isConnected() { return this === document || Boolean(this.parentNode?.isConnected); }
    append(...nodes) { for (const node of nodes) { node.remove(); node.parentNode = this; this.children.push(node); } }
    replaceChildren(...nodes) { this.children.forEach((node) => { node.parentNode = null; }); this.children = []; this.append(...nodes); }
    remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((node) => node !== this); this.parentNode = null; }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    getAttribute(name) { return this.attributes[name] ?? null; }
    removeAttribute(name) { delete this.attributes[name]; if (name === 'src') this.src = ''; }
    addEventListener(name, listener) { if (!this.listeners.has(name)) this.listeners.set(name, new Set()); this.listeners.get(name).add(listener); }
    fire(type, extra = {}) { const event = { target: this, type, preventDefault() {}, ...extra }; this.listeners.get(type)?.forEach((fn) => fn(event)); }
    querySelectorAll(selector) { return this.queries.get(selector) || []; }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    map(selector, ...nodes) { this.queries.set(selector, nodes); return nodes[0]; }
    focus() { document.activeElement = this; }
    showModal() { this.open = true; }
    close() { this.open = false; this.fire('close'); }
  }
  document = new Element('document');
  document.createElement = (tag) => new Element(tag);
  document.body = new Element('body'); document.append(document.body);
  document.activeElement = document.body;
  const galleryTab = new Element('button', { eventTab: 'past' });
  const upcomingTab = new Element('button', { eventTab: 'upcoming' });
  const gallery = new Element('section', { eventPanel: 'past' });
  const upcoming = new Element('section', { eventPanel: 'upcoming' });
  document.body.append(galleryTab, upcomingTab, gallery, upcoming);
  document.map('[data-event-tab="past"]', galleryTab);
  document.map('[data-event-tab]', galleryTab, upcomingTab);
  document.map('[data-event-panel="past"]', gallery);
  document.map('[data-event-panel="upcoming"]', upcoming);
  document.map('[data-event-panel]', gallery, upcoming);
  const context = vm.createContext({ document, URL, Intl, defaultSettings, photoSlots, textFields: [] });
  const api = vm.runInContext(`${source}\n({ applySiteContent, publicEventAlbums, formatAlbumDate });`, context);
  const apply = (data) => api.applySiteContent({ settings: defaultSettings, ...data });
  return { ...api, apply, document, gallery, galleryTab, upcoming, upcomingTab };
}

const albums = [
  { id: 'album_one', title: 'An afternoon with Rider', date: '2026-10-07', coverPhotoId: 'photo_two' },
  { id: 'album_two', title: 'A school visit', date: '', coverPhotoId: 'photo_one' },
  { id: 'album_empty', title: 'Memories coming soon', date: '', coverPhotoId: '' },
];
const photos = [
  { id: 'photo_one', eventId: 'album_one', title: 'First photo', url: '/one.jpg', alt: 'A portrait', description: 'First caption.' },
  { id: 'photo_two', eventId: 'album_one', title: 'Second photo', url: '/two.jpg' },
  { id: 'photo_three', eventId: 'album_two', title: 'Other event', url: '/three.jpg' },
  { title: 'Legacy photo', url: '/legacy.jpg' },
  { id: 'photo_orphan', eventId: 'album_missing', title: 'Orphaned photo', url: '/orphan.jpg' },
  { eventId: 'album_one', title: 'Missing photo id', url: '/missing-id.jpg' },
];
const walk = (root) => [root, ...root.children.flatMap(walk)];
const byClass = (root, name) => walk(root).filter((node) => node.classList.contains(name));
const byTag = (root, tag) => walk(root).filter((node) => node.tagName === tag);
const buttonNamed = (root, name) => byTag(root, 'button').find((node) => node.getAttribute('aria-label') === name || node.textContent === name);
const serialize = (value) => JSON.parse(JSON.stringify(value));
const populated = () => { const f = fixture(); f.apply({ eventAlbums: albums, gallery: photos }); return f; };

test('public albums keep source order and group only photos with stable, known references', () => {
  const { publicEventAlbums } = fixture();
  const result = publicEventAlbums(albums, photos);
  assert.deepEqual(serialize(result.map((album) => [album.id, album.photos.map((photo) => photo.title)])), [
    ['album_one', ['First photo', 'Second photo']], ['album_two', ['Other event']], ['album_empty', []],
    ['', ['Legacy photo', 'Orphaned photo', 'Missing photo id']],
  ]);
  assert.equal(result[3].title, 'Unassigned photos'); assert.equal(result[3].date, '');
});

test('cover selection cannot use another event, a missing photo, or an unsafe image', () => {
  const f = fixture();
  const result = f.publicEventAlbums(albums, [...photos, { id: 'photo_unsafe', eventId: 'album_one', url: 'javascript:alert(1)' }]);
  assert.equal(result[0].cover.url, '/two.jpg');
  assert.equal(result[1].cover, null); assert.equal(result[2].cover, null); assert.equal(result[3].cover, null);
  const ownUnsafe = f.publicEventAlbums([{ ...albums[0], coverPhotoId: 'photo_unsafe' }], [{ id: 'photo_unsafe', eventId: 'album_one', url: 'javascript:alert(1)' }]);
  assert.equal(ownUnsafe[0].photos.length, 0); assert.equal(ownUnsafe[0].cover, null);
});

test('legacy content needs no migration to stay accessible and input records are not mutated', () => {
  const f = fixture(); const originalAlbums = JSON.stringify(albums); const originalPhotos = JSON.stringify(photos);
  f.publicEventAlbums(albums, photos);
  assert.equal(JSON.stringify(albums), originalAlbums); assert.equal(JSON.stringify(photos), originalPhotos);
  const result = f.publicEventAlbums(undefined, photos);
  assert.equal(result.length, 1); assert.equal(result[0].photos.length, 6); assert.equal(result[0].unassigned, true);
  assert.equal(f.publicEventAlbums([], []).length, 0);
});

test('invalid entries, duplicate albums, and unsafe URLs do not break the gallery', () => {
  const f = fixture();
  const result = f.publicEventAlbums([null, {}, { id: 'missing_title' }, albums[0], albums[0]], [null, {}, ...photos, { url: '//bad.example/a.jpg' }, { url: 'http://bad.example/a.jpg' }]);
  assert.equal(result.length, 2); assert.equal(result[0].photos.length, 2); assert.equal(result[1].photos.length, 4);
});

test('dates are optional, checked against the calendar, and formatted without timezone shifts', () => {
  const f = fixture();
  assert.equal(f.formatAlbumDate('2026-10-07'), 'October 7, 2026');
  assert.equal(f.formatAlbumDate('2024-02-29'), 'February 29, 2024');
  for (const date of ['', null, undefined, '2026-02-29', '2026-02-31', '2026-13-01', 'October 7', '<img>']) assert.equal(f.formatAlbumDate(date), '');
});

test('folder tiles show counts, optional dates, and only the chosen own-photo cover', () => {
  const f = populated(); const cards = byClass(f.gallery, 'cms-album-card');
  assert.equal(f.galleryTab.textContent, 'Past Events'); assert.equal(cards.length, 4);
  assert.equal(byTag(cards[0], 'img')[0].src, '/two.jpg'); assert.equal(byTag(cards[0], 'img')[0].alt, '');
  assert.equal(byTag(cards[0], 'time')[0].textContent, 'October 7, 2026');
  assert.equal(byTag(cards[1], 'img').length, 0); assert.equal(byTag(cards[1], 'time').length, 0);
  assert.equal(byClass(cards[2], 'cms-album-bottom')[0].children[0].textContent, '0 photos');
  assert.equal(byTag(cards[3], 'time').length, 0); assert.equal(byClass(f.gallery, 'cms-photo-gallery').length, 0);
});

test('opening an album isolates its photos; back restores the same folder and keyboard focus', () => {
  const f = populated(); const card = byClass(f.gallery, 'cms-album-card')[0];
  for (let repeat = 0; repeat < 3; repeat++) {
    card.fire('click');
    assert.equal(byClass(f.gallery, 'cms-album-heading')[0].textContent, albums[0].title);
    assert.equal(f.document.activeElement, byClass(f.gallery, 'cms-album-heading')[0]);
    assert.deepEqual(byClass(f.gallery, 'cms-photo-gallery').flatMap((grid) => byTag(grid, 'img').map((img) => img.src)), ['/one.jpg', '/two.jpg']);
    byClass(f.gallery, 'cms-album-back')[0].fire('click');
    assert.equal(byClass(f.gallery, 'cms-album-card')[0], card); assert.equal(f.document.activeElement, card);
  }
});

test('legacy folder retains original titles and explicitly says photos are unassigned', () => {
  const f = populated(); byClass(f.gallery, 'cms-album-card')[3].fire('click');
  assert.equal(byClass(f.gallery, 'cms-album-heading')[0].textContent, 'Unassigned photos');
  assert.equal(byTag(f.gallery, 'time').length, 0);
  assert.match(byClass(f.gallery, 'cms-album-note')[0].textContent, /haven’t been added to an event/);
  assert.deepEqual(byTag(f.gallery, 'h4').map((node) => node.textContent), ['Legacy photo', 'Orphaned photo', 'Missing photo id']);
});

test('empty albums remain openable and upcoming events stay separate', () => {
  const f = populated();
  f.apply({ eventAlbums: albums, gallery: photos, events: [{ title: 'Next appearance', date: 'Coming soon' }] });
  byClass(f.gallery, 'cms-album-card')[2].fire('click');
  assert.equal(byClass(f.gallery, 'cms-photo-gallery').length, 0);
  assert.equal(byClass(f.gallery, 'event-gallery-placeholder')[0].textContent, 'Photos from this event will appear here soon.');
  assert.equal(byTag(f.upcoming, 'h3')[0].textContent, 'Next appearance');
  assert.equal(byTag(f.gallery, 'h3')[0].textContent, albums[2].title);
});

test('photo dialog supports repeated open/close, larger originals, arrow navigation, and focus restoration', () => {
  const f = populated(); byClass(f.gallery, 'cms-album-card')[0].fire('click');
  const trigger = byClass(f.gallery, 'cms-photo-open')[0];
  const dialog = byTag(f.document, 'dialog')[0];
  for (let repeat = 0; repeat < 3; repeat++) {
    trigger.fire('click'); assert.equal(dialog.open, true);
    assert.equal(dialog.getAttribute('aria-labelledby'), 'event-photo-title');
    assert.equal(f.document.body.classList.contains('photo-viewer-open'), true);
    assert.equal(byTag(dialog, 'img')[0].src, '/one.jpg');
    assert.equal(f.document.activeElement, buttonNamed(dialog, 'Close photo'));
    assert.equal(buttonNamed(dialog, 'Previous photo').disabled, true);
    let prevented = false;
    dialog.fire('keydown', { key: 'ArrowRight', preventDefault: () => { prevented = true; } });
    assert.equal(prevented, true); assert.equal(byTag(dialog, 'img')[0].src, '/two.jpg');
    assert.equal(buttonNamed(dialog, 'Next photo').disabled, true);
    dialog.fire('keydown', { key: 'ArrowRight' }); assert.equal(byTag(dialog, 'img')[0].src, '/two.jpg');
    dialog.fire('keydown', { key: 'ArrowLeft' }); assert.equal(byTag(dialog, 'img')[0].src, '/one.jpg');
    buttonNamed(dialog, 'Close photo').fire('click');
    assert.equal(dialog.open, false); assert.equal(f.document.activeElement, trigger);
    assert.equal(f.document.body.classList.contains('photo-viewer-open'), false);
  }
});

test('background click closes only if the pointer also started on the backdrop', () => {
  const f = populated(); byClass(f.gallery, 'cms-album-card')[0].fire('click');
  const trigger = byClass(f.gallery, 'cms-photo-open')[0]; const dialog = byTag(f.document, 'dialog')[0];
  trigger.fire('click');
  dialog.fire('pointerdown', { target: byTag(dialog, 'img')[0] }); dialog.fire('click'); assert.equal(dialog.open, true);
  dialog.fire('pointerdown'); dialog.fire('click'); assert.equal(dialog.open, false);
});

test('new content replaces the previous modal without leaking scroll locks or hiding new photos', () => {
  const f = populated(); byClass(f.gallery, 'cms-album-card')[0].fire('click'); byClass(f.gallery, 'cms-photo-open')[0].fire('click');
  const oldDialog = byTag(f.document, 'dialog')[0];
  f.apply({ eventAlbums: albums, gallery: photos });
  assert.equal(byTag(f.document, 'dialog').length, 1); assert.equal(oldDialog.isConnected, false);
  assert.equal(f.document.body.classList.contains('photo-viewer-open'), false);
  byClass(f.gallery, 'cms-album-card')[0].fire('click'); byClass(f.gallery, 'cms-photo-open')[0].fire('click');
  oldDialog.fire('close');
  assert.equal(f.document.body.classList.contains('photo-viewer-open'), true);
  assert.equal(byTag(byTag(f.document, 'dialog')[0], 'img')[0].src, '/one.jpg');
});

test('untrusted captions and event titles stay text, including in the larger viewer', () => {
  const f = fixture(); const unsafe = '<img src=x onerror=alert(1)>';
  f.apply({ eventAlbums: [{ id: 'album_one', title: unsafe }], gallery: [{ id: 'photo_one', eventId: 'album_one', url: '/safe.jpg', title: unsafe, description: unsafe }] });
  byClass(f.gallery, 'cms-album-card')[0].fire('click');
  assert.equal(byClass(f.gallery, 'cms-album-heading')[0].textContent, unsafe);
  assert.equal(byTag(f.gallery, 'h4')[0].textContent, unsafe);
  assert.equal(byTag(f.gallery, 'img').length, 1);
  byClass(f.gallery, 'cms-photo-open')[0].fire('click');
  assert.equal(byTag(byTag(f.document, 'dialog')[0], 'h2')[0].textContent, unsafe);
  assert.equal(byTag(f.document, 'script').length, 0);
});

test('no albums or photos has a clear empty state without adding made-up events', () => {
  const f = fixture(); f.apply({ eventAlbums: [], gallery: [] });
  assert.equal(byClass(f.gallery, 'cms-album-card').length, 0);
  assert.match(byClass(f.gallery, 'event-gallery-placeholder')[0].textContent, /as event albums are added/);
  assert.equal(f.galleryTab.textContent, 'Past Events');
});

test('cover, thumbnail and full-size CSS use containment and mobile layouts remain defined', () => {
  for (const selector of ['.cms-album-cover img', '.cms-photo-gallery img', '.cms-photo-stage img']) {
    const rule = css.slice(css.indexOf(`${selector} {`)).split('}')[0];
    assert.match(rule, /object-fit:\s*contain/); assert.doesNotMatch(rule, /object-fit:\s*cover/);
  }
  assert.match(css, /@media \(max-width: 620px\)\s*\{\s*\.cms-event-albums \{ grid-template-columns: 1fr;/);
  assert.match(css, /\.cms-photo-dialog::backdrop/);
  assert.match(css, /\.cms-album-card:focus-visible/);
});
