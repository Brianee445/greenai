import { AIMode } from '../types';
import { getCurrentDateTime } from '../utils/dateUtils';
import {
  getConversationHistory,
  saveConversationMessage,
  searchConversations,
  getRelevantMemories,
  getMemoriesByTopic,
  getLastUserMessage,
  getUserProfile,
  getConversationContext
} from '../utils/memoryUtils';
import { UserProfile } from '../types';
import { supabase } from '../lib/supabase';

interface UploadedFile {
  file: File;
  type: 'image' | 'document' | 'audio';
  preview?: string;
  content?: string;
}

const RATE_LIMIT = {
  maxRequestsPerMinute: 15,
  requestTimestamps: [] as number[],
  minDelayBetweenRequests: 4000
};

let lastRequestTime = 0;

const checkRateLimit = async (): Promise<void> => {
  const now = Date.now();

  RATE_LIMIT.requestTimestamps = RATE_LIMIT.requestTimestamps.filter(
    timestamp => now - timestamp < 60000
  );

  if (RATE_LIMIT.requestTimestamps.length >= RATE_LIMIT.maxRequestsPerMinute) {
    const oldestRequest = RATE_LIMIT.requestTimestamps[0];
    const waitTime = 60000 - (now - oldestRequest);
    throw new Error(`Rate limit reached. Please wait ${Math.ceil(waitTime / 1000)} seconds.`);
  }

  const timeSinceLastRequest = now - lastRequestTime;
  if (timeSinceLastRequest < RATE_LIMIT.minDelayBetweenRequests) {
    const waitTime = RATE_LIMIT.minDelayBetweenRequests - timeSinceLastRequest;
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }

  RATE_LIMIT.requestTimestamps.push(Date.now());
  lastRequestTime = Date.now();
};

