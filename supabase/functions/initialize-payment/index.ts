import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';

const PAYSTACK_SECRET_KEY = Deno.env.get('PAYSTACK_SECRET_KEY') ?? '';
const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const SB_URL = Deno.env.get('SB_URL') ?? '';
const SB_SERVICE_ROLE_KEY = Deno.env.get('SB_SERVICE_ROLE_KEY') ?? '';
const APP_URL = Deno.env.get('APP_URL') ?? 'http://localhost:5173';
const supabase = createClient(SB_URL, SB_SERVICE_ROLE_KEY);

async function paystackPost(path: string, body: Record<string, unknown>) {
  const res = await fetch(`https://api.paystack.co${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return res.json();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { plan_id, billing_cycle } = await req.json();
    if (!plan_id || !billing_cycle) {
      return new Response(JSON.stringify({ error: 'Missing plan_id or billing_cycle' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!['monthly', 'yearly'].includes(billing_cycle)) {
      return new Response(JSON.stringify({ error: 'Invalid billing_cycle' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { data: plan, error: planError } = await supabase
      .from('plans')
      .select('*')
      .eq('id', plan_id)
      .eq('active', true)
      .single();
    if (planError || !plan) {
      return new Response(JSON.stringify({ error: 'Plan not found or inactive' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (plan.slug === 'free') {
      return new Response(JSON.stringify({ error: 'Cannot upgrade to free plan' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const amount = billing_cycle === 'yearly' ? plan.yearly_price : plan.monthly_price;
    if (amount <= 0) {
      return new Response(JSON.stringify({ error: 'Invalid plan price' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const paystackRes = await paystackPost('/transaction/initialize', {
      email: user.email,
      amount,
      currency: 'NGN',
      callback_url: `${APP_URL}/billing?session_id={transaction_reference}`,
      metadata: {
        user_id: user.id,
        plan_id: plan.id,
        billing_cycle,
      },
    });
    if (!paystackRes.status) {
      return new Response(JSON.stringify({ error: 'Payment initialization failed' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { data: paymentAttempt } = await supabase
      .from('payment_attempts')
      .insert({
        user_id: user.id,
        plan_id: plan.id,
        billing_cycle,
        reference: paystackRes.data.reference,
        authorization_url: paystackRes.data.authorization_url,
        access_code: paystackRes.data.access_code,
        status: 'pending',
        metadata: {
          plan_slug: plan.slug,
          plan_name: plan.display_name,
          amount,
        },
      })
      .select('id')
      .single();
    return new Response(
      JSON.stringify({
        authorization_url: paystackRes.data.authorization_url,
        reference: paystackRes.data.reference,
        payment_attempt_id: paymentAttempt?.id,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Initialize payment error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
