'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { Brain } from 'lucide-react';

interface AnalysePendingButtonProps {
  onComplete?: () => void;
  disabled?: boolean;
}

interface AnalyseResponse {
  processed: number;
  completed: number;
  failed: number;
  still_pending: number;
}

export function AnalysePendingButton({ onComplete, disabled }: AnalysePendingButtonProps) {
  const [running, setRunning] = useState(false);
  const { showToast } = useToast();

  async function handleClick() {
    setRunning(true);
    try {
      const res = await fetch('/api/analyse-pending', { method: 'POST' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'Failed to analyse pending');
      }
      const data = (await res.json()) as AnalyseResponse;

      const parts: string[] = [];
      if (data.processed === 0) {
        parts.push('Nothing pending to analyse');
      } else {
        parts.push(`Analysed ${data.completed} item${data.completed === 1 ? '' : 's'}`);
        if (data.failed > 0) {
          parts.push(`${data.failed} failed`);
        }
        if (data.still_pending > 0) {
          parts.push(`${data.still_pending} still pending`);
        }
      }
      showToast(parts.join(', '), data.failed > 0 ? 'info' : 'success');
      onComplete?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to analyse pending';
      showToast(message, 'error');
    } finally {
      setRunning(false);
    }
  }

  return (
    <Button
      size="sm"
      variant="secondary"
      onClick={handleClick}
      loading={running}
      disabled={disabled}
    >
      <Brain className="h-4 w-4" />
      {running ? 'Analysing…' : 'Analyse pending'}
    </Button>
  );
}
