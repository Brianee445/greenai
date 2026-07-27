export type UserRole = 'user' | 'admin' | 'super_admin';

export interface Profile {
  id: string;
  email: string | null;
  role: UserRole;
  display_name: string | null;
  banned_at: string | null;
  suspended_at: string | null;
  ban_reason: string | null;
  deleted_at: string | null;
  valid_from: string;
  created_at: string;
  updated_at: string;
}

export interface NewProfile {
  id: string;
  email?: string | null;
  role?: UserRole;
  display_name?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface UpdateProfile {
  email?: string | null;
  display_name?: string | null;
  role?: UserRole;
  updated_at?: string;
}

export interface Plan {
  id: string;
  slug: string;
  display_name: string;
  monthly_price: number;
  yearly_price: number;
  model_name: string;
  upload_limit: number;
  daily_chat_limit: number;
  max_file_size: number;
  active: boolean;
  created_at: string;
}

export interface NewPlan {
  slug: string;
  display_name: string;
  monthly_price?: number;
  yearly_price?: number;
  model_name: string;
  upload_limit?: number;
  daily_chat_limit?: number;
  max_file_size?: number;
  active?: boolean;
}

export interface Subscription {
  id: string;
  user_id: string;
  plan_id: string;
  status: 'active' | 'cancelled' | 'expired' | 'past_due';
  billing_cycle: 'monthly' | 'yearly' | 'free' | null;
  paystack_customer_code: string | null;
  paystack_subscription_code: string | null;
  start_date: string;
  end_date: string | null;
  cancel_at_period_end: boolean;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface NewSubscription {
  user_id: string;
  plan_id: string;
  status?: string;
  billing_cycle?: string;
  paystack_customer_code?: string;
  paystack_subscription_code?: string;
  start_date?: string;
  end_date?: string;
  cancel_at_period_end?: boolean;
}

export interface Payment {
  id: string;
  user_id: string;
  subscription_id: string | null;
  amount: number;
  currency: string;
  reference: string;
  status: 'success' | 'failed' | 'pending';
  payment_method: string | null;
  paid_at: string | null;
  gateway_response: Record<string, unknown>;
  created_at: string;
}

export interface PaymentAttempt {
  id: string;
  user_id: string;
  plan_id: string;
  billing_cycle: 'monthly' | 'yearly';
  reference: string;
  authorization_url: string | null;
  access_code: string | null;
  status: 'pending' | 'success' | 'failed' | 'abandoned';
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Invoice {
  id: string;
  user_id: string;
  subscription_id: string;
  payment_id: string | null;
  amount: number;
  currency: string;
  status: 'paid' | 'unpaid' | 'void';
  period_start: string;
  period_end: string;
  paid_at: string | null;
  invoice_url: string | null;
  created_at: string;
}

export interface WebhookEvent {
  id: string;
  event_type: string;
  paystack_signature: string;
  raw_body: Record<string, unknown>;
  status: 'received' | 'processed' | 'failed';
  idempotency_key: string | null;
  error_message: string | null;
  processed_at: string | null;
  created_at: string;
}

export interface UsageLog {
  id: string;
  user_id: string;
  action: 'chat_message' | 'file_upload';
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface DailyChatUsage {
  id: string;
  user_id: string;
  date: string;
  count: number;
  created_at: string;
  updated_at: string;
}

export interface FileUpload {
  id: string;
  user_id: string;
  file_name: string;
  file_size: number;
  file_type: string;
  storage_path: string;
  uploaded_at: string;
}

export interface Permission {
  id: string;
  permission_key: string;
  description: string | null;
  super_admin_only: boolean;
  created_at: string;
}

export interface AdminPermission {
  id: string;
  admin_id: string;
  permission_key: string;
  granted_by: string;
  created_at: string;
  deleted_at: string | null;
}

export interface FeatureFlag {
  id: string;
  flag_key: string;
  description: string | null;
  enabled: boolean;
  target_type: 'global' | 'user' | 'plan' | 'beta';
  target_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface NewFeatureFlag {
  flag_key: string;
  description?: string | null;
  enabled?: boolean;
  target_type?: 'global' | 'user' | 'plan' | 'beta';
  target_id?: string | null;
}

export interface UpdateFeatureFlag {
  description?: string | null;
  enabled?: boolean;
  target_type?: 'global' | 'user' | 'plan' | 'beta';
  target_id?: string | null;
  updated_at?: string;
}

export interface AdminAuditLogEntry {
  id: string;
  admin_id: string;
  action: string;
  target_type: string;
  target_id: string | null;
  metadata: Record<string, unknown>;
  ip_address: string | null;
  created_at: string;
}

export interface AnalyticsEvent {
  id: string;
  event_type: string;
  user_id: string | null;
  session_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface ConversationRow {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface NewConversationRow {
  id: string;
  user_id: string;
  title?: string;
  created_at?: string;
  updated_at?: string;
}

export interface UpdateConversationRow {
  title?: string;
  updated_at?: string;
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
  web_search: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface NewMessageRow {
  id: string;
  conversation_id: string;
  user_id: string;
  role: 'user' | 'ai';
  content: string;
  mode?: string | null;
  model?: string | null;
  liked?: boolean;
  disliked?: boolean;
  web_search?: boolean;
  metadata?: Record<string, unknown>;
  created_at?: string;
}

export interface UpdateMessageRow {
  liked?: boolean;
  disliked?: boolean;
  metadata?: Record<string, unknown>;
}

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: NewProfile;
        Update: UpdateProfile;
      };
      plans: {
        Row: Plan;
        Insert: NewPlan;
        Update: Partial<NewPlan>;
      };
      subscriptions: {
        Row: Subscription;
        Insert: NewSubscription;
        Update: Partial<NewSubscription>;
      };
      payments: {
        Row: Payment;
        Insert: Omit<Payment, 'id' | 'created_at'>;
        Update: Partial<Omit<Payment, 'id'>>;
      };
      payment_attempts: {
        Row: PaymentAttempt;
        Insert: Omit<PaymentAttempt, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<PaymentAttempt, 'id'>>;
      };
      invoices: {
        Row: Invoice;
        Insert: Omit<Invoice, 'id' | 'created_at'>;
        Update: Partial<Omit<Invoice, 'id'>>;
      };
      webhook_events: {
        Row: WebhookEvent;
        Insert: Omit<WebhookEvent, 'id' | 'created_at'>;
        Update: Partial<Omit<WebhookEvent, 'id'>>;
      };
      usage_logs: {
        Row: UsageLog;
        Insert: Omit<UsageLog, 'id' | 'created_at'>;
        Update: Partial<Omit<UsageLog, 'id'>>;
      };
      daily_chat_usage: {
        Row: DailyChatUsage;
        Insert: Omit<DailyChatUsage, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<DailyChatUsage, 'id'>>;
      };
      file_uploads: {
        Row: FileUpload;
        Insert: Omit<FileUpload, 'id' | 'uploaded_at'>;
        Update: Partial<Omit<FileUpload, 'id'>>;
      };
      conversations: {
        Row: ConversationRow;
        Insert: NewConversationRow;
        Update: UpdateConversationRow;
      };
      messages: {
        Row: MessageRow;
        Insert: NewMessageRow;
        Update: UpdateMessageRow;
      };
      feature_flags: {
        Row: FeatureFlag;
        Insert: NewFeatureFlag;
        Update: UpdateFeatureFlag;
      };
      admin_audit_logs: {
        Row: AdminAuditLogEntry;
        Insert: Omit<AdminAuditLogEntry, 'id' | 'created_at'>;
        Update: Partial<Omit<AdminAuditLogEntry, 'id'>>;
      };
      permissions: {
        Row: Permission;
        Insert: Omit<Permission, 'id' | 'created_at'>;
        Update: Partial<Omit<Permission, 'id'>>;
      };
      admin_permissions: {
        Row: AdminPermission;
        Insert: Omit<AdminPermission, 'id' | 'created_at'>;
        Update: Partial<Omit<AdminPermission, 'id'>>;
      };
      analytics_events: {
        Row: AnalyticsEvent;
        Insert: Omit<AnalyticsEvent, 'id' | 'created_at'>;
        Update: Partial<Omit<AnalyticsEvent, 'id'>>;
      };
    };
  };
}
