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
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const [
      { count: totalMessages },
      { count: messagesToday },
      { count: totalUploads },
      { count: uploadsToday },
      { data: dailyUsage },
      { data: modelUsage },
      { data: topUsers },
    ] = await Promise.all([
      supabase.from('usage_logs').select('id', { count: 'exact', head: true }).eq('action', 'chat_message'),
      supabase.from('usage_logs').select('id', { count: 'exact', head: true }).eq('action', 'chat_message').gte('created_at', today),
      supabase.from('usage_logs').select('id', { count: 'exact', head: true }).eq('action', 'file_upload'),
      supabase.from('usage_logs').select('id', { count: 'exact', head: true }).eq('action', 'file_upload').gte('created_at', today),
      supabase.from('daily_chat_usage').select('date, count').gte('date', thirtyDaysAgo).order('date', { ascending: true }),
      supabase.from('messages').select('model').not('model', 'is', null),
      supabase.from('usage_logs').select('user_id, profiles!inner(email, display_name)').order('created_at', { ascending: false }).limit(20),
    ]);

    const modelBreakdown: Record<string, number> = {};
    for (const m of (modelUsage ?? []) as { model: string }[]) {
      const name = m.model || 'unknown';
      modelBreakdown[name] = (modelBreakdown[name] ?? 0) + 1;
    }

    const userCounts: Record<string, number> = {};
    for (const u of (topUsers ?? []) as { user_id: string }[]) {
      userCounts[u.user_id] = (userCounts[u.user_id] ?? 0) + 1;
    }

    const sortedTopUsers = Object.entries(userCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10);

    return new Response(
      JSON.stringify({
        total_messages: totalMessages ?? 0,
        messages_today: messagesToday ?? 0,
        total_uploads: totalUploads ?? 0,
        uploads_today: uploadsToday ?? 0,
        daily_usage: dailyUsage ?? [],
        model_breakdown: modelBreakdown,
        top_users: sortedTopUsers.map(([user_id, count]) => ({ user_id, count })),
      }),
      { status: 200, headers: { ...headers, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    return errorResponse(error, headers);
  }
});
