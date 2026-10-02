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
  for (const photo of data.photos || []) {
    const slot = photoSlots.find((entry) => entry.name === photo.placement);
    if (!slot || !safeUrl(photo.url)) continue;
    document.querySelectorAll(slot.selector).forEach((img) => {
      img.src = safeUrl(photo.url);
      img.alt = photo.alt || slot.alt;
    });
  }
  const gallery = document.querySelector('[data-event-panel="past"]');
  if (gallery && Array.isArray(data.gallery)) {
    const photos = data.gallery.filter((photo) => safeUrl(photo.url));
    if (photos.length) {
      const grid = element('div', '', 'cms-photo-gallery');
      for (const photo of photos) {
        const figure = element('figure');
        const img = element('img');
        img.src = safeUrl(photo.url);
        img.alt = photo.alt || photo.title || '';
        img.loading = 'lazy';
        const caption = element('figcaption');
        caption.append(element('h3', photo.title), element('p', photo.description));
        figure.append(img, caption);
        grid.append(figure);
      }
      gallery.replaceChildren(grid);
    } else {
      gallery.replaceChildren(element('p', 'Signing photos, readings, and memories will appear here as the gallery grows.', 'event-gallery-placeholder'));
    }
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
