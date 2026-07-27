import { supabase } from '../lib/supabase';
import type { Message, Conversation } from '../types';

const db = supabase as never as {
  from: (table: 'conversations' | 'messages') => ReturnType<typeof supabase.from>;
};

type MessageRow = {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  created_at: string;
  mode: string | null;
  model: string | null;
  liked: boolean;
  disliked: boolean;
  web_search: boolean;
};

type ConversationRow = {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

function messageToRow(
  conversationId: string,
  userId: string,
  m: Message
): Record<string, unknown> {
  return {
    id: m.id,
    conversation_id: conversationId,
    user_id: userId,
    role: m.sender,
    content: m.text,
    mode: m.mode ?? null,
    model: m.model ?? null,
    liked: m.liked ?? false,
    disliked: m.disliked ?? false,
    web_search: m.webSearch ?? false,
    metadata: {},
    created_at: new Date(m.timestamp).toISOString(),
  };
}

function rowToMessage(row: MessageRow): Message {
  return {
    id: row.id,
    text: row.content,
    sender: row.role as 'user' | 'ai',
    timestamp: new Date(row.created_at).getTime(),
    mode: (row.mode ?? undefined) as Message['mode'],
    model: (row.model ?? undefined) as Message['model'],
    liked: row.liked || undefined,
    disliked: row.disliked || undefined,
    webSearch: row.web_search || undefined,
  };
}

function conversationToRow(
  userId: string,
  c: Conversation
): Record<string, unknown> {
  return {
    id: c.id,
    user_id: userId,
    title: c.title,
    created_at: new Date(c.createdAt).toISOString(),
    updated_at: new Date(c.updatedAt).toISOString(),
  };
}

function rowToConversation(
  row: ConversationRow,
  messages: Message[]
): Conversation {
  return {
    id: row.id,
    title: row.title,
    messages,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  };
}

export async function fetchConversations(
  userId: string
): Promise<Conversation[]> {
  const { data: convRows, error: convErr } = await db
    .from('conversations')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (convErr) throw convErr;
  if (!convRows || convRows.length === 0) return [];

  const conversationIds = (convRows as ConversationRow[]).map((r) => r.id);

  const { data: msgRows, error: msgErr } = await db
    .from('messages')
    .select('*')
    .in('conversation_id', conversationIds)
    .order('created_at', { ascending: true });

  if (msgErr) throw msgErr;

  const messagesByConversation: Record<string, Message[]> = {};
  if (msgRows) {
    for (const m of msgRows as MessageRow[]) {
      if (!messagesByConversation[m.conversation_id]) {
        messagesByConversation[m.conversation_id] = [];
      }
      messagesByConversation[m.conversation_id].push(rowToMessage(m));
    }
  }

  return (convRows as ConversationRow[]).map((r) =>
    rowToConversation(r, messagesByConversation[r.id] ?? [])
  );
}

export async function fetchMessages(
  conversationId: string
): Promise<Message[]> {
  const { data, error } = await db
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return ((data ?? []) as MessageRow[]).map(rowToMessage);
}

export async function upsertConversation(
  userId: string,
  conversation: Conversation
): Promise<void> {
  const row = conversationToRow(userId, conversation);
  const { error } = await db
    .from('conversations')
    .upsert(row, { onConflict: 'id' });

  if (error) throw error;
}

export async function upsertMessages(
  conversationId: string,
  userId: string,
  messages: Message[]
): Promise<void> {
  const rows = messages.map((m) => messageToRow(conversationId, userId, m));

  const { error: deleteErr } = await db
    .from('messages')
    .delete()
    .eq('conversation_id', conversationId);

  if (deleteErr) throw deleteErr;

  if (rows.length === 0) return;

  const CHUNK_SIZE = 50;
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const { error: insertErr } = await db
      .from('messages')
      .insert(chunk);
    if (insertErr) throw insertErr;
  }
}

export async function deleteConversation(
  conversationId: string
): Promise<void> {
  const { error } = await db
    .from('conversations')
    .delete()
    .eq('id', conversationId);

  if (error) throw error;
}

export async function migrateFromLocalStorage(
  userId: string
): Promise<number> {
  const raw = localStorage.getItem('greenai-conversations');
  if (!raw) return 0;

  let conversations: Conversation[];
  try {
    conversations = JSON.parse(raw);
  } catch {
    return 0;
  }

  if (!Array.isArray(conversations) || conversations.length === 0) return 0;

  let migrated = 0;
  for (const c of conversations) {
    if (!c.id || !c.messages) continue;
    await upsertConversation(userId, c);
    await upsertMessages(c.id, userId, c.messages);
    migrated++;
  }

  localStorage.removeItem('greenai-conversations');
  localStorage.removeItem('greenai-messages');

  return migrated;
}
