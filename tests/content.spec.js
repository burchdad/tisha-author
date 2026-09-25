import { test, expect } from '@playwright/test';
import { defaultSettings, defaultCurricula, defaultPhotos } from '../cms/defaults.js';
import textFields from '../cms/text-fields.json' with { type: 'json' };

function content(overrides = {}) {
  return {
    settings: { ...defaultSettings, paperbackPrice: 18.5, hardcoverPrice: 22, shippingMessage: 'Books ship the week of November 20th.' },
    copy: { homeIntro: 'An updated introduction from the author.' },
    curricula: defaultCurricula.map((item) => ({ ...item, url: item.existingUrl })),
    media: [{ category: 'podcast', title: 'A new podcast episode', url: 'https://example.com/episode', description: 'Episode description.' }],
    photos: defaultPhotos.map((item) => ({ ...item, url: item.placement === 'author' ? '/story/tisha-laying-down.jpg' : item.existingUrl })),
    gallery: [{ title: 'A reading with Rider', description: 'Our latest event.', alt: 'Rider and Tisha at a reading', url: '/story/tisha-laying-down.jpg' }],
    ...overrides,
  };
}

async function mockContent(page, data = content()) {
  await page.route('https://dashboardtest.apicdn.sanity.io/**', async (route) => {
    expect(new URL(route.request().url()).searchParams.get('perspective')).toBe('published');
    await route.fulfill({ json: { result: data } });
  });
  await page.route('**/api/shipping-rate', (route) => route.fulfill({ json: { amount: 5, provider: 'USPS', service: 'Ground Advantage' } }));
}

for (const width of [1440, 390]) {
  test('published edits, prices, files and gallery at ' + width, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await mockContent(page);
    await page.goto('/');
    await expect(page.locator('.hero-lede')).toHaveText('An updated introduction from the author.');
    await expect(page.locator('.author-photo img')).toHaveAttribute('src', '/story/tisha-laying-down.jpg');
    await expect(page.locator('.footer-message')).toContainText('November 20th');
    await expect(page.getByRole('link', { name: 'A new podcast episode' })).toHaveAttribute('href', 'https://example.com/episode');
    await page.locator('[data-open-book]').first().evaluate((el) => el.click());
    await page.locator('[data-shipping-field="state"]').fill('TX');
    await page.locator('[data-shipping-field="zip"]').fill('75703');
    await expect(page.locator('[data-order-total]')).toHaveText('$23.50');
    await expect(page.locator('[data-paypal-link]')).toHaveAttribute('href', /23.50$/);
    await expect(page.locator('[data-venmo-link]')).toHaveAttribute('aria-disabled', 'false');
    await page.locator('[data-book-quantity]').fill('2');
    await page.locator('[data-book-format][value="hardcover"]').check();
    await expect(page.locator('[data-order-total]')).toHaveText('$49.00');
    await expect(page.locator('[data-cashapp-link]')).toHaveAttribute('href', /49.00$/);
    await page.locator('.book-modal-close').click();
    await page.locator('[data-event-tab="past"]').click();
    await expect(page.locator('.cms-photo-gallery img')).toHaveAttribute('alt', 'Rider and Tisha at a reading');
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await page.goto('/curriculum.html');
    await expect(page.locator('[data-curriculum-list="companion"] a')).toHaveAttribute('href', '/resources/riders-magic-mark-curriculum-companion.pdf');
    await expect(page.locator('[data-curriculum-list="gratitude"] a')).toHaveAttribute('href', '/resources/growing-gratitude-and-confidence-curriculum.pdf');
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    expect(errors).toEqual([]);
  });
}

test('failed content service does not allow payment at stale prices', async ({ page }) => {
  await page.route('https://dashboardtest.apicdn.sanity.io/**', (route) => route.fulfill({ status: 503, body: '{}' }));
  await page.route('**/api/shipping-rate', (route) => route.fulfill({ json: { amount: 5 } }));
  await page.goto('/#purchase-book');
  await page.locator('[data-shipping-field="state"]').fill('TX');
  await page.locator('[data-shipping-field="zip"]').fill('75703');
  await expect(page.locator('[data-checkout-status]')).toContainText('Verifying current book prices');
  for (const selector of ['[data-cashapp-link]', '[data-paypal-link]', '[data-venmo-link]']) {
    await expect(page.locator(selector)).toHaveAttribute('aria-disabled', 'true');
  }
  await expect(page.locator('.hero h1')).toHaveText("Rider's Magic Mark");
});

