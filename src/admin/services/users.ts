import { supabase } from '../../lib/supabase';
import type { Profile } from '../../types/database';

const FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_FUNCTIONS_URL;

interface PaginatedResponse<T> {
  users: (Profile & T)[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface UserDetailResponse {
  profile: Profile;
  subscriptions: unknown[];
  payments: unknown[];
  conversations: unknown[];
  usage_logs: unknown[];
}

type QueryParams = Record<string, string>;

async function callFunction<T>(name: string, params?: QueryParams): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token ?? '';

  const searchParams = params ? '?' + new URLSearchParams(params).toString() : '';
  const response = await fetch(`${FUNCTIONS_URL}/${name}${searchParams}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(body.error ?? `HTTP ${response.status}`);
  }

  return response.json();
}

export async function listUsers(params: {
  page?: number;
  pageSize?: number;
  search?: string;
  role?: string;
  status?: string;
}): Promise<PaginatedResponse<Record<string, unknown>>> {
  const queryParams: QueryParams = {};
  if (params.page) queryParams.page = String(params.page);
  if (params.pageSize) queryParams.pageSize = String(params.pageSize);
  if (params.search) queryParams.search = params.search;
  if (params.role) queryParams.role = params.role;
  if (params.status) queryParams.status = params.status;

  return callFunction<PaginatedResponse<Record<string, unknown>>>('v1-admin-users', queryParams);
}

export async function getUserDetail(userId: string): Promise<UserDetailResponse> {
  return callFunction<UserDetailResponse>('v1-admin-user-detail', { id: userId });
}

export async function banUser(userId: string, reason?: string): Promise<void> {
  await callFunction<{ success: boolean }>('v1-admin-user-ban', {});
  // POST based — need a different approach since callFunction uses GET
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token ?? '';
  await fetch(`${FUNCTIONS_URL}/v1-admin-user-ban`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ user_id: userId, reason }),
  });
}

export async function unbanUser(userId: string): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token ?? '';
  await fetch(`${FUNCTIONS_URL}/v1-admin-user-unban`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ user_id: userId }),
  });
}

export async function changeUserPlan(
  userId: string,
  planId: string,
  action: 'upgrade' | 'downgrade',
  billingCycle?: string,
): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token ?? '';
  const fnName = action === 'upgrade' ? 'v1-admin-user-upgrade' : 'v1-admin-user-downgrade';
  await fetch(`${FUNCTIONS_URL}/${fnName}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ user_id: userId, plan_id: planId, billing_cycle: billingCycle ?? 'monthly' }),
  });
}
