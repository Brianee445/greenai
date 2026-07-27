import { supabase } from '../../lib/supabase';

const FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_FUNCTIONS_URL;

export interface ConversationRow {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
  profiles: { email: string; display_name: string | null };
}

export interface MessageRow {
  id: string;
  conversation_id: string;
  user_id: string;
  role: 'user' | 'ai';
  content: string;
  mode: string | null;
  model: string | null;
  liked: boolean;
  disliked: boolean;
  created_at: string;
}

interface ConversationsResponse {
  conversations: ConversationRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface ConversationDetailResponse {
  conversation: ConversationRow;
  messages: MessageRow[];
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

export async function listConversations(params: {
  page?: number;
  pageSize?: number;
  search?: string;
}): Promise<ConversationsResponse> {
  const queryParams: Record<string, string> = {};
  if (params.page) queryParams.page = String(params.page);
  if (params.pageSize) queryParams.pageSize = String(params.pageSize);
  if (params.search) queryParams.search = params.search;
  return callFunction<ConversationsResponse>('v1-admin-conversations', queryParams);
}

export async function getConversationDetail(id: string): Promise<ConversationDetailResponse> {
  return callFunction<ConversationDetailResponse>('v1-admin-conversation-detail', { id });
}
