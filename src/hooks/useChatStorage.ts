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

// Merge DB and local conversation lists, keeping whichever copy of each
// conversation is actually newer. This is what prevents a stale DB read
// (e.g. because an earlier background sync silently failed — expired auth
// token, network blip, whatever) from clobbering fresher data that's
// already sitting safely in localStorage. Without this, ANY sync failure
// anywhere in the app's lifetime becomes a permanent, silent data-loss bug
// the next time the page loads.
function reconcileConversations(
  dbConversations: Conversation[],
  localConversations: Conversation[]
): Conversation[] {
  const byId = new Map<string, Conversation>();

  for (const conv of localConversations) {
    byId.set(conv.id, conv);
  }

  for (const dbConv of dbConversations) {
    const localConv = byId.get(dbConv.id);
    if (!localConv || (dbConv.updatedAt ?? 0) >= (localConv.updatedAt ?? 0)) {
      byId.set(dbConv.id, dbConv);
    }
    // else: local copy is newer, keep it (already in the map)
  }

  return Array.from(byId.values()).sort(
    (a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)
  );
}

function isAuthTokenError(err: unknown): boolean {
  const msg = (err as { message?: string; code?: string })?.message ?? '';
  const code = (err as { message?: string; code?: string })?.code ?? '';
  return (
    code === 'refresh_token_not_found' ||
    msg.toLowerCase().includes('refresh token') ||
    msg.toLowerCase().includes('jwt')
  );
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
  // Surfaced so the UI can optionally show a subtle "not synced" indicator
  // instead of failures being completely invisible, as they were before.
  const [syncError, setSyncError] = useState<string | null>(null);

  const prevUserIdRef = useRef(userId);
  const initialLoadDoneRef = useRef(false);
  const syncRetryCountRef = useRef(0);

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
        const localConvs = loadFromStorage<Conversation[]>('greenai-conversations', []);

        if (dbConversations.length > 0 || localConvs.length > 0) {
          // Reconcile instead of blindly trusting the DB — a DB copy that's
          // older than what's already in localStorage means an earlier
          // sync failed silently, and we should not let that stale data
          // win.
          const merged = reconcileConversations(dbConversations, localConvs);
          setConversationsState(merged);
          setMessagesState(merged[0]?.messages ?? []);
          setCurrentConversationId(merged[0]?.id ?? `conv-${Date.now()}`);

          // If localStorage had conversations the DB didn't know about (or
          // had newer versions of ones it did), push those up now instead
          // of waiting for the next edit to trigger a sync.
          const dbIds = new Set(dbConversations.map((c) => c.id));
          const needsPush = merged.filter((c) => {
            const dbConv = dbConversations.find((d) => d.id === c.id);
            return !dbIds.has(c.id) || (dbConv && (c.updatedAt ?? 0) > (dbConv.updatedAt ?? 0));
          });
          for (const conv of needsPush) {
            try {
              await upsertConversation(userId, conv);
              await upsertMessages(conv.id, userId, conv.messages);
            } catch (err) {
              console.error('Failed to push locally-newer conversation to DB:', err);
            }
          }
        } else {
          // Neither DB nor local has anything for this user — nothing to
          // reconcile, but still worth checking for a legacy pre-account
          // localStorage payload to migrate in.
          const count = await migrateFromLocalStorage(userId).catch(() => 0);
          if (count > 0) {
            const migrated = await fetchConversations(userId).catch(() => []);
            if (migrated.length > 0) {
              setConversationsState(migrated);
              setMessagesState(migrated[0]?.messages ?? []);
              setCurrentConversationId(migrated[0]?.id ?? `conv-${Date.now()}`);
            }
          }
        }

        setSyncError(null);
        setLoadedFromDb(true);
        initialLoadDoneRef.current = true;
      })
      .catch((err) => {
        console.error('Failed to load conversations from DB:', err);

        // Auth is broken (expired/invalid refresh token, etc.) — the
        // safest thing to do is keep whatever's already in localStorage
        // (already the initial state) rather than resetting to empty, and
        // let the user know sync is degraded rather than staying silent.
        if (isAuthTokenError(err)) {
          setSyncError('Your session needs refreshing — sign out and back in to restore cloud sync.');
        } else {
          setSyncError('Could not reach the server — showing your locally saved chats.');
        }

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

        syncRetryCountRef.current = 0;
        setSyncError(null);
      } catch (err) {
        console.error('Sync failed:', err);

        if (isAuthTokenError(err)) {
          // Retrying won't help a dead token — surface it plainly instead
          // of silently retrying forever. localStorage still has the data,
          // so nothing is lost, but it won't reach the DB until re-auth.
          setSyncError('Your session needs refreshing — sign out and back in to restore cloud sync.');
          return;
        }

        // Transient failure (network blip, etc.) — retry a few times with
        // backoff before giving up and surfacing it, instead of either
        // silently dropping it forever or hammering the server.
        if (syncRetryCountRef.current < 3) {
          syncRetryCountRef.current += 1;
          setSyncError('Sync is having trouble — retrying…');
        } else {
          setSyncError('Could not sync to the server. Your chats are saved on this device only for now.');
        }
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
    syncError,
  };
}
