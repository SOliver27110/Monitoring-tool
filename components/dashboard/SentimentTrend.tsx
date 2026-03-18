import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { SentimentTrend as SentimentTrendType } from '@/lib/types';

interface SentimentTrendProps {
  trend: SentimentTrendType;
  thisWeekSupportive: number;
  lastWeekSupportive: number;
}

const trendConfig: Record<SentimentTrendType, {
  icon: React.ReactNode;
  label: string;
  className: string;
  bgClass: string;
}> = {
  improving: {
    icon: <TrendingUp className="h-5 w-5" />,
    label: 'Improving',
    className: 'text-green-700',
    bgClass: 'bg-green-50 border-green-200',
  },
  stable: {
    icon: <Minus className="h-5 w-5" />,
    label: 'Stable',
    className: 'text-gray-700',
    bgClass: 'bg-gray-50 border-gray-200',
  },
  worsening: {
    icon: <TrendingDown className="h-5 w-5" />,
    label: 'Worsening',
    className: 'text-red-700',
    bgClass: 'bg-red-50 border-red-200',
  },
};

export function SentimentTrend({ trend, thisWeekSupportive, lastWeekSupportive }: SentimentTrendProps) {
  const config = trendConfig[trend];

  return (
    <div className={`rounded-lg border p-4 ${config.bgClass}`}>
      <div className="text-sm text-gray-500 mb-2">Sentiment Trend</div>
      <div className={`flex items-center gap-2 ${config.className}`}>
        {config.icon}
        <span className="text-lg font-semibold">{config.label}</span>
      </div>
      <div className="mt-2 text-xs text-gray-500">
        Supportive: {thisWeekSupportive}% this week
        {lastWeekSupportive > 0 && ` vs ${lastWeekSupportive}% last week`}
      </div>
    </div>
  );
}
