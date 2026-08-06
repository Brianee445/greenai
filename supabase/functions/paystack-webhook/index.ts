import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';

const PAYSTACK_SECRET_KEY = Deno.env.get('PAYSTACK_SECRET_KEY') ?? '';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const SB_URL = Deno.env.get('SB_URL') ?? '';
const SB_SERVICE_ROLE_KEY = Deno.env.get('SB_SERVICE_ROLE_KEY') ?? '';

// Fail loudly at startup instead of silently making every DB call fail.
if (!PAYSTACK_SECRET_KEY) {
  console.error('FATAL: PAYSTACK_SECRET_KEY is not set.');
}
if (!SB_URL || !SB_SERVICE_ROLE_KEY) {
  console.error('FATAL: SB_URL / SB_SERVICE_ROLE_KEY is not set. Check `supabase secrets list` and confirm the names match exactly.');
}

const supabase = createClient(SB_URL, SB_SERVICE_ROLE_KEY);

async function verifyPaystackSignature(rawBody: string, signature: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(PAYSTACK_SECRET_KEY);
  const bodyData = encoder.encode(rawBody);
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['sign'],
  );
  const signatureBytes = await crypto.subtle.sign('HMAC', cryptoKey, bodyData);
  const computed = Array.from(new Uint8Array(signatureBytes))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return computed === signature;
}

// Small helper so every call is checked the same way and logs consistently.
async function run<T>(
  label: string,
  promise: PromiseLike<{ data: T; error: unknown }>,
): Promise<T> {
  const { data, error } = await promise;
  if (error) {
    console.error(`[${label}] Supabase error:`, JSON.stringify(error));
    throw new Error(`${label} failed: ${(error as { message?: string })?.message ?? 'unknown error'}`);
  }
  return data;
}

