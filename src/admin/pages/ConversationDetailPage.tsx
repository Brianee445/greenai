import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Skeleton } from '../components/LoadingSkeleton';
import { getConversationDetail, type ConversationRow, type MessageRow } from '../services/conversations';

export function ConversationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [conversation, setConversation] = useState<ConversationRow | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDetail = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await getConversationDetail(id);
      setConversation(data.conversation);
      setMessages(data.messages);
    } catch {
      setConversation(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!conversation) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-400">Conversation not found</p>
        <button onClick={() => navigate('/ops/conversations')} className="mt-4 text-emerald-400 hover:text-emerald-300">
          Back to conversations
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <button
        onClick={() => navigate('/ops/conversations')}
        className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to conversations
      </button>

      <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
        <h2 className="text-xl font-semibold text-white">
          {conversation.title || 'Untitled'}
        </h2>
        <div className="flex items-center gap-3 mt-2 text-sm text-gray-500">
          <span>{conversation.profiles?.display_name ?? conversation.profiles?.email ?? 'Unknown'}</span>
          <span>·</span>
          <span>{messages.length} messages</span>
          <span>·</span>
          <span>Created {new Date(conversation.created_at).toLocaleDateString()}</span>
        </div>
      </div>

      <div className="space-y-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-xl px-5 py-3 ${
                msg.role === 'user'
                  ? 'bg-emerald-500/10 border border-emerald-500/20 text-gray-200'
                  : 'bg-gray-800 border border-gray-700 text-gray-300'
              }`}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  {msg.role === 'user' ? 'User' : 'AI'}
                </span>
                {msg.model && (
                  <span className="text-xs text-gray-600">{msg.model}</span>
                )}
                {msg.mode && (
                  <span className="text-xs text-gray-600">· {msg.mode}</span>
                )}
              </div>
              <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
              <p className="text-xs text-gray-600 mt-2">
                {new Date(msg.created_at).toLocaleTimeString()}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
