import { useState, useEffect, useCallback } from 'react';
import { TrendingUp, DollarSign, BarChart3 } from 'lucide-react';
import { StatCard } from '../components/StatCard';
import { ChartCard } from '../components/ChartCard';
import { AreaChart } from '../components/AreaChart';
import { DoughnutChart } from '../components/DoughnutChart';
import { getRevenueData } from '../services/payments';

type Period = 'daily' | 'monthly' | 'yearly';

export function RevenuePage() {
  const [period, setPeriod] = useState<Period>('monthly');
  const [series, setSeries] = useState<{ date: string; amount: number }[]>([]);
  const [byPlan, setByPlan] = useState<Record<string, number>>({});
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [totalTransactions, setTotalTransactions] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchRevenue = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getRevenueData(period);
      setSeries(result.series);
      setByPlan(result.revenue_by_plan);
      setTotalRevenue(result.total_revenue);
      setTotalTransactions(result.total_transactions);
    } catch {
      setSeries([]);
      setByPlan({});
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    fetchRevenue();
  }, [fetchRevenue]);

  const planLabels = Object.keys(byPlan);
  const planValues = Object.values(byPlan);

  const periods: { value: Period; label: string }[] = [
    { value: 'daily', label: 'Daily' },
    { value: 'monthly', label: 'Monthly' },
    { value: 'yearly', label: 'Yearly' },
  ];

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          icon={<DollarSign className="w-5 h-5 text-emerald-400" />}
          label="Total Revenue"
          value={`₦${(totalRevenue / 100).toLocaleString()}`}
          loading={loading}
        />
        <StatCard
          icon={<BarChart3 className="w-5 h-5 text-blue-400" />}
          label="Transactions"
          value={totalTransactions}
          loading={loading}
        />
        <StatCard
          icon={<TrendingUp className="w-5 h-5 text-purple-400" />}
          label="Average per Transaction"
          value={totalTransactions > 0 ? `₦${((totalRevenue / totalTransactions) / 100).toLocaleString()}` : '₦0'}
          loading={loading}
        />
      </div>

      {/* Period toggle */}
      <div className="flex items-center gap-2">
        {periods.map(p => (
          <button
            key={p.value}
            onClick={() => setPeriod(p.value)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              period === p.value
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                : 'bg-gray-800 text-gray-400 border border-gray-700 hover:border-gray-600'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2">
          <ChartCard title="Revenue Trend" subtitle={`Aggregated ${period} revenue`} loading={loading} height="h-72">
            <AreaChart data={series} />
          </ChartCard>
        </div>
        <div>
          <ChartCard title="Revenue by Plan" subtitle="Current active subscriptions" loading={loading} height="h-72">
            {planLabels.length > 0 ? (
              <DoughnutChart labels={planLabels} values={planValues} />
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500 text-sm">
                No active subscriptions
              </div>
            )}
          </ChartCard>
        </div>
      </div>
    </div>
  );
}