async function handleChargeSuccess(event: Record<string, unknown>) {
  const data = event.data as Record<string, unknown>;
  const metadata = (data.metadata as Record<string, unknown>) ?? {};
  const customer = (data.customer as Record<string, unknown>) ?? {};
  const authorization = (data.authorization as Record<string, unknown>) ?? {};
  const userId = metadata.user_id as string;
  const planId = metadata.plan_id as string;
  const billingCycle = metadata.billing_cycle as string;
  const reference = data.reference as string;
  const amount = data.amount as number;
  const paidAt = data.paid_at as string;

  if (!userId || !planId || !reference) {
    // This is a real, common failure mode worth calling out: if your
    // frontend doesn't pass `metadata: { user_id, plan_id, billing_cycle }`
    // when initializing the Paystack transaction, this throws on every
    // single charge.success event.
    throw new Error(
      `Missing required payment metadata (userId=${userId}, planId=${planId}, reference=${reference})`,
    );
  }

  const existingSubscription = await run(
    'select existing subscription',
    supabase
      .from('subscriptions')
      .select('id, status')
      .eq('user_id', userId)
      .in('status', ['active', 'cancelled'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  );

  const subscriptionData = {
    user_id: userId,
    plan_id: planId,
    status: 'active',
    billing_cycle: billingCycle ?? 'monthly',
    paystack_customer_code: (customer.customer_code as string) ?? null,
    paystack_subscription_code: (data.subscription_code as string) ?? null,
    start_date: paidAt ? new Date(paidAt).toISOString() : new Date().toISOString(),
    end_date: null,
    cancel_at_period_end: false,
    cancelled_at: null,
  };

  let subscriptionId: string;
  if (existingSubscription) {
    const updatedSub = await run(
      'update subscription',
      supabase
        .from('subscriptions')
        .update({ ...subscriptionData, updated_at: new Date().toISOString() })
        .eq('id', existingSubscription.id)
        .select('id')
        .single(),
    );
    subscriptionId = updatedSub?.id ?? existingSubscription.id;
  } else {
    const newSub = await run(
      'insert subscription',
      supabase.from('subscriptions').insert(subscriptionData).select('id').single(),
    );
    subscriptionId = newSub?.id ?? '';
  }

  await run(
    'insert payment',
    supabase.from('payments').insert({
      subscription_id: subscriptionId,
      amount,
      currency: 'NGN',
      reference,
      status: 'success',
      payment_method: (authorization.channel as string) ?? null,
      paid_at: paidAt ? new Date(paidAt).toISOString() : new Date().toISOString(),
      gateway_response: data as Record<string, unknown>,
    }),
  );

  const plan = await run(
    'select plan',
    supabase.from('plans').select('monthly_price, yearly_price').eq('id', planId).single(),
  );

  const isYearly = billingCycle === 'yearly';
  const periodDays = isYearly ? 365 : 30;
  const periodStart = paidAt ? new Date(paidAt) : new Date();
  const periodEnd = new Date(periodStart);
  periodEnd.setDate(periodEnd.getDate() + periodDays);

  await run(
    'insert invoice',
    supabase.from('invoices').insert({
      subscription_id: subscriptionId,
      amount,
      status: 'paid',
      period_start: periodStart.toISOString(),
      period_end: periodEnd.toISOString(),
      paid_at: new Date().toISOString(),
    }),
  );

  void plan; // currently unused beyond validation that the plan exists
}

async function handleChargeFailed(event: Record<string, unknown>) {
  const data = event.data as Record<string, unknown>;
  const reference = data.reference as string;
  if (!reference) return;

  await run(
    'update payment_attempts (failed)',
    supabase
      .from('payment_attempts')
      .update({ status: 'failed', updated_at: new Date().toISOString() })
      .eq('reference', reference),
  );

  await run(
    'insert payment (failed)',
    supabase.from('payments').insert({
      subscription_id: null,
      amount: (data.amount as number) ?? 0,
      currency: 'NGN',
      reference,
      status: 'failed',
      paid_at: null,
      gateway_response: data as Record<string, unknown>,
    }),
  );
}

async function handleSubscriptionNotRenew(event: Record<string, unknown>) {
  const data = event.data as Record<string, unknown>;
  const subscriptionCode = data.subscription_code as string;
  if (!subscriptionCode) return;

  const sub = await run(
    'select subscription by code',
    supabase
      .from('subscriptions')
      .select('id, user_id, plan_id')
      .eq('paystack_subscription_code', subscriptionCode)
      .single(),
  );

  if (sub) {
    const freePlan = await run(
      'select free plan',
      supabase.from('plans').select('id').eq('slug', 'free').maybeSingle(),
    );

    await run(
      'update subscription to expired',
      supabase
        .from('subscriptions')
        .update({
          status: 'expired',
          cancel_at_period_end: false,
          updated_at: new Date().toISOString(),
          plan_id: freePlan?.id ?? sub.plan_id,
          end_date: new Date().toISOString(),
        })
        .eq('id', sub.id),
    );
  }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (req.method !== 'POST') {
      return new Response('Method not allowed', { status: 405, headers: corsHeaders });
    }

    if (!PAYSTACK_SECRET_KEY || !SB_URL || !SB_SERVICE_ROLE_KEY) {
      console.error('Webhook received but server is misconfigured (missing env vars).');
      return new Response('Server misconfigured', { status: 500, headers: corsHeaders });
    }

    const rawBody = await req.text();
    const paystackSignature = req.headers.get('x-paystack-signature') ?? '';
    if (!paystackSignature) {
      console.error('Webhook rejected: missing x-paystack-signature header.');
      return new Response('Missing signature', { status: 401, headers: corsHeaders });
    }

    const isValid = await verifyPaystackSignature(rawBody, paystackSignature);
    if (!isValid) {
      // If you're seeing this in logs, PAYSTACK_SECRET_KEY almost certainly
      // doesn't match the mode (test vs live) Paystack is sending from.
      console.error('Webhook rejected: signature mismatch.');
      return new Response('Invalid signature', { status: 401, headers: corsHeaders });
    }

    const event = JSON.parse(rawBody);
    const eventType = event.event as string;
    // Prefer the payment reference over Date.now() for the fallback key —
    // a timestamp-based key defeats the purpose of idempotency if Paystack
    // ever retries the same event.
    const eventId = (event.data?.id as string) ?? (event.data?.reference as string) ?? `${eventType}-${Date.now()}`;

    let existingEvent;
    try {
      existingEvent = await run(
        'select existing webhook_event',
        supabase.from('webhook_events').select('id, status').eq('idempotency_key', eventId).maybeSingle(),
      );
    } catch (err) {
      console.error('Could not check webhook_events table — check table/column names against the schema:', err);
      return new Response('Internal server error', { status: 500, headers: corsHeaders });
    }

    if (existingEvent) {
      return new Response('OK', { status: 200, headers: corsHeaders });
    }

    try {
      await run(
        'insert webhook_event',
        supabase.from('webhook_events').insert({
          event_type: eventType,
          paystack_signature: paystackSignature,
          raw_body: event,
          status: 'received',
          idempotency_key: eventId,
        }),
      );
    } catch (err) {
      // This is the insert that was failing silently before. Now it's
      // logged AND we return a 500 so Paystack retries the webhook
      // instead of marking it delivered.
      console.error('Failed to record webhook_event — nothing else will run:', err);
      return new Response('Internal server error', { status: 500, headers: corsHeaders });
    }

    try {
      switch (eventType) {
        case 'charge.success':
          await handleChargeSuccess(event);
          break;
        case 'charge.failed':
          await handleChargeFailed(event);
          break;
        case 'subscription.not_renew':
          await handleSubscriptionNotRenew(event);
          break;
        default:
          console.log(`Unhandled event type: ${eventType}`);
      }
      await run(
        'mark webhook_event processed',
        supabase
          .from('webhook_events')
          .update({ status: 'processed', processed_at: new Date().toISOString() })
          .eq('idempotency_key', eventId),
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Handler for "${eventType}" failed:`, errorMessage);
      try {
        await run(
          'mark webhook_event failed',
          supabase
            .from('webhook_events')
            .update({ status: 'failed', error_message: errorMessage })
            .eq('idempotency_key', eventId),
        );
      } catch (innerErr) {
        console.error('Additionally failed to record the failure status:', innerErr);
      }
      // Still return 200 here (Paystack event was received and logged,
      // just failed to apply) — but now you have a row in webhook_events
      // with status='failed' and a real error_message to debug from.
    }

    return new Response('OK', { status: 200, headers: corsHeaders });
  } catch (error) {
    console.error('Webhook error:', error instanceof Error ? error.stack : error);
    return new Response('Internal server error', { status: 500, headers: corsHeaders });
  }
});
