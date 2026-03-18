import { AlertTriangle, ExternalLink } from 'lucide-react';
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
            {(item.source_name || item.published_at) && (
              <div className="flex flex-wrap items-center gap-2 mb-1 mt-1">
                {item.source_name && (
                  <span className="text-xs font-medium text-gray-600">{item.source_name}</span>
                )}
                {item.published_at && (
                  <span className="text-xs text-gray-400">
                    {new Date(item.published_at).toLocaleDateString('en-GB', {
                      day: 'numeric', month: 'short', year: 'numeric',
                    })}
                  </span>
                )}
              </div>
            )}
            <p className="text-sm text-gray-900">{item.summary}</p>
            <p className="mt-1 text-xs text-red-700 font-medium">{item.recommended_action}</p>
            {item.source_url && (
              <a
                href={item.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-xs text-brand-purple hover:underline"
              >
                Read full article
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
