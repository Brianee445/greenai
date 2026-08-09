import { useState } from 'react';
import { Link } from 'react-router-dom';
import { X, SquarePen, Settings, Sun, Moon, Trash2, Search, LogOut, LogIn, UserPlus } from 'lucide-react';
import { Conversation } from '../types';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onSettingsClick: () => void;
  onToggleDarkMode: () => void;
  conversations: Conversation[];
  currentConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  onNewConversation: () => void;
  darkMode: boolean;
  userEmail: string;
  // Optional display name for the profile card avatar/initial. Falls back to
  // deriving an initial from userEmail when not provided.
  userName?: string;
  isAuthenticated: boolean;
  onSignOut: () => Promise<void>;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  onClose,
  onSettingsClick,
  onToggleDarkMode,
  conversations,
  currentConversationId,
  onSelectConversation,
  onDeleteConversation,
  onNewConversation,
  darkMode,
  userEmail,
  userName,
  isAuthenticated,
  onSignOut,
}) => {
  const [hoveredConversation, setHoveredConversation] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredConversations = searchQuery.trim()
    ? conversations.filter((c) =>
        c.title.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : conversations;

  const groupConversations = (convos: Conversation[]) => {
    const now = new Date();
    const groups: Record<string, Conversation[]> = {
      Today: [],
      Yesterday: [],
      'Previous 7 Days': [],
      Older: [],
    };

    convos.forEach((c) => {
      const diff = (now.getTime() - new Date(c.updatedAt).getTime()) / (1000 * 60 * 60 * 24);
      if (diff < 1) groups['Today'].push(c);
      else if (diff < 2) groups['Yesterday'].push(c);
      else if (diff < 7) groups['Previous 7 Days'].push(c);
      else groups['Older'].push(c);
    });

    return groups;
  };

  const grouped = groupConversations(filteredConversations);

  const sidebarStyle = {
    width: '260px',
    maxWidth: '85vw',
    fontFamily: "'Söhne', 'ui-sans-serif', 'system-ui', sans-serif",
  } as const;

  const darkStyle = {
    backgroundColor: darkMode ? '#171717' : '#ffffff',
    borderRight: darkMode ? 'none' : '1px solid #e5e7eb',
  } as const;

  const profileInitial = (userName?.trim()?.[0] ?? userEmail?.trim()?.[0] ?? 'U').toUpperCase();

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          style={{ background: 'rgba(0,0,0,0.4)' }}
          onClick={onClose}
        />
      )}

      <div
        className={`
          flex-col h-full
          ${isOpen ? 'fixed left-0 top-0 z-50 flex' : 'hidden'}
          lg:static lg:flex
        `}
        style={{ ...sidebarStyle, ...darkStyle }}
      >
        <div className="flex items-center justify-between px-3 pt-3 pb-1">
          <button
            onClick={onClose}
            className={`lg:hidden p-2 rounded-lg transition-colors ${
              darkMode 
                ? 'text-gray-400 hover:text-white hover:bg-white/10' 
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            <X size={18} />
          </button>
          <div className="hidden lg:block" />
          <button
            onClick={onNewConversation}
            title="New chat"
            className={`p-2 rounded-lg transition-colors touch-manipulation ${
              darkMode 
                ? 'text-gray-400 hover:text-white hover:bg-white/10' 
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            <SquarePen size={18} />
          </button>
        </div>

        {isAuthenticated ? (
          <>
            <div className="px-3 py-2">
              <div
                className="flex items-center gap-2 px-3 py-2 rounded-lg"
                style={{ backgroundColor: darkMode ? '#2f2f2f' : '#f3f4f6' }}
              >
                <Search size={14} style={{ color: darkMode ? '#8e8ea0' : '#6b7280', flexShrink: 0 }} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search chats"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    fontSize: '13px',
                    color: darkMode ? '#ececec' : '#374151',
                    width: '100%',
                    caretColor: darkMode ? '#ececec' : '#374151',
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    style={{ color: darkMode ? '#8e8ea0' : '#6b7280', flexShrink: 0, lineHeight: 1 }}
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-3 pb-2" style={{ scrollbarWidth: 'none' }}>
              {filteredConversations.length === 0 ? (
                <p style={{ fontSize: '12px', color: darkMode ? '#8e8ea0' : '#6b7280', padding: '12px 8px' }}>
                  {searchQuery.trim() ? 'No chats match your search' : 'No conversations yet'}
                </p>
              ) : (
                Object.entries(grouped).map(([label, convos]) => {
                  if (convos.length === 0) return null;
                  return (
                    <div key={label} className="mb-4">
                      {!searchQuery.trim() && (
                        <p
                          className="px-2 mb-1"
                          style={{ fontSize: '11px', fontWeight: 600, color: darkMode ? '#8e8ea0' : '#6b7280', letterSpacing: '0.04em' }}
                        >
                          {label}
                        </p>
                      )}
                      <div className="space-y-0.5">
                        {convos.map((conversation) => {
                          const isActive = currentConversationId === conversation.id;
                          const isHovered = hoveredConversation === conversation.id;
                          return (
                            <div
                              key={conversation.id}
                              className={`relative flex items-center rounded-lg cursor-pointer group ${
                                isActive ? 'bg-gradient-green-soft' : ''
                              }`}
                              style={{
                                backgroundColor: isActive 
                                  ? undefined 
                                  : isHovered 
                                    ? (darkMode ? '#212121' : '#f9fafb') 
                                    : 'transparent',
                                transition: 'background-color 0.1s ease',
                                minHeight: '36px',
                              }}
                              onMouseEnter={() => setHoveredConversation(conversation.id)}
                              onMouseLeave={() => setHoveredConversation(null)}
                              onClick={() => onSelectConversation(conversation.id)}
                            >
                              <span
                                className="flex-1 px-3 py-2 truncate"
                                style={{
                                  fontSize: '13.5px',
                                  color: isActive 
                                    ? (darkMode ? '#ececec' : '#111827') 
                                    : (darkMode ? '#acacac' : '#6b7280'),
                                  fontWeight: isActive ? 500 : 400,
                                  lineHeight: '1.4',
                                }}
                              >
                                {conversation.title}
                              </span>
                              {isHovered && (
                                <>
                                  <div
                                    style={{
                                      position: 'absolute',
                                      right: 28,
                                      top: 0,
                                      bottom: 0,
                                      width: 40,
                                      background: isActive
                                        ? (darkMode 
                                            ? 'linear-gradient(to left, #2f2f2f, transparent)'
                                            : 'linear-gradient(to left, #f3f4f6, transparent)')
                                        : (darkMode 
                                            ? 'linear-gradient(to left, #212121, transparent)'
                                            : 'linear-gradient(to left, #f9fafb, transparent)'),
                                      pointerEvents: 'none',
                                    }}
                                  />
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onDeleteConversation(conversation.id);
                                    }}
                                    className="flex-shrink-0 mr-1 p-1 rounded transition-colors"
                                    style={{ color: darkMode ? '#8e8ea0' : '#6b7280', position: 'relative', zIndex: 1 }}
                                    onMouseEnter={(e) => (e.currentTarget.style.color = '#ef4444')}
                                    onMouseLeave={(e) => (e.currentTarget.style.color = darkMode ? '#8e8ea0' : '#6b7280')}
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        ) : (
          <div className="flex-1" />
        )}

        <div
          className="px-3 py-3 flex flex-col gap-0.5"
          style={{ borderTop: darkMode ? '1px solid #2f2f2f' : '1px solid #e5e7eb' }}
        >
          {isAuthenticated ? (
            <>
              {/* Profile card: gradient avatar + name/email, replaces the old
                  plain-text email row so the user's identity actually reads
                  as a "profile section" rather than a stray line of text. */}
              {userEmail && (
                <div
                  className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg mb-1"
                  style={{
                    backgroundColor: darkMode ? 'rgba(16,185,129,0.08)' : 'rgba(16,185,129,0.06)',
                  }}
                >
                  <div
                    className="w-8 h-8 rounded-full bg-gradient-green flex items-center justify-center text-white text-xs font-semibold flex-shrink-0"
                  >
                    {profileInitial}
                  </div>
                  <div className="flex-1 min-w-0">
                    {userName?.trim() && (
                      <p
                        className="truncate"
                        style={{ fontSize: '13px', fontWeight: 500, color: darkMode ? '#ececec' : '#111827' }}
                      >
                        {userName}
                      </p>
                    )}
                    <p
                      className="truncate"
                      style={{ fontSize: '11px', color: darkMode ? '#8e8ea0' : '#6b7280' }}
                    >
                      {userEmail}
                    </p>
                  </div>
                </div>
              )}

              <button
                onClick={onSettingsClick}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg w-full text-left transition-colors touch-manipulation ${
                  darkMode ? 'hover:bg-white/10' : 'hover:bg-gray-100'
                }`}
                style={{ color: darkMode ? '#ececec' : '#374151' }}
              >
                <Settings size={17} style={{ color: darkMode ? '#8e8ea0' : '#6b7280' }} />
                <span style={{ fontSize: '13.5px' }}>Settings</span>
              </button>

              <button
                onClick={onToggleDarkMode}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg w-full text-left transition-colors touch-manipulation ${
                  darkMode ? 'hover:bg-white/10' : 'hover:bg-gray-100'
                }`}
                style={{ color: darkMode ? '#ececec' : '#374151' }}
              >
                {darkMode ? (
                  <Sun size={17} style={{ color: darkMode ? '#8e8ea0' : '#6b7280' }} />
                ) : (
                  <Moon size={17} style={{ color: darkMode ? '#8e8ea0' : '#6b7280' }} />
                )}
                <span style={{ fontSize: '13.5px' }}>
                  {darkMode ? 'Light mode' : 'Dark mode'}
                </span>
              </button>

              <Link
                to="/pricing"
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg w-full text-left transition-colors touch-manipulation ${
                  darkMode ? 'hover:bg-white/10' : 'hover:bg-gray-100'
                }`}
                style={{ color: darkMode ? '#ececec' : '#374151', textDecoration: 'none' }}
              >
                <span style={{ fontSize: '13.5px' }}>Pricing</span>
              </Link>

              <Link
                to="/billing"
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg w-full text-left transition-colors touch-manipulation ${
                  darkMode ? 'hover:bg-white/10' : 'hover:bg-gray-100'
                }`}
                style={{ color: darkMode ? '#ececec' : '#374151', textDecoration: 'none' }}
              >
                <span style={{ fontSize: '13.5px' }}>Billing</span>
              </Link>

              <button
                onClick={onSignOut}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg w-full text-left transition-colors touch-manipulation ${
                  darkMode ? 'hover:bg-white/10' : 'hover:bg-gray-100'
                }`}
                style={{ color: darkMode ? '#ececec' : '#374151' }}
              >
                <LogOut size={17} style={{ color: darkMode ? '#8e8ea0' : '#6b7280' }} />
                <span style={{ fontSize: '13.5px' }}>Sign out</span>
              </button>
            </>
          ) : (
            <>
              <Link
                to="/login"
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg w-full text-left transition-colors touch-manipulation ${
                  darkMode ? 'hover:bg-white/10' : 'hover:bg-gray-100'
                }`}
                style={{ color: darkMode ? '#ececec' : '#374151', textDecoration: 'none' }}
              >
                <LogIn size={17} style={{ color: darkMode ? '#8e8ea0' : '#6b7280' }} />
                <span style={{ fontSize: '13.5px' }}>Log in</span>
              </Link>

              <Link
                to="/register"
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg w-full text-left transition-colors touch-manipulation ${
                  darkMode ? 'hover:bg-white/10' : 'hover:bg-gray-100'
                }`}
                style={{ color: darkMode ? '#ececec' : '#374151', textDecoration: 'none' }}
              >
                <UserPlus size={17} style={{ color: darkMode ? '#8e8ea0' : '#6b7280' }} />
                <span style={{ fontSize: '13.5px' }}>Sign up</span>
              </Link>

              <div
                className="px-3 py-3 rounded-lg mb-1 mt-1"
                style={{ backgroundColor: darkMode ? '#2f2f2f' : '#f3f4f6' }}
              >
                <p style={{ fontSize: '12px', color: darkMode ? '#8e8ea0' : '#6b7280', textAlign: 'center' }}>
                  You are using Guest Mode
                </p>
              </div>

              <button
                onClick={onToggleDarkMode}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg w-full text-left transition-colors touch-manipulation ${
                  darkMode ? 'hover:bg-white/10' : 'hover:bg-gray-100'
                }`}
                style={{ color: darkMode ? '#ececec' : '#374151' }}
              >
                {darkMode ? (
                  <Sun size={17} style={{ color: darkMode ? '#8e8ea0' : '#6b7280' }} />
                ) : (
                  <Moon size={17} style={{ color: darkMode ? '#8e8ea0' : '#6b7280' }} />
                )}
                <span style={{ fontSize: '13.5px' }}>
                  {darkMode ? 'Light mode' : 'Dark mode'}
                </span>
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
};
