import { AlertTriangle } from 'lucide-react';
import { ItemAlertBadge } from '@/components/ui/AlertBadge';
import { Badge } from '@/components/ui/Badge';
import type { AnalysisItem, Sentiment } from '@/lib/types';

interface ActionItemsProps {
  items: AnalysisItem[];
}

const sentimentVariant: Record<Sentiment, 'success' | 'default' | 'danger' | 'warning'> = {
  Supportive: 'success',
  Neutral: 'default',
  Opposed: 'danger',
  Mixed: 'warning',
};

export function ActionItems({ items }: ActionItemsProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className="h-4 w-4 text-red-600" />
        <span className="text-sm font-semibold text-red-800">
          Items Requiring Action ({items.length})
        </span>
      </div>
      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.id} className="rounded-lg bg-white border border-red-100 p-3">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <ItemAlertBadge level={item.alert_level} />
              <Badge variant={sentimentVariant[item.sentiment as Sentiment]}>
                {item.sentiment}
              </Badge>
            </div>
            <p className="text-sm text-gray-900">{item.summary}</p>
            <p className="mt-1 text-xs text-red-700 font-medium">{item.recommended_action}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
