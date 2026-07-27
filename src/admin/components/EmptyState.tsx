import { PackageOpen } from 'lucide-react';

interface EmptyStateProps {
  title?: string;
  message?: string;
  action?: { label: string; onClick: () => void };
}

export function EmptyState({
  title = 'Nothing here yet',
  message = 'Data will appear here once available.',
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <PackageOpen className="w-16 h-16 text-gray-600 mb-4" />
      <h3 className="text-lg font-semibold text-gray-300 mb-1">{title}</h3>
      <p className="text-sm text-gray-500 mb-4 text-center max-w-sm">{message}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition-colors"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
