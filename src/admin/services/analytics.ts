import { supabase } from '../../lib/supabase';

const FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_FUNCTIONS_URL;

export type AnalyticsEventType =
  | 'USER_REGISTERED' | 'USER_LOGIN'
  | 'CHAT_STARTED' | 'CHAT_COMPLETED' | 'PROMPT_SENT' | 'RESPONSE_GENERATED'
  | 'IMAGE_GENERATED' | 'FILE_UPLOADED'
  | 'PAYMENT_STARTED' | 'PAYMENT_SUCCESS' | 'PAYMENT_FAILED'
  | 'SUBSCRIPTION_CREATED' | 'SUBSCRIPTION_RENEWED' | 'SUBSCRIPTION_CANCELLED'
  | 'USER_BANNED' | 'USER_UNBANNED'
  | 'FEATURE_FLAG_ENABLED' | 'FEATURE_FLAG_DISABLED';

export async function recordEvent(
  eventType: AnalyticsEventType,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token ?? '';

  try {
    await fetch(`${FUNCTIONS_URL}/v1-analytics-record`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ event_type: eventType, metadata }),
    });
  } catch {
    // Never throw — analytics should never block the app
  }
}
