import { test, expect } from '@playwright/test';
import { defaultSettings } from '../cms/defaults.js';

// Read-only synthetic fixtures. Every API request is intercepted, and nothing is saved.
const albumData = {
  settings: { ...defaultSettings },
  eventAlbums: [
    { id: 'album_reading', title: 'An afternoon with Rider', date: '2026-10-07', coverPhotoId: 'photo_portrait' },
    { id: 'album_school', title: 'A very special school visit and a wonderfully long event title', date: '', coverPhotoId: 'photo_portrait' },
    { id: 'album_empty', title: 'A new chapter', date: '', coverPhotoId: '' },
  ],
  gallery: [
    { id: 'photo_portrait', eventId: 'album_reading', title: 'Portrait moment', description: 'The whole portrait should remain visible.', alt: 'Synthetic portrait photo', url: '/album-fixture-portrait.svg' },
    { id: 'photo_landscape', eventId: 'album_reading', title: 'A wide moment', alt: 'Synthetic landscape photo', url: '/album-fixture-landscape.svg' },
    { id: 'photo_school', eventId: 'album_school', title: 'School moment', alt: 'Synthetic school photo', url: '/album-fixture-square.svg' },
    { title: 'Original legacy title', alt: 'Synthetic legacy photo', url: '/album-fixture-square.svg' },
  ],
  events: [{ title: 'Upcoming appearance', date: 'Date coming soon', description: 'Upcoming events remain separate.' }],
};

