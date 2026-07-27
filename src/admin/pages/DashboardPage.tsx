import { useState, useEffect, useCallback } from 'react';
import {
  Users, UserPlus, TrendingUp, MessageSquare,
  CreditCard, Activity,
} from 'lucide-react';
import { StatCard } from '../components/StatCard';
import { ChartCard } from '../components/ChartCard';
import { AreaChart } from '../components/AreaChart';
import { DoughnutChart } from '../components/DoughnutChart';
import { getDashboardStats, type DashboardStats } from '../services/dashboard';
import { getRevenueData } from '../services/payments';

const defaultStats: DashboardStats = {
  total_users: 0,
  users_today: 0,
  revenue_today: 0,
  active_chats: 0,
  failed_payments_today: 0,
  conversations_today: 0,
};

export function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats>(defaultStats);
  const [loading, setLoading] = useState(true);
  const [revenueSeries, setRevenueSeries] = useState<{ date: string; amount: number }[]>([]);
  const [revenueByPlan, setRevenueByPlan] = useState<Record<string, number>>({});
  const [chartsLoading, setChartsLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getDashboardStats();
      setStats(data);
    } catch {
      setStats(defaultStats);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchCharts = useCallback(async () => {
    setChartsLoading(true);
    try {
      const revenue = await getRevenueData('monthly');
      setRevenueSeries(revenue.series);
      setRevenueByPlan(revenue.revenue_by_plan);
    } catch {
      setRevenueSeries([]);
      setRevenueByPlan({});
    } finally {
      setChartsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    fetchCharts();
  }, [fetchStats, fetchCharts]);

  const planLabels = Object.keys(revenueByPlan);
  const planValues = Object.values(revenueByPlan);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard
          icon={<Users className="w-5 h-5 text-emerald-400" />}
          label="Total Users"
          value={stats.total_users}
          loading={loading}
        />
        <StatCard
          icon={<UserPlus className="w-5 h-5 text-blue-400" />}
          label="New Today"
          value={stats.users_today}
          loading={loading}
        />
        <StatCard
          icon={<TrendingUp className="w-5 h-5 text-emerald-400" />}
          label="Revenue Today"
          value={`₦${(stats.revenue_today / 100).toLocaleString()}`}
          loading={loading}
          realtime
        />
        <StatCard
          icon={<MessageSquare className="w-5 h-5 text-purple-400" />}
          label="Active Chats"
          value={stats.active_chats}
          loading={loading}
          realtime
        />
        <StatCard
          icon={<CreditCard className="w-5 h-5 text-red-400" />}
          label="Failed Payments"
          value={stats.failed_payments_today}
          loading={loading}
          realtime
        />
        <StatCard
          icon={<Activity className="w-5 h-5 text-cyan-400" />}
          label="Conversations Today"
          value={stats.conversations_today}
          loading={loading}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2">
          <ChartCard title="Revenue Trend" subtitle="Monthly revenue (30 days)" loading={chartsLoading} height="h-64">
            <AreaChart data={revenueSeries} />
          </ChartCard>
        </div>
        <div>
          <ChartCard title="Revenue by Plan" subtitle="Current active subscriptions" loading={chartsLoading} height="h-64">
            {planLabels.length > 0 ? (
              <DoughnutChart labels={planLabels} values={planValues} />
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500 text-sm">
                No data
              </div>
            )}
          </ChartCard>
        </div>
      </div>
    </div>
  );
}
