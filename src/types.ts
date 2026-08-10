export interface Message {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  timestamp: number;
  mode: AIMode;
  model?: AIModel;
  liked?: boolean;
  disliked?: boolean;
  webSearch?: boolean;
  imageUrl?: string;
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

export type AIMode = 'basic' | 'scary' | 'green' | 'humanize' | 'gptzero' | 'companion' | 'utility' | 'translator' | 'law' | 'service' | 'gxdev';

export type AIModel = 'gx-1.5' | 'gx-2.0' | 'gx-3.0';

export interface UserProfile {
  name: string;
  hobby: string;
  personalInfo: string;
  age?: string;
  occupation?: string;
  interests?: string;
  email?: string;
}

export interface AppSettings {
  currentMode: AIMode;
  currentModel: AIModel;
  darkMode: boolean;
  fontSize: 'small' | 'medium' | 'large';
  autoSave: boolean;
  companionMode: boolean;
  selectedLanguage: string;
  userProfile: UserProfile;
}