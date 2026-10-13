import { uploadPresigned } from '@vercel/blob/client';
import textFields from '../cms/text-fields.json';
import './admin.css';

const loginPanel = document.querySelector('#login-panel');
const loginForm = document.querySelector('#login-form');
const dashboard = document.querySelector('#dashboard');
const logoutButton = document.querySelector('#logout');
const saveStatus = document.querySelector('[data-save-status]');
let content;
let savedSnapshot = '';
let readOnly = false;
let operation = '';
const previewNotice = document.querySelector('#preview-notice');
const inviteCopyNames = new Set(['schoolEyebrow', 'schoolHeading', 'schoolIntro', 'readingTitle', 'readingDescription', 'workshopTitle', 'workshopDescription', 'trainingTitle', 'trainingDescription', 'signingTitle', 'signingDescription', 'schoolClosing']);
const toolkitCopyNames = new Set(['toolkitHeading', 'toolkitIntro', 'toolkitFeatureHeading', 'toolkitFeatureIntro', 'toolkitModalHeading', 'toolkitModalIntro']);
const purchasePopupNames = new Set(['bookBadge', 'bookAuthorName', 'bookAuthorRole', 'bookEyebrow', 'bookTitle', 'bookDescription', 'bookFormatLegend', 'checkoutInstructions', 'orderContactIntro']);

const escape = (value = '') => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const field = (label, name, value = '', options = {}) => {
  const control = options.multiline
    ? `<textarea name="${escape(name)}" maxlength="${escape(options.max || 1000)}" rows="${escape(options.rows || 3)}">${escape(value)}</textarea>`
    : `<input name="${escape(name)}" type="${escape(options.type || 'text')}" value="${escape(value)}" maxlength="${escape(options.max || 2048)}" ${options.required ? 'required' : ''}>`;
  return `<label>${escape(label)}${control}</label>`;
};


// Legacy reads may not yet include album fields. Assign IDs once at load time,
// then preserve them through every edit and save.
function normalizeAlbumFields(data) {
  const albumIds = new Set();
  const photoIds = new Set();
  const eventAlbums = (Array.isArray(data.eventAlbums) ? data.eventAlbums : []).map((item = {}) => {
    const id = typeof item.id === 'string' && item.id && !albumIds.has(item.id) ? item.id : `album_${crypto.randomUUID()}`;
    albumIds.add(id);
    return { ...item, id, title: item.title || '', date: item.date || '', coverPhotoId: item.coverPhotoId || '' };
  });
  const gallery = (Array.isArray(data.gallery) ? data.gallery : []).map((item = {}) => {
    const id = typeof item.id === 'string' && item.id && !photoIds.has(item.id) ? item.id : `photo_${crypto.randomUUID()}`;
    photoIds.add(id);
    return { ...item, id, eventId: albumIds.has(item.eventId) ? item.eventId : '', date: item.date || '' };
  });
  for (const album of eventAlbums) {
    if (!gallery.some((photo) => photo.id === album.coverPhotoId && photo.eventId === album.id && photo.url)) album.coverPhotoId = '';
  }
  return { ...data, revision: data.revision ?? null, eventAlbums, gallery };
}

function viewableUrl(value) {
  if (typeof value !== 'string' || /[\x00-\x20\x7f\\]/.test(value)) return '';
  if (/^\/(?!\/)/.test(value)) return value;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password ? value : '';
  } catch { return ''; }
}

function syncInteractivity() {
  const busy = Boolean(operation);
  previewNotice.hidden = !readOnly;
  document.querySelector('#content-form').setAttribute('aria-busy', String(busy));
  document.querySelectorAll('#content-form input, #content-form textarea, #content-form select').forEach((input) => {
    input.disabled = busy || (readOnly && input.type === 'file');
  });
  document.querySelectorAll('#content-form button').forEach((button) => {
    button.disabled = busy || (button.hasAttribute('data-restore-revision') && (readOnly || button.dataset.currentRevision === 'true'));
  });
  document.querySelectorAll('[data-save]').forEach((button) => { button.disabled = busy || readOnly; });
  logoutButton.disabled = busy;
}

