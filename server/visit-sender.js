import { VisitError } from './visit-model.js';

export function schoolVisitSender() {
  // Dedicated approved mailbox, not the administrator's personal sender setting.
  // The operator must verify the domain with Resend before enabling deployment.
  const address = String(process.env.SCHOOL_VISIT_FROM_EMAIL || '').trim();
  const domain = address.split('@')[1]?.toLowerCase();
  const sharedDomains = new Set(['resend.dev', 'gmail.com', 'googlemail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'icloud.com', 'me.com', 'aol.com', 'proton.me', 'protonmail.com']);
  if (!/^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?\.[a-zA-Z]{2,}$/.test(address) || address.length > 254 || sharedDomains.has(domain)) {
    throw new VisitError('School visit sender is not configured with an approved mailbox.', 503);
  }
  return `Rider's Magic Mark <${address}>`;
}
