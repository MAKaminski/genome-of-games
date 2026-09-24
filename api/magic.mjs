/* POST /api/magic — email a one-time sign-in link.

   Body: { "email": "someone@example.com" }. The link carries a signed token
   (lib/api.mjs `sign`) good for an hour; /api/session exchanges it for a
   thirty-day session. Always answers 200 for a well-formed address, so the
   endpoint cannot be used to test which emails have signed in before. */
import { json, missingEnv, SITE, sign, now, MAGIC_TTL, EMAIL, normalizeEmail } from '../lib/api.mjs';

const FROM = (process.env.MAGIC_FROM || 'The Genome of Games <genome@michael-kaminski.io>').trim();

function message(link) {
  const text = `Sign in to The Genome of Games\n\nOpen this link to sign in:\n${link}\n\nIt expires in an hour. If you did not ask for it, ignore this email — nothing happens without the link.\n\n${SITE}`;
  const html = `<div style="font:16px/1.6 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#111;max-width:34em">
<p style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#666;margin:0 0 12px">The Genome of Games</p>
<p style="font-size:22px;font-weight:700;margin:0 0 18px">Your sign-in link</p>
<p><a href="${link}" style="display:inline-block;background:#d7ff3e;color:#0a0a0a;font-weight:700;text-decoration:none;padding:14px 22px;border-radius:4px">Sign in</a></p>
<p style="color:#555">It expires in an hour. If you did not ask for it, ignore this email — nothing happens without the link.</p>
<p style="color:#888;font-size:13px;word-break:break-all">${link}</p>
</div>`;
  return { text, html };
}

export async function POST(request) {
  const gap = missingEnv('MAGIC_SECRET', 'RESEND_API_KEY');
  if (gap) return json({ error: gap }, 503);

  let email = '';
  try { email = normalizeEmail((await request.json()).email); } catch { /* fall through */ }
  if (!EMAIL.test(email) || email.length > 254) return json({ error: 'That does not look like an email address' }, 400);

  try {
    const token = sign({ kind: 'magic', email, exp: now() + MAGIC_TTL });
    const link = `${SITE}/newsletter/?token=${encodeURIComponent(token)}`;
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
