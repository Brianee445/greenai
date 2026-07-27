import { supabase } from '../../lib/supabase';

const FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_FUNCTIONS_URL;

export interface UsageStats {
  total_messages: number;
  messages_today: number;
  total_uploads: number;
  uploads_today: number;
  daily_usage: { date: string; count: number }[];
  model_breakdown: Record<string, number>;
  top_users: { user_id: string; count: number }[];
}

export async function getUsageStats(): Promise<UsageStats> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token ?? '';

  const response = await fetch(`${FUNCTIONS_URL}/v1-admin-usage`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(body.error ?? `HTTP ${response.status}`);
  }

  return response.json();
}
