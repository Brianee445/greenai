import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import {
  requireAdmin,
  corsHeaders,
  handleCors,
  errorResponse,
  createServiceClient,
} from '../_shared/admin.ts';

serve(async (req) => {
  const headers = corsHeaders();
  const cors = handleCors(req, headers);
  if (cors) return cors;

  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createServiceClient();
    const { user } = await requireAdmin(supabase, req, {
      permission: 'subscriptions.manage',
      audit: { action: 'cancel_subscription', target_type: 'subscription' },
    });

    const { subscription_id, cancel_immediately } = await req.json();
    if (!subscription_id) {
      return new Response(JSON.stringify({ error: 'Missing subscription_id' }), {
        status: 400,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }

    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('*, plans!inner(slug)')
      .eq('id', subscription_id)
      .single();

    if (!subscription) {
      return new Response(JSON.stringify({ error: 'Subscription not found' }), {
        status: 404,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }

    if (subscription.plans?.slug === 'free') {
      return new Response(JSON.stringify({ error: 'Cannot cancel free plan' }), {
        status: 400,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }

    const now = new Date().toISOString();
    const updates: Record<string, unknown> = {
      cancel_at_period_end: !cancel_immediately,
      cancelled_at: now,
      updated_at: now,
    };

    if (cancel_immediately) {
      updates.status = 'cancelled';
      updates.end_date = now;
    }

    const { error: updateError } = await supabase
      .from('subscriptions')
      .update(updates)
      .eq('id', subscription_id);

    if (updateError) throw updateError;

    const { data: updated } = await supabase
      .from('subscriptions')
      .select('*, plans(*), profiles!inner(email, display_name)')
      .eq('id', subscription_id)
      .single();

    return new Response(
      JSON.stringify({ subscription: updated }),
      { status: 200, headers: { ...headers, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    return errorResponse(error, headers);
  }
});
