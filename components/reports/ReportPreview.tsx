'use client';

import { ProjectAlertBadge } from '@/components/ui/AlertBadge';
import type { ReportContent, AlertLevel } from '@/lib/types';

interface ReportPreviewProps {
  content: ReportContent;
  generatedAt: string;
}

const trendLabel: Record<string, string> = {
  improving: 'Improving',
  stable: 'Stable',
  worsening: 'Worsening',
};

export function ReportPreview({ content, generatedAt }: ReportPreviewProps) {
  const notableVoices = content.notable_voices ?? [];
  const sourcesReviewed = content.sources_reviewed ?? [];
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
      <div className="border-b border-gray-200 pb-4">
        <h2 className="text-xl font-bold text-gray-900">
          {content.client_name} &mdash; {content.site_name}
        </h2>
        <p className="text-xs text-gray-400 mt-1">
          Generated on {new Date(generatedAt).toLocaleDateString('en-GB', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <span className="text-sm text-gray-500">Coverage volume this week</span>
          <div className="text-2xl font-bold text-gray-900">{content.coverage_volume}</div>
        </div>
        <div>
          <span className="text-sm text-gray-500">Sentiment trend</span>
          <div className="text-lg font-semibold text-gray-900">
            {trendLabel[content.sentiment_trend] ?? content.sentiment_trend}
          </div>
        </div>
        <div>
          <span className="text-sm text-gray-500">Alert level</span>
          <div className="mt-1">
            <ProjectAlertBadge level={content.alert_level as AlertLevel} />
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-1">Key developments</h3>
        <p className="text-sm text-gray-900">{content.key_developments}</p>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-1">Notable voices</h3>
        <p className="text-sm text-gray-900">
          {notableVoices.length > 0
            ? notableVoices.join(', ')
            : 'None identified this week'}
        </p>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-1">Items requiring action</h3>
        <p className="text-sm text-gray-900">{content.items_requiring_action}</p>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-1">Sources reviewed</h3>
        <ul className="text-sm text-gray-900 list-disc list-inside">
          {sourcesReviewed.map((source, i) => (
            <li key={i}>{source}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