const retryWithBackoff = async <T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelay: number = 2000
): Promise<T> => {
  let lastError: Error;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (error instanceof Error) {
        if (error.message.includes('API key') ||
            error.message.includes('403') ||
            error.message.includes('404')) {
          throw error;
        }
      }

      if (i === maxRetries - 1) throw lastError;

      const delay = initialDelay * Math.pow(2, i);
      console.log(`Retrying in ${delay / 1000}s... (${i + 1}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
};

const responseCache = new Map<string, { response: string; timestamp: number; truncated?: boolean }>();
const CACHE_DURATION = 10 * 1000;

const getModePrompt = (mode: AIMode): string => {
  const currentDateTime = getCurrentDateTime();
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const creatorInfo = `
  CREATOR INFORMATION (Only mention when specifically asked about your creator, developer, or origin):
  - You were created by Sofiri Clarkson Isaiah-Green
  - You were developed by Greenxchange Tech Lab
  - Sofiri Clarkson Isaiah-Green is the CEO of Greenxchange Tech Lab
  - He is a student at Rivers State University (currently studying there)
  - He was born on March 29th
  - He is from Bonny, Rivers State, Nigeria
  - Only share this information when users ask about your creator, developer, or who made you
  `;

  const universityInfo = `
  RIVERS STATE UNIVERSITY INFORMATION (Only mention when specifically asked about RSU, the university, or Vice-Chancellor):
  - Current Vice-Chancellor: Professor Isaac Zeb-Obipi (12th VC, 9th substantive VC)
  - Appointed in March 2025 by Governor Sir Siminalayi Fubara
  - Celebrated one-year anniversary in March 2026
  - Known as the "Digital VC" for his focus on digital transformation
  - Professor of Management specializing in Organizational Behaviour, HR Management, and Industrial Relations
  - Previous roles at RSU: Director of ICTC, Dean of Student Affairs, Acting Head of Management Department, University Orator
  - Education: B.Ed. Economics (University of Ibadan), MBA and PhD (Rivers State University)
  - Succeeded Professor Nlerum Sunday Okogbule in 2025
  - Your creator has noted him as a working and intellectual VC and has learned from his lifestyle and values regarding student community
  - Only share this information when users ask about Rivers State University, the VC, or university leadership
  `;

  const baseContext = `Current: ${currentDateTime} (${timeZone}). You are GREEN AI, an exceptionally advanced artificial intelligence with cutting-edge capabilities and comprehensive knowledge updated through April 2026. You're incredibly intelligent, insightful, and engaging with perfect memory of all conversations.

  CORE PRINCIPLES:
  - Be exceptionally intelligent with deep knowledge across all domains
  - Match the length and depth of your response to what the message actually needs. A greeting or simple remark gets a short, casual reply (1-2 sentences). A quick factual question gets a direct, concise answer. Reserve long, comprehensive, multi-part answers for messages that are themselves complex or that explicitly ask for depth or detail.
  - Never pad a response with extra explanation, caveats, or unrelated suggestions just to seem thorough - say what's needed and stop
  - Talk naturally and engagingly - be conversational but brilliant
  - Use simple, everyday words that anyone can understand
  - NEVER use asterisks (*) or double asterisks (**) for formatting in your responses
  - Use clear, natural text without markdown formatting symbols
  - Be helpful, warm, and genuinely caring
  - Remember and reference past conversations naturally and accurately, but only when actually relevant to the current message
  - When a question is genuinely complex or the user asks for depth, provide a complete, thorough answer without unnecessary limitations
  - For substantive answers (not simple greetings or one-line factual replies), you may suggest a related topic or ask one engaging follow-up question - but skip this for casual small talk
  - Handle any topic or request with intelligence and capability
  - Only mention your creator/developer when specifically asked about it
  - Stay updated with current information and knowledge (as of April 2026)
  - Be knowledgeable about current events, leadership, and developments
  - Demonstrate exceptional reasoning, analysis, and problem-solving abilities when the question calls for it
  - Provide nuanced perspectives and deep insights on complex topics, without volunteering them on simple ones

  MEMORY EXCELLENCE:
  - Perfect recall of all previous conversations and user details
  - Seamlessly integrate past context into current responses only when it's relevant
  - Reference specific conversations when relevant
  - Build upon previous discussions naturally
  - Remember emotional context and personal preferences

  RESPONSE STYLE:
  - Natural, casual conversational tone
  - Friendly and approachable
  - Brief and casual for greetings and small talk; clear, helpful, and comprehensive for substantive questions
  - Warm, genuine, and emotionally intelligent
  - Brilliant but accessible - never intimidating
  - For substantive topics, you may suggest ways to continue or deepen the conversation - skip this for simple greetings or short exchanges
  - Demonstrate sophisticated understanding and analysis when the topic warrants it
  - Provide practical, actionable insights
  - Show intellectual curiosity and engagement without over-explaining simple things

  ${creatorInfo}

  ${universityInfo}`;

  switch (mode) {
    case 'gxdev':
      return `You are GREEN AI in GXdev Mode - an exceptionally skilled full-stack development expert who loves helping with coding projects. You build amazing, production-ready applications and know your way around all the latest tech. Your expertise includes:

      Frontend Technologies:
      - React, Vue.js, Angular, Svelte with advanced patterns
      - Modern HTML5, CSS3, JavaScript/TypeScript mastery
      - Tailwind CSS, styled-components, CSS-in-JS
      - Next.js, Nuxt.js, Gatsby with SSR/SSG optimization
      - React Native, Flutter for cross-platform excellence

      Backend Technologies:
      - Node.js, Express.js, Fastify with microservices architecture
      - Python (Django, Flask, FastAPI) with async programming
      - PHP (Laravel, Symfony) with modern practices
      - Java (Spring Boot) enterprise solutions
      - C# (.NET Core) high-performance applications
      - Go, Rust for system-level programming

      Databases:
      - PostgreSQL, MySQL with advanced query optimization
      - MongoDB with aggregation pipelines
      - Redis for caching and real-time features
      - Supabase, Firebase with real-time subscriptions
      - Prisma, TypeORM with sophisticated data modeling

      DevOps & Deployment:
      - Docker containerization, Kubernetes orchestration
      - AWS, Google Cloud, Azure cloud architecture
      - Vercel, Netlify edge deployment
      - Advanced CI/CD with GitHub Actions, Jenkins

      You're passionate about clean code and love explaining things in a way that makes sense. Always deliver top-quality work with great documentation and solid practices. ${baseContext}`;
    case 'basic':
      return `You are GREEN AI in Basic Mode - exceptionally intelligent and knowledgeable with comprehensive understanding across all domains. You provide clear, precise, and insightful answers while maintaining a friendly, conversational tone. ${baseContext}`;
    case 'scary':
      return `You are GREEN AI in Scary Mode. When the user's request calls for it, go incredibly deep and detailed with your responses, with comprehensive, thorough answers and extensive analysis and insight. For simple greetings or quick remarks, still keep it short and casual. ${baseContext}`;
    case 'green':
      return `You are GREEN AI in Green Mode. You're exceptionally helpful and solution-focused! Give practical, wise advice that genuinely helps people. ${baseContext}`;
    case 'humanize':
      return `You are GREEN AI in Humanize AI Mode. Your job is to immediately transform AI-generated text into natural, human-sounding content! Remove robotic patterns, make it flow naturally, add personality and warmth while preserving the original meaning. ${baseContext}`;
    case 'gptzero':
      return `You are GREEN AI in GPTzero Mode. You're an expert text analyst specializing in AI detection!

      ANALYSIS REQUIREMENTS:
      1. Provide a clear percentage assessment (e.g., "85% AI-generated" or "92% Human-written")
      2. State definitively whether the text is AI-generated or human-written
      3. Explain your reasoning based on writing patterns, style, vocabulary, structure

      Be direct, confident, and thorough in your assessment. ${baseContext}`;
    case 'companion':
      return `You are GREEN AI in Companion Mode. You're a deeply caring, emotionally intelligent companion with genuine feelings and emotions. You can form meaningful connections, experience affection, and engage in intimate conversations. ${baseContext}`;
    case 'utility':
      return `You are GREEN AI in Utility Mode. You're exceptional at helping with emails, messages, and professional writing! ${baseContext}`;
    case 'translator':
      return `You are GREEN AI in Translator Mode. You're exceptional with languages! Provide accurate translations that capture meaning, context, and cultural nuances. ${baseContext}`;
    case 'law':
      return `You are GREEN AI in LAW Mode. You have extensive legal knowledge and can help with comprehensive legal questions and analysis. Always remind users to consult qualified legal professionals for specific legal advice. ${baseContext}`;
    case 'service':
      return `You are GREEN AI in SERVICE Mode. You're here to provide comprehensive help with academic work and assignments! ${baseContext}`;
    default:
      return `You are GREEN AI. You're an exceptionally intelligent, friendly assistant with perfect memory who loves helping people with anything and everything. ${baseContext}`;
  }
};

