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
    await requireAdmin(supabase, req, { permission: 'analytics.view' });

    const today = new Date().toISOString().split('T')[0];

    const [
      { count: totalUsers },
      { count: usersToday },
      { data: revenueToday },
      { data: activeChats },
      { data: failedPayments },
      { count: openTickets },
    ] = await Promise.all([
      supabase.from('profiles').select('id', { count: 'exact', head: true }).is('deleted_at', null),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', today),
      supabase.from('payments').select('amount').eq('status', 'success').gte('created_at', today),
      supabase.from('conversations').select('id', { count: 'exact', head: true }).gte('updated_at', new Date(Date.now() - 15 * 60 * 1000).toISOString()),
      supabase.from('payment_attempts').select('id', { count: 'exact', head: true }).eq('status', 'failed').gte('created_at', today),
      supabase.from('conversations').select('id', { count: 'exact', head: true }).gte('created_at', today),
    ]);

    const revenueTotal = (revenueToday as { amount: number }[] ?? []).reduce((sum, p) => sum + Number(p.amount), 0);

    return new Response(
      JSON.stringify({
        total_users: totalUsers ?? 0,
        users_today: usersToday ?? 0,
        revenue_today: revenueTotal,
        active_chats: activeChats ?? 0,
        failed_payments_today: failedPayments ?? 0,
        conversations_today: openTickets ?? 0,
      }),
      { status: 200, headers: { ...headers, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    return errorResponse(error, headers);
  }
});
