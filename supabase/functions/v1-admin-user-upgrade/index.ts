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
    await requireAdmin(supabase, req, {
      permission: 'users.upgrade',
      audit: { action: 'USER_UPGRADED', target_type: 'user', target_id: undefined },
    });

    const { user_id, plan_id, billing_cycle } = await req.json();
    if (!user_id || !plan_id) {
      return new Response(JSON.stringify({ error: 'Missing user_id or plan_id' }), {
        status: 400,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }

    // Cancel existing active subscriptions
    const now = new Date().toISOString();
    await supabase
      .from('subscriptions')
      .update({ status: 'cancelled', cancelled_at: now, updated_at: now })
      .eq('user_id', user_id)
      .eq('status', 'active');

    // Create new subscription
    const { data, error } = await supabase
      .from('subscriptions')
      .insert({
        user_id,
        plan_id,
        status: 'active',
        billing_cycle: billing_cycle ?? 'monthly',
        start_date: now,
      })
      .select('*, plans(*)')
      .single();

    if (error) throw error;

    return new Response(
      JSON.stringify({ subscription: data }),
      { status: 200, headers: { ...headers, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    return errorResponse(error, headers);
  }
});
