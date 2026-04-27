'use client';

import { Badge } from '@/components/ui/Badge';
import { ItemAlertBadge } from '@/components/ui/AlertBadge';
import { Button } from '@/components/ui/Button';
import { RoleGate } from '@/components/ui/RoleGate';
import { Check, X, RefreshCw, ExternalLink } from 'lucide-react';
import type { AnalysisItem, Sentiment } from '@/lib/types';
import { FEED_SOURCE_LABELS, type FeedSourceId } from '@/lib/feedSourceLabels';

interface QueueItemProps {
  item: AnalysisItem;
  selected: boolean;
  onApprove: () => void;
  onDismiss: () => void;
  onReanalyse: () => void;
  onClick: () => void;
}

const sentimentVariant: Record<Sentiment, 'success' | 'default' | 'danger' | 'warning'> = {
  Supportive: 'success',
  Neutral: 'default',
  Opposed: 'danger',
  Mixed: 'warning',
};

export function QueueItem({ item, selected, onApprove, onDismiss, onReanalyse, onClick }: QueueItemProps) {
  const isPending = item.analysis_status === 'pending' || item.analysis_status === 'analysing';
  const isFailed = item.analysis_status === 'failed';
  const isComplete = item.analysis_status === 'complete';
  const isActionRequired = isComplete && item.alert_level === 'Action Required';
  const isPaywalled = isComplete && item.extraction_status === 'paywalled';
  const notableVoices = item.notable_voices ?? [];

  return (
    <div
      onClick={onClick}
      className={`
        rounded-lg border bg-white p-4 transition-all cursor-pointer
        ${isActionRequired ? 'border-l-4 border-l-red-500' : ''}
        ${selected ? 'ring-2 ring-brand-purple border-brand-purple' : 'border-gray-200 hover:border-gray-300'}
      `}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            {isPending && (
              <Badge variant="default">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-gray-400 animate-pulse" />
                  Analyzing…
                </span>
              </Badge>
            )}
            {isFailed && (
              <>
                <Badge variant="danger">Analysis failed</Badge>
                <span className="text-xs text-gray-500">
                  {item.analysis_attempts}/3 attempts
                </span>
              </>
            )}
            {isComplete && item.sentiment && (
              <Badge variant={sentimentVariant[item.sentiment as Sentiment]}>
                {item.sentiment}
              </Badge>
            )}
            {isComplete && (
              <ItemAlertBadge level={item.alert_level as AnalysisItem['alert_level']} />
            )}
            {item.project && (
              <Badge variant="purple">{item.project.client_name}</Badge>
            )}
            {item.match_type === 'project' && (
              <Badge variant="info">Project match</Badge>
            )}
            {item.match_type === 'client' && (
              <Badge variant="default">Client match</Badge>
            )}
            {item.feed_source_id && (
              <Badge variant="default">
                {FEED_SOURCE_LABELS[item.feed_source_id as FeedSourceId] ?? item.feed_source_id}
              </Badge>
            )}
          </div>

          {isPending && (
            <>
              <p className="text-xs font-medium text-gray-500 mb-1">Pending analysis</p>
              <p className="text-sm text-gray-700 line-clamp-2">{item.source_text}</p>
              {item.source_url && (
                <a
                  href={item.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="mt-1 inline-flex items-center gap-1 text-xs text-brand-purple hover:underline"
                >
                  <ExternalLink className="h-3 w-3" />
                  Open article
                </a>
              )}
            </>
          )}

          {isFailed && (
            <>
              <p className="text-sm text-gray-700 line-clamp-2">{item.source_text}</p>
              {item.analysis_last_error && (
                <p
                  className="mt-1 text-xs text-red-600 italic truncate"
                  title={item.analysis_last_error}
                >
                  {item.analysis_last_error}
                </p>
              )}
              {item.source_url && (
                <a
                  href={item.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="mt-1 inline-flex items-center gap-1 text-xs text-brand-purple hover:underline"
                >
                  <ExternalLink className="h-3 w-3" />
                  Open article
                </a>
              )}
            </>
          )}

          {isComplete && (
            <>
              {item.source_url ? (
                <a
                  href={item.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-sm text-gray-900 mb-1 block hover:text-brand-purple hover:underline"
                >
                  {item.summary ?? '—'}
                  <ExternalLink className="inline-block h-3 w-3 ml-1 align-text-top opacity-60" />
                </a>
              ) : (
                <p className="text-sm text-gray-900 mb-1">{item.summary ?? '—'}</p>
              )}
              <p className="text-xs text-gray-500 italic">{item.recommended_action ?? '—'}</p>

              {notableVoices.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {notableVoices.map((voice, i) => (
                    <span key={i} className="text-xs text-gray-500 bg-gray-50 rounded px-1.5 py-0.5">
                      {voice}
                    </span>
                  ))}
                </div>
              )}

              {isPaywalled && (
                <p className="mt-2 inline-block rounded border border-yellow-200 bg-yellow-50 px-2 py-1 text-xs text-yellow-700">
                  Analysis based on summary — full article paywalled
                </p>
              )}
            </>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {isComplete && (
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
          )}
          {isFailed && (
            <RoleGate allowedRoles={['admin', 'project_lead']}>
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onReanalyse();
                }}
                title="Re-analyse"
                className="text-brand-purple hover:bg-purple-50"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </RoleGate>
          )}
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
