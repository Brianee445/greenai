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

    const url = new URL(req.url);
    const page = parseInt(url.searchParams.get('page') ?? '1', 10);
    const pageSize = parseInt(url.searchParams.get('pageSize') ?? '20', 10);
    const search = url.searchParams.get('search') ?? '';
    const offset = (page - 1) * pageSize;

    let query = supabase
      .from('conversations')
      .select('*, profiles!inner(email, display_name)', { count: 'exact' });

    if (search) {
      query = query.or(
        `title.ilike.%${search}%,profiles.email.ilike.%${search}%`,
      );
    }

    const { data: conversations, count, error } = await query
      .order('updated_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (error) throw error;

    const conversationsWithCounts = await Promise.all(
      (conversations ?? []).map(async (conv) => {
        const { count: msgCount } = await supabase
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .eq('conversation_id', conv.id);
        return { ...conv, message_count: msgCount ?? 0 };
      }),
    );

    return new Response(
      JSON.stringify({
        conversations: conversationsWithCounts,
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
