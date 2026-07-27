import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { DataTable, type Column } from '../components/DataTable';
import { listSubscriptions, type SubscriptionRow } from '../services/subscriptions';

export function SubscriptionsPage() {
  const navigate = useNavigate();
  const [subscriptions, setSubscriptions] = useState<SubscriptionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const pageSize = 20;

  const columns: Column<SubscriptionRow>[] = [
    {
      key: 'profiles',
      header: 'User',
      width: '20%',
      render: (row) => row.profiles?.display_name ?? row.profiles?.email ?? '—',
    },
    {
      key: 'plans',
      header: 'Plan',
      width: '16%',
      render: (row) => row.plans?.display_name ?? '—',
    },
    {
      key: 'status',
      header: 'Status',
      width: '12%',
      render: (row) => {
        const s = row.status;
        const colors: Record<string, string> = {
          active: 'text-emerald-400',
          cancelled: 'text-amber-400',
          expired: 'text-red-400',
          past_due: 'text-orange-400',
        };
        return <span className={`capitalize font-medium ${colors[s] ?? 'text-gray-400'}`}>{s}</span>;
      },
    },
    {
      key: 'billing_cycle',
      header: 'Billing',
      width: '10%',
      render: (row) => <span className="capitalize">{row.billing_cycle ?? '—'}</span>,
    },
    {
      key: 'start_date',
      header: 'Started',
      width: '14%',
      render: (row) => new Date(row.start_date).toLocaleDateString(),
    },
    {
      key: 'end_date',
      header: 'Ends',
      width: '14%',
      render: (row) => (row.end_date ? new Date(row.end_date).toLocaleDateString() : '—'),
    },
    {
      key: 'cancel_at_period_end',
      header: 'Cancel',
      width: '8%',
      render: (row) =>
        row.cancel_at_period_end ? (
          <span className="text-amber-400 text-xs font-medium">Scheduled</span>
        ) : (
          <span className="text-gray-600">—</span>
        ),
    },
  ];

  const fetchSubscriptions = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listSubscriptions({ page, pageSize, status: statusFilter, search });
      setSubscriptions(result.subscriptions);
      setTotal(result.total);
    } catch {
      setSubscriptions([]);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, search]);

  useEffect(() => {
    fetchSubscriptions();
  }, [fetchSubscriptions]);

  const handleRowClick = (row: SubscriptionRow) => {
    navigate(`/ops/subscriptions/${row.id}`);
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Search by user email or name..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="cancelled">Cancelled</option>
          <option value="expired">Expired</option>
          <option value="past_due">Past Due</option>
        </select>
        <p className="text-sm text-gray-500">{total} subscription{total !== 1 ? 's' : ''}</p>
      </div>

      <DataTable<SubscriptionRow>
        columns={columns}
        data={subscriptions}
        loading={loading}
        emptyMessage="No subscriptions found"
        pageSize={subscriptions.length || 1}
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