test('text is escaped and unsafe links are omitted', async ({ page }) => {
  await mockContent(page, content({
    copy: { homeIntro: '<img src=x onerror=alert(1)>' },
    media: [{ title: 'Unsafe link', category: 'podcast', url: 'javascript:alert(1)' }],
  }));
  await page.goto('/');
  await expect(page.locator('.hero-lede')).toHaveText('<img src=x onerror=alert(1)>');
  await expect(page.locator('.hero-lede img')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Unsafe link' })).toHaveCount(0);
});

test('every editable text selector resolves on its page', async ({ page }) => {
  await mockContent(page);
  for (const file of ['index.html', 'curriculum.html']) {
    await page.goto('/' + file);
    for (const field of textFields.filter((entry) => entry.page === file)) {
      await expect(page.locator(field.selector)).toHaveCount(1);
    }
  }
});

test('configured admin loads managed sign-in on a deep route', async ({ page }) => {
  test.setTimeout(90000);
  page.on('pageerror', (error) => console.log('Admin runtime:', error.message));
  await page.route('**/auth/providers*', (route) => route.fulfill({ json: { providers: [{ name: 'google', title: 'Google', url: 'https://api.sanity.io/v1/auth/login/google' }] } }));
  await page.route('**/users/me*', (route) => route.fulfill({ status: 401, json: { error: 'Unauthorized' } }));
  await page.goto('/admin/structure');
  await expect(page.locator('#studio')).toBeVisible({ timeout: 60000 });
  await expect(page.getByText('Google', { exact: true }).first()).toBeVisible({ timeout: 60000 });
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex,nofollow');
});

 test('invalid published prices keep all payment links disabled', async ({ page }) => {
  await mockContent(page, content({ settings: { ...defaultSettings, paperbackPrice: -3 } }));
  await page.goto('/#purchase-book');
  await page.locator('[data-shipping-field="state"]').fill('TX');
  await page.locator('[data-shipping-field="zip"]').fill('75703');
  await expect(page.locator('[data-checkout-status]')).toContainText('Verifying current book prices');
  await expect(page.locator('[data-cashapp-link]')).toHaveAttribute('aria-disabled', 'true');
 });

for (const width of [1440, 390]) {
  test('expanded shipping fields and copied Venmo amount at ' + width, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text) => { window.copiedCheckoutText = text; } } }));
    await mockContent(page);
    const shippingRequests = [];
    page.on('request', (request) => { if (request.url().endsWith('/api/shipping-rate')) shippingRequests.push(request.postDataJSON()); });
    await page.goto('/#purchase-book');
    await expect(page.getByRole('textbox', { name: 'First name', exact: true })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Last name', exact: true })).toBeVisible();
    await expect(page.locator('details.book-address-details')).toHaveCount(0);
    await page.locator('[data-shipping-field="firstName"]').fill('Jamie');
    await page.locator('[data-shipping-field="lastName"]').fill('Reader');
    await page.locator('[data-shipping-field="email"]').fill('reader@example.com');
    await page.locator('[data-shipping-field="street"]').fill('123 Test Street');
    await page.locator('[data-shipping-field="city"]').fill('Tyler');
    await page.locator('[data-shipping-field="state"]').fill('TX');
    await page.locator('[data-shipping-field="zip"]').fill('75703');
    await expect(page.locator('[data-copy-amount]')).toBeEnabled();
    await expect(page.locator('[data-venmo-link]')).toHaveText('Venmo · $23.50');
    await page.locator('[data-copy-amount]').click();
    await expect.poll(() => page.evaluate(() => window.copiedCheckoutText)).toBe('23.50');
    expect(shippingRequests.at(-1).name).toBe('Jamie Reader');
    await page.locator('[data-copy-order]').click();
    await expect.poll(() => page.evaluate(() => window.copiedCheckoutText)).toContain('Jamie Reader');
    await page.locator('[data-book-quantity]').fill('2');
    await expect(page.locator('[data-copy-amount]')).toHaveText('Copy Venmo amount: $42.00');
    await page.locator('[data-copy-amount]').click();
    await expect.poll(() => page.evaluate(() => window.copiedCheckoutText)).toBe('42.00');
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await page.locator('[data-shipping-field="firstName"]').scrollIntoViewIfNeeded();
    await page.screenshot({ path: process.env.TEMP + '/tisha-expanded-checkout-' + width + '.png' });
  });
}
