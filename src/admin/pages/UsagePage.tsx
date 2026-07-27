import { useState, useEffect, useCallback } from 'react';
import { MessageSquare, Upload, Activity, Cpu, Users } from 'lucide-react';
import { StatCard } from '../components/StatCard';
import { ChartCard } from '../components/ChartCard';
import { AreaChart } from '../components/AreaChart';
import { DoughnutChart } from '../components/DoughnutChart';
import { getUsageStats, type UsageStats } from '../services/usage';

export function UsagePage() {
  const [stats, setStats] = useState<UsageStats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getUsageStats();
      setStats(data);
    } catch {
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const modelLabels = stats?.model_breakdown ? Object.keys(stats.model_breakdown) : [];
  const modelValues = stats?.model_breakdown ? Object.values(stats.model_breakdown) : [];

  const dailyData = (stats?.daily_usage ?? []).map(d => ({ date: d.date, amount: d.count }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          icon={<MessageSquare className="w-5 h-5 text-emerald-400" />}
          label="Total Messages"
          value={stats?.total_messages ?? 0}
          loading={loading}
        />
        <StatCard
          icon={<Activity className="w-5 h-5 text-blue-400" />}
          label="Messages Today"
          value={stats?.messages_today ?? 0}
          loading={loading}
          realtime
        />
        <StatCard
          icon={<Upload className="w-5 h-5 text-purple-400" />}
          label="Total Uploads"
          value={stats?.total_uploads ?? 0}
          loading={loading}
        />
        <StatCard
          icon={<Cpu className="w-5 h-5 text-cyan-400" />}
          label="Uploads Today"
          value={stats?.uploads_today ?? 0}
          loading={loading}
          realtime
        />
        <StatCard
          icon={<Users className="w-5 h-5 text-amber-400" />}
          label="Active Users (30d)"
          value={stats?.top_users.length ?? 0}
          loading={loading}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2">
          <ChartCard title="Daily Chat Usage" subtitle="Last 30 days" loading={loading} height="h-64">
            <AreaChart data={dailyData} />
          </ChartCard>
        </div>
        <div>
          <ChartCard title="Messages by Model" subtitle="Model breakdown" loading={loading} height="h-64">
            {modelLabels.length > 0 ? (
              <DoughnutChart labels={modelLabels} values={modelValues} />
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500 text-sm">
                No data
              </div>
            )}
          </ChartCard>
        </div>
      </div>

      {stats && stats.top_users.length > 0 && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
            Top Users by Activity
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">User ID</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {stats.top_users.map((u) => (
                  <tr key={u.user_id} className="hover:bg-gray-700/50 transition-colors">
                    <td className="px-4 py-3">
                      <span className="text-gray-300 font-mono text-xs">{u.user_id}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-gray-300 font-medium">{u.count}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
