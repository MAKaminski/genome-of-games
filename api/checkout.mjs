/* POST /api/checkout — start a $10/month newsletter subscription.
   Requires a session token in the Authorization header. */
import { stripe, userFromRequest, customerFor, statusFor, json, missingEnv, SITE, PRICE_ID } from '../lib/api.mjs';

export async function POST(request) {
  const gap = missingEnv('MAGIC_SECRET', 'STRIPE_SECRET_KEY', 'STRIPE_PRICE_ID');
  if (gap) return json({ error: gap }, 503);

  const user = userFromRequest(request);
  if (!user) return json({ error: 'Sign in first' }, 401);

  try {
    const current = await statusFor(user.email);
    if (current.status === 'active') return json({ error: 'You are already subscribed' }, 409);

    /* One Stripe customer per email, so a resubscribe lands on the same
       billing history. */
    const customer = await customerFor(user.email, true);
    const session = await stripe('checkout/sessions', {
      mode: 'subscription',
      customer: customer.id,
      client_reference_id: user.email,
      success_url: `${SITE}/newsletter/?checkout=success`,
      cancel_url: `${SITE}/newsletter/?checkout=cancelled`,
      allow_promotion_codes: true,
      line_items: { 0: { price: PRICE_ID, quantity: 1 } },
      subscription_data: { metadata: { email: user.email } }
    });
    return json({ url: session.url });
  } catch (err) {
    console.error('checkout failed', err);
    return json({ error: 'Could not start checkout' }, 500);
  }
}
