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
    await requireAdmin(supabase, req, { permission: 'subscriptions.manage' });

    const url = new URL(req.url);
    const page = parseInt(url.searchParams.get('page') ?? '1', 10);
    const pageSize = parseInt(url.searchParams.get('pageSize') ?? '20', 10);
    const status = url.searchParams.get('status') ?? '';
    const planId = url.searchParams.get('plan_id') ?? '';
    const search = url.searchParams.get('search') ?? '';
    const offset = (page - 1) * pageSize;

    let query = supabase
      .from('subscriptions')
      .select('*, plans(*), profiles!inner(email, display_name)', { count: 'exact' });

    if (status) {
      query = query.eq('status', status);
    }
    if (planId) {
      query = query.eq('plan_id', planId);
    }
    if (search) {
      query = query.or(
        `profiles.email.ilike.%${search}%,profiles.display_name.ilike.%${search}%`,
      );
    }

    const { data: subscriptions, count, error } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (error) throw error;

    return new Response(
      JSON.stringify({
        subscriptions: subscriptions ?? [],
        total: count ?? 0,
        page,
        pageSize,
        totalPages: Math.ceil((count ?? 0) / pageSize),
      }),
      { status: 200, headers: { ...headers, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    return errorResponse(error, headers);
  }
});
