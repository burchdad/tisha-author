import { VisitError } from './visit-model.js';

export function schoolVisitSender() {
  // Dedicated approved mailbox, not the administrator's personal sender setting.
  // The operator must verify the domain with Resend before enabling deployment.
  const address = String(process.env.SCHOOL_VISIT_FROM_EMAIL || '').trim();
  if (!/^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?\.[a-zA-Z]{2,}$/.test(address) || address.length > 254 || address.toLowerCase().endsWith('@resend.dev')) {
    throw new VisitError('School visit sender is not configured with an approved mailbox.', 503);
  }
  return `Rider's Magic Mark <${address}>`;
}
