import { useState, useEffect, useCallback, useRef } from 'react';
import type { Message, Conversation } from '../types';
import {
  fetchConversations,
  upsertConversation,
  upsertMessages,
  deleteConversation as deleteConversationFromDb,
  migrateFromLocalStorage,
} from '../services/chatStorage';

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as T;
  } catch { /* empty */ }
  return fallback;
}

function saveToStorage(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.error(`Error writing to localStorage key "${key}":`, err);
  }
}

export function useChatStorage(user: { id: string } | null) {
  const isAuthenticated = !!user;
  const userId = user?.id ?? null;

  const [messages, setMessagesState] = useState<Message[]>(() =>
    loadFromStorage<Message[]>('greenai-messages', [])
  );
  const [conversations, setConversationsState] = useState<Conversation[]>(() =>
    loadFromStorage<Conversation[]>('greenai-conversations', [])
  );
  const [currentConversationId, setCurrentConversationId] = useState(
    () => `conv-${Date.now()}`
  );
  const [loadedFromDb, setLoadedFromDb] = useState(false);

  const prevUserIdRef = useRef(userId);
  const initialLoadDoneRef = useRef(false);

  // ─── Bootstrap: fetch from Supabase on auth or auth change ──────────────

  useEffect(() => {
    if (!isAuthenticated || !userId) {
      setLoadedFromDb(true);
      initialLoadDoneRef.current = true;
      return;
    }

    if (prevUserIdRef.current !== userId) {
      prevUserIdRef.current = userId;
      initialLoadDoneRef.current = false;
      setLoadedFromDb(false);
    }

    if (initialLoadDoneRef.current) return;

    fetchConversations(userId)
      .then(async (dbConversations) => {
        if (dbConversations.length > 0) {
          setConversationsState(dbConversations);
          setMessagesState(dbConversations[0]?.messages ?? []);
          setCurrentConversationId(dbConversations[0]?.id ?? `conv-${Date.now()}`);
        } else {
          const localConvs = loadFromStorage<Conversation[]>('greenai-conversations', []);
          if (localConvs.length > 0) {
            const count = await migrateFromLocalStorage(userId);
            if (count > 0) {
              const migrated = await fetchConversations(userId);
              if (migrated.length > 0) {
                setConversationsState(migrated);
                setMessagesState(migrated[0]?.messages ?? []);
                setCurrentConversationId(migrated[0]?.id ?? `conv-${Date.now()}`);
              }
            }
          }
        }
        setLoadedFromDb(true);
        initialLoadDoneRef.current = true;
      })
      .catch((err) => {
        console.error('Failed to load conversations from DB:', err);
        setLoadedFromDb(true);
        initialLoadDoneRef.current = true;
      });

    return () => {};
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Sync to localStorage ──────────────────────────────────────────────

  useEffect(() => {
    saveToStorage('greenai-messages', messages);
  }, [messages]);

  useEffect(() => {
    saveToStorage('greenai-conversations', conversations);
  }, [conversations]);

  // ─── Debounced sync to Supabase (sequential: conversations first, then messages) ──

  useEffect(() => {
    if (!isAuthenticated || !userId || !loadedFromDb) return;
    if (conversations.length === 0 && messages.length === 0) return;

    const timer = setTimeout(async () => {
      try {
        for (const c of conversations) {
          await upsertConversation(userId, c);
        }

        // Always ensure the current conversation exists in the DB
        // before syncing its messages (handles new conversations
        // where saveCurrentConversation hasn't been called yet)
        if (messages.length > 0) {
          const existing = conversations.find((c) => c.id === currentConversationId);
          const firstUserMsg = messages.find((m) => m.sender === 'user')?.text ?? '';
          const title =
            firstUserMsg.slice(0, 50) + (firstUserMsg.length > 50 ? '...' : '') ||
            'New chat';

          const currentConv: Conversation = {
            id: currentConversationId,
            title,
            messages,
            createdAt: existing?.createdAt ?? Date.now(),
            updatedAt: Date.now(),
          };
          await upsertConversation(userId, currentConv);
          await upsertMessages(currentConversationId, userId, messages);
        }
      } catch (err) {
        console.error('Sync failed:', err);
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [conversations, messages, currentConversationId, isAuthenticated, userId, loadedFromDb]);

  // ─── Conversation helpers ──────────────────────────────────────────────

  const saveCurrentConversation = useCallback(() => {
    if (!Array.isArray(messages) || messages.length === 0) return;

    setConversationsState((prev) => {
      const existingIndex = prev.findIndex((c) => c.id === currentConversationId);
      const firstUserMsg = messages.find((m) => m.sender === 'user')?.text ?? '';
      const title =
        firstUserMsg.slice(0, 50) + (firstUserMsg.length > 50 ? '...' : '') ||
        'New chat';

      const conversation: Conversation = {
        id: currentConversationId,
        title,
        messages,
        createdAt:
          existingIndex >= 0 ? prev[existingIndex].createdAt : Date.now(),
        updatedAt: Date.now(),
      };

      if (existingIndex >= 0) {
        const updated = [...prev];
        updated[existingIndex] = conversation;
        return updated;
      }
      return [conversation, ...prev];
    });
  }, [messages, currentConversationId]);

  const loadConversation = useCallback(
    (conversationId: string, autoSave?: boolean) => {
      if (
        Array.isArray(messages) &&
        messages.length > 0 &&
        autoSave
      ) {
        saveCurrentConversation();
      }

      setConversationsState((prev) => {
        const conversation = prev.find((c) => c.id === conversationId);
        if (conversation) {
          setMessagesState(conversation.messages || []);
          setCurrentConversationId(conversation.id);
        }
        return prev;
      });
    },
    [messages, saveCurrentConversation]
  );

  const handleNewChat = useCallback(
    (autoSave?: boolean) => {
      if (Array.isArray(messages) && messages.length > 0 && autoSave) {
        saveCurrentConversation();
      }
      setMessagesState([]);
      setCurrentConversationId(`conv-${Date.now()}`);
    },
    [messages, saveCurrentConversation]
  );

  const handleDeleteConversation = useCallback(
    (id: string) => {
      setConversationsState((prev) => prev.filter((c) => c.id !== id));

      if (isAuthenticated) {
        deleteConversationFromDb(id).catch((err) =>
          console.error('Failed to delete conversation from DB:', err)
        );
      }

      if (id === currentConversationId) {
        setMessagesState([]);
        setCurrentConversationId(`conv-${Date.now()}`);
      }
    },
    [currentConversationId, isAuthenticated]
  );

  const setMessages = useCallback(
    (value: Message[] | ((prev: Message[]) => Message[])) => {
      if (typeof value === 'function') {
        setMessagesState((prev) => {
          const next = (value as (prev: Message[]) => Message[])(prev);
          return next;
        });
      } else {
        setMessagesState(value);
      }
    },
    []
  );

  const setConversations = useCallback(
    (
      value:
        | Conversation[]
        | ((prev: Conversation[]) => Conversation[])
    ) => {
      if (typeof value === 'function') {
        setConversationsState(value);
      } else {
        setConversationsState(value);
      }
    },
    []
  );

  return {
    messages,
    conversations,
    currentConversationId,
    setMessages,
    setConversations,
    setCurrentConversationId,
    saveCurrentConversation,
    loadConversation,
    handleNewChat,
    handleDeleteConversation,
  };
}
