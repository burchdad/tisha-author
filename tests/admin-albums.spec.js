import { test, expect } from '@playwright/test';
import textFields from '../cms/text-fields.json' with { type: 'json' };

// All admin API calls are fixtures. These tests never sign in, send auth mail,
// upload a real asset, or read/write a live content store.
function content(overrides = {}) {
  return {
    revision: 'site-content/1.json',
    settings: { paperbackPrice: 14.99, hardcoverPrice: 16.99, shippingMessage: 'Fixture shipping' },
    copy: Object.fromEntries(textFields.map((field) => [field.name, field.initialValue])),
    curricula: [], media: [], photos: [], toolkit: [], social: [],
    events: [{ title: 'An upcoming signing', date: 'Soon', location: 'Fixture venue', description: '', url: '' }],
    eventAlbums: [{ id: 'album_reading', title: 'School reading', date: '2026-10-12', coverPhotoId: 'photo_reading' }],
    gallery: [
      { id: 'photo_reading', eventId: 'album_reading', title: 'Reading together', date: '2026-10-12', alt: 'Rider reading', description: 'Original reading caption', url: '/fixture-reading.jpg' },
      { id: 'photo_legacy', eventId: '', title: 'Existing photo', date: '', alt: 'Original alt', description: 'Original caption', url: '/fixture-existing.jpg' },
    ],
    ...overrides,
  };
}

function deferred() { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; }

async function fixture(page, { data = content(), readOnly = false, save, upload } = {}) {
  const writes = [];
  await page.route('https://**', (route) => route.abort());
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (method !== 'GET') writes.push({ path, method, body: route.request().postDataJSON() });
    if (path === '/api/admin/session') return route.fulfill({ json: { authenticated: true, configured: true, readOnly } });
    if (path === '/api/admin/content') {
      if (method === 'GET') return route.fulfill({ json: data });
      if (save) return save(route);
      data = { ...route.request().postDataJSON(), revision: 'site-content/2.json' };
      return route.fulfill({ json: data });
    }
    if (path === '/api/admin/revisions' && method === 'GET') return route.fulfill({ json: { revisions: [{ id: 'site-content/1.json', createdAt: '2026-10-12T12:00:00Z' }, { id: 'site-content/0.json', createdAt: '2026-10-11T12:00:00Z' }] } });
    if (path === '/api/admin/upload' && upload) return upload(route);
    return route.fulfill({ status: 403, json: { message: 'Fixture blocks every other API action.' } });
  });
  await page.route('**/fixture-*.jpg', (route) => route.fulfill({ status: 204 }));
  await page.goto('/admin#gallery');
  await expect(page.locator('#dashboard')).toBeVisible();
  return writes;
}

