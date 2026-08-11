import { useState, useEffect, useCallback, useRef } from 'react';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { ChatArea } from './components/ChatArea';
import { ChatInput } from './components/ChatInput';
import { SettingsModal } from './components/SettingsModal';
import { useChatStorage } from './hooks/useChatStorage';
import { useLocalStorage } from './hooks/useLocalStorage';
import { useAuth } from './auth/hooks/useAuth';
import { useAuthModal } from './auth/providers/AuthModalProvider';
import { sendMessage } from './services/geminiApi';
import { generateImage } from './services/imageApi';
import { clearConversationMemory } from './utils/memoryUtils';
import { Message, AppSettings } from './types';
import { checkQuota, recordUsage } from './subscriptions/services/api';
import { useSubscriptionContext } from './subscriptions/providers/SubscriptionProvider';
import { getAllowedModels } from './subscriptions/utils/quota';

export default function App() {
  const { user, signOut } = useAuth();
  const { showAuthModal } = useAuthModal();
  const { plan } = useSubscriptionContext();
  const isAuthenticated = !!user;

  const [settings, setSettings] = useLocalStorage('greenai-settings', {
    currentMode: 'basic',
    currentModel: 'gx-2.0',
    darkMode: true,
    fontSize: 'medium',
    autoSave: true,
    companionMode: false,
    selectedLanguage: 'English',
    userProfile: {
      name: '',
      hobby: '',
      personalInfo: '',
      age: '',
      occupation: '',
      interests: ''
    }
  });

  const {
    messages,
    conversations,
    currentConversationId,
    setMessages,
    setConversations,
    setCurrentConversationId,
    loadConversation: loadConversationFromHook,
    handleNewChat: handleNewChatFromHook,
    handleDeleteConversation: handleDeleteConversationFromHook,
  } = useChatStorage(user);

  const loadConversation = useCallback((conversationId: string) => {
    loadConversationFromHook(conversationId, settings.autoSave);
    if (window.innerWidth < 1024) setIsSidebarOpen(false);
  }, [loadConversationFromHook, settings.autoSave]);

  const handleNewChat = useCallback(() => {
    handleNewChatFromHook(settings.autoSave);
    if (window.innerWidth < 1024) setIsSidebarOpen(false);
  }, [handleNewChatFromHook, settings.autoSave]);

  const handleDeleteConversation = useCallback((id: string) => {
    handleDeleteConversationFromHook(id);
  }, [handleDeleteConversationFromHook]);

  const [isTyping, setIsTyping] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);
  const [pendingEditImage, setPendingEditImage] = useState<string | null>(null);

  // Tracks the in-flight request so "stop" can discard a response that
  // arrives after the user has already cancelled. The Gemini call isn't
  // streamed, so this can't abort the network request mid-flight — instead
  // it marks the request stale so its result is dropped on arrival, and
  // immediately restores the UI to its idle state.
  const activeRequestIdRef = useRef<number | null>(null);

  const handleAuthRequired = useCallback((feature: string) => {
    const messages: Record<string, { title: string; description: string }> = {
      'upload files': {
        title: 'Sign in to upload files',
        description: 'Create a free account to upload images, documents, and keep your conversations synced across devices.',
      },
      'use voice input': {
        title: 'Sign in to use voice input',
        description: 'Create a free account to record voice messages and keep your conversations synced across devices.',
      },
      'upload audio': {
        title: 'Sign in to upload audio',
        description: 'Create a free account to upload audio files and keep your conversations synced across devices.',
      },
      'view settings': {
        title: 'Sign in to access settings',
        description: 'Create a free account to customize your experience and manage your profile.',
      },
    };
    const config = messages[feature] || {
      title: 'Sign in to continue',
      description: 'Create a free account to access this feature.',
    };
    showAuthModal(config);
  }, [showAuthModal]);

  // Friendly rotating messages
  const friendlyMessages = [
    "What can I help with?",
    "How can I assist you today?",
    "What would you like to explore?",
    "Ready to help with anything!",
    "What's on your mind?",
    "How may I be of service?",
    "What can we work on together?",
    "I'm here to help!",
    "What questions do you have?",
    "Let's create something amazing!",
    "What would you like to know?",
    "Ready for our next adventure?"
  ];

  // Rotate messages every 3 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentMessageIndex((prev) => (prev + 1) % friendlyMessages.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [friendlyMessages.length]);

  // ─── Messaging ────────────────────────────────────────────────────────────

  const handleSendMessage = async (text: string, files?: any[], webSearch?: boolean, imageGen?: boolean) => {
    if (isProcessing) return;

    if (isAuthenticated) {
      try {
        const quota = await checkQuota('chat');
        if (!quota.allowed) {
          alert(`You've used all your daily messages. Upgrade to Pro for unlimited access.`);
          return;
        }
      } catch {
        // Allow sending if quota check fails
      }

      const allowedModels = getAllowedModels(plan?.slug);
      if (!allowedModels.includes(settings.currentModel)) {
        const highest = allowedModels[allowedModels.length - 1];
        alert(`Your current plan does not support the ${settings.currentModel.toUpperCase()} model. Switching to ${highest.toUpperCase()}.`);
        handleSettingsChange({ ...settings, currentModel: highest });
        return;
      }
    }

    // Mark this as the active request. If the user hits "stop" before this
    // resolves, activeRequestIdRef will no longer match and the response
    // gets discarded further down.
    const requestId = Date.now();
    activeRequestIdRef.current = requestId;

    setIsProcessing(true);
    setIsTyping(true);

    const userMessage: Message = {
      id: requestId.toString(),
      text: text + (files && files.length > 0 ? ` [${files.length} file(s) attached]` : ''),
      sender: 'user',
      timestamp: Date.now(),
      mode: settings.currentMode
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);

    try {
      if (imageGen) {
        // Attached photos (if any) get sent alongside the prompt so the
        // model edits/refines them, rather than generating from text alone.
        const imageInputs = (files ?? [])
          .filter((f: any) => f.type === 'image' && typeof f.preview === 'string')
          .map((f: any) => {
            const [header, base64] = f.preview.split(',');
            const mimeMatch = header.match(/data:(.*?);base64/);
            return {
              data: base64,
              mimeType: mimeMatch ? mimeMatch[1] : (f.file?.type || 'image/png'),
            };
          });

        const { url, isPersistent } = await generateImage(text, imageInputs.length ? imageInputs : undefined);
        if (!isPersistent) {
          console.warn('Generated image is a session-only blob: URL — it will not survive a page refresh. Check that SUPABASE_SERVICE_ROLE_KEY is available to the generate-image function.');
        }

        if (activeRequestIdRef.current !== requestId) return;

        const aiImageMessage: Message = {
          id: (Date.now() + 1).toString(),
          text: '',
          sender: 'ai',
          timestamp: Date.now(),
          mode: settings.currentMode,
          imageUrl: url,
        };

        setMessages([...newMessages, aiImageMessage]);

        if (isAuthenticated) {
          recordUsage('image_generation', { model: 'gemini-3.1-flash-image' }).catch(() => {});
        }
      } else {
        const response = await sendMessage(
          text,
          settings.currentMode,
          settings.currentModel,
          currentConversationId,
          settings.companionMode,
          settings.selectedLanguage,
          { ...settings.userProfile, email: '' },
          files,
          webSearch ?? false
        );

        // If the user cancelled while this was in flight, don't append a
        // response to a conversation that's already moved on.
        if (activeRequestIdRef.current !== requestId) return;

        const aiMessage: Message = {
          id: (Date.now() + 1).toString(),
          text: response.text,
          sender: 'ai',
          timestamp: Date.now(),
          mode: settings.currentMode,
          webSearch: response.webSearch ?? false,
        };

        setMessages([...newMessages, aiMessage]);

        if (isAuthenticated) {
          recordUsage('chat_message', { model: settings.currentModel, mode: settings.currentMode }).catch(() => {});
        }
      }
    } catch (error) {
      if (activeRequestIdRef.current !== requestId) return;

      console.error('Error sending message:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: imageGen
          ? (error instanceof Error ? error.message : 'Something went wrong generating your image. Please try again.')
          : 'Something went wrong. Please try again.',
        sender: 'ai',
        timestamp: Date.now(),
        mode: settings.currentMode
      };
      setMessages([...newMessages, errorMessage]);
    } finally {
      if (activeRequestIdRef.current === requestId) {
        setIsProcessing(false);
        setIsTyping(false);
      }
    }
  };

  // Called from the ChatInput stop button. Immediately restores the idle UI
  // and invalidates the in-flight request so its eventual response (success
  // or error) is silently dropped instead of being appended late.
  const handleStopGeneration = useCallback(() => {
    activeRequestIdRef.current = null;
    setIsProcessing(false);
    setIsTyping(false);
  }, []);

  const handleMessageReaction = (messageId: string, reaction: 'like' | 'dislike') => {
    setMessages(prev =>
      prev.map(msg => {
        if (msg.id !== messageId) return msg;
        return reaction === 'like'
          ? { ...msg, liked: !msg.liked, disliked: false }
          : { ...msg, disliked: !msg.disliked, liked: false };
      })
    );
  };

  const handleSettingsChange = (newSettings: AppSettings) => setSettings(newSettings);

  const handleClearMemory = () => {
    setMessages([]);
    setConversations([]);
    setCurrentConversationId(`conv-${Date.now()}`);
    clearConversationMemory();
  };

  // ─── Side effects ─────────────────────────────────────────────────────────

  // Document title
  useEffect(() => {
    if (!settings.currentMode) return;
    const modeNames: Record<string, string> = {
      basic: 'Basic', scary: 'Scary', green: 'Green', humanize: 'Humanize AI',
      gptzero: 'GPTzero', companion: 'Companion', utility: 'Utility',
      translator: 'Translator', law: 'LAW', service: 'SERVICE', gxdev: 'GXdev'
    };
    document.title = `GREEN AI — ${modeNames[settings.currentMode] ?? settings.currentMode}`;
  }, [settings.currentMode]);

  // ─── ChatGPT layout ───────────────────────────────────────────────────────
  // ChatGPT structure:
  //   • Full-height flex row
  //   • Sidebar is always rendered on desktop (lg+), overlaid on mobile
  //   • Main column = flex-col, fills remaining width
  //   • No visible top Header on desktop (sidebar handles nav) — Header stays for mobile burger menu
  //   • Chat area grows, input pinned to bottom

  const isEmptyChat = !Array.isArray(messages) || messages.length === 0;

  return (
    <div
      className="h-screen flex overflow-hidden"
      style={{ backgroundColor: settings.darkMode ? '#212121' : '#ffffff' }}
    >
      {/* ── Sidebar ── */}
      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        onSettingsClick={() => {
          if (isAuthenticated) {
            setIsSettingsOpen(true);
          } else {
            handleAuthRequired('view settings');
          }
        }}
        onToggleDarkMode={() => setSettings({ ...settings, darkMode: !settings.darkMode })}
        conversations={Array.isArray(conversations) ? conversations : []}
        currentConversationId={currentConversationId}
        onSelectConversation={loadConversation}
        onDeleteConversation={handleDeleteConversation}
        onNewConversation={handleNewChat}
        darkMode={settings.darkMode}
        userEmail={user?.email ?? ''}
        userName={settings.userProfile?.name}
        isAuthenticated={isAuthenticated}
        onSignOut={signOut}
      />

      {/* ── Main column ── */}
      <div className="flex flex-col flex-1 min-w-0 relative">

        {/* Mobile-only header (burger + new chat) */}
        <Header
          currentMode={settings.currentMode}
          currentModel={settings.currentModel}
          darkMode={settings.darkMode}
          companionMode={settings.companionMode}
          selectedLanguage={settings.selectedLanguage}
          onSidebarToggle={() => setIsSidebarOpen(prev => !prev)}
          onNewChat={handleNewChat}
        />

        {/* Chat body — scrollable */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {isEmptyChat ? (
            /* ── Empty state: centred greeting like ChatGPT ── */
            <div className="flex-1 flex flex-col items-center justify-center px-4 pb-32">
              <h1
                className="text-3xl font-semibold mb-2 bg-gradient-to-r from-emerald-400 via-green-500 to-emerald-600 bg-clip-text text-transparent transition-all duration-500 ease-in-out"
                style={{
                  fontFamily: "'Söhne', ui-sans-serif, system-ui, sans-serif"
                }}
              >
                {friendlyMessages[currentMessageIndex]}
              </h1>
            </div>
          ) : (
            <ChatArea
              messages={messages}
              isTyping={isTyping}
              darkMode={settings.darkMode}
              currentMode={settings.currentMode}
              companionMode={settings.companionMode}
              userProfile={{ ...settings.userProfile, email: '' }}
              onMessageReaction={handleMessageReaction}
              onEditImage={(imageUrl) => setPendingEditImage(imageUrl)}
            />
          )}
        </div>

        {/* ── Input bar — pinned to bottom, centred, max-width like ChatGPT ── */}
        <div
          className="w-full px-6 pb-4 pt-6"
          style={{
            background: settings.darkMode
              ? 'linear-gradient(to top, #212121 80%, transparent)'
              : 'linear-gradient(to top, #ffffff 80%, transparent)',
          }}
        >
          <div className="max-w-3xl mx-auto">
            <ChatInput
              onSendMessage={(message, files, webSearch, imageGen) => handleSendMessage(message, files, webSearch, imageGen)}
              onStopGeneration={handleStopGeneration}
              disabled={isProcessing}
              placeholder="Message GREEN AI"
              darkMode={settings.darkMode}
              onAuthRequired={isAuthenticated ? undefined : handleAuthRequired}
              pendingEditImage={pendingEditImage}
              onEditImageConsumed={() => setPendingEditImage(null)}
            />
          </div>
        </div>
      </div>

      {/* ── Settings modal ── */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSettingsChange={handleSettingsChange}
        onClearMemory={handleClearMemory}
        darkMode={settings.darkMode}
        planSlug={plan?.slug}
      />
    </div>
  );
}
