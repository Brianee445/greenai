import { supabase } from '../../lib/supabase';
import type { AdminProfile } from '../types';

const FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_FUNCTIONS_URL;

interface CheckAdminResponse {
  profile: AdminProfile;
  permissions: string[];
}

async function callAdminCheck(token?: string): Promise<CheckAdminResponse> {
  if (!token) {
    const { data: { session } } = await supabase.auth.getSession();
    token = session?.access_token ?? '';
  }

  const url = `${FUNCTIONS_URL}/v1-admin-check`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error('Not authorized');
    }
    const body = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(body.error ?? `HTTP ${response.status}`);
  }

  return response.json();
}

export async function checkAdminStatus(token?: string): Promise<CheckAdminResponse> {
  return callAdminCheck(token);
}
