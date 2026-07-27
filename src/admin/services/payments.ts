import { supabase } from '../../lib/supabase';

const FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_FUNCTIONS_URL;

export interface PaymentFunnel {
  total_attempts: number;
  succeeded: number;
  failed: number;
  abandoned: number;
  pending: number;
  conversion_rate: number;
  success_rate: number;
}

export interface PaymentRow {
  id: string;
  user_id: string;
  amount: number;
  currency: string;
  reference: string;
  status: string;
  payment_method: string | null;
  paid_at: string | null;
  created_at: string;
  profiles: { email: string; display_name: string | null };
}

interface PaymentsResponse {
  payments: PaymentRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  funnel: PaymentFunnel;
}

interface RevenueSeries {
  date: string;
  amount: number;
}

interface RevenueResponse {
  series: RevenueSeries[];
  total_revenue: number;
  total_transactions: number;
  revenue_by_plan: Record<string, number>;
  period: string;
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

export async function listPayments(params: {
  page?: number;
  pageSize?: number;
  status?: string;
}): Promise<PaymentsResponse> {
  const queryParams: Record<string, string> = {};
  if (params.page) queryParams.page = String(params.page);
  if (params.pageSize) queryParams.pageSize = String(params.pageSize);
  if (params.status) queryParams.status = params.status;
  return callFunction<PaymentsResponse>('v1-admin-payments', queryParams);
}

export async function getRevenueData(period: 'daily' | 'monthly' | 'yearly' = 'monthly'): Promise<RevenueResponse> {
  return callFunction<RevenueResponse>('v1-admin-revenue', { period });
}
