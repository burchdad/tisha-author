import { test, expect } from '@playwright/test';

const storageKey = 'rmm_school_visit_retry_v1';
const fields = { name: 'Fixture Coordinator', school: 'Fixture School', email: 'fixture@example.com', preferredDate: '2026-11-10', preferredTime: '10:00', timeZone: 'America/Chicago', location: 'Fixture Library' };
async function fillForm(page, overrides = {}) {
  const form = page.locator('[data-invite-form]');
  for (const [name, value] of Object.entries({ ...fields, ...overrides })) await form.locator(`[name=${name}]`).fill(value);
  await form.locator('[name=interest]').selectOption('Classroom workshop');
  await form.locator('[name=durationMinutes]').selectOption('45');
  return form;
}

test('lost response, page reload, and identical resubmission reuse the private retry; edited details receive a new ID', async ({ page }) => {
  const calls = []; let confirmed = false;
  await page.route('**/api/**', async (route) => {
    if (new URL(route.request().url()).pathname !== '/api/school-visit') return route.fulfill({ status: 503, json: {} });
    calls.push(route.request().postDataJSON());
    // Simulate server acceptance followed by a lost response. No external request is made.
    if (!confirmed) return route.abort('failed');
    return route.fulfill({ json: { message: 'Fixture request received for review. Not booked.' } });
  });
  await page.goto('/'); let form = await fillForm(page);
  await form.getByRole('button', { name: 'Start the Conversation' }).click();
  await expect(form.locator('[data-form-status]')).toHaveAttribute('data-state', 'error');
  await expect(form.locator('[data-form-status]')).toContainText('within 23 hours');
  expect(calls).toHaveLength(1);
  const raw = await page.evaluate((key) => sessionStorage.getItem(key), storageKey);
  const retry = JSON.parse(raw);
  expect(Object.keys(retry).sort()).toEqual(['createdAt', 'fingerprint', 'id']);
  expect(retry.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  for (const value of Object.values(fields)) expect(raw).not.toContain(value);
  expect(retry.id).toBe(calls[0].requestId);

  await page.reload();
  await expect(page.locator('[data-form-status]')).toContainText('previous submission');
  form = await fillForm(page);
  await form.getByRole('button', { name: 'Start the Conversation' }).click();
  await expect(form.locator('[data-form-status]')).toHaveAttribute('data-state', 'error');
  expect(calls).toHaveLength(2); expect(calls[1].requestId).toBe(calls[0].requestId);
  expect(JSON.parse(await page.evaluate((key) => sessionStorage.getItem(key), storageKey)).createdAt).toBe(retry.createdAt);

  await form.locator('[name=school]').fill('Changed Fixture School'); confirmed = true;
  await form.getByRole('button', { name: 'Start the Conversation' }).click();
  await expect(form.locator('[data-form-status]')).toContainText('Not booked');
  await expect(form.locator('[data-form-status]')).toHaveAttribute('data-state', 'success');
  expect(calls).toHaveLength(3); expect(calls[2].requestId).not.toBe(calls[1].requestId);
  expect(await page.evaluate((key) => sessionStorage.getItem(key), storageKey)).toBeNull();
});

test('disabled browser storage blocks submission before any endpoint call', async ({ page }) => {
  const calls = [];
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => { throw new DOMException('Fixture storage denied', 'QuotaExceededError'); };
  });
  await page.route('**/api/**', async (route) => {
    if (new URL(route.request().url()).pathname === '/api/school-visit') calls.push(route.request().postDataJSON());
    return route.fulfill({ status: 503, json: {} });
  });
  await page.goto('/'); const form = await fillForm(page);
  await form.getByRole('button', { name: 'Start the Conversation' }).click();
  await expect(form.locator('[data-form-status]')).toContainText('Nothing new was sent');
  await expect(form.getByRole('button', { name: 'Start the Conversation' })).toBeEnabled();
  expect(calls).toHaveLength(0);
});
