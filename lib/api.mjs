/* Shared helpers for the Vercel Functions in /api.

   No SDKs on purpose. This project's whole claim is zero runtime dependencies,
   and Stripe and Resend have plain REST APIs that `fetch` handles.

   There is no database. A signed-in reader is a signed token carrying their
   email (HMAC over MAGIC_SECRET), and whether they pay is read from Stripe,
   which already knows. That is the whole account system: nothing to
   provision, nothing to migrate, nothing to lose. */
import crypto from 'node:crypto';

/* Env values get pasted by hand and piped through shells; a stray newline in a
   URL turns every request into a confusing 400. Trim once, here. */
const env = (name, fallback = '') => (process.env[name] || fallback).trim();

export const SITE = env('SITE_URL', 'https://genome-of-games.vercel.app');
const STRIPE_KEY = env('STRIPE_SECRET_KEY');
export const PRICE_ID = env('STRIPE_PRICE_ID');
const SECRET = env('MAGIC_SECRET');

export const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
  });

export function missingEnv(...names) {
  const missing = names.filter(n => !process.env[n]);
  return missing.length ? `Not configured yet — missing ${missing.join(', ')}` : null;
}

/* ---------------------------------------------------------------- tokens -- */

/* Two token kinds share one shape: `magic` (in the emailed link, one hour) and
   `session` (in the browser, thirty days). The payload is base64url JSON and
   the signature is HMAC-SHA256 over it. Verification checks the signature in
   constant time, then the kind, then the expiry — a magic token can never be
   presented as a session. */
export const MAGIC_TTL = 60 * 60;
export const SESSION_TTL = 30 * 24 * 60 * 60;
export const now = () => Math.floor(Date.now() / 1000);

const mac = body => crypto.createHmac('sha256', SECRET).update(body).digest('base64url');

export function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${mac(body)}`;
}

export function verify(token, kind) {
  if (typeof token !== 'string' || token.length > 2048) return null;
  const i = token.lastIndexOf('.');
  if (i < 1) return null;
  const body = token.slice(0, i), given = Buffer.from(token.slice(i + 1));
  const expected = Buffer.from(mac(body));
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  let p;
  try { p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch { return null; }
  if (!p || p.kind !== kind || typeof p.email !== 'string' || !(p.exp > now())) return null;
  return p;
}

/* The signed-in reader, from the Authorization header. */
export function userFromRequest(request) {
  const auth = request.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  return token ? verify(token, 'session') : null;
}

export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const normalizeEmail = e => String(e || '').trim().toLowerCase();

/* ---------------------------------------------------------------- Stripe -- */

/* Stripe takes form-encoded bodies with bracketed paths for nested values:
   subscription_data[metadata][user]=abc. */
function formEncode(obj, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object') formEncode(v, key, out);
    else out.append(key, String(v));
  }
  return out;
}

export async function stripe(path, body, method = 'POST') {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: {
      authorization: `Bearer ${STRIPE_KEY}`,
      ...(body ? { 'content-type': 'application/x-www-form-urlencoded' } : {})
    },
    body: body ? formEncode(body) : undefined
  });
  const out = await res.json();
  if (!res.ok) throw new Error(out.error ? out.error.message : `Stripe ${res.status}`);
  return out;
}

/* Stripe is the subscriber record. One customer per email. */
export async function customerFor(email, create = false) {
  const q = `email:'${email.replace(/'/g, "\\'")}'`;
  const found = await stripe(`customers/search?query=${encodeURIComponent(q)}&limit=1`, null, 'GET');
  if (found.data && found.data[0]) return found.data[0];
  return create ? stripe('customers', { email }) : null;
}

const STATUS = {
  active: 'active', trialing: 'active',
  past_due: 'past_due', unpaid: 'past_due'
};

/* current_period_end sits on the subscription in older API versions and on the
   subscription item in newer ones. Take whichever is present. */
function periodEnd(sub) {
  const item = sub.items && sub.items.data && sub.items.data[0];
  const ts = sub.current_period_end || (item && item.current_period_end);
  return ts ? new Date(ts * 1000).toISOString() : null;
}

export async function statusFor(email) {
  const customer = await customerFor(email);
  if (!customer) return { status: 'free' };
  const subs = await stripe(`subscriptions?customer=${customer.id}&status=all&limit=10`, null, 'GET');
  const rank = { active: 0, trialing: 0, past_due: 1, unpaid: 1 };
  const live = (subs.data || []).filter(s => s.status in rank).sort((a, b) => rank[a.status] - rank[b.status])[0];
  if (!live) return { status: 'free', customer: customer.id };
  return { status: STATUS[live.status], customer: customer.id, current_period_end: periodEnd(live) };
}

/* ---------------------------------------------------------------- Resend -- */

/* Every signed-in reader goes on the Resend contact list — that list is what
   "free updates" are sent to. Failure here must never block a sign-in. */
export async function addContact(email) {
  const key = env('RESEND_API_KEY');
  if (!key) return false;
  try {
    const res = await fetch('https://api.resend.com/contacts', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ email, unsubscribed: false })
    });
    return res.ok;
  } catch {
    return false;
  }
}
