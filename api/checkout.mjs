/* POST /api/checkout — start a $10/month newsletter subscription.
   Requires a Supabase access token in the Authorization header. */
import { stripe, userFromRequest, getSubscriber, updateSubscriber, json, missingEnv, SITE, PRICE_ID } from '../lib/api.mjs';

export async function POST(request) {
  const gap = missingEnv('STRIPE_SECRET_KEY', 'STRIPE_PRICE_ID', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY');
  if (gap) return json({ error: gap }, 503);

  const user = await userFromRequest(request);
  if (!user) return json({ error: 'Sign in first' }, 401);

  try {
    const row = await getSubscriber(user.id);
    if (row && row.newsletter_status === 'active') {
      return json({ error: 'You are already subscribed' }, 409);
    }

    /* Reuse the Stripe customer if this person has subscribed before, so a
       resubscribe lands on the same billing history. */
    let customer = row && row.stripe_customer_id;
    if (!customer) {
      const created = await stripe('customers', {
        email: user.email,
        metadata: { supabase_user_id: user.id }
      });
      customer = created.id;
      await updateSubscriber(['id', user.id], { stripe_customer_id: customer });
    }

    const session = await stripe('checkout/sessions', {
      mode: 'subscription',
      customer,
      client_reference_id: user.id,
      success_url: `${SITE}/newsletter/?checkout=success`,
      cancel_url: `${SITE}/newsletter/?checkout=cancelled`,
      allow_promotion_codes: true,
      line_items: { 0: { price: PRICE_ID, quantity: 1 } },
      subscription_data: { metadata: { supabase_user_id: user.id } }
    });

    return json({ url: session.url });
  } catch (err) {
    console.error('checkout failed', err);
    return json({ error: 'Could not start checkout' }, 500);
  }
}
