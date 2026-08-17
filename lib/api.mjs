/* Shared helpers for the Vercel Functions in /api.

   No SDKs on purpose. This project's whole claim is zero runtime dependencies,
   and both Stripe and Supabase have plain REST APIs that `fetch` handles. */

/* Env values get pasted by hand and piped through shells; a stray newline in a
   URL turns every request into a confusing 400. Trim once, here. */
const env = (name, fallback = '') => (process.env[name] || fallback).trim();

export const SITE = env('SITE_URL', 'https://genome-of-games.vercel.app');

const SUPABASE_URL = env('SUPABASE_URL');
const SERVICE_KEY = env('SUPABASE_SERVICE_ROLE_KEY');
const STRIPE_KEY = env('STRIPE_SECRET_KEY');

export const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
  });

export function missingEnv(...names) {
  const missing = names.filter(n => !process.env[n]);
  return missing.length ? `Not configured yet — missing ${missing.join(', ')}` : null;
}

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

export const PRICE_ID = env('STRIPE_PRICE_ID');

export async function stripe(path, body, method = 'POST') {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: {
      authorization: `Bearer ${STRIPE_KEY}`,
      'content-type': 'application/x-www-form-urlencoded'
    },
    body: body ? formEncode(body) : undefined
  });
  const out = await res.json();
  if (!res.ok) throw new Error(out.error ? out.error.message : `Stripe ${res.status}`);
  return out;
}

/* -------------------------------------------------------------- Supabase -- */

/* Identify the caller from their Supabase access token. Verifying against
   GoTrue rather than decoding the JWT locally means a revoked session stops
   working immediately and we never need the JWT secret. */
export async function userFromRequest(request) {
  const auth = request.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { authorization: `Bearer ${token}`, apikey: env('SUPABASE_ANON_KEY') }
  });
  if (!res.ok) return null;
  const user = await res.json();
  return user && user.id ? user : null;
}

/* Service-role reads and writes. Bypasses RLS, so this must only ever run in
   a function — never anywhere the key could reach the browser. */
export async function db(path, { method = 'GET', body, prefer } = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SERVICE_KEY,
      authorization: `Bearer ${SERVICE_KEY}`,
      'content-type': 'application/json',
      ...(prefer ? { prefer } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export async function getSubscriber(userId) {
  const rows = await db(`gog_subscribers?select=*&id=eq.${encodeURIComponent(userId)}`);
  return rows && rows[0] ? rows[0] : null;
}

export async function updateSubscriber(match, patch) {
  const [col, val] = match;
  return db(`gog_subscribers?${col}=eq.${encodeURIComponent(val)}`, {
    method: 'PATCH', body: patch, prefer: 'return=minimal'
  });
}
