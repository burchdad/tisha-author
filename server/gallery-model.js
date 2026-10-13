import { createHash } from 'node:crypto';

const albumId = /^album_[a-zA-Z0-9-]{8,80}$/;
const photoId = /^photo_[a-zA-Z0-9-]{8,80}$/;
const cleanText = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';

function invalid(message) {
  const error = new Error(message); error.code = 'INVALID_CONTENT'; throw error;
}

function optionalDate(value) {
  if (!value) return '';
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      !Number.isFinite(Date.parse(value + 'T12:00:00Z')) ||
      new Date(value + 'T12:00:00Z').toISOString().slice(0, 10) !== value) {
    invalid('Choose a valid event date or leave it blank.');
  }
  return value;
}

// Legacy IDs are deterministic, including repeated URLs, so loading old content
// never writes a migration or invents event metadata.
function legacyPhotoId(url, occurrence) {
  return 'photo_' + createHash('sha256').update(`${url}\n${occurrence}`).digest('hex').slice(0, 32);
}

export function normalizeGallery(input, safeUrl) {
  if (input?.eventAlbums !== undefined && !Array.isArray(input.eventAlbums)) invalid('Event albums must be a list.');
  if (input?.gallery !== undefined && !Array.isArray(input.gallery)) invalid('Gallery photos must be a list.');
  const albums = input?.eventAlbums || [];
  const photos = input?.gallery || [];
  // Reject overflow rather than silently dropping existing photos as slice() did.
  if (albums.length > 100) invalid('Use no more than 100 event albums.');
  if (photos.length > 1000) invalid('Use no more than 1,000 gallery photos. No photos were saved or removed.');
  const seenAlbums = new Set();
  const eventAlbums = albums.map((item) => {
    if (typeof item?.id !== 'string' || !albumId.test(item.id) || seenAlbums.has(item.id)) invalid('Each event needs a unique valid album ID.');
    seenAlbums.add(item.id);
    const title = cleanText(item.title, 200);
    if (!title) invalid('Give every event album a title.');
    const coverPhotoId = item.coverPhotoId || '';
    if (typeof coverPhotoId !== 'string' || (coverPhotoId && !photoId.test(coverPhotoId))) invalid('Choose a valid event cover photo.');
    return { id: item.id, title, date: optionalDate(item.date), coverPhotoId };
  });
  const seenPhotos = new Set();
  const occurrences = new Map();
  const gallery = photos.map((item) => {
    const url = safeUrl(item?.url);
    if (!url) {
      if (item?.id || item?.eventId) invalid('Upload a photo before saving, or remove its empty photo card.');
      return null; // Retain old normalization behavior for empty legacy cards.
    }
    const occurrence = occurrences.get(url) || 0;
    occurrences.set(url, occurrence + 1);
    const id = item.id || legacyPhotoId(url, occurrence);
    if (typeof id !== 'string' || !photoId.test(id) || seenPhotos.has(id)) invalid('Each gallery photo needs a unique valid photo ID.');
    seenPhotos.add(id);
    const eventId = item.eventId || '';
    if (typeof eventId !== 'string' || (eventId && !seenAlbums.has(eventId))) invalid('Choose an existing event for every photo, or choose Unassigned photos.');
    return { id, eventId, title: cleanText(item.title, 200), description: cleanText(item.description, 1000),
      alt: cleanText(item.alt, 300), date: /^\d{4}-\d{2}-\d{2}$/.test(item.date || '') ? item.date : '', url };
  }).filter(Boolean);
  const byPhotoId = new Map(gallery.map((photo) => [photo.id, photo]));
  for (const album of eventAlbums) {
    if (album.coverPhotoId && byPhotoId.get(album.coverPhotoId)?.eventId !== album.id) {
      invalid('An event cover must be one of that event’s photos.');
    }
  }
  return { gallery, eventAlbums };
}

// An already-open older dashboard does not know album fields. Keep those fields
// and any omitted saved photos until the author reloads the album-aware editor.
export function preserveLegacyGallery(input, current, canonicalUrl = (value) => typeof value === 'string' ? value.trim().replaceAll(' ', '%20') : '') {
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid('Content must be an object.');
  if (Object.hasOwn(input, 'eventAlbums')) return input;
  const remaining = [...(current.gallery || [])];
  const gallery = (Array.isArray(input.gallery) ? input.gallery : []).map((photo) => {
    const index = remaining.findIndex((saved) => canonicalUrl(saved.url) === canonicalUrl(photo?.url));
    if (index < 0) return photo;
    const [saved] = remaining.splice(index, 1);
    return { ...photo, id: saved.id, eventId: saved.eventId };
  });
  return { ...input, eventAlbums: current.eventAlbums || [], gallery: [...gallery, ...remaining] };
}

export function validateContentRevision(input, current) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid('Content must be an object.');
  if (Object.hasOwn(input, 'revision') && input.revision !== (current.revision ?? null)) {
    const error = new Error('The website was saved in another session. Keep a copy of your edits, then refresh before saving.');
    error.code = 'CONTENT_CONFLICT'; throw error;
  }
}
