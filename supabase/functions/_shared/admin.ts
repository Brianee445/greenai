import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';

const SB_URL = Deno.env.get('SB_URL') ?? '';
const SB_SERVICE_ROLE_KEY = Deno.env.get('SB_SERVICE_ROLE_KEY') ?? '';

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 60;

export function generateRequestId(): string {
  return crypto.randomUUID();
}

export function extractClientIp(req: Request): string | null {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0].trim();
    if (first) return first;
  }
  return req.headers.get('x-real-ip');
}

export interface AdminProfile {
  id: string;
  email: string;
  role: 'super_admin' | 'admin';
  display_name: string | null;
}

export interface AuditLogInput {
  action: string;
  target_type: string;
  target_id?: string;
  metadata?: Record<string, unknown>;
}

export class AuthError extends Error {
  constructor(message: string, public statusCode: number) {
    super(message);
    this.name = 'AuthError';
  }
}

async function checkRateLimit(
  supabase: ReturnType<typeof createClient>,
  ip: string,
  endpoint: string,
): Promise<void> {
  const now = Date.now();

  // Try to upsert — on conflict, increment. Reset window if expired.
  const { data } = await supabase
    .from('_rate_limits')
    .upsert(
      {
        ip_address: ip,
        endpoint,
        request_count: 1,
        window_start: new Date(now).toISOString(),
      },
      { onConflict: 'ip_address,endpoint', ignoreDuplicates: false },
    )
    .select('request_count, window_start')
    .single();

  if (!data) return;

  const windowAge = now - new Date(data.window_start as string).getTime();
  if (windowAge > RATE_LIMIT_WINDOW_MS) {
    // Window expired — reset by incrementing counter with new window
    await supabase
      .from('_rate_limits')
      .update({
        request_count: 1,
        window_start: new Date(now).toISOString(),
      })
      .eq('ip_address', ip)
      .eq('endpoint', endpoint);
    return;
  }

  if ((data.request_count as number) >= RATE_LIMIT_MAX) {
    throw new AuthError('Rate limit exceeded. Try again later.', 429);
  }

  // Increment counter
  await supabase.rpc('increment_rate_limit', {
    p_ip: ip,
    p_endpoint: endpoint,
  });
}

export async function requireAdmin(
  supabase: ReturnType<typeof createClient>,
  req: Request,
  options?: { permission?: string; audit?: AuditLogInput },
): Promise<{ user: { id: string; email?: string }; profile: AdminProfile }> {
  const requestId = generateRequestId();
  const ip = extractClientIp(req);
  const userAgent = req.headers.get('user-agent');

  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    throw new AuthError('Unauthorized', 401);
  }

  const endpoint = new URL(req.url).pathname;
  if (ip) {
    await checkRateLimit(supabase, ip, endpoint);
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (!profile) throw new AuthError('Profile not found', 401);
  if (profile.role === 'user') throw new AuthError('Not authorized', 403);
  if (profile.suspended_at) throw new AuthError('Account suspended', 403);
  if (profile.deleted_at) throw new AuthError('Account deactivated', 403);

  // Session revocation check
  if (profile.valid_from) {
    const validFrom = new Date(profile.valid_from).getTime();
    // Supabase JWT payload includes `iat` claim (issued-at, seconds since epoch)
    const jwtIat = (user.iat as number) ?? 0;
    if (validFrom > jwtIat * 1000) {
      throw new AuthError('Session expired. Please log in again.', 401);
    }
  }

  // Permission check
  if (options?.permission) {
    if (profile.role !== 'super_admin') {
      const { data: perm } = await supabase
        .from('admin_permissions')
        .select('id')
        .eq('admin_id', user.id)
        .eq('permission_key', options.permission)
        .is('deleted_at', null)
        .maybeSingle();

      if (!perm) throw new AuthError('Permission denied', 403);
    }
  }

  // Audit log
  if (options?.audit) {
    await supabase.from('admin_audit_logs').insert({
      admin_id: user.id,
      action: options.audit.action,
      target_type: options.audit.target_type,
      target_id: options.audit.target_id ?? null,
      metadata: options.audit.metadata ?? {},
      ip_address: ip,
      user_agent: userAgent,
      request_id: requestId,
    });
  }

  return {
    user: { id: user.id, email: user.email },
    profile: {
      id: profile.id,
      email: profile.email,
      role: profile.role,
      display_name: profile.display_name,
    },
  };
}

export function corsHeaders(origin?: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin ?? '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  };
}

export function handleCors(req: Request, headers: Record<string, string>): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers });
  }
  return null;
}

export function errorResponse(error: unknown, headers: Record<string, string>): Response {
  const status = error instanceof AuthError ? error.statusCode : 500;
  const message = error instanceof Error ? error.message : 'Internal server error';
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}

export function createServiceClient(): ReturnType<typeof createClient> {
  return createClient(SB_URL, SB_SERVICE_ROLE_KEY);
}
