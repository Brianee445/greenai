import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders, handleCors, errorResponse, createServiceClient } from '../_shared/admin.ts';

const KNOWN_EVENT_TYPES = new Set([
  'USER_REGISTERED', 'USER_LOGIN',
  'CHAT_STARTED', 'CHAT_COMPLETED', 'PROMPT_SENT', 'RESPONSE_GENERATED',
  'IMAGE_GENERATED', 'FILE_UPLOADED',
  'PAYMENT_STARTED', 'PAYMENT_SUCCESS', 'PAYMENT_FAILED',
  'SUBSCRIPTION_CREATED', 'SUBSCRIPTION_RENEWED', 'SUBSCRIPTION_CANCELLED',
  'USER_BANNED', 'USER_UNBANNED',
  'FEATURE_FLAG_ENABLED', 'FEATURE_FLAG_DISABLED',
]);

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
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace('Bearer ', '');
    const { data: { user } } = await supabase.auth.getUser(token);

    const { event_type, metadata } = await req.json();
    if (!event_type || typeof event_type !== 'string') {
      return new Response(JSON.stringify({ error: 'event_type is required' }), {
        status: 400,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }

    if (!KNOWN_EVENT_TYPES.has(event_type)) {
      return new Response(JSON.stringify({ error: `Unknown event type: ${event_type}` }), {
        status: 400,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }

    const sessionId = crypto.randomUUID();

    await supabase.from('analytics_events').insert({
      event_type,
      user_id: user?.id ?? null,
      session_id: sessionId,
      metadata: metadata ?? {},
    });

    return new Response(
      JSON.stringify({ success: true, session_id: sessionId }),
      { status: 201, headers: { ...headers, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    return errorResponse(error, headers);
  }
});
