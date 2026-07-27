import type { ReactNode } from 'react';

interface StatCardProps {
  icon: ReactNode;
  label: string;
  value: string | number;
  trend?: { value: string; positive: boolean };
  loading?: boolean;
  realtime?: boolean;
}

export function StatCard({ icon, label, value, trend, loading, realtime }: StatCardProps) {
  if (loading) {
    return (
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 animate-pulse">
        <div className="flex items-center justify-between mb-3">
          <div className="w-10 h-10 rounded-lg bg-gray-700" />
          <div className="w-16 h-4 rounded bg-gray-700" />
        </div>
        <div className="w-24 h-7 rounded bg-gray-700 mb-2" />
        <div className="w-20 h-3 rounded bg-gray-700" />
      </div>
    );
  }

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
          {icon}
        </div>
        {realtime && (
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs text-emerald-500 font-medium">Live</span>
          </div>
        )}
      </div>
      <p className="text-2xl font-bold text-white mb-1">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
      <div className="flex items-center gap-2">
        <p className="text-sm text-gray-400">{label}</p>
        {trend && (
          <span className={`text-xs font-medium ${trend.positive ? 'text-emerald-400' : 'text-red-400'}`}>
            {trend.positive ? '+' : ''}{trend.value}
          </span>
        )}
      </div>
    </div>
  );
}
