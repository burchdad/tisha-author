import { del, list, put } from '@vercel/blob';
import { defaultCurricula, defaultEvents, defaultMedia, defaultPhotos, defaultSettings, defaultSocial } from '../cms/defaults.js';
import textFields from '../cms/text-fields.json' with { type: 'json' };
import toolkitGroups from '../cms/toolkit-resources.json' with { type: 'json' };

const CONTENT_PREFIX = 'site-content/';
const MAX_ITEMS = 100;
const placements = new Set(['companion', 'gratitude', 'additional']);
const categories = new Set(['podcast', 'blog', 'feature']);
const photoPlacements = new Set(['author', 'illustrator', 'visit']);
const toolkitCategories = new Set(toolkitGroups.map((group) => group.category));

function hasBlobCredentials() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || (process.env.BLOB_STORE_ID && process.env.VERCEL_OIDC_TOKEN));
}

function blobOptions() {
  return process.env.BLOB_READ_WRITE_TOKEN ? { token: process.env.BLOB_READ_WRITE_TOKEN } : {};
}

function text(value, max, fallback = '') {
  return typeof value === 'string' ? value.trim().slice(0, max) : fallback;
}

function url(value, fallback = '') {
  const candidate = text(value, 2048, fallback);
  if (/^\/(?!\/)/.test(candidate)) return candidate;
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password ? parsed.href : fallback;
  } catch {
    return fallback;
  }
}

function array(value) {
  return Array.isArray(value) ? value.slice(0, MAX_ITEMS) : [];
}

export function defaultContent() {
  return {
    settings: { ...defaultSettings },
    copy: Object.fromEntries(textFields.map((field) => [field.name, field.initialValue])),
    curricula: defaultCurricula.map((item) => ({ title: item.title, description: item.description, placement: item.placement, url: item.existingUrl })),
    media: defaultMedia.map((item) => ({ title: item.title, description: item.description || '', category: item.category, url: item.url })),
    photos: defaultPhotos.map((item) => ({ placement: item.placement, alt: item.alt, url: item.existingUrl })),
    gallery: [],
    toolkit: toolkitGroups.flatMap((group) => group.resources.map((item) => ({ ...item, category: group.category }))),
    social: defaultSocial.map((item) => ({ ...item })),
    events: defaultEvents.map((item) => ({ ...item })),
  };
}

export function normalizeContent(input) {
  const defaults = defaultContent();
  const paperbackPrice = Number(input?.settings?.paperbackPrice);
  const hardcoverPrice = Number(input?.settings?.hardcoverPrice);
  if (!(paperbackPrice > 0 && paperbackPrice <= 1000 && hardcoverPrice > 0 && hardcoverPrice <= 1000)) {
    const error = new Error('Enter valid prices between $0.01 and $1,000.'); error.code = 'INVALID_CONTENT'; throw error;
  }
  const shippingMessage = text(input?.settings?.shippingMessage, 300);
  if (!shippingMessage) { const error = new Error('The shipping message is required.'); error.code = 'INVALID_CONTENT'; throw error; }

  const copy = {};
  for (const field of textFields) copy[field.name] = text(input?.copy?.[field.name], 5000, defaults.copy[field.name]);

  const curricula = array(input?.curricula).map((item) => ({
    title: text(item?.title, 200), description: text(item?.description, 1000),
    placement: placements.has(item?.placement) ? item.placement : 'additional', url: url(item?.url),
  })).filter((item) => item.title && item.url);

  const media = array(input?.media).map((item) => ({
    title: text(item?.title, 200), description: text(item?.description, 1000),
    category: categories.has(item?.category) ? item.category : 'feature', url: url(item?.url),
  })).filter((item) => item.title && item.url);

  const suppliedPhotos = new Map(array(input?.photos).map((item) => [item?.placement, item]));
  const photos = defaults.photos.map((fallback) => {
    const item = suppliedPhotos.get(fallback.placement) || fallback;
    return { placement: fallback.placement, alt: text(item.alt, 300, fallback.alt), url: url(item.url, fallback.url) };
  }).filter((item) => photoPlacements.has(item.placement));

  const gallery = array(input?.gallery).map((item) => ({
    title: text(item?.title, 200), description: text(item?.description, 1000), alt: text(item?.alt, 300),
    date: /^\d{4}-\d{2}-\d{2}$/.test(item?.date || '') ? item.date : '', url: url(item?.url),
  })).filter((item) => item.url);

  const toolkit = array(input?.toolkit ?? defaults.toolkit).map((item) => ({
    title: text(item?.title, 200), tag: text(item?.tag, 80),
    category: toolkitCategories.has(item?.category) ? item.category : 'activities', url: url(item?.url),
  })).filter((item) => item.title && item.url);

  const social = array(input?.social ?? defaults.social).map((item) => ({
    platform: text(item?.platform, 80), label: text(item?.label, 120), url: url(item?.url),
  })).filter((item) => item.platform && item.url);

  const events = array(input?.events ?? defaults.events).map((item) => ({
    date: text(item?.date, 100), title: text(item?.title, 200), description: text(item?.description, 1000),
    location: text(item?.location, 200), url: url(item?.url),
  })).filter((item) => item.title);

  return { settings: { shippingMessage, paperbackPrice, hardcoverPrice }, copy, curricula, media, photos, gallery, toolkit, social, events };
}

export async function readContent() {
  if (!hasBlobCredentials()) return defaultContent();
  const result = await list({ prefix: CONTENT_PREFIX, limit: 100, ...blobOptions() });
  const latest = result.blobs.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt))[0];
  if (!latest) return defaultContent();
  const response = await fetch(latest.url, { cache: 'no-store' });
  if (!response.ok) throw new Error('Saved content could not be read.');
  return normalizeContent(await response.json());
}

export async function writeContent(input) {
  if (!hasBlobCredentials()) throw new Error('File storage is not configured.');
  const content = normalizeContent(input);
  const pathname = `${CONTENT_PREFIX}${Date.now()}.json`;
  const saved = await put(pathname, JSON.stringify(content), {
    access: 'public', addRandomSuffix: false, contentType: 'application/json', cacheControlMaxAge: 60,
    ...blobOptions(),
  });
  const existing = await list({ prefix: CONTENT_PREFIX, limit: 100, ...blobOptions() });
  const oldUrls = existing.blobs.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt)).slice(10).map((blob) => blob.url);
  if (oldUrls.length) await del(oldUrls, blobOptions());
  return content;
}

export async function listContentRevisions() {
  if (!hasBlobCredentials()) return [];
  const result = await list({ prefix: CONTENT_PREFIX, limit: 100, ...blobOptions() });
  return result.blobs.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt)).slice(0, 10).map((blob) => ({ id: blob.pathname, createdAt: blob.uploadedAt }));
}

export async function restoreContentRevision(id) {
  if (typeof id !== 'string' || !/^site-content\/\d+\.json$/.test(id)) throw new Error('Invalid revision.');
  const result = await list({ prefix: CONTENT_PREFIX, limit: 100, ...blobOptions() });
  const revision = result.blobs.find((blob) => blob.pathname === id);
  if (!revision) throw new Error('That revision is no longer available.');
  const response = await fetch(revision.url, { cache: 'no-store' });
  if (!response.ok) throw new Error('That revision could not be read.');
  return writeContent(await response.json());
}
