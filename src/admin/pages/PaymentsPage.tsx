import { useState, useEffect, useCallback } from 'react';
import { CheckCircle2, XCircle, Clock, Send, TrendingUp } from 'lucide-react';
import { StatCard } from '../components/StatCard';
import { DataTable, type Column } from '../components/DataTable';
import { listPayments, type PaymentFunnel, type PaymentRow } from '../services/payments';

export function PaymentsPage() {
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [funnel, setFunnel] = useState<PaymentFunnel | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const pageSize = 20;

  const columns: Column<PaymentRow>[] = [
    {
      key: 'reference',
      header: 'Reference',
      width: '22%',
      render: (row) => (
        <span className="font-mono text-xs">{row.reference}</span>
      ),
    },
    {
      key: 'profiles',
      header: 'User',
      width: '20%',
      render: (row) => row.profiles?.display_name ?? row.profiles?.email ?? '—',
    },
    {
      key: 'amount',
      header: 'Amount',
      sortable: true,
      width: '14%',
      render: (row) => `₦${(row.amount / 100).toLocaleString()}`,
    },
    {
      key: 'status',
      header: 'Status',
      width: '12%',
      render: (row) => {
        const s = row.status;
        const colors: Record<string, string> = {
          success: 'text-emerald-400',
          failed: 'text-red-400',
          pending: 'text-amber-400',
        };
        return <span className={`capitalize font-medium ${colors[s] ?? 'text-gray-400'}`}>{s}</span>;
      },
    },
    {
      key: 'payment_method',
      header: 'Method',
      width: '14%',
      render: (row) => row.payment_method ?? '—',
    },
    {
      key: 'paid_at',
      header: 'Date',
      sortable: true,
      width: '18%',
      render: (row) => row.paid_at ? new Date(row.paid_at).toLocaleDateString() : '—',
    },
  ];

  const fetchPayments = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listPayments({ page, pageSize, status: statusFilter });
      setPayments(result.payments);
      setFunnel(result.funnel);
      setTotal(result.total);
    } catch {
      setPayments([]);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-6">
      {/* Funnel stats */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        <StatCard
          icon={<Send className="w-5 h-5 text-emerald-400" />}
          label="Total Attempts (30d)"
          value={funnel?.total_attempts ?? 0}
          loading={loading}
        />
        <StatCard
          icon={<CheckCircle2 className="w-5 h-5 text-emerald-400" />}
          label="Succeeded"
          value={funnel?.succeeded ?? 0}
          loading={loading}
        />
        <StatCard
          icon={<XCircle className="w-5 h-5 text-red-400" />}
          label="Failed"
          value={funnel?.failed ?? 0}
          loading={loading}
        />
        <StatCard
          icon={<Clock className="w-5 h-5 text-amber-400" />}
          label="Abandoned"
          value={funnel?.abandoned ?? 0}
          loading={loading}
        />
        <StatCard
          icon={<TrendingUp className="w-5 h-5 text-blue-400" />}
          label="Conversion Rate"
          value={funnel ? `${funnel.conversion_rate}%` : '0%'}
          loading={loading}
        />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <option value="">All statuses</option>
          <option value="success">Success</option>
          <option value="failed">Failed</option>
          <option value="pending">Pending</option>
        </select>
        <p className="text-sm text-gray-500">{total} payment{total !== 1 ? 's' : ''}</p>
      </div>

      {/* Payments table */}
      <DataTable<PaymentRow>
        columns={columns}
        data={payments}
        loading={loading}
        emptyMessage="No payments found"
        pageSize={payments.length || 1}
        keyExtractor={(row) => row.id}
      />

      {/* Server-side pagination */}
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
