import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { createVisit, normalizeInquiry, applyVisitAction } from '../server/visit-model.js';
const now = Date.parse('2026-10-12T12:00:00Z');
const fields = { name: 'School Coordinator', school: 'Example Elementary', email: 'teacher@example.com', interest: 'Classroom reading', preferredDate: '2026-11-10', preferredTime: '10:00', timeZone: 'America/Chicago', durationMinutes: '45', location: 'Example City Library', notes: '<img src=x onerror=alert(1)> Local test only' };
async function fixture(page, { signedIn = false, interruptApproval = false } = {}) {
  let record = createVisit(randomUUID(), normalizeInquiry(fields, now), now); const calls = [];
  await page.route('**/api/**', async (route) => {
    const req = route.request(); const url = new URL(req.url());
    if (url.pathname.endsWith('/session')) return route.fulfill({ json: { authenticated: signedIn, configured: true } });
    if (url.pathname.endsWith('/login')) { signedIn = true; return route.fulfill({ json: { authenticated: true } }); }
    if (url.pathname.endsWith('/logout')) { signedIn = false; return route.fulfill({ json: { authenticated: false } }); }
    if (url.pathname === '/api/admin/visits') {
      if (!signedIn) return route.fulfill({ status: 401, json: { message: 'Sign in to review this visit request.' } });
      if (req.method() === 'POST') {
        const body = req.postDataJSON(); calls.push(body);
        try { record = applyVisitAction(record, body, 'author@example.com', now); }
        catch (error) { return route.fulfill({ status: error.status || 400, json: { message: error.message } }); }
        if (interruptApproval && body.action === 'approve') { interruptApproval = false; return route.abort(); }
      }
      return route.fulfill({ json: { visit: record, calendarIntegration: 'manual' } });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto(`/visits.html?id=${record.id}`);
  return { calls, get record() { return record; } };
}
for (const width of [1280, 390]) {
  test(`email review, sign-in, edited approval and separate calendar confirmation at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 }); const errors = []; page.on('pageerror', (error) => errors.push(error.message));
    const f = await fixture(page);
    await expect(page.locator('#login-panel')).toBeVisible(); expect(f.calls).toHaveLength(0);
    await page.locator('#login-form [name=email]').fill('author@example.com'); await page.locator('#login-form [name=password]').fill('fake-test-password');
    await page.getByRole('button', { name: 'Sign in to review' }).click();
    await expect(page.locator('#school')).toHaveText('Example Elementary'); await expect(page.locator('#request-notes img')).toHaveCount(0);
    await page.getByRole('button', { name: 'Approve visit', exact: true }).click(); await expect(page.locator('#status')).toContainText('Check your calendar'); expect(f.calls).toHaveLength(0);
    await page.locator('#review-form [name=preferredTime]').fill('11:15'); await page.locator('#review-form [name=availabilityChecked]').check();
    await page.locator('#review-form [name=durationMinutes]').fill('60'); await expect(page.locator('[name=availabilityChecked]')).not.toBeChecked();
    await page.locator('#review-form [name=availabilityChecked]').check();
    await page.getByRole('button', { name: 'Approve visit', exact: true }).click();
    await expect(page.locator('#calendar-panel')).toBeVisible(); expect(f.calls).toHaveLength(1); expect(f.record.status).toBe('approved'); expect(f.record.schedule.preferredTime).toBe('11:15');
    await expect(page.locator('#calendar-state')).toContainText('not yet been recorded'); await expect(page.locator('#calendar-download')).toHaveAttribute('href', /format=ics/);
    await page.locator('[name=calendarLabel]').fill('Author work calendar'); await page.locator('[name=calendarSaved]').check(); await page.getByRole('button', { name: 'Record that I saved it' }).click();
    await expect(page.locator('#calendar-state')).toContainText('website has not verified'); expect(f.record.calendar.status).toBe('manually_recorded');
    await expect(page.locator('#school-reply')).toHaveAttribute('href', /^mailto:teacher%40example.com\?/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false); expect(errors).toEqual([]);
    await page.screenshot({ path: `../review-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Sign out' }).click(); await expect(page.locator('#review-panel')).toBeHidden();
    await page.reload(); await expect(page.locator('#login-panel')).toBeVisible(); expect(f.calls).toHaveLength(2);
  });
}
test('interrupted approval reloads the durable approved state without double approval', async ({ page }) => {
  const f = await fixture(page, { signedIn: true, interruptApproval: true });
  await page.locator('[name=availabilityChecked]').check(); await page.getByRole('button', { name: 'Approve visit', exact: true }).click();
  await expect(page.locator('#calendar-panel')).toBeVisible(); await expect(page.locator('#review-form')).toBeHidden(); expect(f.calls).toHaveLength(1);
  await page.getByRole('button', { name: 'Reload latest status' }).click(); expect(f.calls).toHaveLength(1);
});
test('cancel decline leaves pending request unchanged; explicit decline persists', async ({ page }) => {
  const f = await fixture(page, { signedIn: true });
  page.once('dialog', (dialog) => dialog.dismiss()); await page.getByRole('button', { name: 'Decline request' }).click(); expect(f.calls).toHaveLength(0);
  page.once('dialog', (dialog) => dialog.accept()); await page.getByRole('button', { name: 'Decline request' }).click();
  await expect(page.locator('#state')).toContainText('Declined'); expect(f.calls).toHaveLength(1); await expect(page.locator('#calendar-panel')).toBeHidden();
});
test('public form collects timezone and duration, retries with stable ID and changes ID after edits', async ({ page }) => {
  const calls = []; let fail = true;
  await page.route('**/api/content', (route) => route.fulfill({ status: 503, json: {} }));
  await page.route('**/api/school-visit', (route) => { calls.push(route.request().postDataJSON()); return route.fulfill({ status: fail ? 503 : 200, json: { message: fail ? 'Retry fixture' : 'Request sent for review. Not booked.' } }); });
  await page.goto('/'); const form = page.locator('[data-invite-form]');
  for (const key of ['name', 'school', 'email', 'preferredDate', 'preferredTime', 'timeZone', 'location']) await form.locator(`[name=${key}]`).fill(fields[key]);
  await form.locator('[name=interest]').selectOption({ index: 1 }); await form.locator('[name=durationMinutes]').selectOption('45');
  await form.getByRole('button', { name: 'Start the Conversation' }).click(); await expect(form.locator('[data-form-status]')).toContainText('Retry fixture');
  await form.getByRole('button', { name: 'Start the Conversation' }).click(); await expect.poll(() => calls.length).toBe(2); expect(calls[0].requestId).toBe(calls[1].requestId);
  await form.locator('[name=school]').fill('Updated School'); fail = false; await form.getByRole('button', { name: 'Start the Conversation' }).click();
  await expect(form.locator('[data-form-status]')).toContainText('Not booked'); expect(calls[2].requestId).not.toBe(calls[1].requestId);
});

test('request changes requires notes, records proposal, and prepares a separate unsent reply', async ({ page }) => {
  const f = await fixture(page, { signedIn: true });
  await page.getByRole('button', { name: 'Request changes', exact: true }).click();
  await expect(page.locator('#status')).toContainText('Describe the changes'); expect(f.calls).toHaveLength(0);
  await page.locator('[name=preferredTime]').fill('11:30');
  await page.locator('[name=changeMessage]').fill('Could we use the library instead? <script>test</script>');
  await page.getByRole('button', { name: 'Request changes', exact: true }).click();
  await expect(page.locator('#state')).toContainText('Changes requested'); expect(f.calls).toHaveLength(1);
  expect(f.record.status).toBe('changes_requested'); expect(f.record.calendar.status).toBe('not_recorded');
  await expect(page.locator('#calendar-panel')).toBeHidden(); await expect(page.locator('#review-form')).toBeVisible();
  await expect(page.locator('#change-request-summary script')).toHaveCount(0);
  const draft = decodeURIComponent(await page.locator('#school-reply').getAttribute('href'));
  expect(draft).toContain('Could we use the library instead?'); expect(draft).toContain('11:30'); expect(draft).toContain('not booked yet');
  await page.reload(); await expect(page.locator('#state')).toContainText('Changes requested'); expect(f.calls).toHaveLength(1);
  await page.locator('[name=availabilityChecked]').check(); await page.getByRole('button', { name: 'Approve visit', exact: true }).click();
  await expect(page.locator('#calendar-panel')).toBeVisible(); expect(f.calls).toHaveLength(2); expect(f.record.status).toBe('approved');
});
