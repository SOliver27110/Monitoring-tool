'use client';

import { Badge } from '@/components/ui/Badge';
import { ItemAlertBadge } from '@/components/ui/AlertBadge';
import { Button } from '@/components/ui/Button';
import { Check, X, ExternalLink } from 'lucide-react';
import type { AnalysisItem, Sentiment } from '@/lib/types';

interface QueueItemProps {
  item: AnalysisItem;
  selected: boolean;
  onApprove: () => void;
  onDismiss: () => void;
  onClick: () => void;
}

const sentimentVariant: Record<Sentiment, 'success' | 'default' | 'danger' | 'warning'> = {
  Supportive: 'success',
  Neutral: 'default',
  Opposed: 'danger',
  Mixed: 'warning',
};

export function QueueItem({ item, selected, onApprove, onDismiss, onClick }: QueueItemProps) {
  const isPending = item.review_status === 'pending_analysis';
  const isActionRequired = !isPending && item.alert_level === 'Action Required';

  return (
    <div
      onClick={onClick}
      className={`
        rounded-lg border bg-white p-4 transition-all cursor-pointer
        ${isActionRequired ? 'border-l-4 border-l-red-500' : ''}
        ${isPending ? 'opacity-60' : ''}
        ${selected ? 'ring-2 ring-brand-purple border-brand-purple' : 'border-gray-200 hover:border-gray-300'}
      `}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            {isPending ? (
              <Badge variant="default">Analysing…</Badge>
            ) : (
              <>
                <Badge variant={sentimentVariant[item.sentiment as Sentiment]}>
                  {item.sentiment}
                </Badge>
                <ItemAlertBadge level={(item.alert_level ?? 'Routine') as NonNullable<AnalysisItem['alert_level']>} />
              </>
            )}
            {item.project && (
              <Badge variant="purple">
                {item.project.client_name}
              </Badge>
            )}
          </div>
          {(item.source_name || item.published_at) && (
            <div className="flex flex-wrap items-center gap-2 mb-1">
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
          <p className="text-sm text-gray-900 mb-1">{isPending ? 'Waiting for analysis…' : item.summary}</p>
          {!isPending && (
            <p className="text-xs text-gray-500 italic">{item.recommended_action}</p>
          )}
          {item.source_url && (
            <a
              href={item.source_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="mt-1 inline-flex items-center gap-1 text-xs text-brand-purple hover:underline"
            >
              Read full article
              <ExternalLink className="h-3 w-3" />
            </a>
          )}

          {item.notable_voices.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {item.notable_voices.map((voice, i) => (
                <span key={i} className="text-xs text-gray-500 bg-gray-50 rounded px-1.5 py-0.5">
                  {voice}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onApprove();
            }}
            title="Approve (a)"
            className="text-green-600 hover:text-green-700 hover:bg-green-50"
          >
            <Check className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onDismiss();
            }}
            title="Dismiss (d)"
            className="text-red-600 hover:text-red-700 hover:bg-red-50"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
