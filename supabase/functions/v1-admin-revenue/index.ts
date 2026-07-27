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
    await requireAdmin(supabase, req, { permission: 'payments.view' });

    const url = new URL(req.url);
    const period = url.searchParams.get('period') ?? 'monthly';

    let dateFrom: string;
    const now = new Date();

    if (period === 'daily') {
      dateFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    } else if (period === 'yearly') {
      dateFrom = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString();
    } else {
      dateFrom = new Date(now.getTime() - 12 * 30 * 24 * 60 * 60 * 1000).toISOString();
    }

    const { data: payments } = await supabase
      .from('payments')
      .select('amount, created_at, status')
      .eq('status', 'success')
      .gte('created_at', dateFrom)
      .order('created_at', { ascending: true });

    const successfulPayments = (payments ?? []) as { amount: number; created_at: string }[];

    // Aggregate into time buckets
    const aggregate: Record<string, number> = {};
    for (const p of successfulPayments) {
      const d = new Date(p.created_at);
      let key: string;
      if (period === 'daily') {
        key = d.toISOString().split('T')[0];
      } else if (period === 'yearly') {
        key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      } else {
        key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      }
      aggregate[key] = (aggregate[key] ?? 0) + Number(p.amount);
    }

    const series = Object.entries(aggregate).map(([date, amount]) => ({ date, amount }));

    const totalRevenue = successfulPayments.reduce((sum, p) => sum + Number(p.amount), 0);
    const totalTransactions = successfulPayments.length;

    const { data: planBreakdown } = await supabase
      .from('subscriptions')
      .select('plans!inner(display_name, monthly_price)')
      .eq('status', 'active');

    const byPlan: Record<string, number> = {};
    for (const sub of (planBreakdown ?? []) as Array<{ plans: { display_name: string; monthly_price: number } }>) {
      const name = sub.plans.display_name;
      byPlan[name] = (byPlan[name] ?? 0) + Number(sub.plans.monthly_price);
    }

    return new Response(
      JSON.stringify({
        series,
        total_revenue: totalRevenue,
        total_transactions: totalTransactions,
        revenue_by_plan: byPlan,
        period,
      }),
      { status: 200, headers: { ...headers, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    return errorResponse(error, headers);
  }
});
