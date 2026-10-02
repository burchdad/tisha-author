import { uploadPresigned } from '@vercel/blob/client';
import textFields from '../cms/text-fields.json';
import './admin.css';

const loginPanel = document.querySelector('#login-panel');
const loginForm = document.querySelector('#login-form');
const dashboard = document.querySelector('#dashboard');
const logoutButton = document.querySelector('#logout');
const saveStatus = document.querySelector('[data-save-status]');
let content;

const escape = (value = '') => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const field = (label, name, value = '', options = {}) => {
  const control = options.multiline
    ? `<textarea name="${name}" maxlength="${options.max || 1000}" rows="${options.rows || 3}">${escape(value)}</textarea>`
    : `<input name="${name}" type="${options.type || 'text'}" value="${escape(value)}" maxlength="${options.max || 2048}" ${options.required ? 'required' : ''}>`;
  return `<label>${label}${control}</label>`;
};

async function api(path, options = {}) {
  const response = await fetch(path, { credentials: 'same-origin', ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || 'Something went wrong.');
  return data;
}

function setStatus(node, message, state = '') { node.textContent = message; node.dataset.state = state; }

function renderCopy() {
  document.querySelector('#copy-fields').innerHTML = textFields.map((item) =>
    field(item.title, item.name, content.copy[item.name], { multiline: content.copy[item.name]?.length > 80, max: 5000 })
  ).join('');
}

function uploadControl(kind, index, url, accepts) {
  return `<label>File URL<input name="url" type="text" value="${escape(url)}" required></label>
    <label class="upload-label">Upload ${accepts === 'application/pdf' ? 'PDF' : 'photo'}<input class="file-input" type="file" accept="${accepts}" data-upload-kind="${kind}" data-upload-index="${index}"><span class="upload-progress" aria-live="polite"></span></label>`;
}

function renderCurricula() {
  document.querySelector('#curricula-list').innerHTML = content.curricula.map((item, index) => `<article class="editor-card" data-kind="curricula" data-index="${index}">
    <div class="card-heading"><h3>Curriculum ${index + 1}</h3><button class="remove" type="button" data-remove="curricula" data-index="${index}">Remove</button></div>
    <div class="field-grid">${field('Title', 'title', item.title, { required: true })}${field('Description', 'description', item.description, { multiline: true })}
      <label>Placement<select name="placement"><option value="companion" ${item.placement === 'companion' ? 'selected' : ''}>Curriculum companion</option><option value="gratitude" ${item.placement === 'gratitude' ? 'selected' : ''}>Gratitude curriculum</option><option value="additional" ${item.placement === 'additional' ? 'selected' : ''}>More downloads</option></select></label>
      ${uploadControl('curricula', index, item.url, 'application/pdf')}</div></article>`).join('') || '<p class="empty">No curriculum files yet.</p>';
}

function renderMedia() {
  document.querySelector('#media-list').innerHTML = content.media.map((item, index) => `<article class="editor-card" data-kind="media" data-index="${index}">
    <div class="card-heading"><h3>Media link ${index + 1}</h3><button class="remove" type="button" data-remove="media" data-index="${index}">Remove</button></div>
    <div class="field-grid">${field('Title', 'title', item.title, { required: true })}${field('HTTPS link', 'url', item.url, { type: 'url', required: true })}
      <label>Type<select name="category"><option value="podcast" ${item.category === 'podcast' ? 'selected' : ''}>Podcast</option><option value="blog" ${item.category === 'blog' ? 'selected' : ''}>Blog or article</option><option value="feature" ${item.category === 'feature' ? 'selected' : ''}>Feature</option></select></label>
      ${field('Description (optional)', 'description', item.description, { multiline: true })}</div></article>`).join('') || '<p class="empty">No media links yet.</p>';
}

function renderPhotos() {
  const names = { author: 'Author portrait', illustrator: 'Illustrator portrait', visit: 'School visit photo' };
  document.querySelector('#photos-list').innerHTML = content.photos.map((item, index) => `<article class="editor-card" data-kind="photos" data-index="${index}">
    <div class="card-heading"><h3>${names[item.placement] || 'Website photo'}</h3></div><img class="preview" src="${escape(item.url)}" alt=""><input type="hidden" name="placement" value="${escape(item.placement)}">
    <div class="field-grid">${field('Image description for accessibility', 'alt', item.alt)}${uploadControl('photos', index, item.url, 'image/jpeg,image/png,image/webp,image/gif')}</div></article>`).join('');
}

function renderGallery() {
  document.querySelector('#gallery-list').innerHTML = content.gallery.map((item, index) => `<article class="editor-card" data-kind="gallery" data-index="${index}">
    <div class="card-heading"><h3>Gallery photo ${index + 1}</h3><button class="remove" type="button" data-remove="gallery" data-index="${index}">Remove</button></div>${item.url ? `<img class="preview" src="${escape(item.url)}" alt="">` : ''}
    <div class="field-grid">${field('Title', 'title', item.title)}${field('Date', 'date', item.date, { type: 'date' })}${field('Caption', 'description', item.description, { multiline: true })}${field('Image description for accessibility', 'alt', item.alt)}${uploadControl('gallery', index, item.url, 'image/jpeg,image/png,image/webp,image/gif')}</div></article>`).join('') || '<p class="empty">No event photos yet. Choose “Add gallery photo” to begin.</p>';
}

function render() {
  const form = document.querySelector('#content-form');
  form.elements.paperbackPrice.value = content.settings.paperbackPrice;
  form.elements.hardcoverPrice.value = content.settings.hardcoverPrice;
  form.elements.shippingMessage.value = content.settings.shippingMessage;
  renderCopy(); renderCurricula(); renderMedia(); renderPhotos(); renderGallery();
}

function valuesForCard(card) {
  return Object.fromEntries([...card.querySelectorAll('input:not([type="file"]), textarea, select')].map((input) => [input.name, input.value]));
}

function collect() {
  const form = document.querySelector('#content-form');
  return {
    settings: { paperbackPrice: Number(form.elements.paperbackPrice.value), hardcoverPrice: Number(form.elements.hardcoverPrice.value), shippingMessage: form.elements.shippingMessage.value },
    copy: Object.fromEntries(textFields.map((item) => [item.name, form.elements[item.name].value])),
    curricula: [...document.querySelectorAll('[data-kind="curricula"]')].map(valuesForCard),
    media: [...document.querySelectorAll('[data-kind="media"]')].map(valuesForCard),
    photos: [...document.querySelectorAll('[data-kind="photos"]')].map(valuesForCard),
    gallery: [...document.querySelectorAll('[data-kind="gallery"]')].map(valuesForCard),
  };
}

async function loadDashboard() {
  content = await api('/api/admin/content'); render();
  loginPanel.hidden = true; dashboard.hidden = false; logoutButton.hidden = false;
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = loginForm.querySelector('button'); const status = loginForm.querySelector('[data-login-status]');
  button.disabled = true; setStatus(status, 'Signing in…');
  try {
    await api('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(loginForm))) });
    loginForm.reset(); await loadDashboard();
  } catch (error) { setStatus(status, error.message, 'error'); }
  finally { button.disabled = false; }
});

document.addEventListener('click', (event) => {
  const add = event.target.closest('[data-add]');
  if (add) {
    content = collect();
    if (add.dataset.add === 'curricula') content.curricula.push({ title: '', description: '', placement: 'additional', url: '' });
    if (add.dataset.add === 'media') content.media.push({ title: '', description: '', category: 'podcast', url: '' });
    if (add.dataset.add === 'gallery') content.gallery.push({ title: '', description: '', alt: '', date: '', url: '' });
    render(); document.querySelector(`#${add.dataset.add}-list .editor-card:last-of-type`)?.scrollIntoView({ behavior: 'smooth' });
  }
  const remove = event.target.closest('[data-remove]');
  if (remove) { content = collect(); content[remove.dataset.remove].splice(Number(remove.dataset.index), 1); render(); }
});

document.addEventListener('change', async (event) => {
  const input = event.target.closest('[data-upload-kind]');
  if (!input?.files?.[0]) return;
  const progress = input.parentElement.querySelector('.upload-progress'); input.disabled = true; progress.textContent = 'Uploading…';
  try {
    const file = input.files[0];
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-').slice(-120);
    const result = await uploadPresigned(`uploads/${Date.now()}-${safeName}`, file, { access: 'public', handleUploadUrl: '/api/admin/upload' });
    const card = input.closest('.editor-card'); card.querySelector('input[name="url"]').value = result.url;
    const preview = card.querySelector('.preview'); if (preview) preview.src = result.url;
    progress.textContent = 'Upload complete. Save changes to publish it.';
  } catch (error) { progress.textContent = error.message || 'Upload failed.'; }
  finally { input.disabled = false; }
});

document.querySelectorAll('[data-save]').forEach((button) => button.addEventListener('click', async () => {
  const form = document.querySelector('#content-form'); if (!form.reportValidity()) return;
  document.querySelectorAll('[data-save]').forEach((item) => { item.disabled = true; }); setStatus(saveStatus, 'Saving website changes…');
  try {
    content = await api('/api/admin/content', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(collect()) });
    render(); setStatus(saveStatus, 'Saved. The public website will update within about one minute.', 'success');
  } catch (error) {
    setStatus(saveStatus, error.message, 'error');
    if (/sign in/i.test(error.message)) { dashboard.hidden = true; loginPanel.hidden = false; }
  } finally { document.querySelectorAll('[data-save]').forEach((item) => { item.disabled = false; }); }
}));

logoutButton.addEventListener('click', async () => {
  await api('/api/admin/logout', { method: 'POST' }).catch(() => {});
  content = null; dashboard.hidden = true; logoutButton.hidden = true; loginPanel.hidden = false;
});

try {
  const session = await api('/api/admin/session');
  if (session.authenticated) await loadDashboard();
  else if (!session.configured) setStatus(loginForm.querySelector('[data-login-status]'), 'The private dashboard is waiting for its one-time account setup.', 'error');
} catch { setStatus(loginForm.querySelector('[data-login-status]'), 'The dashboard could not connect. Please refresh and try again.', 'error'); }
