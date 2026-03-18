'use client';

import { Badge } from '@/components/ui/Badge';
import { ItemAlertBadge } from '@/components/ui/AlertBadge';
import type { AnalysisResult as AnalysisResultType, Sentiment } from '@/lib/types';

interface AnalysisResultProps {
  result: AnalysisResultType;
}

const sentimentVariant: Record<Sentiment, 'success' | 'default' | 'danger' | 'warning'> = {
  Supportive: 'success',
  Neutral: 'default',
  Opposed: 'danger',
  Mixed: 'warning',
};

export function AnalysisResult({ result }: AnalysisResultProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={sentimentVariant[result.sentiment]}>{result.sentiment}</Badge>
        <ItemAlertBadge level={result.alert_level} />
      </div>

      <div>
        <h4 className="text-sm font-medium text-gray-500 mb-1">Summary</h4>
        <p className="text-sm text-gray-900">{result.summary}</p>
      </div>

      <div>
        <h4 className="text-sm font-medium text-gray-500 mb-1">Recommended Action</h4>
        <p className="text-sm text-gray-900">{result.recommended_action}</p>
      </div>

      {result.notable_voices.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-gray-500 mb-1">Notable Voices</h4>
          <div className="flex flex-wrap gap-1.5">
            {result.notable_voices.map((voice, i) => (
              <Badge key={i} variant="purple">{voice}</Badge>
            ))}
          </div>
        </div>
      )}

      {result.key_themes.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-gray-500 mb-1">Key Themes</h4>
          <div className="flex flex-wrap gap-1.5">
            {result.key_themes.map((theme, i) => (
              <Badge key={i} variant="info">{theme}</Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
