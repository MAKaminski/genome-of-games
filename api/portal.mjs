/* POST /api/portal — open Stripe's billing portal so a subscriber can update
   their card or cancel without us building any of that. */
import { stripe, userFromRequest, customerFor, json, missingEnv, SITE } from '../lib/api.mjs';

export async function POST(request) {
  const gap = missingEnv('MAGIC_SECRET', 'STRIPE_SECRET_KEY');
  if (gap) return json({ error: gap }, 503);

  const user = userFromRequest(request);
  if (!user) return json({ error: 'Sign in first' }, 401);

  try {
    const customer = await customerFor(user.email);
    if (!customer) return json({ error: 'No billing record yet' }, 404);
    const session = await stripe('billing_portal/sessions', {
      customer: customer.id,
      return_url: `${SITE}/newsletter/`
    });
    return json({ url: session.url });
  } catch (err) {
    console.error('portal failed', err);
    return json({ error: 'Could not open the billing portal' }, 500);
  }
}
