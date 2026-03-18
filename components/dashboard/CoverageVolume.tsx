import { BarChart3, ArrowUp, ArrowDown, Minus } from 'lucide-react';

interface CoverageVolumeProps {
  thisWeek: number;
  lastWeek: number;
}

export function CoverageVolume({ thisWeek, lastWeek }: CoverageVolumeProps) {
  const diff = thisWeek - lastWeek;
  const percentChange = lastWeek > 0 ? Math.round((diff / lastWeek) * 100) : 0;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="text-sm text-gray-500 mb-2">Coverage Volume</div>
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-bold text-gray-900">{thisWeek}</span>
        <span className="text-sm text-gray-500">this week</span>
      </div>
      <div className="mt-2 flex items-center gap-1.5 text-sm">
        {diff > 0 && (
          <>
            <ArrowUp className="h-4 w-4 text-green-600" />
            <span className="text-green-600">+{diff} ({percentChange}%)</span>
          </>
        )}
        {diff < 0 && (
          <>
            <ArrowDown className="h-4 w-4 text-red-600" />
            <span className="text-red-600">{diff} ({percentChange}%)</span>
          </>
        )}
        {diff === 0 && (
          <>
            <Minus className="h-4 w-4 text-gray-400" />
            <span className="text-gray-500">Same as last week</span>
          </>
        )}
        <span className="text-gray-400 ml-1">vs {lastWeek} last week</span>
      </div>
    </div>
  );
}
