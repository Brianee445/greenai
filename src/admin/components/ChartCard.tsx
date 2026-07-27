import type { ReactNode } from 'react';

interface ChartCardProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  loading?: boolean;
  height?: string;
}

export function ChartCard({ title, subtitle, children, loading, height = 'h-64' }: ChartCardProps) {
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-gray-200">{title}</h3>
        {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      <div className={loading ? `${height} flex items-center justify-center` : height}>
        {loading ? (
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        ) : (
          children
        )}
      </div>
    </div>
  );
}
