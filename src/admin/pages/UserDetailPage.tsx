import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Ban, CheckCircle } from 'lucide-react';
import { useAdminAuth } from '../hooks/useAdminAuth';
import { PERMISSIONS } from '../types';
import { getUserDetail, banUser, unbanUser } from '../services/users';
import { Skeleton } from '../components/LoadingSkeleton';
import type { Profile } from '../../types/database';

export function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { hasPermission } = useAdminAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [subscriptions, setSubscriptions] = useState<unknown[]>([]);
  const [payments, setPayments] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchDetail = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await getUserDetail(id);
      setProfile(data.profile);
      setSubscriptions(data.subscriptions);
      setPayments(data.payments);
    } catch {
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  const handleBan = async () => {
    if (!id) return;
    setActionLoading('ban');
    try {
      await banUser(id);
      await fetchDetail();
    } finally {
      setActionLoading(null);
    }
  };

  const handleUnban = async () => {
    if (!id) return;
    setActionLoading('unban');
    try {
      await unbanUser(id);
      await fetchDetail();
    } finally {
      setActionLoading(null);
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

  if (!profile) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-400">User not found</p>
        <button onClick={() => navigate('/ops/users')} className="mt-4 text-emerald-400 hover:text-emerald-300">
          Back to users
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <button
        onClick={() => navigate('/ops/users')}
        className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to users
      </button>

      <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold text-white">
              {profile.display_name ?? profile.email}
            </h2>
            <p className="text-sm text-gray-400 mt-1">{profile.email}</p>
            <div className="flex items-center gap-3 mt-2 text-sm">
              <span className="text-gray-500">
                Joined {new Date(profile.created_at).toLocaleDateString()}
              </span>
              {profile.banned_at && (
                <span className="text-red-400 font-medium">Banned</span>
              )}
              {profile.suspended_at && (
                <span className="text-amber-400 font-medium">Suspended</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {hasPermission(PERMISSIONS.USERS_BAN) && !profile.banned_at && (
              <button
                onClick={handleBan}
                disabled={actionLoading === 'ban'}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-600/20 text-red-400 hover:bg-red-600/30 text-sm font-medium transition-colors disabled:opacity-50"
              >
                <Ban className="w-4 h-4" />
                {actionLoading === 'ban' ? 'Banning...' : 'Ban'}
              </button>
            )}
            {hasPermission(PERMISSIONS.USERS_UNBAN) && profile.banned_at && (
              <button
                onClick={handleUnban}
                disabled={actionLoading === 'unban'}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 text-sm font-medium transition-colors disabled:opacity-50"
              >
                <CheckCircle className="w-4 h-4" />
                {actionLoading === 'unban' ? 'Unbanning...' : 'Unban'}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
            Subscriptions ({subscriptions.length})
          </h3>
          {subscriptions.length === 0 ? (
            <p className="text-gray-500 text-sm">No subscriptions</p>
          ) : (
            <div className="space-y-3">
              {(subscriptions as Array<{ id: string; status: string; billing_cycle?: string; created_at: string; plans?: { display_name?: string } }>).map((sub) => (
                <div key={sub.id} className="flex items-center justify-between py-2 border-b border-gray-700 last:border-0">
                  <div>
                    <p className="text-sm text-white">{sub.plans?.display_name ?? 'Unknown plan'}</p>
                    <p className="text-xs text-gray-500">
                      {sub.billing_cycle} · {new Date(sub.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <span className={`text-xs font-medium capitalize ${sub.status === 'active' ? 'text-emerald-400' : 'text-gray-500'}`}>
                    {sub.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
            Recent Payments ({payments.length})
          </h3>
          {payments.length === 0 ? (
            <p className="text-gray-500 text-sm">No payments</p>
          ) : (
            <div className="space-y-3">
              {(payments as Array<{ id: string; amount: number; status: string; created_at: string }>).map((p) => (
                <div key={p.id} className="flex items-center justify-between py-2 border-b border-gray-700 last:border-0">
                  <div>
                    <p className="text-sm text-white">₦{(p.amount / 100).toLocaleString()}</p>
                    <p className="text-xs text-gray-500">{new Date(p.created_at).toLocaleDateString()}</p>
                  </div>
                  <span className={`text-xs font-medium capitalize ${p.status === 'success' ? 'text-emerald-400' : p.status === 'failed' ? 'text-red-400' : 'text-amber-400'}`}>
                    {p.status}
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
