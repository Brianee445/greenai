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
    const id = url.searchParams.get('id');
    if (!id) {
      return new Response(JSON.stringify({ error: 'Missing subscription id' }), {
        status: 400,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }

    const [subRes, paymentsRes, invoicesRes] = await Promise.all([
      supabase.from('subscriptions').select('*, plans(*), profiles!inner(email, display_name)').eq('id', id).single(),
      supabase.from('payments').select('*').eq('subscription_id', id).order('created_at', { ascending: false }).limit(20),
      supabase.from('invoices').select('*').eq('subscription_id', id).order('period_start', { ascending: false }).limit(20),
    ]);

    if (subRes.error) {
      return new Response(JSON.stringify({ error: 'Subscription not found' }), {
        status: 404,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }

    return new Response(
      JSON.stringify({
        subscription: subRes.data,
        payments: paymentsRes.data ?? [],
        invoices: invoicesRes.data ?? [],
      }),
      { status: 200, headers: { ...headers, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    return errorResponse(error, headers);
  }
});
