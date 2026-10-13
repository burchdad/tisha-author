import { test, expect } from '@playwright/test';
import { defaultSettings } from '../cms/defaults.js';

// These browser checks use local synthetic images and mocked content only.
// Do not point the runner at production or remove the API interception.
for (const width of [390, 1440]) {
  test(`gallery and controls survive unavailable WebGL at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...args) {
        if (['webgl', 'webgl2', 'experimental-webgl'].includes(type)) return null;
        return original.call(this, type, ...args);
      };
    });
    const sizes = [[400, 800], [900, 400], [600, 600]];
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/api/**', async (route) => {
      if (new URL(route.request().url()).pathname !== '/api/content' || route.request().method() !== 'GET') {
        throw new Error('Unexpected API request in read-only fixture test');
      }
      await route.fulfill({ json: {
        settings: { ...defaultSettings },
        copy: { homeIntro: 'Offline fixture content is available.' },
        gallery: sizes.map((_, index) => ({ title: `Fixture ${index}`, alt: `Synthetic photo ${index}`, url: `/gallery-fixture-${index}.svg` })),
      } });
    });
    await page.route('**/gallery-fixture-*.svg', (route) => {
      const index = Number(route.request().url().match(/gallery-fixture-(\d)/)[1]);
      const [w, h] = sizes[index];
      return route.fulfill({ contentType: 'image/svg+xml', body: `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="#00bfc7"/><rect x="4" y="4" width="${w - 8}" height="${h - 8}" fill="none" stroke="#172033" stroke-width="8"/><circle cx="${w / 2}" cy="30" r="20" fill="#ff2f5f"/></svg>` });
    });
    await page.goto('/');
    await expect(page.locator('#magic-world')).toBeHidden();
    await expect(page.locator('.hero-lede')).toHaveText('Offline fixture content is available.');
    await expect(page.locator('[data-event-tab="past"]')).toHaveText('Photo Gallery (3)');
    const photos = page.locator('.cms-photo-gallery img');
    await expect(photos).toHaveCount(3);
    for (let index = 0; index < 3; index++) {
      await photos.nth(index).scrollIntoViewIfNeeded();
      await expect(photos.nth(index)).toHaveCSS('object-fit', 'contain');
      await expect.poll(() => photos.nth(index).evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true);
      const box = await photos.nth(index).boundingBox();
      expect(Math.abs(box.width / box.height - 4 / 3)).toBeLessThan(0.01);
    }
    for (let repeat = 0; repeat < 2; repeat++) {
      await page.locator('[data-event-tab="upcoming"]').click();
      await expect(page.locator('[data-event-panel="upcoming"]')).toBeVisible();
      await page.locator('[data-event-tab="past"]').click();
      await expect(page.locator('[data-event-panel="past"]')).toBeVisible();
      await page.locator('[data-open-book]').first().evaluate((button) => button.click());
      await expect(page.locator('.book-modal')).toBeVisible();
      await expect(page.locator('[data-square-link]')).toHaveAttribute('aria-disabled', 'false');
      await page.keyboard.press('Escape');
      await expect(page.locator('.book-modal')).toBeHidden();
      await page.locator('[data-open-toolkit]').first().evaluate((button) => button.click());
      await expect(page.locator('.toolkit-modal')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.locator('.toolkit-modal')).toBeHidden();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    expect(errors).toEqual([]);
  });
}
