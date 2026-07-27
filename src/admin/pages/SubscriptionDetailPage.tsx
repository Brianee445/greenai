import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Ban } from 'lucide-react';
import { Skeleton } from '../components/LoadingSkeleton';
import { getSubscriptionDetail, cancelSubscription, type SubscriptionRow } from '../services/subscriptions';

export function SubscriptionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [subscription, setSubscription] = useState<SubscriptionRow | null>(null);
  const [payments, setPayments] = useState<unknown[]>([]);
  const [invoices, setInvoices] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);

  const fetchDetail = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await getSubscriptionDetail(id);
      setSubscription(data.subscription as unknown as SubscriptionRow);
      setPayments(data.payments);
      setInvoices(data.invoices);
    } catch {
      setSubscription(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  const handleCancel = async () => {
    if (!id) return;
    if (!confirm('Cancel this subscription? The user will retain access until the billing period ends.')) return;
    setCancelling(true);
    try {
      await cancelSubscription(id);
      await fetchDetail();
    } finally {
      setCancelling(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!subscription) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-400">Subscription not found</p>
        <button onClick={() => navigate('/ops/subscriptions')} className="mt-4 text-emerald-400 hover:text-emerald-300">
          Back to subscriptions
        </button>
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    active: 'text-emerald-400 bg-emerald-500/10',
    cancelled: 'text-amber-400 bg-amber-500/10',
    expired: 'text-red-400 bg-red-500/10',
    past_due: 'text-orange-400 bg-orange-500/10',
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <button
        onClick={() => navigate('/ops/subscriptions')}
        className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to subscriptions
      </button>

      <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold text-white">
              {subscription.profiles?.display_name ?? subscription.profiles?.email ?? 'Unknown'}
            </h2>
            <p className="text-sm text-gray-400 mt-1">
              {subscription.plans?.display_name ?? 'Unknown plan'}
            </p>
            <div className="flex items-center gap-3 mt-2 text-sm text-gray-500">
              <span>{subscription.billing_cycle ?? '—'} billing</span>
              <span>Started {new Date(subscription.start_date).toLocaleDateString()}</span>
              {subscription.end_date && <span>Ends {new Date(subscription.end_date).toLocaleDateString()}</span>}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className={`px-3 py-1 rounded-full text-xs font-medium capitalize ${statusColors[subscription.status] ?? 'text-gray-400 bg-gray-700'}`}>
              {subscription.status}
            </span>
            {subscription.status === 'active' && !subscription.cancel_at_period_end && (
              <button
                onClick={handleCancel}
                disabled={cancelling}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-600/20 text-amber-400 hover:bg-amber-600/30 text-sm font-medium transition-colors disabled:opacity-50"
              >
                <Ban className="w-4 h-4" />
                {cancelling ? 'Cancelling...' : 'Cancel'}
              </button>
            )}
          </div>
        </div>

        {subscription.cancel_at_period_end && (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-sm text-amber-400">
            Subscription is scheduled to cancel at period end ({subscription.end_date ? new Date(subscription.end_date).toLocaleDateString() : 'N/A'})
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
            Payments ({payments.length})
          </h3>
          {payments.length === 0 ? (
            <p className="text-gray-500 text-sm">No payments</p>
          ) : (
            <div className="space-y-3">
              {(payments as Array<{ id: string; amount: number; status: string; paid_at: string | null }>).map((p) => (
                <div key={p.id} className="flex items-center justify-between py-2 border-b border-gray-700 last:border-0">
                  <div>
                    <p className="text-sm text-white">₦{(p.amount / 100).toLocaleString()}</p>
                    <p className="text-xs text-gray-500">{p.paid_at ? new Date(p.paid_at).toLocaleDateString() : '—'}</p>
                  </div>
                  <span className={`text-xs font-medium capitalize ${p.status === 'success' ? 'text-emerald-400' : p.status === 'failed' ? 'text-red-400' : 'text-amber-400'}`}>
                    {p.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
            Invoices ({invoices.length})
          </h3>
          {invoices.length === 0 ? (
            <p className="text-gray-500 text-sm">No invoices</p>
          ) : (
            <div className="space-y-3">
              {(invoices as Array<{ id: string; amount: number; status: string; period_start: string; period_end: string }>).map((inv) => (
                <div key={inv.id} className="flex items-center justify-between py-2 border-b border-gray-700 last:border-0">
                  <div>
                    <p className="text-sm text-white">₦{(inv.amount / 100).toLocaleString()}</p>
                    <p className="text-xs text-gray-500">
                      {new Date(inv.period_start).toLocaleDateString()} – {new Date(inv.period_end).toLocaleDateString()}
                    </p>
                  </div>
                  <span className={`text-xs font-medium capitalize ${inv.status === 'paid' ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {inv.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