for (const width of [1440, 390]) {
  test(`event folder controls preserve existing photos at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const writes = await fixture(page);
    const oldPhoto = page.locator('[data-kind="gallery"]').nth(1);
    await expect(oldPhoto.getByRole('combobox', { name: 'Event folder', exact: true })).toHaveValue('');
    await oldPhoto.getByRole('textbox', { name: 'Caption', exact: true }).fill('An unsaved caption');
    await page.getByRole('button', { name: 'Create event folder', exact: true }).click();
    const folder = page.locator('[data-kind="eventAlbums"]').last();
    await folder.getByLabel('Event name', { exact: true }).fill('Library signing');
    await folder.getByLabel('Event date (optional)', { exact: true }).fill('2026-10-13');
    const folderId = await folder.locator('input[name="id"]').inputValue();
    await oldPhoto.getByRole('combobox', { name: 'Event folder', exact: true }).selectOption(folderId);
    await folder.getByLabel('Cover photo (optional)').selectOption('photo_legacy');
    await page.locator('[data-save]').last().click();
    await expect(page.locator('[data-save-status]')).toContainText('Saved.');
    const payload = writes.find((write) => write.path === '/api/admin/content').body;
    expect(payload.revision).toBe('site-content/1.json');
    expect(payload.eventAlbums).toContainEqual({ id: folderId, title: 'Library signing', date: '2026-10-13', coverPhotoId: 'photo_legacy' });
    expect(payload.gallery[1]).toEqual({ ...content().gallery[1], eventId: folderId, description: 'An unsaved caption' });
    expect(payload.events).toEqual(content().events);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  });
}

test('an album add-photo button preselects its folder and a blank upload cannot disappear on save', async ({ page }) => {
  const writes = await fixture(page);
  const folder = page.locator('[data-kind="eventAlbums"]').first();
  await folder.getByRole('button', { name: 'Add photo to this event', exact: true }).click();
  const photo = page.locator('[data-kind="gallery"]').last();
  await expect(photo.getByRole('combobox', { name: 'Event folder', exact: true })).toHaveValue('album_reading');
  await expect(photo.locator('input[name="id"]')).toHaveValue(/^photo_/);
  await photo.getByLabel('Title', { exact: true }).fill('Keep this new draft');
  await page.locator('[data-save]').last().click();
  await expect(page.locator('[data-save-status]')).toContainText('awaiting upload');
  await expect(photo.getByLabel('Title', { exact: true })).toHaveValue('Keep this new draft');
  expect(writes).toEqual([]);
});

test('folder removal can be canceled and confirmation moves photos without deleting assets', async ({ page }) => {
  const writes = await fixture(page);
  const folder = page.locator('[data-kind="eventAlbums"]').first();
  const photo = page.locator('[data-kind="gallery"]').first();
  await photo.getByRole('textbox', { name: 'Caption', exact: true }).fill('Keep this unsaved caption');
  page.once('dialog', (dialog) => dialog.dismiss());
  await folder.getByRole('button', { name: 'Remove event folder', exact: true }).click();
  await expect(folder).toHaveCount(1);
  page.once('dialog', async (dialog) => { expect(dialog.message()).toContain('No photo files will be deleted'); await dialog.accept(); });
  await folder.getByRole('button', { name: 'Remove event folder', exact: true }).click();
  await expect(page.locator('[data-kind="eventAlbums"]')).toHaveCount(0);
  await expect(page.locator('[data-kind="gallery"]')).toHaveCount(2);
  await expect(photo.getByRole('combobox', { name: 'Event folder', exact: true })).toHaveValue('');
  await expect(photo.getByRole('textbox', { name: 'Caption', exact: true })).toHaveValue('Keep this unsaved caption');
  await expect(photo.locator('input[name="url"]')).toHaveValue('/fixture-reading.jpg');
  await page.locator('[data-save]').last().click();
  await expect(page.locator('[data-save-status]')).toContainText('Saved.');
  const payload = writes[0].body;
  expect(payload.eventAlbums).toEqual([]);
  expect(payload.gallery.map((item) => item.url)).toEqual(content().gallery.map((item) => item.url));
  expect(payload.gallery.every((item) => item.eventId === '')).toBe(true);
  expect(writes.every((write) => write.method === 'PUT')).toBe(true);
});

test('cover choices contain only the event’s uploaded photos and clear after reassignment', async ({ page }) => {
  await fixture(page);
  const folder = page.locator('[data-kind="eventAlbums"]').first();
  const cover = folder.getByLabel('Cover photo (optional)');
  await expect(cover.locator('option')).toHaveCount(2);
  await expect(cover.locator('option[value="photo_legacy"]')).toHaveCount(0);
  await page.locator('[data-kind="gallery"]').first().getByRole('combobox', { name: 'Event folder', exact: true }).selectOption('');
  await expect(cover).toHaveValue('');
  await expect(cover.locator('option')).toHaveCount(1);
});

test('legacy fixtures keep photo metadata and stable generated IDs through new folders', async ({ page }) => {
  const data = content({ gallery: [{ title: 'Old title', description: 'Old caption', alt: 'Old alt', url: '/fixture-old.jpg' }] });
  delete data.eventAlbums;
  await fixture(page, { data });
  const photo = page.locator('[data-kind="gallery"]').first();
  const id = await photo.locator('input[name="id"]').inputValue();
  await page.getByRole('button', { name: 'Create event folder', exact: true }).click();
  await page.getByLabel('Event name', { exact: true }).fill('A new event');
  await expect(photo.locator('input[name="id"]')).toHaveValue(id);
  await expect(photo.getByRole('textbox', { name: 'Caption', exact: true })).toHaveValue('Old caption');
  await expect(photo.getByLabel('Image description for accessibility', { exact: true })).toHaveValue('Old alt');
  await expect(photo.getByRole('combobox', { name: 'Event folder', exact: true })).toHaveValue('');
});

test('preview writes stay blocked even if disabled controls are dispatched programmatically', async ({ page }) => {
  const writes = await fixture(page, { readOnly: true });
  await expect(page.locator('#preview-notice')).toBeVisible();
  await expect(page.locator('[data-save]').last()).toBeDisabled();
  await expect(page.locator('input[type="file"]').first()).toBeDisabled();
  await expect(page.locator('[data-restore-revision]').last()).toBeDisabled();
  await page.getByRole('button', { name: 'Create event folder', exact: true }).click();
  await page.locator('[data-kind="eventAlbums"]').last().getByLabel('Event name', { exact: true }).fill('Preview only');
  await page.locator('[data-save]').last().dispatchEvent('click');
  await page.locator('[data-restore-revision]').last().dispatchEvent('click');
  await page.locator('input[type="file"]').first().setInputFiles({ name: 'preview.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('fixture') });
  await expect(page.locator('[data-save-status]')).toHaveText('Preview edits only. Saving is disabled.');
  expect(writes).toEqual([]);
});

test('a stale save leaves the unsaved fields and associations in place', async ({ page }) => {
  await fixture(page, { save: (route) => route.fulfill({ status: 409, json: { message: 'A newer version was saved. Refresh before saving again.' } }) });
  const photo = page.locator('[data-kind="gallery"]').last();
  await photo.getByRole('combobox', { name: 'Event folder', exact: true }).selectOption('album_reading');
  await photo.getByRole('textbox', { name: 'Caption', exact: true }).fill('My unsaved edit');
  await page.locator('[data-save]').last().click();
  await expect(page.locator('[data-save-status]')).toContainText('A newer version was saved');
  await expect(photo.getByRole('textbox', { name: 'Caption', exact: true })).toHaveValue('My unsaved edit');
  await expect(photo.getByRole('combobox', { name: 'Event folder', exact: true })).toHaveValue('album_reading');
  await expect(page.locator('[data-save]').last()).toBeEnabled();
});

test('pending save blocks overlapping actions until the response finishes', async ({ page }) => {
  const pending = deferred(); let started = false;
  const writes = await fixture(page, { save: async (route) => { started = true; await pending.promise; return route.fulfill({ json: { ...route.request().postDataJSON(), revision: 'site-content/2.json' } }); } });
  await page.locator('[data-save]').last().click();
  await expect.poll(() => started).toBe(true);
  await expect(page.getByRole('button', { name: 'Create event folder', exact: true })).toBeDisabled();
  await expect(page.locator('[data-kind="gallery"]').first().getByLabel('Title', { exact: true })).toBeDisabled();
  await page.locator('[data-add="gallery"]').last().dispatchEvent('click');
  await page.locator('[data-remove="gallery"]').first().dispatchEvent('click');
  await page.locator('[data-save]').last().dispatchEvent('click');
  await expect(page.locator('[data-kind="gallery"]')).toHaveCount(2);
  expect(writes).toHaveLength(1);
  pending.resolve();
  await expect(page.locator('[data-save-status]')).toContainText('Saved.');
  await expect(page.getByRole('button', { name: 'Create event folder', exact: true })).toBeEnabled();
});

test('pending upload blocks re-render and a failed selection survives adding another photo', async ({ page }) => {
  const pending = deferred(); let started = false;
  await fixture(page, { upload: async (route) => { started = true; await pending.promise; return route.fulfill({ status: 503, json: { error: 'Fixture upload failure' } }); } });
  const first = page.locator('[data-kind="gallery"]').first();
  const file = first.locator('input[type="file"]');
  await file.setInputFiles({ name: 'fixture.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('fixture') });
  await expect.poll(() => started).toBe(true);
  await expect(page.locator('[data-save]').last()).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Create event folder', exact: true })).toBeDisabled();
  await page.locator('[data-remove="gallery"]').first().dispatchEvent('click');
  await expect(page.locator('[data-kind="gallery"]')).toHaveCount(2);
  pending.resolve();
  await expect(page.locator('[data-save]').last()).toBeEnabled();
  await expect(first.locator('input[name="url"]')).toHaveValue('/fixture-reading.jpg');
  await page.getByRole('button', { name: 'Add photo', exact: true }).click();
  expect(await file.evaluate((input) => input.files[0]?.name)).toBe('fixture.jpg');
  await expect(first.locator('input[name="url"]')).toHaveValue('/fixture-reading.jpg');
});
