/* POST /api/magic — email a one-time sign-in link.

   Google sign-in needs OAuth credentials created by hand in Google Cloud and
   pasted into Supabase; until that is done the Google button bounces with a
   provider error. This path needs neither. GoTrue's admin API mints a magic
   link token for the address (creating the user if it is new), we email the
   token ourselves through Resend, and the browser exchanges it for a session
   with POST /auth/v1/verify — no redirect through Supabase, so nothing has to
   be allow-listed in its dashboard either.

   Body: { "email": "someone@example.com" }. Always answers 200 for a
   well-formed address so the endpoint cannot be used to test which emails
   have accounts. */
import { json, missingEnv, SITE, adminGenerateLink } from '../lib/api.mjs';

const FROM = (process.env.MAGIC_FROM || 'The Genome of Games <hello@modularequity.com>').trim();
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/* A bare token in a URL is fine: it is single-use and expires in an hour
   (GoTrue's default), and the page discards it from the address bar as soon
   as it is exchanged. */
const linkFor = tokenHash => `${SITE}/newsletter/?token_hash=${encodeURIComponent(tokenHash)}`;

function message(link) {
  const text = `Sign in to The Genome of Games\n\nOpen this link to sign in:\n${link}\n\nIt works once and expires in an hour. If you did not ask for it, ignore this email — nothing happens without the link.\n\n${SITE}`;
  const html = `<div style="font:16px/1.6 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#111;max-width:34em">
<p style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#666;margin:0 0 12px">The Genome of Games</p>
<p style="font-size:22px;font-weight:700;margin:0 0 18px">Your sign-in link</p>
<p><a href="${link}" style="display:inline-block;background:#d7ff3e;color:#0a0a0a;font-weight:700;text-decoration:none;padding:14px 22px;border-radius:4px">Sign in</a></p>
<p style="color:#555">It works once and expires in an hour. If you did not ask for it, ignore this email — nothing happens without the link.</p>
<p style="color:#888;font-size:13px;word-break:break-all">${link}</p>
</div>`;
  return { text, html };
}

export async function POST(request) {
  const gap = missingEnv('SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'RESEND_API_KEY');
  if (gap) return json({ error: gap }, 503);

  let email = '';
  try { email = String((await request.json()).email || '').trim().toLowerCase(); } catch { /* fall through */ }
  if (!EMAIL.test(email) || email.length > 254) return json({ error: 'That does not look like an email address' }, 400);

  try {
    const tokenHash = await adminGenerateLink(email);
    const link = linkFor(tokenHash);
    const { text, html } = message(link);
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${process.env.RESEND_API_KEY.trim()}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [email], subject: 'Your sign-in link for The Genome of Games', text, html })
    });
    if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
    return json({ ok: true });
  } catch (err) {
    console.error('magic link failed', err);
    return json({ error: 'Could not send the link. Try again in a minute.' }, 500);
  }
}
