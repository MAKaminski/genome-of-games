/* POST /api/portal — open Stripe's billing portal so a subscriber can update
   their card or cancel without us building any of that. */
import { stripe, userFromRequest, getSubscriber, json, missingEnv, SITE } from '../lib/api.mjs';

export async function POST(request) {
  const gap = missingEnv('STRIPE_SECRET_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY');
  if (gap) return json({ error: gap }, 503);

  const user = await userFromRequest(request);
  if (!user) return json({ error: 'Sign in first' }, 401);

  try {
    const row = await getSubscriber(user.id);
    if (!row || !row.stripe_customer_id) return json({ error: 'No billing record yet' }, 404);

    const session = await stripe('billing_portal/sessions', {
      customer: row.stripe_customer_id,
      return_url: `${SITE}/newsletter/`
    });
    return json({ url: session.url });
  } catch (err) {
    console.error('portal failed', err);
    return json({ error: 'Could not open the billing portal' }, 500);
  }
}
