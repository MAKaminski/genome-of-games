/* POST /api/session — turn an emailed magic token into a session.

   Body: { "token": "<from the link>" }. Returns { session, email, exp }. The
   browser keeps the session token and sends it as a Bearer header to the
   other functions. Signing in also puts the address on the Resend contact
   list, which is what free updates go to. */
import { json, missingEnv, verify, sign, now, SESSION_TTL, addContact } from '../lib/api.mjs';

export async function POST(request) {
  const gap = missingEnv('MAGIC_SECRET');
  if (gap) return json({ error: gap }, 503);

  let token = '';
  try { token = String((await request.json()).token || ''); } catch { /* fall through */ }
  const magic = verify(token, 'magic');
  if (!magic) return json({ error: 'That link has expired. Request a new one.' }, 401);

  const exp = now() + SESSION_TTL;
  const session = sign({ kind: 'session', email: magic.email, exp });
  const listed = await addContact(magic.email);
  return json({ session, email: magic.email, exp, listed });
}
