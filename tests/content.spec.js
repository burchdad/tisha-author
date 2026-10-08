import { test, expect } from '@playwright/test';
import { defaultSettings, defaultCurricula, defaultPhotos, defaultSocial, defaultEvents } from '../cms/defaults.js';
import textFields from '../cms/text-fields.json' with { type: 'json' };
import toolkitGroups from '../cms/toolkit-resources.json' with { type: 'json' };

function content(overrides = {}) {
  return {
    settings: { ...defaultSettings, paperbackPrice: 18.5, hardcoverPrice: 22, shippingMessage: 'Books ship the week of November 20th.' },
    copy: { ...Object.fromEntries(textFields.map((field) => [field.name, field.initialValue])), homeIntro: 'An updated introduction from the author.', schoolHeading: 'Bring Rider to your school.' },
    curricula: defaultCurricula.map((item) => ({ ...item, url: item.existingUrl })),
    media: [{ category: 'podcast', title: 'A new podcast episode', url: 'https://example.com/episode', description: 'Episode description.' }],
    photos: defaultPhotos.map((item) => ({ ...item, url: item.placement === 'author' ? '/story/tisha-laying-down.jpg' : item.existingUrl })),
    gallery: [{ title: 'A reading with Rider', description: 'Our latest event.', alt: 'Rider and Tisha at a reading', url: '/story/tisha-laying-down.jpg' }],
    toolkit: toolkitGroups.flatMap((group) => group.resources.map((item) => ({ ...item, category: group.category }))),
    social: defaultSocial.map((item) => ({ ...item })),
    events: defaultEvents.map((item) => ({ ...item })),
    ...overrides,
  };
}

async function mockContent(page, data = content()) {
  await page.route('**/api/content', (route) => route.fulfill({ json: data }));
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
    await expect(page.getByRole('link', { name: 'Author Login' })).toHaveAttribute('href', '/admin');
    await expect(page.getByRole('link', { name: 'A new podcast episode' })).toHaveAttribute('href', 'https://example.com/episode');
    await expect(page.locator('#schools h2')).toHaveText('Bring Rider to your school.');
    await expect(page.locator('[data-event-panel="upcoming"] h3')).toHaveText('Meet Dr. Shipley and Rider');
    await expect(page.locator('.social-links a').first()).toHaveAttribute('href', /facebook\.com/);
    await page.locator('[data-open-toolkit]').first().evaluate((el) => el.click());
    await expect(page.getByRole('link', { name: 'Being Special & Grateful' })).toHaveAttribute('href', '/toolkit/being-special-grateful-worksheet.docx');
    await page.locator('[data-close-toolkit]').last().click();
    await page.locator('[data-open-book]').first().evaluate((el) => el.click());
    await expect(page.locator('[data-square-link]')).toHaveAttribute('href', 'https://square.link/u/ZV1vr14t');
    await expect(page.locator('[data-venmo-link]')).toHaveCount(0);
    await expect(page.locator('[data-shipping-field]')).toHaveCount(0);
    await page.locator('[data-book-format][value="hardcover"]').check();
    await expect(page.locator('[data-square-link]')).toHaveAttribute('href', 'https://square.link/u/uq2dEXqy');
    await expect(page.locator('[data-square-link]')).toContainText('Hard-cover');
    await expect(page.locator('[data-checkout-status]')).toHaveText('Secure checkout is provided by Square.');
    await page.locator('.book-modal-close').click();
    await expect(page.locator('[data-event-tab="past"]')).toHaveText('Photo Gallery (1)');
    await expect(page.locator('[data-event-tab="past"]')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.cms-photo-gallery img')).toHaveAttribute('alt', 'Rider and Tisha at a reading');
    await page.locator('[data-event-tab="upcoming"]').click();
    await expect(page.locator('[data-event-panel="upcoming"]')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await page.goto('/curriculum.html');
    await expect(page.locator('[data-curriculum-list="companion"] a')).toHaveAttribute('href', '/resources/riders-magic-mark-curriculum-companion.pdf');
    await expect(page.locator('[data-curriculum-list="gratitude"] a')).toHaveAttribute('href', '/resources/growing-gratitude-and-confidence-curriculum.pdf');
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    expect(errors).toEqual([]);
  });
}

