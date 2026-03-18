'use client';

interface BatchProgressProps {
  current: number;
  total: number;
}

export function BatchProgress({ current, total }: BatchProgressProps) {
  const percentage = total > 0 ? Math.round((current / total) * 100) : 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-600">
          Processing item {current} of {total}
        </span>
        <span className="font-medium text-brand-purple">{percentage}%</span>
      </div>
      <div className="h-2 w-full rounded-full bg-gray-200">
        <div
          className="h-2 rounded-full bg-brand-purple transition-all duration-300"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
