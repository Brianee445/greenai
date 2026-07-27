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
    const page = parseInt(url.searchParams.get('page') ?? '1', 10);
    const pageSize = parseInt(url.searchParams.get('pageSize') ?? '20', 10);
    const status = url.searchParams.get('status') ?? '';
    const offset = (page - 1) * pageSize;

    let query = supabase
      .from('payments')
      .select('*, profiles!inner(email, display_name)', { count: 'exact' });

    if (status) {
      query = query.eq('status', status);
    }

    const { data: payments, count, error } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (error) throw error;

    const { data: funnel } = await supabase
      .from('payment_attempts')
      .select('status')
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

    const attempts = (funnel ?? []) as { status: string }[];
    const total = attempts.length;
    const succeeded = attempts.filter(a => a.status === 'success').length;
    const failed = attempts.filter(a => a.status === 'failed').length;
    const abandoned = attempts.filter(a => a.status === 'abandoned').length;
    const pending = attempts.filter(a => a.status === 'pending').length;

    return new Response(
      JSON.stringify({
        payments: payments ?? [],
        total: count ?? 0,
        page,
        pageSize,
        totalPages: Math.ceil((count ?? 0) / pageSize),
        funnel: {
          total_attempts: total,
          succeeded,
          failed,
          abandoned,
          pending,
          conversion_rate: total > 0 ? Math.round((succeeded / total) * 100) : 0,
          success_rate: total > 0 ? Math.round((succeeded / (succeeded + failed)) * 100) : 0,
        },
      }),
      { status: 200, headers: { ...headers, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    return errorResponse(error, headers);
  }
});
