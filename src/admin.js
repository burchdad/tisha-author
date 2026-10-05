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
const inviteCopyNames = new Set(['schoolEyebrow', 'schoolHeading', 'schoolIntro', 'readingTitle', 'readingDescription', 'workshopTitle', 'workshopDescription', 'trainingTitle', 'trainingDescription', 'signingTitle', 'signingDescription', 'schoolClosing']);
const toolkitCopyNames = new Set(['toolkitHeading', 'toolkitIntro', 'toolkitFeatureHeading', 'toolkitFeatureIntro', 'toolkitModalHeading', 'toolkitModalIntro']);
const bookCopyNames = new Set(['bookDescription', 'checkoutInstructions']);

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

function copyFields(names) {
  return textFields.filter((item) => names ? names.has(item.name) : !inviteCopyNames.has(item.name) && !toolkitCopyNames.has(item.name) && !bookCopyNames.has(item.name)).map((item) =>
    field(item.title, item.name, content.copy[item.name], { multiline: content.copy[item.name]?.length > 80, max: 5000 })
  ).join('');
}

function renderCopy() {
  document.querySelector('#book-copy-fields').innerHTML = copyFields(bookCopyNames);
  document.querySelector('#copy-fields').innerHTML = copyFields();
  document.querySelector('#invite-fields').innerHTML = copyFields(inviteCopyNames);
  document.querySelector('#toolkit-copy-fields').innerHTML = copyFields(toolkitCopyNames);
}

function uploadControl(kind, index, url, accepts, uploadLabel) {
  const current = url ? `<a class="current-file" href="${escape(url)}" target="_blank" rel="noopener">View current ${uploadLabel}</a>` : '<span class="current-file empty-file">No file uploaded yet</span>';
  return `<input name="url" type="hidden" value="${escape(url)}">
    <label class="upload-label">Choose a new ${uploadLabel}<input class="file-input" type="file" accept="${accepts}" data-upload-kind="${kind}" data-upload-index="${index}"><span class="upload-help">Select a file from your computer. It uploads automatically; then save the website changes.</span><span class="upload-progress" aria-live="polite"></span></label>${current}`;
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
  list.innerHTML = revisions.map((revision, index) => `<div class="revision-row"><div><strong>${index === 0 ? 'Current saved version' : `Saved version ${index + 1}`}</strong><span>${escape(new Date(revision.createdAt).toLocaleString())}</span></div><button class="secondary" type="button" data-restore-revision="${escape(revision.id)}" ${index === 0 ? 'disabled' : ''}>Restore</button></div>`).join('') || '<p class="empty">Saved versions will appear after the first website update.</p>';
}

async function loadRevisions() {
  try { renderRevisions((await api('/api/admin/revisions')).revisions); }
  catch (error) { document.querySelector('#revisions-list').innerHTML = `<p class="empty">${escape(error.message)}</p>`; }
}

function renderPhotos() {
  const names = { author: 'Author portrait', illustrator: 'Illustrator portrait', visit: 'School visit photo' };
  document.querySelector('#photos-list').innerHTML = content.photos.map((item, index) => `<article class="editor-card" data-kind="photos" data-index="${index}">
    <div class="card-heading"><h3>${names[item.placement] || 'Website photo'}</h3></div><img class="preview" src="${escape(item.url)}" alt=""><input type="hidden" name="placement" value="${escape(item.placement)}">
    <div class="field-grid">${field('Image description for accessibility', 'alt', item.alt)}${uploadControl('photos', index, item.url, 'image/jpeg,image/png,image/webp,image/gif', 'photo')}</div></article>`).join('');
}

function renderGallery() {
  document.querySelector('#gallery-list').innerHTML = content.gallery.map((item, index) => `<article class="editor-card" data-kind="gallery" data-index="${index}">
    <div class="card-heading"><h3>Gallery photo ${index + 1}</h3><button class="remove" type="button" data-remove="gallery" data-index="${index}">Remove</button></div>${item.url ? `<img class="preview" src="${escape(item.url)}" alt="">` : ''}
    <div class="field-grid">${field('Title', 'title', item.title)}${field('Date', 'date', item.date, { type: 'date' })}${field('Caption', 'description', item.description, { multiline: true })}${field('Image description for accessibility', 'alt', item.alt)}${uploadControl('gallery', index, item.url, 'image/jpeg,image/png,image/webp,image/gif', 'photo')}</div></article>`).join('') || '<p class="empty">No event photos yet. Choose “Add gallery photo” to begin.</p>';
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
  renderCopy(); renderToolkit(); renderCurricula(); renderMedia(); renderEvents(); renderSocial(); renderPhotos(); renderGallery();
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
    toolkit: [...document.querySelectorAll('[data-kind="toolkit"]')].map(valuesForCard),
    events: [...document.querySelectorAll('[data-kind="events"]')].map(valuesForCard),
    social: [...document.querySelectorAll('[data-kind="social"]')].map(valuesForCard),
  };
}

function isDirty() {
  return Boolean(content && savedSnapshot && JSON.stringify(collect()) !== savedSnapshot);
}

function showUnsavedStatus() {
  if (content && isDirty()) setStatus(saveStatus, 'Unsaved changes', 'pending');
}