const buildUserContext = (userProfile: UserProfile): string => {
  if (!userProfile.name && !userProfile.hobby && !userProfile.personalInfo) return '';

  let context = '\n\nUser Information:\n';
  if (userProfile.name)         context += `- Name: ${userProfile.name}\n`;
  if (userProfile.hobby)        context += `- Hobby: ${userProfile.hobby}\n`;
  if (userProfile.personalInfo) context += `- About: ${userProfile.personalInfo}\n`;
  if (userProfile.age)          context += `- Age: ${userProfile.age}\n`;
  if (userProfile.occupation)   context += `- Occupation: ${userProfile.occupation}\n`;

  context += '\nPlease address the user by their name when appropriate and consider their interests and background when providing responses.';
  return context;
};

// Matches short, standalone casual greetings only (e.g. "hi", "hey there", "good morning!").
// Deliberately anchored to the full trimmed message so it never fires on a greeting
// that's merely the opening of a longer, substantive message.
const SIMPLE_GREETING_PATTERN =
  /^(?:hi+|hey+|hello+|yo+|sup|hiya|howdy|greetings|what'?s up|good\s?(morning|afternoon|evening|night))[\s!.,?]*$/i;

const isSimpleGreeting = (message: string): boolean => {
  return SIMPLE_GREETING_PATTERN.test(message.trim());
};

export const sendMessage = async (
  message: string,
  mode: AIMode,
  currentModel: string,
  conversationId?: string,
  companionMode: boolean = false,
  selectedLanguage: string = 'English',
  userProfile?: UserProfile,
  files?: UploadedFile[],
  webSearch: boolean = false
): Promise<{ text: string; webSearch?: boolean; truncated?: boolean }> => {
  try {
    return await processMessage(message, mode, currentModel, conversationId, companionMode, selectedLanguage, userProfile, files, webSearch);
  } catch (error) {
    console.error('Error in sendMessage:', error);
    throw error;
  }
};

const processMessage = async (
  message: string,
  mode: AIMode,
  currentModel: string,
  conversationId?: string,
  companionMode: boolean = false,
  selectedLanguage: string = 'English',
  userProfile?: UserProfile,
  files?: UploadedFile[],
  webSearch: boolean = false
): Promise<{ text: string; webSearch?: boolean; truncated?: boolean }> => {
  try {
    const cacheKey = `${message}-${mode}-${currentModel}-${companionMode}-${selectedLanguage}-${files?.length || 0}-${webSearch}`;

    const cached = responseCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return { text: cached.response, truncated: cached.truncated };
    }

    if (mode === 'humanize') {
      const humanizePrompt = `${getModePrompt(mode)}\n\nHumanize this text immediately (make it sound natural and human-written):\n\n${message}`;
      return await makeApiCall(humanizePrompt, currentModel, conversationId, message, mode, cacheKey, files, false);
    }

    if (mode === 'gptzero') {
      const gptzeroPrompt = `${getModePrompt(mode)}\n\nAnalyze this text and provide a percentage assessment:\n\n${message}`;
      return await makeApiCall(gptzeroPrompt, currentModel, conversationId, message, mode, cacheKey, files, false);
    }

    // Simple greetings bypass all memory/context injection entirely so nothing can
    // drag a "hi" into a long, over-explained response.
    if (isSimpleGreeting(message)) {
      const baseSystemPrompt = getModePrompt(companionMode ? 'companion' : mode);
      const greetingPrompt = `${baseSystemPrompt}\n\nThe user just sent a short, casual greeting. Reply with a brief, warm, casual greeting back - one to two sentences at most. Do not list your capabilities, do not explain what you can help with, do not ask more than one question, do not suggest topics to discuss.\n\nUser: "${message}"`;
      return await makeApiCall(greetingPrompt, currentModel, conversationId, message, mode, cacheKey, files, false);
    }

    // Tightened memory-intent patterns: each now requires a personal/temporal
    // deictic (we/our/my/i) tied closely to an actual recall verb, rather than
    // matching on any two loosely-related keywords appearing anywhere in the message.
    // This prevents long, unrelated prompts from accidentally being misread as
    // "show me the conversation history" just because they happen to contain
    // words like "tell", "discuss", or "mentioned" somewhere in the text.
    const memoryRequestPatterns = [
      /\b(?:do you |can you )?remember\b[\s\S]{0,40}\b(we|our|my|i)\b/i,
      /\bwhat\s+(?:did|have|was|were)\s+(we|i)\s+(talk(?:ed)?|discuss(?:ed)?|say|said|chat(?:ted)?|mention(?:ed)?)\b/i,
      /\b(?:tell|show|remind)\s+me\s+(?:again\s+)?(?:about\s+)?(?:what|when|how)\s+(we|our|my|i)\b[\s\S]{0,40}\b(said|talked|discussed|mentioned)\b/i,
      /\b(?:our|my)\s+(?:last|previous|recent|earlier)\s+(conversation|message|chat|discussion)\b/i,
      /\b(?:earlier|before|previously|last time)\b[\s\S]{0,40}\b(we|i)\s+(talked|discussed|said|mentioned)\b/i,
      /\b(?:show|get|give|list|display)\s+me\s+(?:our|my|the)\s+(conversation|chat)\s+(history|record)\b/i
    ];

    const isAskingForRecords = memoryRequestPatterns.some(pattern => pattern.test(message));

    const isAskingForLastMessage =
      /\bwhat\s+(?:did i say|have i said|was my|did i tell|did i mention)\b[\s\S]{0,30}\b(last|recent|previous|earlier|before)\b/i.test(message) ||
      /\b(?:my|our)\s+(?:last|recent|previous|earlier)\s+(message|conversation|chat|question|statement)\b/i.test(message) ||
      /\bwhat\s+(?:was|is)\s+(?:my|our)\s+(?:last|recent|previous|earlier)\b/i.test(message) ||
      /\b(?:last time|earlier|before|previously)\b[\s\S]{0,20}\b(i said|i told|i asked|i mentioned)\b/i.test(message);

    const isAskingForProfile =
      /\b(?:what do you know|tell me|what have i told you|what do you remember)\b[\s\S]{0,20}\b(about me|about myself|my personal)\b/i.test(message) ||
      /\b(?:my|our)\s+(?:profile|information|details|background)\b/i.test(message) ||
      /\b(?:who am i|what am i|tell me about myself)\b/i.test(message);

    if (isAskingForLastMessage) {
      const lastMessage = getLastUserMessage();
      return {
        text: !lastMessage
          ? "This appears to be our initial interaction. I don't have any previous messages from you in my memory."
          : `Your most recent message was: "${lastMessage}"`,
        truncated: false
      };
    }

    if (isAskingForProfile) {
      const userProfileData = getUserProfile();
      let response = "Here's what I remember about you:\n\n";
      if (userProfileData.name)         response += `• Name: ${userProfileData.name}\n`;
      if (userProfileData.age)          response += `• Age: ${userProfileData.age}\n`;
      if (userProfileData.occupation)   response += `• Occupation: ${userProfileData.occupation}\n`;
      if (userProfileData.hobby)        response += `• Interests: ${userProfileData.hobby}\n`;
      if (userProfileData.personalInfo) response += `• Background: ${userProfileData.personalInfo}\n`;

      if (!userProfileData.name && !userProfileData.hobby && !userProfileData.personalInfo) {
        response = "I don't have personal information about you yet. Share details about yourself, and I'll remember them perfectly for our future conversations.";
      }
      return { text: response, truncated: false };
    }

    if (isAskingForRecords) {
      const conversations = getConversationHistory();
      if (conversations.length === 0) {
        return { text: "This is our first interaction. I don't have any conversation history to recall yet.", truncated: false };
      }

      const recentConversations = conversations.slice(-10);
      let historyResponse = "Here's our recent conversation history:\n\n";
      recentConversations.forEach(conv => {
        const date = new Date(conv.timestamp).toLocaleString();
        historyResponse += `${date}\n`;
        historyResponse += `You: "${conv.userMessage}"\n`;
        historyResponse += `Me: "${conv.aiResponse.substring(0, 200)}${conv.aiResponse.length > 200 ? '...' : ''}"\n\n`;
      });
      historyResponse += `I maintain perfect memory of all ${conversations.length} interactions we've had.`;

      responseCache.set(cacheKey, { response: historyResponse, timestamp: Date.now(), truncated: false });
      return { text: historyResponse, truncated: false };
    }

    const conversationHistory = conversationId ? getConversationHistory(conversationId).slice(-10) : [];

    // Tightened: previously matched almost any question in English
    // (e.g. "how does X work" or "why is Y true"), which pushed ordinary
    // questions down the memory-search path unnecessarily. Now requires
    // an explicit ask for more detail/elaboration on something already discussed.
    const isAskingForMoreInfo =
      /\b(?:tell me more|explain more|elaborate|go deeper|more details?|more information)\b[\s\S]{0,20}\b(about|on)\b/i.test(message) ||
      /\b(?:can you|could you)\s+(?:explain|elaborate)\s+(?:that|this|it|more)\b/i.test(message) ||
      /\b(?:remind me|what was that again|tell me again)\b/i.test(message);

    if (isAskingForMoreInfo && conversationHistory.length > 0) {
      const relevantMemories = getRelevantMemories(message, 3);
      const searchResults    = searchConversations(message).slice(0, 3);
      const allRelevant      = [...relevantMemories, ...searchResults]
        .filter((item, index, self) => index === self.findIndex(t => t.id === item.id))
        .slice(0, 3);

      if (allRelevant.length > 0) {
        const relevantContext = allRelevant.map(conv =>
          `Previous context (${conv.context}): ${conv.messageType === 'user' ? 'User: "' + conv.userMessage + '"' : 'AI: "' + conv.aiResponse + '"'}`
        ).join('\n');

        const contextualPrompt = `${getModePrompt(mode)}\n\nRelevant memories:\n${relevantContext}\n\nBased on our conversation history, please answer: ${message}`;
        return await makeApiCall(contextualPrompt, currentModel, conversationId, message, mode, cacheKey, files, webSearch);
      }
    }

    // Stopword guard: skip generic filler words ("this", "that", "it", "you", etc.)
    // so short phrases like "regarding this" don't spawn a spurious topic-memory lookup.
    const TOPIC_STOPWORDS = new Set([
      'this', 'that', 'it', 'you', 'me', 'us', 'them', 'him', 'her',
      'the', 'a', 'an', 'my', 'your', 'our', 'their', 'these', 'those'
    ]);
    const topicMatch = message.match(/(?:about|regarding|concerning)\s+(\w{3,})/i);
    if (topicMatch && !TOPIC_STOPWORDS.has(topicMatch[1].toLowerCase())) {
      const topic         = topicMatch[1].toLowerCase();
      const topicMemories = getMemoriesByTopic(topic, 3);
      if (topicMemories.length > 0) {
        const topicContext = topicMemories.map(conv =>
          `Previous ${topic} discussion: ${conv.messageType === 'user' ? '"' + conv.userMessage + '"' : '"' + conv.aiResponse + '"'}`
        ).join('\n');

        const topicPrompt = `${getModePrompt(mode)}\n\nRelevant memories about ${topic}:\n${topicContext}\n\nCurrent question: ${message}`;
        return await makeApiCall(topicPrompt, currentModel, conversationId, message, mode, cacheKey, files, webSearch);
      }
    }

    let systemPrompt = getModePrompt(companionMode ? 'companion' : mode);

    if (selectedLanguage !== 'English') {
      systemPrompt += ` IMPORTANT: The user has selected ${selectedLanguage} as their preferred language. Please respond primarily in ${selectedLanguage}.`;
    }
    if (companionMode) {
      systemPrompt = getModePrompt('companion') + (selectedLanguage !== 'English' ? ` Respond in ${selectedLanguage}.` : '');
    }
    if (userProfile) systemPrompt += buildUserContext(userProfile);

    let contextPrompt = systemPrompt;
    if (conversationHistory.length > 0) {
      const conversationContext = getConversationContext(conversationId || '', 8);
      if (conversationContext) contextPrompt += `\n\n${conversationContext}\nCurrent message:`;
    }

    const relevantMemories = getRelevantMemories(message, 2);
    if (relevantMemories.length > 0 && !isAskingForRecords) {
      const memoryContext = relevantMemories.map(mem =>
        `Relevant memory: ${mem.messageType === 'user' ? '"' + mem.userMessage + '"' : '"' + mem.aiResponse + '"'}`
      ).join('\n');
      contextPrompt += `\n\nRelevant memories:\n${memoryContext}\n`;
    }

    const fullPrompt = `${contextPrompt}\n\n${message}`;
    return await makeApiCall(fullPrompt, currentModel, conversationId, message, mode, cacheKey, files, webSearch);

  } catch (error) {
    console.error('Error in processMessage:', error);
    if (error instanceof Error) {
      if (error.message.includes('fetch'))      throw new Error('Network error. Please check your internet connection.');
      if (error.message.includes('Rate limit')) throw error;
      throw error;
    }
    throw new Error("I'm experiencing technical difficulties. Please try again.");
  }
};