test('failed content service does not allow payment at stale prices', async ({ page }) => {
  await page.route('**/api/content', (route) => route.fulfill({ status: 503, body: '{}' }));
  await page.goto('/#purchase-book');
  await expect(page.locator('[data-checkout-status]')).toContainText('Verifying current book prices');
  await expect(page.locator('[data-square-link]')).toHaveAttribute('aria-disabled', 'true');
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

test('authenticated author loads the custom dashboard on a deep route', async ({ page }) => {
  await page.route('**/api/admin/session', (route) => route.fulfill({ json: { authenticated: true, configured: true } }));
  await page.route('**/api/admin/content', (route) => route.fulfill({ json: content() }));
  await page.route('**/api/admin/revisions', (route) => route.fulfill({ json: { revisions: [{ id: 'site-content/1.json', createdAt: '2026-10-02T12:00:00.000Z' }] } }));
  await page.goto('/admin/structure');
  await expect(page.getByRole('heading', { name: 'Update the website' })).toBeVisible();
  await expect(page.getByLabel('Hard-cover price')).toHaveValue('22');
  await expect(page.getByRole('heading', { name: 'Featured media' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Invite the Author' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Teacher Toolkit' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Book purchase pop-up' })).toBeVisible();
  await expect(page.getByLabel('Pop-up: heading')).toHaveValue("Pre-order Rider's Magic Mark");
  await expect(page.getByRole('link', { name: 'Preview pop-up' })).toHaveAttribute('href', '/#purchase-book');
  await expect(page.getByRole('heading', { name: 'Upcoming events' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Social links' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Revision history' })).toBeVisible();
  await expect(page.locator('details.toolkit-category')).toHaveCount(8);
  await expect(page.getByRole('button', { name: 'Save website changes' }).first()).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex,nofollow');
});

test('dashboard marks edits as unsaved', async ({ page }) => {
  await page.route('**/api/admin/session', (route) => route.fulfill({ json: { authenticated: true, configured: true } }));
  await page.route('**/api/admin/content', (route) => route.fulfill({ json: content() }));
  await page.route('**/api/admin/revisions', (route) => route.fulfill({ json: { revisions: [] } }));
  await page.goto('/admin');
  await page.getByLabel('Shipping message').fill('A changed shipping message.');
  await expect(page.locator('[data-save-status]')).toHaveText('Unsaved changes');
});

 test('invalid published prices keep all payment links disabled', async ({ page }) => {
  await mockContent(page, content({ settings: { ...defaultSettings, paperbackPrice: -3 } }));
  await page.goto('/#purchase-book');
  await expect(page.locator('[data-checkout-status]')).toContainText('Verifying current book prices');
  await expect(page.locator('[data-square-link]')).toHaveAttribute('aria-disabled', 'true');
 });

for (const width of [1440, 390]) {
  test('Square-only checkout is clear and responsive at ' + width, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await mockContent(page);
    await page.goto('/#purchase-book');
    await expect(page.locator('[data-square-link]')).toBeVisible();
    await expect(page.locator('[data-square-link]')).toContainText('Continue to Square');
    await expect(page.getByText('Choose your quantity and enter your email, delivery address, and payment securely on Square.')).toBeVisible();
    await expect(page.getByText(/Shipping and tax are shown|send tracking information when it ships/)).toHaveCount(0);
    await expect(page.locator('[data-venmo-link]')).toHaveCount(0);
    await expect(page.locator('[data-cashapp-link], [data-paypal-link], [data-shipping-field], [data-copy-order]')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  });
}

test('dashboard photo editor uses file upload instead of a manual URL field', async ({ page }) => {
  await page.route('**/api/admin/session', (route) => route.fulfill({ json: { authenticated: true, configured: true } }));
  await page.route('**/api/admin/content', (route) => route.fulfill({ json: content() }));
  await page.route('**/api/admin/revisions', (route) => route.fulfill({ json: { revisions: [] } }));
  await page.goto('/admin#site-photos');
  const photoCard = page.locator('[data-kind="photos"]').first();
  await expect(photoCard.getByText('Choose a new photo')).toBeVisible();
  await expect(photoCard.locator('input[name="url"]')).toHaveAttribute('type', 'hidden');
  await expect(page.getByLabel('Soft-cover price')).toBeVisible();
  await expect(page.getByLabel('Checkout: Square instructions')).toBeVisible();
  await expect(page.locator('[data-kind="photos"]')).toHaveCount(4);
});
