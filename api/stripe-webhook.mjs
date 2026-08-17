/* POST /api/stripe-webhook — Stripe tells us when a subscription starts,
   renews, lapses or is cancelled, and we mirror that onto the subscriber row.

   This endpoint is public, so the signature check is the only thing standing
   between the internet and "everyone is a paying subscriber". It is done by
   hand here rather than with the Stripe SDK; the raw request body must be
   hashed exactly as sent, which is why this reads request.text() and never
   request.json(). */
import crypto from 'node:crypto';
import { stripe, db, updateSubscriber, json, missingEnv } from '../lib/api.mjs';

const TOLERANCE_SECONDS = 300;

function signatureIsValid(raw, header, secret) {
  if (!header) return false;
  let timestamp = null;
  const signatures = [];
  for (const part of header.split(',')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    const key = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();
    if (key === 't') timestamp = value;
    else if (key === 'v1') signatures.push(value);   // Stripe may send several
  }
  if (!timestamp || !signatures.length) return false;

  // Reject replays of an old, already-valid payload.
  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!Number.isFinite(age) || age > TOLERANCE_SECONDS) return false;

  const expected = crypto.createHmac('sha256', secret)
    .update(`${timestamp}.${raw}`, 'utf8').digest('hex');
  const expectedBuf = Buffer.from(expected, 'utf8');

  return signatures.some(sig => {
    const sigBuf = Buffer.from(sig, 'utf8');
    return sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf);
  });
}

const STATUS = {
  active: 'active', trialing: 'active',
  past_due: 'past_due', unpaid: 'past_due',
  canceled: 'canceled', incomplete_expired: 'canceled'
};

/* current_period_end sits on the subscription in older API versions and on the
   subscription item in newer ones. Take whichever is present. */
function periodEnd(sub) {
  const item = sub.items && sub.items.data && sub.items.data[0];
  const ts = sub.current_period_end || (item && item.current_period_end);
  return ts ? new Date(ts * 1000).toISOString() : null;
}

async function applySubscription(sub) {
  const patch = {
    newsletter_status: STATUS[sub.status] || 'free',
    stripe_subscription_id: sub.id,
    current_period_end: periodEnd(sub)
  };
  const userId = sub.metadata && sub.metadata.supabase_user_id;
  if (userId) await updateSubscriber(['id', userId], patch);
  else if (sub.customer) await updateSubscriber(['stripe_customer_id', sub.customer], patch);
}

export async function POST(request) {
  const gap = missingEnv('STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY');
  if (gap) return json({ error: gap }, 503);

  const raw = await request.text();
  if (!signatureIsValid(raw, request.headers.get('stripe-signature'), process.env.STRIPE_WEBHOOK_SECRET)) {
    return json({ error: 'Bad signature' }, 400);
  }

  let event;
  try { event = JSON.parse(raw); } catch { return json({ error: 'Bad payload' }, 400); }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        if (session.subscription) {
          // Re-fetch rather than trusting the session: this is the authoritative status.
          const sub = await stripe(`subscriptions/${session.subscription}`, null, 'GET');
          if (!sub.metadata || !sub.metadata.supabase_user_id) {
            if (session.client_reference_id) sub.metadata = { supabase_user_id: session.client_reference_id };
          }
          if (session.customer && session.client_reference_id) {
            await updateSubscriber(['id', session.client_reference_id], { stripe_customer_id: session.customer });
          }
          await applySubscription(sub);
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await applySubscription(event.data.object);
        break;
      default:
        break;   // everything else is acknowledged and ignored
    }
  } catch (err) {
    // 500 makes Stripe retry, which is what we want for a transient DB failure.
    console.error('webhook handling failed', event.type, err);
    return json({ error: 'Handler failed' }, 500);
  }

  return json({ received: true });
}