function beginOperation(name) {
  if (operation || readOnly) return false;
  operation = name;
  syncInteractivity();
  return true;
}

function endOperation() { operation = ''; syncInteractivity(); }

async function api(path, options = {}) {
  const response = await fetch(path, { credentials: 'same-origin', ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || 'Something went wrong.');
  return data;
}

function setStatus(node, message, state = '') { node.textContent = message; node.dataset.state = state; }

function copyFields(names) {
  return textFields.filter((item) => names ? names.has(item.name) : !inviteCopyNames.has(item.name) && !toolkitCopyNames.has(item.name) && !purchasePopupNames.has(item.name)).map((item) =>
    field(item.title, item.name, content.copy[item.name], { multiline: content.copy[item.name]?.length > 80, max: 5000 })
  ).join('');
}

function renderCopy() {
  document.querySelector('#purchase-popup-fields').innerHTML = copyFields(purchasePopupNames);
  document.querySelector('#copy-fields').innerHTML = copyFields();
  document.querySelector('#invite-fields').innerHTML = copyFields(inviteCopyNames);
  document.querySelector('#toolkit-copy-fields').innerHTML = copyFields(toolkitCopyNames);
}

function uploadControl(kind, index, url, accepts, uploadLabel) {
  const linkUrl = viewableUrl(url);
  const current = linkUrl ? `<a class="current-file" href="${escape(linkUrl)}" target="_blank" rel="noopener">View current ${escape(uploadLabel)}</a>` : '<span class="current-file empty-file">No file uploaded yet</span>';
  return `<input name="url" type="hidden" value="${escape(url)}">
    <label class="upload-label">Choose a new ${escape(uploadLabel)}<input class="file-input" type="file" accept="${escape(accepts)}" data-upload-kind="${escape(kind)}" data-upload-index="${escape(index)}" ${readOnly ? 'disabled' : ''}><span class="upload-help">${readOnly ? 'Uploads are disabled in this read-only preview.' : 'Select a file from your computer. It uploads automatically; then save the website changes.'}</span><span class="upload-progress" aria-live="polite"></span></label><div class="upload-recovery" hidden><button class="secondary" type="button" data-retry-upload>Retry upload</button><button class="remove" type="button" data-clear-upload>Discard file selection</button></div>${current}`;
}

function renderCurricula() {
  document.querySelector('#curricula-list').innerHTML = content.curricula.map((item, index) => `<article class="editor-card" data-kind="curricula" data-index="${index}">
    <div class="card-heading"><h3>Curriculum ${index + 1}</h3><button class="remove" type="button" data-remove="curricula" data-index="${index}">Remove</button></div>
    <div class="field-grid">${field('Title', 'title', item.title, { required: true })}${field('Description', 'description', item.description, { multiline: true })}
      <label>Placement<select name="placement"><option value="companion" ${item.placement === 'companion' ? 'selected' : ''}>Curriculum companion</option><option value="gratitude" ${item.placement === 'gratitude' ? 'selected' : ''}>Gratitude curriculum</option><option value="additional" ${item.placement === 'additional' ? 'selected' : ''}>More downloads</option></select></label>
      ${uploadControl('curricula', index, item.url, 'application/pdf', 'PDF')}</div></article>`).join('') || '<p class="empty">No curriculum files yet.</p>';
}

function renderMedia() {
  document.querySelector('#media-list').innerHTML = content.media.map((item, index) => `<article class="editor-card" data-kind="media" data-index="${index}">
    <div class="card-heading"><h3>Media link ${index + 1}</h3><button class="remove" type="button" data-remove="media" data-index="${index}">Remove</button></div>
    <div class="field-grid">${field('Title', 'title', item.title, { required: true })}${field('HTTPS link', 'url', item.url, { type: 'url', required: true })}
      <label>Type<select name="category"><option value="podcast" ${item.category === 'podcast' ? 'selected' : ''}>Podcast</option><option value="blog" ${item.category === 'blog' ? 'selected' : ''}>Blog or article</option><option value="feature" ${item.category === 'feature' ? 'selected' : ''}>Feature</option></select></label>
      ${field('Description (optional)', 'description', item.description, { multiline: true })}</div></article>`).join('') || '<p class="empty">No media links yet.</p>';
}

function renderEvents() {
  document.querySelector('#events-list').innerHTML = (content.events || []).map((item, index) => `<article class="editor-card" data-kind="events" data-index="${index}">
    <div class="card-heading"><h3>Event ${index + 1}</h3><button class="remove" type="button" data-remove="events" data-index="${index}">Remove</button></div>
    <div class="field-grid">${field('Date or date message', 'date', item.date)}${field('Title', 'title', item.title, { required: true })}${field('Description', 'description', item.description, { multiline: true })}${field('Location', 'location', item.location)}${field('Event details link (optional)', 'url', item.url, { type: 'url' })}</div></article>`).join('') || '<p class="empty">No upcoming events yet.</p>';
}

function renderSocial() {
  document.querySelector('#social-list').innerHTML = (content.social || []).map((item, index) => `<article class="editor-card" data-kind="social" data-index="${index}">
    <div class="card-heading"><h3>Social link ${index + 1}</h3><button class="remove" type="button" data-remove="social" data-index="${index}">Remove</button></div>
    <div class="field-grid">${field('Platform', 'platform', item.platform, { required: true })}${field('Account name', 'label', item.label)}${field('HTTPS link', 'url', item.url, { type: 'url', required: true })}</div></article>`).join('') || '<p class="empty">No social links yet.</p>';
}

function renderRevisions(revisions = []) {
  const list = document.querySelector('#revisions-list');
  list.innerHTML = revisions.map((revision, index) => `<div class="revision-row"><div><strong>${index === 0 ? 'Current saved version' : `Saved version ${index + 1}`}</strong><span>${escape(new Date(revision.createdAt).toLocaleString())}</span></div><button class="secondary" type="button" data-restore-revision="${escape(revision.id)}" data-current-revision="${index === 0}" ${index === 0 || readOnly || operation ? 'disabled' : ''}>Restore</button></div>`).join('') || '<p class="empty">Saved versions will appear after the first website update.</p>';
}

async function loadRevisions() {
  try { renderRevisions((await api('/api/admin/revisions')).revisions); }
  catch (error) { document.querySelector('#revisions-list').innerHTML = `<p class="empty">${escape(error.message)}</p>`; }
}

function renderPhotos() {
  const names = { author: 'Author portrait', checkout: 'Purchase pop-up headshot', illustrator: 'Illustrator portrait', visit: 'School visit photo' };
  document.querySelector('#photos-list').innerHTML = content.photos.map((item, index) => `<article class="editor-card" data-kind="photos" data-index="${index}">
    <div class="card-heading"><h3>${names[item.placement] || 'Website photo'}</h3></div><img class="preview" src="${escape(viewableUrl(item.url))}" alt=""><input type="hidden" name="placement" value="${escape(item.placement)}">
    <div class="field-grid">${field('Image description for accessibility', 'alt', item.alt)}${uploadControl('photos', index, item.url, 'image/jpeg,image/png,image/webp,image/gif', 'photo')}</div></article>`).join('');
}

function albumOptions(albums, selected = '') {
  return `<option value="" ${selected === '' ? 'selected' : ''}>Unassigned photos</option>` + albums.map((album, index) => `<option value="${escape(album.id)}" ${selected === album.id ? 'selected' : ''}>${escape(album.title || `Untitled event ${index + 1}`)}</option>`).join('');
}

function coverOptions(photos, selected = '') {
  return `<option value="" ${selected === '' ? 'selected' : ''}>First photo (automatic)</option>` + photos.filter((photo) => photo.url).map((photo, index) => `<option value="${escape(photo.id)}" ${selected === photo.id ? 'selected' : ''}>${escape(photo.title || photo.alt || `Photo ${index + 1}`)}</option>`).join('');
}

function albumSummary(photos) {
  const uploaded = photos.filter((photo) => photo.url).length;
  const drafts = photos.length - uploaded;
  return `${uploaded} photo${uploaded === 1 ? '' : 's'}${drafts ? ` · ${drafts} awaiting upload` : ''}`;
}

function renderAlbums() {
  document.querySelector('#event-albums-list').innerHTML = content.eventAlbums.map((album, index) => {
    const photos = content.gallery.filter((photo) => photo.eventId === album.id);
    return `<article class="editor-card album-editor" data-kind="eventAlbums" data-index="${index}">
      <input name="id" type="hidden" value="${escape(album.id)}">
      <div class="card-heading"><div><p class="album-label">EVENT FOLDER</p><h3 data-album-heading>${escape(album.title || `Untitled event ${index + 1}`)}</h3><p class="album-count" data-album-count>${escape(albumSummary(photos))}</p></div><button class="remove" type="button" data-remove="eventAlbums" data-index="${index}">Remove event folder</button></div>
      <div class="field-grid">${field('Event name', 'title', album.title, { required: true, max: 200 })}${field('Event date (optional)', 'date', album.date, { type: 'date' })}
        <label class="wide">Cover photo (optional)<select name="coverPhotoId">${coverOptions(photos, album.coverPhotoId)}</select><span class="upload-help">Choose a photo assigned to this event. The first photo is used if no cover is chosen.</span></label></div>
      <button class="secondary album-add-photo" type="button" data-add="gallery" data-event-id="${escape(album.id)}">Add photo to this event</button>
    </article>`;
  }).join('') || '<p class="empty">No event folders yet. Create an event to group its photographs.</p>';
}

function galleryCard(item, index) {
  return `<article class="editor-card" data-kind="gallery" data-index="${index}">
    <input name="id" type="hidden" value="${escape(item.id)}">
    <div class="card-heading"><h3>Gallery photo ${index + 1}</h3><button class="remove" type="button" data-remove="gallery" data-index="${index}">Remove photo</button></div>${viewableUrl(item.url) ? `<img class="preview" src="${escape(viewableUrl(item.url))}" alt="">` : ''}
    <div class="field-grid"><label class="wide">Event folder<select name="eventId">${albumOptions(content.eventAlbums, item.eventId)}</select></label>${field('Title', 'title', item.title, { max: 200 })}${field('Photo date (optional)', 'date', item.date, { type: 'date' })}${field('Caption', 'description', item.description, { multiline: true })}${field('Image description for accessibility', 'alt', item.alt, { max: 300 })}${uploadControl('gallery', index, item.url, 'image/jpeg,image/png,image/webp,image/gif', 'photo')}</div></article>`;
}

function renderGallery() {
  document.querySelector('#gallery-list').innerHTML = content.gallery.map(galleryCard).join('') || '<p class="empty">No event photos yet. Choose “Add photo” to begin.</p>';
}

function appendGalleryPhoto() {
  const list = document.querySelector('#gallery-list');
  list.querySelector('.empty')?.remove();
  const index = content.gallery.length - 1;
  list.insertAdjacentHTML('beforeend', galleryCard(content.gallery[index], index));
}

function removeGalleryPhoto(index) {
  document.querySelectorAll('[data-kind="gallery"]')[index]?.remove();
  if (!content.gallery.length) { renderGallery(); return; }
  document.querySelectorAll('[data-kind="gallery"]').forEach((card, newIndex) => {
    card.dataset.index = String(newIndex);
    card.querySelector('[data-remove]').dataset.index = String(newIndex);
    card.querySelector('[data-upload-kind]').dataset.uploadIndex = String(newIndex);
    card.querySelector('h3').textContent = `Gallery photo ${newIndex + 1}`;
  });
}

// Update only options and labels while typing, so unsaved fields and file inputs
// stay in place. Changing an association clears a cover that no longer belongs.
function refreshAlbumControls() {
  if (operation || !content) return;
  const draft = collect();
  document.querySelectorAll('[data-kind="gallery"]').forEach((card) => {
    const select = card.querySelector('select[name="eventId"]');
    select.innerHTML = albumOptions(draft.eventAlbums, select.value);
  });
  document.querySelectorAll('[data-kind="eventAlbums"]').forEach((card, index) => {
    const album = draft.eventAlbums[index];
    const photos = draft.gallery.filter((photo) => photo.eventId === album.id);
    const cover = card.querySelector('select[name="coverPhotoId"]');
    const selected = photos.some((photo) => photo.id === cover.value && photo.url) ? cover.value : '';
    cover.innerHTML = coverOptions(photos, selected);
    card.querySelector('[data-album-heading]').textContent = album.title || `Untitled event ${index + 1}`;
    card.querySelector('[data-album-count]').textContent = albumSummary(photos);
  });
  document.querySelector('[data-unassigned-count]').textContent = albumSummary(draft.gallery.filter((photo) => !photo.eventId));
}

function renderToolkit() {
  const categoryNames = { curriculum: 'Curriculum', activities: 'Activities', 'gratitude-journal': 'Gratitude Journal', coloring: 'Coloring Pages', certificates: 'Certificates', poems: 'Poems', family: 'Family', teachers: 'Teacher Things' };
  const cards = (content.toolkit || []).map((item, index) => ({ category: item.category, html: `<article class="editor-card" data-kind="toolkit" data-index="${index}">
    <div class="card-heading"><h3>Toolkit resource ${index + 1}</h3><button class="remove" type="button" data-remove="toolkit" data-index="${index}">Remove</button></div>
    <div class="field-grid">${field('Title', 'title', item.title, { required: true })}${field('Short label', 'tag', item.tag)}
      <label>Category<select name="category">${Object.entries(categoryNames).map(([value, label]) => `<option value="${value}" ${item.category === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
      ${uploadControl('toolkit', index, item.url, '.pdf,.doc,.docx,.zip', 'file')}</div></article>` }));
  document.querySelector('#toolkit-list').innerHTML = Object.entries(categoryNames).map(([category, label]) => {
    const matching = cards.filter((card) => card.category === category);
    return `<details class="toolkit-category"><summary>${label}<span>${matching.length} resource${matching.length === 1 ? '' : 's'}</span></summary><div class="category-cards">${matching.map((card) => card.html).join('') || '<p class="empty">No resources in this category.</p>'}</div></details>`;
  }).join('');
}

function render() {
  const form = document.querySelector('#content-form');
  form.elements.paperbackPrice.value = content.settings.paperbackPrice;
  form.elements.hardcoverPrice.value = content.settings.hardcoverPrice;
  form.elements.shippingMessage.value = content.settings.shippingMessage;
  renderCopy(); renderToolkit(); renderCurricula(); renderMedia(); renderEvents(); renderSocial(); renderPhotos(); renderAlbums(); renderGallery();
  syncInteractivity();
}

function valuesForCard(card) {
  return Object.fromEntries([...card.querySelectorAll('input:not([type="file"]), textarea, select')].map((input) => [input.name, input.value]));
}

function collect() {
  const form = document.querySelector('#content-form');
  return {
    revision: content.revision ?? null,
    settings: { paperbackPrice: Number(form.elements.paperbackPrice.value), hardcoverPrice: Number(form.elements.hardcoverPrice.value), shippingMessage: form.elements.shippingMessage.value },
    copy: Object.fromEntries(textFields.map((item) => [item.name, form.elements[item.name].value])),
    curricula: [...document.querySelectorAll('[data-kind="curricula"]')].map(valuesForCard),
    media: [...document.querySelectorAll('[data-kind="media"]')].map(valuesForCard),
    photos: [...document.querySelectorAll('[data-kind="photos"]')].map(valuesForCard),
    gallery: [...document.querySelectorAll('[data-kind="gallery"]')].map(valuesForCard),
    eventAlbums: [...document.querySelectorAll('[data-kind="eventAlbums"]')].map(valuesForCard),
    toolkit: [...document.querySelectorAll('[data-kind="toolkit"]')].map(valuesForCard),
    events: [...document.querySelectorAll('[data-kind="events"]')].map(valuesForCard),
    social: [...document.querySelectorAll('[data-kind="social"]')].map(valuesForCard),
  };
}

function isDirty() {
  return Boolean(content && savedSnapshot && JSON.stringify(collect()) !== savedSnapshot);
}

function showUnsavedStatus() {
  if (operation) return;
  if (content && isDirty()) setStatus(saveStatus, readOnly ? 'Preview edits only. Saving is disabled.' : 'Unsaved changes', 'pending');
}

async function loadDashboard() {
  content = normalizeAlbumFields(await api('/api/admin/content')); render(); refreshAlbumControls();
  savedSnapshot = JSON.stringify(collect());
  loginPanel.hidden = true; dashboard.hidden = false; document.body.classList.add('dashboard-active');
  await loadRevisions();
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = loginForm.querySelector('button'); const status = loginForm.querySelector('[data-login-status]');
  button.disabled = true; setStatus(status, 'Signing in…');
  try {
    await api('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(loginForm))) });
    loginForm.reset();
    readOnly = (await api('/api/admin/session')).readOnly === true;
    if (content && isDirty()) {
      loginPanel.hidden = true; dashboard.hidden = false; document.body.classList.add('dashboard-active');
      syncInteractivity(); showUnsavedStatus();
    } else await loadDashboard();
  } catch (error) { setStatus(status, error.message, 'error'); }
  finally { button.disabled = false; }
});

const renderers = { curricula: renderCurricula, media: renderMedia, gallery: renderGallery, eventAlbums: renderAlbums, toolkit: renderToolkit, events: renderEvents, social: renderSocial };

function focusNewCard(kind) {
  const cards = document.querySelectorAll(`[data-kind="${kind}"]`);
  const card = cards[cards.length - 1];
  card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  card?.querySelector('input:not([type="hidden"]):not([type="file"])')?.focus({ preventScroll: true });
}

document.addEventListener('click', (event) => {
  const add = event.target.closest('[data-add]');
  const remove = event.target.closest('[data-remove]');
  const restore = event.target.closest('[data-restore-revision]');
  if ((!add && !remove && !restore) || operation || !content) return;
  if (add) {
    const kind = add.dataset.add;
    if (!renderers[kind]) return;
    content = collect();
    if (kind === 'curricula') content.curricula.push({ title: '', description: '', placement: 'additional', url: '' });
    if (kind === 'media') content.media.push({ title: '', description: '', category: 'podcast', url: '' });
    if (kind === 'gallery') content.gallery.push({ id: `photo_${crypto.randomUUID()}`, eventId: content.eventAlbums.some((album) => album.id === add.dataset.eventId) ? add.dataset.eventId : '', title: '', description: '', alt: '', date: '', url: '' });
    if (kind === 'eventAlbums') content.eventAlbums.push({ id: `album_${crypto.randomUUID()}`, title: '', date: '', coverPhotoId: '' });
    if (kind === 'toolkit') content.toolkit.push({ title: '', tag: 'Resource', category: 'activities', url: '' });
    if (kind === 'events') content.events.push({ date: '', title: '', description: '', location: '', url: '' });
    if (kind === 'social') content.social.push({ platform: '', label: '', url: '' });
    if (kind === 'gallery') appendGalleryPhoto(); else renderers[kind]();
    refreshAlbumControls(); syncInteractivity(); focusNewCard(kind); showUnsavedStatus();
  }
  if (remove) {
    const kind = remove.dataset.remove;
    const index = Number(remove.dataset.index);
    if (!renderers[kind]) return;
    const draft = collect();
    if (!draft[kind]?.[index]) return;
    if (kind === 'eventAlbums') {
      const album = draft.eventAlbums[index];
      if (!confirm(`Remove the event folder “${album.title || 'Untitled event'}”? Its photos will move to Unassigned photos. No photo files will be deleted.`)) return;
      draft.gallery = draft.gallery.map((photo) => photo.eventId === album.id ? { ...photo, eventId: '' } : photo);
      // Change association values before removing their options, retaining photo fields.
      document.querySelectorAll('[data-kind="gallery"] select[name="eventId"]').forEach((select) => { if (select.value === album.id) select.value = ''; });
    }
    content = draft;
    content[kind].splice(index, 1);
    if (kind === 'gallery') removeGalleryPhoto(index); else renderers[kind]();
    refreshAlbumControls(); syncInteractivity(); showUnsavedStatus();
  }
  if (restore) restoreRevision(restore.dataset.restoreRevision);
});

const contentForm = document.querySelector('#content-form');
contentForm.addEventListener('submit', (event) => event.preventDefault());
contentForm.addEventListener('input', (event) => {
  if (event.target.closest('[data-kind="eventAlbums"], [data-kind="gallery"]') && event.target.name === 'title') refreshAlbumControls();
  showUnsavedStatus();
});
contentForm.addEventListener('change', (event) => {
  if (event.target.name === 'eventId') refreshAlbumControls();
  showUnsavedStatus();
});

async function uploadFile(input) {
  if (!input?.files?.[0] || !beginOperation('upload')) return;
  const recovery = input.closest('.editor-card').querySelector('.upload-recovery');
  if (recovery) recovery.hidden = true;
  const progress = input.parentElement.querySelector('.upload-progress'); progress.textContent = 'Uploading securely…';
  setStatus(saveStatus, 'Uploading… Please wait before making more changes.', 'pending');
  let uploadError = '';
  let uploadComplete = false;
  try {
    const file = input.files[0];
    if (file.size > 15 * 1024 * 1024) throw new Error('That file is larger than 15 MB. Choose a smaller file.');
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-').slice(-120);
    const result = await uploadPresigned(`uploads/${Date.now()}-${safeName}`, file, {
      access: 'private', handleUploadUrl: '/api/admin/upload', abortSignal: AbortSignal.timeout(60000),
    });
    const mediaUrl = `/api/media?pathname=${encodeURIComponent(result.pathname)}`;
    const card = input.closest('.editor-card'); card.querySelector('input[name="url"]').value = mediaUrl;
    let preview = card.querySelector('.preview');
    if (!preview && input.accept.startsWith('image/')) { preview = document.createElement('img'); preview.className = 'preview'; preview.alt = ''; card.querySelector('.card-heading').after(preview); }
    if (preview) preview.src = mediaUrl;
    const currentFile = card.querySelector('.current-file');
    if (currentFile) { const link = document.createElement('a'); link.className = 'current-file'; link.href = mediaUrl; link.target = '_blank'; link.rel = 'noopener'; link.textContent = `View uploaded ${input.accept.startsWith('image/') ? 'photo' : 'file'}`; currentFile.replaceWith(link); }
    progress.textContent = 'Upload complete. Save changes to publish it.';
    uploadComplete = true;
  } catch (error) { console.error('Dashboard upload failed', error); uploadError = error.name === 'TimeoutError' ? 'Upload timed out. Check your connection and try again.' : (error.message || 'Upload failed.'); progress.textContent = uploadError; }
  finally {
    if (uploadComplete) input.value = '';
    endOperation(); refreshAlbumControls();
    if (uploadError) {
      if (recovery) recovery.hidden = false;
      setStatus(saveStatus, uploadError, 'error');
    } else showUnsavedStatus();
  }
}

document.addEventListener('change', (event) => uploadFile(event.target.closest('[data-upload-kind]')));
document.addEventListener('click', (event) => {
  const retry = event.target.closest('[data-retry-upload]');
  const clear = event.target.closest('[data-clear-upload]');
  if ((!retry && !clear) || operation || readOnly) return;
  const card = (retry || clear).closest('.editor-card');
  const input = card.querySelector('input[type="file"]');
  if (retry) return uploadFile(input);
  input.value = '';
  card.querySelector('.upload-recovery').hidden = true;
  card.querySelector('.upload-progress').textContent = 'File selection cleared. The previous file is unchanged.';
  setStatus(saveStatus, 'File selection cleared. The previous file is unchanged.');
  showUnsavedStatus();
});

async function saveChanges() {
  if (operation || readOnly || !content) return;
  const emptyPhoto = [...document.querySelectorAll('[data-kind="gallery"]')].find((card) => !card.querySelector('input[name="url"]').value.trim());
  if (emptyPhoto) {
    setStatus(saveStatus, 'A gallery photo is awaiting upload. Choose a photo file or remove its draft before saving; your other edits are still here.', 'error');
    emptyPhoto.scrollIntoView({ behavior: 'smooth', block: 'center' });
    emptyPhoto.querySelector('input[type="file"]')?.focus({ preventScroll: true });
    return;
  }
  const pendingFile = [...document.querySelectorAll('#content-form input[type="file"]')].find((input) => input.files?.length);
  if (pendingFile) {
    setStatus(saveStatus, 'A selected file has not uploaded successfully. Use Retry upload or Discard file selection before saving.', 'error');
    pendingFile.focus();
    return;
  }
  if (!contentForm.reportValidity() || !beginOperation('save')) return;
  setStatus(saveStatus, 'Saving website changes…');
  try {
    const saved = await api('/api/admin/content', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(collect()) });
    content = normalizeAlbumFields(saved);
    render(); savedSnapshot = JSON.stringify(collect()); await loadRevisions();
    setStatus(saveStatus, 'Saved. The public website will update within about one minute.', 'success');
  } catch (error) {
    setStatus(saveStatus, error.message, 'error');
    if (/sign in/i.test(error.message)) { dashboard.hidden = true; loginPanel.hidden = false; }
  } finally { endOperation(); refreshAlbumControls(); }
}

document.querySelectorAll('[data-save]').forEach((button) => button.addEventListener('click', saveChanges));

async function restoreRevision(id) {
  if (operation || readOnly || !content) return;
  if (!confirm('Restore this saved version? Your current saved website content and any unsaved edits will be replaced.')) return;
  if (!beginOperation('restore')) return;
  setStatus(saveStatus, 'Restoring saved version…');
  try {
    content = normalizeAlbumFields(await api('/api/admin/revisions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, revision: content.revision ?? null }) }));
    render(); savedSnapshot = JSON.stringify(collect()); await loadRevisions();
    setStatus(saveStatus, 'Saved version restored. The public website will update within about one minute.', 'success');
  } catch (error) { setStatus(saveStatus, error.message, 'error'); }
  finally { endOperation(); refreshAlbumControls(); }
}

logoutButton.addEventListener('click', async () => {
  if (operation) return;
  if (isDirty() && !confirm('You have unsaved changes. Sign out without saving them?')) return;
  await api('/api/admin/logout', { method: 'POST' }).catch(() => {});
  content = null; savedSnapshot = ''; dashboard.hidden = true; loginPanel.hidden = false; document.body.classList.remove('dashboard-active');
});

window.addEventListener('beforeunload', (event) => {
  if (!operation && !isDirty()) return;
  event.preventDefault(); event.returnValue = '';
});

const sectionLinks = [...document.querySelectorAll('.section-nav > a[href^="#"]')];
const sectionObserver = new IntersectionObserver((entries) => {
  const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
  if (!visible) return;
  sectionLinks.forEach((link) => link.toggleAttribute('aria-current', link.hash === `#${visible.target.id}`));
}, { rootMargin: '-15% 0px -70% 0px' });
document.querySelectorAll('.editor-section').forEach((section) => sectionObserver.observe(section));

try {
  const session = await api('/api/admin/session');
  readOnly = session.readOnly === true;
  if (session.authenticated) await loadDashboard();
  else if (!session.configured) setStatus(loginForm.querySelector('[data-login-status]'), 'The private dashboard is waiting for its one-time account setup.', 'error');
} catch { setStatus(loginForm.querySelector('[data-login-status]'), 'The dashboard could not connect. Please refresh and try again.', 'error'); }
