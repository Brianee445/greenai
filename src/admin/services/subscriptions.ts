import { supabase } from '../../lib/supabase';

const FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_FUNCTIONS_URL;

export interface SubscriptionRow {
  id: string;
  user_id: string;
  plan_id: string;
  status: string;
  billing_cycle: string | null;
  paystack_customer_code: string | null;
  paystack_subscription_code: string | null;
  start_date: string;
  end_date: string | null;
  cancel_at_period_end: boolean;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
  plans: { id: string; display_name: string; slug: string; monthly_price: number } | null;
  profiles: { email: string; display_name: string | null };
}

interface SubscriptionsResponse {
  subscriptions: SubscriptionRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface SubscriptionDetailResponse {
  subscription: SubscriptionRow & { profiles: { email: string; display_name: string | null } };
  payments: unknown[];
  invoices: unknown[];
}

async function callFunction<T>(name: string, params?: Record<string, string>): Promise<T> {
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

export async function listSubscriptions(params: {
  page?: number;
  pageSize?: number;
  status?: string;
  plan_id?: string;
  search?: string;
}): Promise<SubscriptionsResponse> {
  const queryParams: Record<string, string> = {};
  if (params.page) queryParams.page = String(params.page);
  if (params.pageSize) queryParams.pageSize = String(params.pageSize);
  if (params.status) queryParams.status = params.status;
  if (params.plan_id) queryParams.plan_id = params.plan_id;
  if (params.search) queryParams.search = params.search;
  return callFunction<SubscriptionsResponse>('v1-admin-subscriptions', queryParams);
}

export async function getSubscriptionDetail(id: string): Promise<SubscriptionDetailResponse> {
  return callFunction<SubscriptionDetailResponse>('v1-admin-subscription-detail', { id });
}

export async function cancelSubscription(subscriptionId: string, cancelImmediately?: boolean): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token ?? '';
  await fetch(`${FUNCTIONS_URL}/v1-admin-subscription-cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ subscription_id: subscriptionId, cancel_immediately: cancelImmediately ?? false }),
  });
}
