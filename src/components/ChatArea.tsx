import React, { useRef, useEffect } from 'react';
import { Message, UserProfile } from '../types';
import { MessageBubble } from './MessageBubble';
import { TypingIndicator } from './TypingIndicator';
import { Leaf } from 'lucide-react';

interface ChatAreaProps {
  messages: Message[];
  isTyping: boolean;
  darkMode: boolean;
  currentMode: string;
  companionMode: boolean;
  userProfile: UserProfile;
  onMessageReaction: (messageId: string, reaction: 'like' | 'dislike') => void;
  onEditImage?: (imageUrl: string) => void;
}

export const ChatArea: React.FC<ChatAreaProps> = ({ 
  messages, 
  isTyping,
  darkMode, 
  currentMode, 
  companionMode, 
  userProfile,
  onMessageReaction,
  onEditImage,
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (!messages || messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center overflow-y-auto">
        <div className="text-center max-w-sm sm:max-w-md w-full">
          <div className="mb-6">
            <div className="relative mx-auto mb-4 w-12 h-12 sm:w-16 sm:h-16">
              <Leaf className="w-16 h-16 text-emerald-500 drop-shadow-lg" />
            </div>
            <h2 className={`text-base sm:text-lg lg:text-xl font-bold ${
              darkMode ? 'text-white' : 'text-gray-900'
            } mb-2 drop-shadow-sm`}>
              Welcome to GREEN AI
            </h2>
            <p className={`${darkMode ? 'text-gray-400' : 'text-gray-600'} leading-relaxed text-sm sm:text-base px-2`}>
              Your friendly AI assistant. Start a conversation and let's chat!
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-hidden p-2 sm:p-3">
      <div
        className="h-full rounded-3xl overflow-y-auto scrollbar-thin scrollbar-thumb-gray-400 scrollbar-track-transparent"
        style={{ backgroundColor: darkMode ? '#212121' : '#ffffff' }}
      >
        {messages.map((message) => (
          <MessageBubble 
            key={message.id} 
            message={message} 
            darkMode={darkMode} 
            userProfile={userProfile}
            onReaction={onMessageReaction}
            onEditImage={onEditImage}
            onImageLoad={() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })}
          />
        ))}
        
        {isTyping && <TypingIndicator darkMode={darkMode} />}
        
        <div ref={messagesEndRef} className="h-4" />
      </div>
    </div>
  );
};
