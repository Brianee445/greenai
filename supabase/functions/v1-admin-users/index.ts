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
    const page = parseInt(url.searchParams.get('page') ?? '1', 10);
    const pageSize = parseInt(url.searchParams.get('pageSize') ?? '20', 10);
    const search = url.searchParams.get('search') ?? '';
    const role = url.searchParams.get('role') ?? '';
    const status = url.searchParams.get('status') ?? '';

    const offset = (page - 1) * pageSize;

    let query = supabase.from('profiles').select('*', { count: 'exact' });

    if (search) {
      query = query.or(`email.ilike.%${search}%,display_name.ilike.%${search}%`);
    }
    if (role) {
      query = query.eq('role', role);
    }
    if (status === 'banned') {
      query = query.not('banned_at', 'is', null);
    } else if (status === 'suspended') {
      query = query.not('suspended_at', 'is', null);
    } else if (status === 'deleted') {
      query = query.not('deleted_at', 'is', null);
    } else if (status === 'active') {
      query = query.is('banned_at', null).is('suspended_at', null).is('deleted_at', null);
    }

    const { data: users, count, error } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (error) throw error;

    return new Response(
      JSON.stringify({
        users: users ?? [],
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
