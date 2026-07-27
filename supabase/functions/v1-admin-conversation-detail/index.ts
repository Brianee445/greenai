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
    const id = url.searchParams.get('id');
    if (!id) {
      return new Response(JSON.stringify({ error: 'Missing conversation id' }), {
        status: 400,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }

    const [convRes, messagesRes] = await Promise.all([
      supabase.from('conversations').select('*, profiles!inner(email, display_name)').eq('id', id).single(),
      supabase.from('messages').select('*').eq('conversation_id', id).order('created_at', { ascending: true }),
    ]);

    if (convRes.error) {
      return new Response(JSON.stringify({ error: 'Conversation not found' }), {
        status: 404,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }

    return new Response(
      JSON.stringify({
        conversation: convRes.data,
        messages: messagesRes.data ?? [],
      }),
      { status: 200, headers: { ...headers, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    return errorResponse(error, headers);
  }
});
