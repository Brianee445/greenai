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
    if (req.method !== 'GET') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createServiceClient();
    await requireAdmin(supabase, req, { permission: 'users.view' });

    const url = new URL(req.url);
    const userId = url.searchParams.get('id');
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Missing user id' }), {
        status: 400,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }

    const [profileRes, subscriptionsRes, paymentsRes, conversationsRes, usageRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).single(),
      supabase.from('subscriptions').select('*, plans(*)').eq('user_id', userId).order('created_at', { ascending: false }),
      supabase.from('payments').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(20),
      supabase.from('conversations').select('*').eq('user_id', userId).order('updated_at', { ascending: false }).limit(20),
      supabase.from('usage_logs').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(50),
    ]);

    if (profileRes.error) {
      return new Response(JSON.stringify({ error: 'User not found' }), {
        status: 404,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }

    return new Response(
      JSON.stringify({
        profile: profileRes.data,
        subscriptions: subscriptionsRes.data ?? [],
        payments: paymentsRes.data ?? [],
        conversations: conversationsRes.data ?? [],
        usage_logs: usageRes.data ?? [],
      }),
      { status: 200, headers: { ...headers, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    return errorResponse(error, headers);
  }
});
