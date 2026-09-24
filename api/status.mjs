/* GET /api/status — the signed-in reader's subscription state, read live
   from Stripe. { status: 'free' | 'active' | 'past_due', current_period_end } */
import { json, missingEnv, userFromRequest, statusFor } from '../lib/api.mjs';

export async function GET(request) {
  const gap = missingEnv('MAGIC_SECRET', 'STRIPE_SECRET_KEY');
  if (gap) return json({ error: gap }, 503);

  const user = userFromRequest(request);
  if (!user) return json({ error: 'Sign in first' }, 401);

  try {
    const s = await statusFor(user.email);
    return json({ email: user.email, status: s.status, current_period_end: s.current_period_end || null });
  } catch (err) {
    console.error('status failed', err);
    return json({ error: 'Could not read your subscription' }, 500);
  }
}
