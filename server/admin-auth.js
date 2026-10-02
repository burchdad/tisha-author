import { createHmac, timingSafeEqual } from 'node:crypto';

export const COOKIE_NAME = 'rmm_admin_session';
const SESSION_SECONDS = 8 * 60 * 60;

function configured() {
  return Boolean(allowedEmails().length && process.env.ADMIN_PASSWORD && process.env.ADMIN_AUTH_SECRET);
}

function allowedEmails() {
  return [process.env.ADMIN_EMAIL, ...(process.env.ADMIN_EMAILS || '').split(',')]
    .map((email) => String(email || '').trim().toLowerCase())
    .filter((email, index, list) => email && list.indexOf(email) === index);
}

function equal(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function signature(value) {
  return createHmac('sha256', process.env.ADMIN_AUTH_SECRET || 'unconfigured').update(value).digest('base64url');
}

export function validateCredentials(email, password) {
  if (!configured()) return false;
  const normalizedEmail = String(email).trim().toLowerCase();
  return allowedEmails().some((allowed) => equal(normalizedEmail, allowed)) &&
    equal(password, process.env.ADMIN_PASSWORD);
}

export function createSession(email = process.env.ADMIN_EMAIL) {
  if (!configured()) throw new Error('Admin access is not configured.');
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!allowedEmails().some((allowed) => equal(normalizedEmail, allowed))) throw new Error('Admin access is not configured.');
  const expires = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const payload = Buffer.from(JSON.stringify({ email: normalizedEmail, expires })).toString('base64url');
  return `${payload}.${signature(payload)}`;
}

function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map((part) => part.trim().split('=').map(decodeURIComponent)).filter(([key]) => key));
}

export function isAuthenticated(request) {
  if (!configured()) return false;
  let token;
  try { token = parseCookies(request.headers.cookie)[COOKIE_NAME]; } catch { return false; }
  if (!token) return false;
  const [payload, suppliedSignature] = token.split('.');
  if (!payload || !suppliedSignature || !equal(suppliedSignature, signature(payload))) return false;
  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return allowedEmails().some((allowed) => equal(session.email, allowed)) && session.expires > Date.now() / 1000;
  } catch {
    return false;
  }
}

export function sessionCookie(token) {
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; Max-Age=${SESSION_SECONDS}; HttpOnly; Secure; SameSite=Strict`;
}

export function expiredSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}

export function hasSameOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === request.headers.host;
  } catch {
    return false;
  }
}

export function adminConfigured() {
  return configured();
}
