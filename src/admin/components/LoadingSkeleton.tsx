interface SkeletonProps {
  className?: string;
  count?: number;
}

export function Skeleton({ className = '' }: SkeletonProps) {
  return (
    <div className={`animate-pulse rounded bg-gray-700 ${className}`} />
  );
}

export function CardSkeleton() {
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

export function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
      <div className="divide-y divide-gray-700">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 p-4 animate-pulse">
            <div className="h-4 flex-1 rounded bg-gray-700" />
            <div className="h-4 w-24 rounded bg-gray-700" />
            <div className="h-4 w-20 rounded bg-gray-700" />
            <div className="h-4 w-16 rounded bg-gray-700" />
          </div>
        ))}
      </div>
    </div>
  );
}