async function mockGallery(page, data = albumData) {
  await page.route('**/api/**', async (route) => {
    if (new URL(route.request().url()).pathname !== '/api/content' || route.request().method() !== 'GET') {
      throw new Error('Unexpected API request in the read-only event album fixture');
    }
    return route.fulfill({ json: data });
  });
  await page.route('**/album-fixture-*.svg', (route) => {
    const shape = route.request().url().match(/album-fixture-(\w+)/)[1];
    const [width, height] = { portrait: [400, 800], landscape: [900, 400], square: [600, 600] }[shape];
    return route.fulfill({ contentType: 'image/svg+xml', body: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#00bfc7"/><rect x="4" y="4" width="${width - 8}" height="${height - 8}" fill="none" stroke="#172033" stroke-width="8"/><circle cx="${width / 2}" cy="32" r="22" fill="#ff2f5f"/></svg>` });
  });
}

for (const width of [390, 1440]) {
  test(`folder albums, original photos, keyboard viewer, and back at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors = []; page.on('pageerror', (error) => errors.push(error.message));
    await mockGallery(page); await page.goto('/');
    const past = page.locator('[data-event-panel="past"]');
    await expect(page.locator('[data-event-tab="past"]')).toHaveText('Past Events');
    await expect(past.locator('.cms-album-card')).toHaveCount(4);
    await expect(past.locator('.cms-photo-gallery')).toHaveCount(0);
    const reading = page.getByRole('button', { name: 'Open An afternoon with Rider, 2 photos' });
    const school = page.getByRole('button', { name: /^Open A very special school visit/ });
    await expect(reading.locator('img')).toHaveAttribute('src', '/album-fixture-portrait.svg');
    await expect(reading.locator('img')).toHaveCSS('object-fit', 'contain');
    await expect(reading.locator('time')).toHaveText('October 7, 2026');
    await expect(school.locator('img')).toHaveCount(0);
    await expect(school.locator('time')).toHaveCount(0);

    for (let repeat = 0; repeat < 2; repeat++) {
      await reading.click();
      await expect(past.locator('.cms-album-heading')).toBeFocused();
      await expect(past.locator('.cms-photo-gallery img')).toHaveCount(2);
      await expect(past.getByAltText('Synthetic school photo')).toHaveCount(0);
      const photo = page.getByRole('button', { name: 'View larger photo: Portrait moment' });
      await photo.focus(); await page.keyboard.press('Enter');
      const dialog = page.getByRole('dialog', { name: 'Portrait moment' });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole('button', { name: 'Close photo' })).toBeFocused();
      await expect(dialog.locator('.cms-photo-stage img')).toHaveCSS('object-fit', 'contain');
      await expect.poll(() => dialog.locator('.cms-photo-stage img').evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true);
      await expect(dialog.locator('.cms-photo-stage img')).toHaveAttribute('src', '/album-fixture-portrait.svg');
      for (let tab = 0; tab < 4; tab++) {
        await page.keyboard.press('Tab');
        expect(await page.evaluate(() => document.activeElement.closest('dialog')?.open)).toBe(true);
      }
      await page.keyboard.press('ArrowRight');
      await expect(page.getByRole('dialog')).toHaveAccessibleName('A wide moment');
      await expect(page.getByRole('dialog').locator('.cms-photo-stage img')).toHaveAttribute('src', '/album-fixture-landscape.svg');
      await page.keyboard.press('ArrowLeft');
      await expect(page.getByRole('dialog')).toHaveAccessibleName('Portrait moment');
      await page.keyboard.press('Escape');
      await expect(page.locator('.cms-photo-dialog')).not.toBeVisible();
      await expect(photo).toBeFocused();
      await expect(page.locator('body')).not.toHaveClass(/photo-viewer-open/);
      await page.getByRole('button', { name: 'Back to Past Events' }).click();
      await expect(reading).toBeFocused();
    }

    await page.getByRole('button', { name: 'Open Unassigned photos, 1 photo' }).click();
    await expect(past.locator('.cms-album-heading')).toHaveText('Unassigned photos');
    await expect(past.locator('time')).toHaveCount(0);
    await expect(past.locator('h4')).toHaveText('Original legacy title');
    await page.getByRole('button', { name: 'Back to Past Events' }).click();
    await page.getByRole('button', { name: 'Open A new chapter, 0 photos' }).click();
    await expect(past).toContainText('Photos from this event will appear here soon.');
    await page.getByRole('button', { name: 'Back to Past Events' }).click();
    await school.click();
    await expect(past.locator('.cms-photo-gallery img')).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await page.locator('[data-event-tab="upcoming"]').click();
    await expect(page.locator('[data-event-panel="upcoming"]')).toBeVisible();
    await expect(page.locator('[data-event-panel="upcoming"] h3')).toHaveText('Upcoming appearance');
    await page.locator('[data-event-tab="past"]').click();
    await expect(past.locator('.cms-album-heading')).toHaveText(albumData.eventAlbums[1].title);
    await page.getByRole('button', { name: 'Back to Past Events' }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    expect(errors).toEqual([]);
  });
}

test('event titles and captions stay literal and invalid image URLs are omitted', async ({ page }) => {
  const text = '<img src=x onerror=alert(1)>';
  await mockGallery(page, {
    settings: defaultSettings,
    eventAlbums: [{ id: 'album_text', title: text, date: '2026-02-31', coverPhotoId: 'photo_unsafe' }],
    gallery: [
      { id: 'photo_text', eventId: 'album_text', title: text, description: text, url: '/album-fixture-square.svg' },
      { id: 'photo_unsafe', eventId: 'album_text', title: 'Unsafe photo', url: 'javascript:alert(1)' },
    ],
  });
  await page.goto('/');
  await page.locator('.cms-album-card').click();
  const past = page.locator('[data-event-panel="past"]');
  await expect(past.locator('.cms-album-heading')).toHaveText(text);
  await expect(past.locator('time')).toHaveCount(0);
  await expect(past.locator('img')).toHaveCount(1);
  await expect(past.locator('h4')).toHaveText(text);
  await past.locator('.cms-photo-open').click();
  await expect(page.getByRole('dialog')).toHaveAccessibleName(text);
  await expect(page.getByRole('dialog').locator('img')).toHaveCount(1);
  await page.getByRole('button', { name: 'Close photo' }).click();
  await expect(past.locator('.cms-photo-open')).toBeFocused();
});
