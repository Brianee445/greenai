import { supabase } from '../../lib/supabase';

const FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_FUNCTIONS_URL;

export interface DashboardStats {
  total_users: number;
  users_today: number;
  revenue_today: number;
  active_chats: number;
  failed_payments_today: number;
  conversations_today: number;
}

async function callFunction<T>(name: string): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token ?? '';

  const response = await fetch(`${FUNCTIONS_URL}/${name}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(body.error ?? `HTTP ${response.status}`);
  }

  return response.json();
}

export async function getDashboardStats(): Promise<DashboardStats> {
  return callFunction<DashboardStats>('v1-admin-dashboard');
}