async function loadDashboard() {
  content = await api('/api/admin/content'); render();
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
    if (add.dataset.add === 'toolkit') content.toolkit.push({ title: '', tag: 'Resource', category: 'activities', url: '' });
    if (add.dataset.add === 'events') content.events.push({ date: '', title: '', description: '', location: '', url: '' });
    if (add.dataset.add === 'social') content.social.push({ platform: '', label: '', url: '' });
    render(); document.querySelector(`#${add.dataset.add}-list .editor-card:last-of-type`)?.scrollIntoView({ behavior: 'smooth' });
    showUnsavedStatus();
  }
  const remove = event.target.closest('[data-remove]');
  if (remove) { content = collect(); content[remove.dataset.remove].splice(Number(remove.dataset.index), 1); render(); showUnsavedStatus(); }
  const restore = event.target.closest('[data-restore-revision]');
  if (restore) restoreRevision(restore.dataset.restoreRevision, restore);
});

document.querySelector('#content-form').addEventListener('input', showUnsavedStatus);
document.querySelector('#content-form').addEventListener('change', showUnsavedStatus);

document.addEventListener('change', async (event) => {
  const input = event.target.closest('[data-upload-kind]');
  if (!input?.files?.[0]) return;
  const progress = input.parentElement.querySelector('.upload-progress'); input.disabled = true; progress.textContent = 'Uploading…';
  try {
    const file = input.files[0];
    if (file.size > 15 * 1024 * 1024) throw new Error('That file is larger than 15 MB. Choose a smaller file.');
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-').slice(-120);
    const result = await uploadPresigned(`uploads/${Date.now()}-${safeName}`, file, {
      access: 'public', handleUploadUrl: '/api/admin/upload', abortSignal: AbortSignal.timeout(60000),
      onUploadProgress: ({ percentage }) => { progress.textContent = `Uploading… ${Math.round(percentage)}%`; },
    });
    const card = input.closest('.editor-card'); card.querySelector('input[name="url"]').value = result.url;
    let preview = card.querySelector('.preview');
    if (!preview && input.accept.startsWith('image/')) { preview = document.createElement('img'); preview.className = 'preview'; preview.alt = ''; card.querySelector('.card-heading').after(preview); }
    if (preview) preview.src = result.url;
    const currentFile = card.querySelector('.current-file');
    if (currentFile) { const link = document.createElement('a'); link.className = 'current-file'; link.href = result.url; link.target = '_blank'; link.rel = 'noopener'; link.textContent = `View uploaded ${input.accept.startsWith('image/') ? 'photo' : 'file'}`; currentFile.replaceWith(link); }
    progress.textContent = 'Upload complete. Save changes to publish it.';
    showUnsavedStatus();
  } catch (error) { console.error('Dashboard upload failed', error); progress.textContent = error.name === 'TimeoutError' ? 'Upload timed out. Check your connection and try again.' : (error.message || 'Upload failed.'); }
  finally { input.disabled = false; }
});

document.querySelectorAll('[data-save]').forEach((button) => button.addEventListener('click', async () => {
  const form = document.querySelector('#content-form'); if (!form.reportValidity()) return;
  document.querySelectorAll('[data-save]').forEach((item) => { item.disabled = true; }); setStatus(saveStatus, 'Saving website changes…');
  try {
    content = await api('/api/admin/content', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(collect()) });
    render(); savedSnapshot = JSON.stringify(collect()); await loadRevisions(); setStatus(saveStatus, 'Saved. The public website will update within about one minute.', 'success');
  } catch (error) {
    setStatus(saveStatus, error.message, 'error');
    if (/sign in/i.test(error.message)) { dashboard.hidden = true; loginPanel.hidden = false; }
  } finally { document.querySelectorAll('[data-save]').forEach((item) => { item.disabled = false; }); }
}));

async function restoreRevision(id, button) {
  if (!confirm('Restore this saved version? Your current saved website content will be replaced.')) return;
  button.disabled = true; setStatus(saveStatus, 'Restoring saved version…');
  try {
    content = await api('/api/admin/revisions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    render(); savedSnapshot = JSON.stringify(collect()); await loadRevisions(); setStatus(saveStatus, 'Saved version restored. The public website will update within about one minute.', 'success');
  } catch (error) { setStatus(saveStatus, error.message, 'error'); button.disabled = false; }
}

logoutButton.addEventListener('click', async () => {
  if (isDirty() && !confirm('You have unsaved changes. Sign out without saving them?')) return;
  await api('/api/admin/logout', { method: 'POST' }).catch(() => {});
  content = null; savedSnapshot = ''; dashboard.hidden = true; loginPanel.hidden = false; document.body.classList.remove('dashboard-active');
});

window.addEventListener('beforeunload', (event) => {
  if (!isDirty()) return;
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
  if (session.authenticated) await loadDashboard();
  else if (!session.configured) setStatus(loginForm.querySelector('[data-login-status]'), 'The private dashboard is waiting for its one-time account setup.', 'error');
} catch { setStatus(loginForm.querySelector('[data-login-status]'), 'The dashboard could not connect. Please refresh and try again.', 'error'); }
