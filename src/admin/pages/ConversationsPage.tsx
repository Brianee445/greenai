import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { DataTable, type Column } from '../components/DataTable';
import { listConversations, type ConversationRow } from '../services/conversations';

export function ConversationsPage() {
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const pageSize = 20;

  const columns: Column<ConversationRow>[] = [
    {
      key: 'title',
      header: 'Title',
      sortable: true,
      width: '30%',
      render: (row) => (
        <span className="text-white font-medium truncate block max-w-xs">
          {row.title || 'Untitled'}
        </span>
      ),
    },
    {
      key: 'profiles',
      header: 'User',
      width: '20%',
      render: (row) => row.profiles?.display_name ?? row.profiles?.email ?? '—',
    },
    {
      key: 'message_count',
      header: 'Messages',
      sortable: true,
      width: '10%',
      render: (row) => row.message_count,
    },
    {
      key: 'updated_at',
      header: 'Last Activity',
      sortable: true,
      width: '18%',
      render: (row) => new Date(row.updated_at).toLocaleDateString(),
    },
    {
      key: 'created_at',
      header: 'Created',
      sortable: true,
      width: '14%',
      render: (row) => new Date(row.created_at).toLocaleDateString(),
    },
  ];

  const fetchConversations = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listConversations({ page, pageSize, search });
      setConversations(result.conversations);
      setTotal(result.total);
    } catch {
      setConversations([]);
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  const handleRowClick = (row: ConversationRow) => {
    navigate(`/ops/conversations/${row.id}`);
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Search by title or user email..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        <p className="text-sm text-gray-500">{total} conversation{total !== 1 ? 's' : ''}</p>
      </div>

      <DataTable<ConversationRow>
        columns={columns}
        data={conversations}
        loading={loading}
        emptyMessage="No conversations found"
        pageSize={conversations.length || 1}
        onRowClick={handleRowClick}
        keyExtractor={(row) => row.id}
      />

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-4 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm text-gray-300 hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Previous
          </button>
          <span className="text-sm text-gray-500">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="px-4 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm text-gray-300 hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
