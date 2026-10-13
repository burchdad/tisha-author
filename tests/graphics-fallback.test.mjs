import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { defaultSettings, photoSlots } from '../cms/defaults.js';

const sourceRoot = new URL('../', import.meta.url);
const read = (name) => readFile(new URL(name, sourceRoot), 'utf8');
const [main, contentSource, menuSource, css, textFieldsSource] = await Promise.all([
  read('src/main.js'), read('src/site-content.js'), read('src/mobile-menu.js'), read('src/styles.css'), read('cms/text-fields.json'),
]);
const textFields = JSON.parse(textFieldsSource);
const withoutImports = (source) => source.replace(/^import .*;\n/gm, '').replace(/^export /gm, '');

class Element {
  constructor(dataset = {}) {
    this.dataset = dataset; this.listeners = new Map(); this.attributes = {};
    this.children = []; this.hidden = false; this.textContent = ''; this.queries = new Map();
    const classes = new Set();
    this.classList = {
      add: (...names) => names.forEach((name) => classes.add(name)),
      remove: (...names) => names.forEach((name) => classes.delete(name)),
      contains: (name) => classes.has(name),
      toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name),
    };
    this.style = { setProperty() {} };
  }
  addEventListener(name, callback) {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set());
    this.listeners.get(name).add(callback);
  }
  removeEventListener(name, callback) { this.listeners.get(name)?.delete(callback); }
  dispatchEvent(event) { for (const callback of [...(this.listeners.get(event.type) || [])]) callback(event); }
  fire(type, extra = {}) { this.dispatchEvent({ type, ...extra }); }
  setAttribute(name, value) { this.attributes[name] = value; }
  getAttribute(name) { return this.attributes[name] ?? null; }
  removeAttribute(name) { delete this.attributes[name]; }
  querySelectorAll(selector) { return this.queries.get(selector) || []; }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  append(...nodes) { this.children.push(...nodes); }
  prepend(...nodes) { this.children.unshift(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  focus() { this.focused = true; }
  showModal() { this.open = true; }
  close() { this.open = false; this.fire('close'); }
  remove() {}
  scrollTo() {}
  map(selector, ...nodes) { this.queries.set(selector, nodes); return nodes[0]; }
}

function setup({ failure, reducedMotion = false, noCanvas = false, badCatalog = false, failFetch = false, cleanupThrows = false } = {}) {
  const document = new Element();
  document.documentElement = new Element(); document.body = new Element();
  document.activeElement = new Element();
  document.createElement = (tag) => {
    const node = new Element(); node.tagName = tag; node.canPlayType = () => 'probably'; return node;
  };
  const canvas = new Element(); if (!noCanvas) document.map('#magic-world', canvas);
  const galleryTab = document.map('[data-event-tab="past"]', new Element({ eventTab: 'past' }));
  const upcomingTab = new Element({ eventTab: 'upcoming' });
  document.map('[data-event-tab]', galleryTab, upcomingTab);
  const gallery = document.map('[data-event-panel="past"]', new Element({ eventPanel: 'past' }));
  const upcoming = document.map('[data-event-panel="upcoming"]', new Element({ eventPanel: 'upcoming' }));
  document.map('[data-event-panel]', gallery, upcoming);
  const hero = new Element();
  document.map(textFields.find((field) => field.name === 'homeIntro').selector, hero);
  const footer = document.map('.footer-message', new Element());
  const header = document.map('.site-header', new Element());
  const menuToggle = document.map('[data-mobile-menu-toggle]', new Element());
  document.map('[data-mobile-menu-panel]', new Element());
  const book = document.map('.book-modal', new Element()); book.hidden = true;
  const openBook = document.map('[data-open-book]', new Element());
  const closeBook = document.map('[data-close-book]', new Element());
  book.map('.book-modal-close', closeBook);
  const paperback = new Element(); paperback.value = 'paperback'; paperback.checked = true;
  const hardcover = new Element(); hardcover.value = 'hardcover'; hardcover.checked = false;
  book.map('[data-book-format]', paperback, hardcover);
  const square = book.map('[data-square-link]', new Element());
  const status = book.map('[data-checkout-status]', new Element());
  const toolkit = document.map('.toolkit-modal', new Element()); toolkit.hidden = true;
  const openToolkit = document.map('[data-open-toolkit]', new Element());
  const closeToolkit = document.map('[data-close-toolkit]', new Element());
  toolkit.map('.toolkit-close', closeToolkit);
  const invite = document.map('[data-invite-form]', new Element());
  invite.map('button[type="submit"]', new Element()); invite.reportValidity = () => false;
  const window = new Element();
  Object.assign(window, {
    innerWidth: 390, innerHeight: 844, devicePixelRatio: 3, location: { hash: '' },
    matchMedia: (query) => ({ matches: query.includes('reduced-motion') && reducedMotion }),
  });
  const stats = { constructed: 0, renders: 0, sizes: 0, disposed: [], resources: [], warnings: [], fetches: [], order: [] };
  let activeFailure = failure;
  const fail = (step) => { if (activeFailure === step) throw new Error(`Fixture ${step} failure`); };
  class Resource {
    constructor() { stats.resources.push(this); }
    dispose() { stats.disposed.push(this); if (cleanupThrows) throw new Error('Fixture cleanup failure'); }
  }
  class Renderer extends Resource {
    constructor() { stats.constructed++; stats.order.push('graphics'); fail('constructor'); super(); }
    setPixelRatio(value) { stats.pixelRatio = value; fail('pixelRatio'); }
    setSize() { stats.sizes++; fail('size'); }
    render() { stats.renders++; fail('render'); }
  }
  const vector = () => ({ x: 0, y: 0, z: 0, set(x, y, z) { Object.assign(this, { x, y, z }); } });
  class Object3D {
    constructor() { this.position = vector(); this.rotation = vector(); this.scale = vector(); this.children = []; this.userData = {}; }
    add(node) { this.children.push(node); }
    updateProjectionMatrix() {}
  }
  class Shape { moveTo() {} bezierCurveTo() {} }
  const THREE = {
    WebGLRenderer: Renderer, Scene: Object3D, PerspectiveCamera: Object3D, Group: Object3D,
    Shape, ShapeGeometry: Resource, MeshBasicMaterial: Resource, Mesh: Object3D, TorusGeometry: Resource,
  };
  const frames = new Map(); let frameId = 0;
  const data = {
    settings: { ...defaultSettings, ...(badCatalog ? { paperbackPrice: -1 } : {}) },
    copy: { homeIntro: 'Fixture content loaded.' },
    gallery: [{ title: 'Fixture photo', alt: 'Synthetic gallery fixture', url: '/test-photo.svg' }],
  };
  const context = vm.createContext({
    document, window, THREE, textFields, defaultSettings, photoSlots,
    navigator: { userAgent: 'Fixture browser', maxTouchPoints: 0 },
    URL, Intl, Event, AbortSignal,
    console: { warn: (message) => stats.warnings.push(message) },
    fetch: async (url) => { stats.fetches.push(url); stats.order.push('content'); return { ok: !failFetch, json: async () => data }; },
    requestAnimationFrame: (callback) => { frames.set(++frameId, callback); return frameId; },
    cancelAnimationFrame: (id) => frames.delete(id),
  });
  vm.runInContext(withoutImports(contentSource), context, { filename: 'site-content.js' });
  vm.runInContext(withoutImports(menuSource), context, { filename: 'mobile-menu.js' });
  const run = () => vm.runInContext(withoutImports(main), context, { filename: 'main.js' });
  return {
    run, stats, frames, document, window, canvas, gallery, galleryTab, upcoming, upcomingTab, hero, footer,
    header, menuToggle, book, openBook, closeBook, paperback, hardcover, square, status, toolkit, openToolkit, closeToolkit, invite,
    setFailure: (value) => { activeFailure = value; },
    nextFrame() { const [id, callback] = frames.entries().next().value; frames.delete(id); callback(); },
  };
}

async function run(options) {
  const fixture = setup(options); fixture.run();
  // Flush the mocked content fetch/json and the site's async finalization.
  await new Promise(setImmediate);
  return fixture;
}

function assertContentAndControls(f) {
  assert.equal(f.hero.textContent, 'Fixture content loaded.', JSON.stringify(f.stats.warnings));
  const folder = f.gallery.children[0].children[0];
  assert.equal(folder.children[2].children[0].textContent, 'Unassigned photos');
  folder.fire('click');
  const photoButton = f.gallery.children[1].children[0].children[0];
  assert.equal(photoButton.children[0].alt, 'Synthetic gallery fixture');
  photoButton.fire('click');
  const viewer = f.document.body.children[0];
  assert.equal(viewer.open, true);
  viewer.children[0].children[0].children[1].fire('click');
  assert.equal(viewer.open, false);
  f.gallery.children[0].children[0].fire('click');
  assert.equal(f.gallery.children[0].children[0], folder);
  assert.equal(f.galleryTab.textContent, 'Past Events');
  assert.equal(f.galleryTab.getAttribute('aria-selected'), 'true');
  assert.equal(f.square.getAttribute('aria-disabled'), 'false');
  assert.equal(f.square.href, 'https://square.link/u/ZV1vr14t');
  for (let i = 0; i < 2; i++) {
    f.upcomingTab.fire('click'); assert.equal(f.upcoming.hidden, false); assert.equal(f.gallery.hidden, true);
    f.galleryTab.fire('click'); assert.equal(f.gallery.hidden, false); assert.equal(f.upcoming.hidden, true);
    f.openBook.fire('click'); assert.equal(f.book.hidden, false);
    f.closeBook.fire('click'); assert.equal(f.book.hidden, true);
    f.openToolkit.fire('click'); assert.equal(f.toolkit.hidden, false);
    f.closeToolkit.fire('click'); assert.equal(f.toolkit.hidden, true);
    f.menuToggle.fire('click'); assert.equal(f.header.classList.contains('mobile-menu-open'), true);
    f.window.fire('keydown', { key: 'Escape' }); assert.equal(f.header.classList.contains('mobile-menu-open'), false);
  }
  f.paperback.checked = false; f.hardcover.checked = true; f.hardcover.fire('change');
  assert.equal(f.square.href, 'https://square.link/u/uq2dEXqy');
  assert.ok(f.invite.listeners.get('submit')?.size, 'Invite handler is initialized without submitting a form');
  assert.deepEqual(f.stats.fetches, ['/api/content'], 'No checkout, inquiry, admin, or other live request is made');
}

for (const failure of ['constructor', 'pixelRatio', 'size', 'render']) {
  test(`${failure} failure preserves published gallery, navigation, toolkit and book controls`, async () => {
    const f = await run({ failure });
    assertContentAndControls(f);
    assert.equal(f.canvas.hidden, true);
    assert.equal(f.frames.size, 0);
    assert.equal(f.canvas.listeners.get('webglcontextlost')?.size || 0, 0);
    assert.equal(f.window.listeners.get('pointermove')?.size || 0, 0);
    assert.equal(f.stats.disposed.length, f.stats.resources.length);
    assert.equal(f.stats.warnings.length, 1);
  });
}

test('working graphics still render, animate, resize and cap pixel density', async () => {
  const f = await run(); assertContentAndControls(f);
  assert.equal(f.canvas.hidden, false); assert.equal(f.stats.pixelRatio, 2);
  assert.deepEqual(f.stats.order, ['content', 'graphics']);
  assert.equal(f.stats.renders, 1); assert.equal(f.frames.size, 1);
  f.nextFrame(); assert.equal(f.stats.renders, 2); assert.equal(f.frames.size, 1);
  f.window.fire('resize'); assert.equal(f.stats.sizes, 2);
  assert.equal(f.stats.warnings.length, 0);
});

test('reduced motion renders once without scheduling animation', async () => {
  const f = await run({ reducedMotion: true }); assertContentAndControls(f);
  assert.equal(f.stats.renders, 1); assert.equal(f.frames.size, 0); assert.equal(f.canvas.hidden, false);
});

test('reduced-motion render failure also uses the graceful fallback', async () => {
  const f = await run({ reducedMotion: true, failure: 'render' }); assertContentAndControls(f);
  assert.equal(f.canvas.hidden, true); assert.equal(f.frames.size, 0);
});

test('missing decorative canvas leaves content and controls available', async () => {
  const f = await run({ noCanvas: true }); assertContentAndControls(f);
  assert.equal(f.stats.constructed, 0); assert.equal(f.stats.warnings.length, 0);
});

for (const failure of ['render', 'size']) {
  test(`later ${failure} failure stops only decorative graphics`, async () => {
    const f = await run(); f.setFailure(failure);
    if (failure === 'render') f.nextFrame(); else f.window.fire('resize');
    assertContentAndControls(f);
    assert.equal(f.canvas.hidden, true); assert.equal(f.frames.size, 0);
    assert.equal(f.stats.disposed.length, f.stats.resources.length);
    assert.equal(f.stats.warnings.length, 1);
    const renders = f.stats.renders; f.window.fire('resize'); assert.equal(f.stats.renders, renders);
  });
}

test('context loss cancels animation and releases resources only once', async () => {
  const f = await run(); f.canvas.fire('webglcontextlost'); f.canvas.fire('webglcontextlost');
  assertContentAndControls(f);
  assert.equal(f.canvas.hidden, true); assert.equal(f.frames.size, 0);
  assert.equal(new Set(f.stats.disposed).size, f.stats.resources.length);
  assert.equal(f.stats.disposed.length, f.stats.resources.length); assert.equal(f.stats.warnings.length, 1);
});

test('cleanup failures do not prevent remaining resources being released or controls working', async () => {
  const f = await run({ failure: 'render', cleanupThrows: true }); assertContentAndControls(f);
  assert.equal(f.stats.disposed.length, f.stats.resources.length); assert.equal(f.frames.size, 0);
});

for (const problem of ['badCatalog', 'failFetch']) {
  test(`graphics fallback preserves fail-closed checkout for ${problem}`, async () => {
    const f = await run({ failure: 'constructor', [problem]: true });
    assert.equal(f.square.getAttribute('aria-disabled'), 'true');
    assert.match(f.status.textContent, /Verifying current book prices/);
    let prevented = false; f.square.fire('click', { preventDefault: () => { prevented = true; } });
    assert.equal(prevented, true);
    f.openBook.fire('click'); assert.equal(f.book.hidden, false);
    f.closeBook.fire('click'); assert.equal(f.book.hidden, true);
    assert.deepEqual(f.stats.fetches, ['/api/content']);
  });
}

test('gallery CSS preserves full-photo containment within the existing responsive 4:3 cards', () => {
  const rule = css.match(/\.cms-photo-gallery img\s*\{([^}]+)\}/)[1];
  assert.match(rule, /object-fit:\s*contain\s*;/);
  assert.match(rule, /display:\s*block\s*;/); assert.match(rule, /width:\s*100%\s*;/);
  assert.match(rule, /aspect-ratio:\s*4\s*\/\s*3\s*;/);
  assert.doesNotMatch(rule, /object-fit:\s*cover/);
  assert.match(css, /@media \(max-width: 780px\) \{ \.cms-photo-gallery \{ grid-template-columns: 1fr; \} \}/);
});
