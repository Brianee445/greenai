import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import {
  requireAdmin,
  corsHeaders,
  handleCors,
  errorResponse,
  createServiceClient,
} from '../_shared/admin.ts';
import { getAdminPermissions } from '../_shared/managePermissions.ts';

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
    const { user, profile } = await requireAdmin(supabase, req);

    // Fetch the admin's assigned permissions
    let permissions: string[] = [];
    if (profile.role === 'super_admin') {
      // Super admin gets all non-super_admin_only permissions
      const { data: allPerms } = await supabase
        .from('permissions')
        .select('permission_key');
      permissions = (allPerms ?? []).map((p: { permission_key: string }) => p.permission_key);
    } else {
      permissions = await getAdminPermissions(supabase, user.id);
    }

    return new Response(
      JSON.stringify({
        profile: {
          id: profile.id,
          email: profile.email,
          role: profile.role,
          display_name: profile.display_name,
        },
        permissions,
      }),
      { status: 200, headers: { ...headers, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    return errorResponse(error, headers);
  }
});
