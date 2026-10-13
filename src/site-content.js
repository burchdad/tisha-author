import textFields from '../cms/text-fields.json';
import { defaultSettings, photoSlots } from '../cms/defaults.js';

export const catalog = { ...defaultSettings, ready: false };

export function safeUrl(value) {
  if (typeof value !== 'string' || /[\u0000-\u0020\\]/.test(value)) return null;
  if (/^\/(?!\/)/.test(value)) return value;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function externalLink(title, url) {
  const link = element('a', title);
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  return link;
}

function renderCurricula(items) {
  document.querySelectorAll('[data-curriculum-list]').forEach((container) => {
    const placement = container.dataset.curriculumList;
    const matching = items.filter((item) => item.placement === placement && safeUrl(item.url));
    container.replaceChildren(...matching.map((item) => {
      const card = element('div', '', 'cms-download');
      const link = externalLink('Download ' + item.title + ' (PDF)', safeUrl(item.url));
      link.className = 'button primary';
      card.append(link, element('p', item.description));
      return card;
    }));
    if (!matching.length && placement !== 'additional') container.append(element('p', 'Curriculum downloads will be available here.'));
    if (placement === 'additional') container.closest('section').hidden = !matching.length;
  });
}

function renderMedia(items) {
  const categories = ['podcast', 'blog', 'feature'];
  document.querySelectorAll('#featured-media .media-card').forEach((card, index) => {
    card.querySelectorAll('a, small, .cms-media-list').forEach((node) => node.remove());
    const list = element('div', '', 'cms-media-list');
    const matching = items.filter((item) => item.category === categories[index] && safeUrl(item.url));
    for (const item of matching) {
      const article = element('div');
      article.append(externalLink(item.title, safeUrl(item.url)));
      if (item.description) article.append(element('p', item.description));
      list.append(article);
    }
    if (!matching.length) list.append(element('p', 'New links will be shared here as they are published.'));
    card.append(list);
  });
}

function renderToolkit(items) {
  document.querySelectorAll('[data-toolkit-category]').forEach((group) => {
    const grid = group.querySelector('.modal-resource-grid');
    if (!grid) return;
    const matching = items.filter((item) => item.category === group.dataset.toolkitCategory && safeUrl(item.url));
    grid.replaceChildren(...matching.map((item) => {
      const link = externalLink(item.title, safeUrl(item.url));
      link.prepend(element('span', item.tag || 'Resource'));
      if (/^\/(?!\/).+\.(?:pdf|docx?|zip)$/i.test(item.url)) {
        link.removeAttribute('target'); link.removeAttribute('rel'); link.setAttribute('download', '');
      }
      return link;
    }));
    if (!matching.length) grid.append(element('p', 'New resources will be added here.', 'resource-coming-soon'));
  });
}

function renderSocial(items) {
  const container = document.querySelector('.social-links');
  if (!container) return;
  const links = items.filter((item) => item.platform && safeUrl(item.url)).map((item) => {
    const link = externalLink(item.platform, safeUrl(item.url));
    link.append(element('span', `${item.label || item.platform} ↗`));
    return link;
  });
  if (links.length) container.replaceChildren(...links);
}

function renderEvents(items) {
  const container = document.querySelector('[data-event-panel="upcoming"]');
  if (!container) return;
  const cards = items.filter((item) => item.title).map((item) => {
    const card = element('article', '', 'event-card featured-event');
    card.append(element('span', item.date || 'Date coming soon', 'event-date'), element('h3', item.title));
    if (item.description) card.append(element('p', item.description));
    if (item.location) card.append(element('span', item.location, 'event-location'));
    const eventUrl = safeUrl(item.url);
    if (eventUrl) {
      const link = externalLink('Event details ↗', eventUrl);
      link.className = 'event-details-link';
      card.append(link);
    }
    return card;
  });
  container.replaceChildren(...(cards.length ? cards : [element('p', 'New appearances will be announced here.', 'event-gallery-placeholder')]));
}


// Published albums are assembled without rewriting legacy gallery records.
// A photo needs a stable id and a known event id before it can join an album.
export function formatAlbumDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  const date = new Date(`${value}T12:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return '';
  return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(date);
}

export function publicEventAlbums(albumItems, galleryItems) {
  const seen = new Set();
  const albums = (Array.isArray(albumItems) ? albumItems : []).filter((album) => {
    if (!album || typeof album.id !== 'string' || !album.id || seen.has(album.id) ||
        typeof album.title !== 'string' || !album.title.trim()) return false;
    seen.add(album.id);
    return true;
  }).map((album) => ({
    id: album.id, title: album.title.trim(), date: formatAlbumDate(album.date) ? album.date : '',
    coverPhotoId: typeof album.coverPhotoId === 'string' ? album.coverPhotoId : '', photos: [],
  }));
  const byId = new Map(albums.map((album) => [album.id, album]));
  const unassigned = { id: '', title: 'Unassigned photos', date: '', coverPhotoId: '', photos: [], unassigned: true };
  for (const item of Array.isArray(galleryItems) ? galleryItems : []) {
    if (!item || !safeUrl(item.url)) continue;
    const photo = {
      ...item, url: safeUrl(item.url),
      title: typeof item.title === 'string' ? item.title : '',
      description: typeof item.description === 'string' ? item.description : '',
      alt: typeof item.alt === 'string' ? item.alt : '',
    };
    const album = typeof photo.id === 'string' && photo.id ? byId.get(photo.eventId) : null;
    (album || unassigned).photos.push(photo);
  }
  if (unassigned.photos.length) albums.push(unassigned);
  for (const album of albums) {
    // Never borrow another event's image, even if a stale cover reference exists.
    album.cover = album.coverPhotoId ? album.photos.find((photo) => photo.id === album.coverPhotoId) || null : null;
  }
  return albums;
}

const photoCount = (count) => `${count} ${count === 1 ? 'photo' : 'photos'}`;
let disposeEventGallery = () => {};

function renderEventAlbums(albumItems, galleryItems) {
  const gallery = document.querySelector('[data-event-panel="past"]');
  if (!gallery) return;
  disposeEventGallery();
  const albums = publicEventAlbums(albumItems, galleryItems);
  const galleryTab = document.querySelector('[data-event-tab="past"]');
  if (galleryTab) galleryTab.textContent = 'Past Events';

  const dialog = element('dialog', '', 'cms-photo-dialog');
  dialog.setAttribute('aria-labelledby', 'event-photo-title');
  dialog.setAttribute('aria-describedby', 'event-photo-position');
  const viewer = element('div', '', 'cms-photo-viewer');
  const toolbar = element('div', '', 'cms-photo-toolbar');
  const position = element('p', '', 'cms-photo-position');
  position.id = 'event-photo-position';
  position.setAttribute('aria-live', 'polite');
  const close = element('button', 'Close ×', 'cms-photo-close');
  close.type = 'button';
  close.setAttribute('aria-label', 'Close photo');
  toolbar.append(position, close);
  const stage = element('div', '', 'cms-photo-stage');
  const fullImage = element('img');
  fullImage.decoding = 'async';
  stage.append(fullImage);
  const footer = element('div', '', 'cms-photo-footer');
  const caption = element('div', '', 'cms-photo-caption');
  const title = element('h2');
  title.id = 'event-photo-title';
  const description = element('p');
  caption.append(title, description);
  const controls = element('div', '', 'cms-photo-controls');
  const previous = element('button', '←', 'cms-photo-nav');
  previous.type = 'button';
  previous.setAttribute('aria-label', 'Previous photo');
  const next = element('button', '→', 'cms-photo-nav');
  next.type = 'button';
  next.setAttribute('aria-label', 'Next photo');
  controls.append(previous, next);
  footer.append(caption, controls);
  viewer.append(toolbar, stage, footer);
  dialog.append(viewer);
  document.body.append(dialog);

  let disposed = false;
  let currentAlbum = null;
  let currentPhoto = 0;
  let photoTrigger = null;
  let albumTrigger = null;
  const updatePhoto = () => {
    const photo = currentAlbum.photos[currentPhoto];
    fullImage.src = photo.url;
    fullImage.alt = photo.alt || photo.title || `Photo ${currentPhoto + 1} from ${currentAlbum.title}`;
    title.textContent = photo.title || `Photo ${currentPhoto + 1}`;
    description.textContent = photo.description;
    description.hidden = !photo.description;
    position.textContent = `${currentPhoto + 1} / ${currentAlbum.photos.length} · ${currentAlbum.title}`;
    previous.disabled = currentPhoto === 0;
    next.disabled = currentPhoto === currentAlbum.photos.length - 1;
    controls.hidden = currentAlbum.photos.length < 2;
  };
  const closePhoto = () => { if (dialog.open) dialog.close(); };
  const onDialogClose = () => {
    if (disposed || dialog.open) return;
    document.body.classList.remove('photo-viewer-open');
    if (photoTrigger?.isConnected) photoTrigger.focus({ preventScroll: true });
    fullImage.removeAttribute('src');
  };
  dialog.addEventListener('close', onDialogClose);
  // Native modal dialogs supply background inertness, focus trapping, and Escape.
  close.addEventListener('click', closePhoto);
  let pointerStartedOutside = false;
  dialog.addEventListener('pointerdown', (event) => { pointerStartedOutside = event.target === dialog; });
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog && pointerStartedOutside) closePhoto();
    pointerStartedOutside = false;
  });
  const movePhoto = (offset) => {
    const index = currentPhoto + offset;
    if (index < 0 || index >= currentAlbum.photos.length) return;
    currentPhoto = index;
    updatePhoto();
  };
  previous.addEventListener('click', () => movePhoto(-1));
  next.addEventListener('click', () => movePhoto(1));
  dialog.addEventListener('keydown', (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      movePhoto(event.key === 'ArrowLeft' ? -1 : 1);
    }
  });

  const folders = element('div', '', 'cms-event-albums');
  const showFolders = (restoreFocus = false) => {
    closePhoto();
    gallery.replaceChildren(folders);
    if (restoreFocus) albumTrigger?.focus({ preventScroll: true });
  };
  const showAlbum = (album, trigger) => {
    currentAlbum = album;
    albumTrigger = trigger;
    const header = element('div', '', 'cms-album-header');
    const back = element('button', '← Back to Past Events', 'cms-album-back');
    back.type = 'button';
    back.addEventListener('click', () => showFolders(true));
    const heading = element('h3', album.title, 'cms-album-heading');
    heading.tabIndex = -1;
    const meta = element('div', '', 'cms-album-meta');
    if (album.date) {
      const date = element('time', formatAlbumDate(album.date));
      date.dateTime = album.date;
      meta.append(date);
    }
    meta.append(element('span', photoCount(album.photos.length)));
    header.append(back, heading, meta);
    if (album.unassigned) header.append(element('p', 'Photos that haven’t been added to an event yet.', 'cms-album-note'));
    const grid = element('div', '', 'cms-photo-gallery');
    album.photos.forEach((photo, index) => {
      const figure = element('figure');
      const button = element('button', '', 'cms-photo-open');
      button.type = 'button';
      button.setAttribute('aria-label', `View larger photo: ${photo.title || photo.alt || `Photo ${index + 1}`}`);
      button.setAttribute('aria-haspopup', 'dialog');
      const img = element('img');
      img.src = photo.url;
      img.alt = photo.alt || photo.title || `Photo ${index + 1} from ${album.title}`;
      img.loading = 'lazy';
      img.decoding = 'async';
      const prompt = element('span', 'View larger ↗', 'cms-photo-prompt');
      prompt.setAttribute('aria-hidden', 'true');
      button.append(img, prompt);
      button.addEventListener('click', () => {
        photoTrigger = button;
        currentPhoto = index;
        updatePhoto();
        dialog.showModal();
        document.body.classList.add('photo-viewer-open');
        close.focus({ preventScroll: true });
      });
      figure.append(button);
      if (photo.title || photo.description) {
        const caption = element('figcaption');
        if (photo.title) caption.append(element('h4', photo.title));
        if (photo.description) caption.append(element('p', photo.description));
        figure.append(caption);
      }
      grid.append(figure);
    });
    gallery.replaceChildren(header, album.photos.length ? grid : element('p', 'Photos from this event will appear here soon.', 'event-gallery-placeholder'));
    heading.focus({ preventScroll: true });
  };

  for (const album of albums) {
    const card = element('button', '', 'cms-album-card');
    card.type = 'button';
    card.setAttribute('aria-label', `Open ${album.title}, ${photoCount(album.photos.length)}`);
    const label = element('span', album.unassigned ? 'Photo collection' : 'Event album', 'cms-album-tab');
    label.setAttribute('aria-hidden', 'true');
    const cover = element('span', '', 'cms-album-cover');
    if (album.cover) {
      const img = element('img');
      img.src = album.cover.url;
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      cover.append(img);
    } else {
      cover.classList.add('cms-album-cover-empty');
      const folder = element('span', '', 'cms-folder-symbol');
      folder.setAttribute('aria-hidden', 'true');
      cover.append(folder, element('span', album.unassigned ? 'A collection of memories' : 'Memories with Rider', 'cms-album-cover-label'));
    }
    const copy = element('span', '', 'cms-album-copy');
    copy.append(element('span', album.title, 'cms-album-title'));
    if (album.date) {
      const date = element('time', formatAlbumDate(album.date), 'cms-album-date');
      date.dateTime = album.date;
      copy.append(date);
    }
    const bottom = element('span', '', 'cms-album-bottom');
    bottom.append(element('span', photoCount(album.photos.length)), element('span', 'Open album →'));
    copy.append(bottom);
    card.append(label, cover, copy);
    card.addEventListener('click', () => showAlbum(album, card));
    folders.append(card);
  }
  if (albums.length) {
    showFolders();
    document.querySelectorAll('[data-event-tab]').forEach((tab) => {
      tab.setAttribute('aria-selected', String(tab === galleryTab));
    });
    document.querySelectorAll('[data-event-panel]').forEach((panel) => { panel.hidden = panel !== gallery; });
  } else {
    gallery.replaceChildren(element('p', 'Signing photos, readings, and memories will appear here as event albums are added.', 'event-gallery-placeholder'));
  }
  disposeEventGallery = () => {
    disposed = true;
    photoTrigger = null;
    closePhoto();
    document.body.classList.remove('photo-viewer-open');
    dialog.remove();
  };
}

export function applySiteContent(data) {
  const settings = data?.settings;
  // Prices must be verified together; never enable checkout with a partial catalog.
  if (!settings || !['paperbackPrice', 'hardcoverPrice'].every((key) => Number.isFinite(settings[key]) && settings[key] > 0 && settings[key] <= 1000) ||
      typeof settings.shippingMessage !== 'string' || !settings.shippingMessage.trim()) throw new Error('Incomplete catalog');
  Object.assign(catalog, {
    paperbackPrice: settings.paperbackPrice, hardcoverPrice: settings.hardcoverPrice,
    shippingMessage: settings.shippingMessage, ready: true,
  });
  for (const field of textFields) {
    if (typeof data.copy?.[field.name] !== 'string') continue;
    document.querySelectorAll(field.selector).forEach((node) => { node.textContent = data.copy[field.name]; });
  }
  const visitOptions = ['readingTitle', 'workshopTitle', 'trainingTitle', 'signingTitle'];
  document.querySelectorAll('[data-invite-form] select[name="interest"] option').forEach((option, index) => {
    const value = data.copy?.[visitOptions[index]];
    if (typeof value === 'string' && value.trim()) option.textContent = value;
  });
  document.querySelectorAll('.preorder-notice').forEach((node) => { node.textContent = catalog.shippingMessage; });
  const footer = document.querySelector('.footer-message');
  if (footer) footer.textContent = 'Pre-order your book now. ' + catalog.shippingMessage;
  const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
  for (const format of ['paperback', 'hardcover']) {
    const price = document.querySelector('[data-book-format][value="' + format + '"]')?.closest('label')?.querySelector('small');
    if (price) price.textContent = currency.format(catalog[format + 'Price']);
  }
  if (Array.isArray(data.curricula)) renderCurricula(data.curricula);
  if (Array.isArray(data.media)) renderMedia(data.media);
  if (Array.isArray(data.toolkit)) renderToolkit(data.toolkit);
  if (Array.isArray(data.social)) renderSocial(data.social);
  if (Array.isArray(data.events)) renderEvents(data.events);
  for (const photo of data.photos || []) {
    const slot = photoSlots.find((entry) => entry.name === photo.placement);
    if (!slot || !safeUrl(photo.url)) continue;
    document.querySelectorAll(slot.selector).forEach((img) => {
      img.src = safeUrl(photo.url);
      img.alt = photo.alt || slot.alt;
    });
  }
  if (Array.isArray(data.gallery) || Array.isArray(data.eventAlbums)) {
    renderEventAlbums(data.eventAlbums, data.gallery);
  }
}

export async function loadSiteContent() {
  try {
    const response = await fetch('/api/content', { signal: AbortSignal.timeout(7000), credentials: 'same-origin' });
    if (!response.ok) throw new Error('Content unavailable');
    applySiteContent(await response.json());
  } catch {
    catalog.ready = false;
    console.warn('Published content could not load. The original site content remains visible; checkout is paused until prices can be verified.');
  } finally {
    window.dispatchEvent(new Event('site-content-ready'));
  }
}
