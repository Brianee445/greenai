import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';

export async function grantPermission(
  supabase: ReturnType<typeof createClient>,
  adminId: string,
  permissionKey: string,
  grantedBy: string,
): Promise<void> {
  // Verify permission exists and is not super_admin_only
  const { data: perm } = await supabase
    .from('permissions')
    .select('super_admin_only')
    .eq('permission_key', permissionKey)
    .single();

  if (!perm) throw new Error(`Permission "${permissionKey}" not found`);
  if (perm.super_admin_only) {
    throw new Error(`Cannot grant "${permissionKey}" to non-super-admin`);
  }

  const { error } = await supabase.from('admin_permissions').upsert(
    {
      admin_id: adminId,
      permission_key: permissionKey,
      granted_by: grantedBy,
      deleted_at: null,
    },
    { onConflict: 'admin_id,permission_key' },
  );

  if (error) throw error;
}

export async function revokePermission(
  supabase: ReturnType<typeof createClient>,
  adminId: string,
  permissionKey: string,
): Promise<void> {
  const { error } = await supabase
    .from('admin_permissions')
    .update({ deleted_at: new Date().toISOString() })
    .eq('admin_id', adminId)
    .eq('permission_key', permissionKey)
    .is('deleted_at', null);

  if (error) throw error;
}

export async function getAdminPermissions(
  supabase: ReturnType<typeof createClient>,
  adminId: string,
): Promise<string[]> {
  const { data } = await supabase
    .from('admin_permissions')
    .select('permission_key')
    .eq('admin_id', adminId)
    .is('deleted_at', null);

  return (data ?? []).map((r: { permission_key: string }) => r.permission_key);
}
