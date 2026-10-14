import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { createVisit, normalizeInquiry } from '../server/visit-model.js';

const now = Date.parse('2026-10-14T00:00:00Z');
const fields = { name: 'Fixture Coordinator', school: 'Fixture School', email: 'fixture@example.com', interest: 'Classroom workshop', preferredDate: '2026-11-10', preferredTime: '10:00', timeZone: 'America/Chicago', durationMinutes: '45', location: 'Fixture Library', notes: 'Synthetic session-expiry fixture' };

for (const width of [1280, 390]) {
  test(`expired session clears private review and preserves pending request at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const record = createVisit(randomUUID(), normalizeInquiry(fields, now), now);
    let authenticated = true;
    const posts = [];
    await page.route('https://**', (route) => route.abort());
    await page.route('**/api/**', async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path.endsWith('/session')) return route.fulfill({ json: { authenticated, configured: true } });
      if (path.endsWith('/login')) { authenticated = true; return route.fulfill({ json: { authenticated } }); }
      if (path === '/api/admin/visits') {
        if (request.method() === 'POST') { posts.push(request.postDataJSON()); authenticated = false; }
        if (!authenticated) return route.fulfill({ status: 401, json: { message: 'Sign in to review this visit request.' } });
        return route.fulfill({ json: { visit: record, calendarIntegration: 'manual' } });
      }
      return route.fulfill({ status: 404, json: {} });
    });
    await page.goto(`/visits.html?id=${record.id}`);
    await expect(page.locator('#school')).toHaveText(fields.school);
    await page.locator('[name=changeMessage]').fill('Please confirm the address.');
    await page.getByRole('button', { name: 'Request changes', exact: true }).click();
    await expect(page.locator('#login-panel')).toBeVisible();
    await expect(page.locator('#review-panel')).toBeHidden();
    await expect(page.locator('#status')).toContainText('Sign in');
    expect(posts).toHaveLength(1);
    expect(record.status).toBe('pending');
    for (const id of ['school', 'state', 'request-notes', 'change-request-summary', 'approved-summary', 'calendar-state', 'request-details']) {
      await expect(page.locator(`#${id}`)).toHaveText('');
    }
    for (const name of ['preferredDate', 'preferredTime', 'timeZone', 'durationMinutes', 'location', 'changeMessage']) {
      await expect(page.locator(`#review-form [name=${name}]`)).toHaveValue('');
    }
    await expect(page.locator('[name=availabilityChecked]')).not.toBeChecked();
    expect(await page.locator('#calendar-download').getAttribute('href')).toBeNull();
    expect(await page.locator('#school-reply').getAttribute('href')).toBeNull();
    await page.locator('#login-form [name=email]').fill('author@example.com');
    await page.locator('#login-form [name=password]').fill('synthetic-password');
    await page.getByRole('button', { name: 'Sign in to review' }).click();
    await expect(page.locator('#school')).toHaveText(fields.school);
    await expect(page.locator('#state')).toHaveText('Pending author review');
    await expect(page.locator('#login-form [name=password]')).toHaveValue('');
    expect(posts).toHaveLength(1);
  });
}