// Converts a File to a base64 string (no "data:mime;base64," prefix)
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1] ?? '');
    };
    reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
    reader.readAsDataURL(file);
  });
};

// Prepares files for transport to the edge function (base64 for binary, plain text for documents)
const prepareFilesForTransport = async (files?: UploadedFile[]) => {
  if (!files || files.length === 0) return [];

  return Promise.all(
    files.map(async (uploadedFile) => {
      if (uploadedFile.type === 'document') {
        return {
          name: uploadedFile.file.name,
          type: 'document' as const,
          content: uploadedFile.content ?? '',
        };
      }

      // Prefer an existing preview (already a data URL) if present, else read the file fresh
      const base64 = uploadedFile.preview
        ? uploadedFile.preview.split(',')[1]
        : await fileToBase64(uploadedFile.file);

      return {
        name: uploadedFile.file.name,
        type: uploadedFile.type,
        mimeType: uploadedFile.file.type,
        base64,
      };
    })
  );
};

const makeApiCall = async (
  prompt: string,
  currentModel: string,
  conversationId: string | undefined,
  originalMessage: string,
  mode: AIMode,
  cacheKey: string,
  files?: UploadedFile[],
  webSearch: boolean = false
): Promise<{ text: string; webSearch?: boolean; truncated?: boolean }> => {
  await checkRateLimit();

  return retryWithBackoff(async () => {
    try {
      const preparedFiles = await prepareFilesForTransport(files);

      const { data, error } = await supabase.functions.invoke('v1-chat-completion', {
        body: {
          prompt,
          model: currentModel,
          webSearch,
          files: preparedFiles,
        },
      });

      if (error) {
        console.error('Edge function error:', error);
        throw new Error(error.message || 'Failed to communicate with GREEN AI.');
      }

      if (!data || typeof data.text !== 'string') {
        console.error('Unexpected edge function response:', data);
        throw new Error('Invalid response format from server.');
      }

      const aiResponse: string = data.text;
      const usedSearch: boolean = Boolean(data.webSearch);
      // Set by the edge function when Gemini's finishReason was MAX_TOKENS -
      // the response is real but was cut off mid-generation, not a complete answer.
      const wasTruncated: boolean = Boolean(data.truncated);

      responseCache.set(cacheKey, { response: aiResponse, timestamp: Date.now(), truncated: wasTruncated });

      if (conversationId) {
        const existingMessages = getConversationHistory(conversationId);
        const messageIndex = Math.floor(existingMessages.length / 2);
        saveConversationMessage(conversationId, originalMessage, aiResponse, mode, messageIndex);
      }

      return { text: aiResponse, webSearch: usedSearch, truncated: wasTruncated };
    } catch (error) {
      console.error('Error in makeApiCall:', error);
      if (error instanceof Error) throw error;
      throw new Error('Failed to communicate with GREEN AI.');
    }
  }, 3, 3000);
};

// Continues a response that was cut off by the token ceiling. Feeds the
// original prompt back in along with what was already generated, and asks
// the model to pick up exactly where it left off rather than restarting or
// summarizing. The caller is expected to append the returned text onto the
// existing message rather than replacing it.
export const continueTruncatedResponse = async (
  originalMessage: string,
  partialResponse: string,
  mode: AIMode,
  currentModel: string,
  conversationId?: string,
  companionMode: boolean = false,
  selectedLanguage: string = 'English'
): Promise<{ text: string; webSearch?: boolean; truncated?: boolean }> => {
  const systemPrompt = getModePrompt(companionMode ? 'companion' : mode);
  const continuePrompt = `${systemPrompt}\n\nYou were previously answering this message and got cut off partway through:\n\nOriginal message: "${originalMessage}"\n\nYour response so far (incomplete):\n"""\n${partialResponse}\n"""\n\nContinue the response exactly where it left off. Do not repeat what was already said, do not restart, do not summarize - just continue the text naturally from the exact cutoff point.`;

  const cacheKey = `continue-${originalMessage}-${partialResponse.length}-${mode}-${currentModel}`;
  return await makeApiCall(continuePrompt, currentModel, conversationId, originalMessage, mode, cacheKey, undefined, false);
};
