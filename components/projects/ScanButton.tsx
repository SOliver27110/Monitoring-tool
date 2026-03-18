'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { Radar } from 'lucide-react';

interface ScanResult {
  project_id: string;
  project_name: string;
  articles_found: number;
  articles_ingested: number;
  errors: string[];
}

interface ScanResponse {
  message: string;
  results: ScanResult[];
  pending: number;
}

export function ScanButton({ onComplete }: { onComplete?: () => void }) {
  const [scanning, setScanning] = useState(false);
  const [status, setStatus] = useState('');
  const { showToast } = useToast();

  async function handleScan() {
    setScanning(true);
    setStatus('Fetching articles…');

    try {
      // Phase 1: Fetch articles from RSS
      const res = await fetch('/api/scan', { method: 'POST' });
      if (!res.ok) {
        const text = await res.text();
        let message = 'Scan failed';
        try {
          message = JSON.parse(text).error ?? message;
        } catch {
          message = text || message;
        }
        throw new Error(message);
      }

      const data = (await res.json()) as ScanResponse;

      if (data.pending === 0) {
        showToast(data.message, 'success');
        onComplete?.();
        return;
      }

      // Phase 2: Analyse articles one by one
      let remaining = data.pending;
      let analysed = 0;
      let consecutiveErrors = 0;

      while (remaining > 0) {
        setStatus(`Analysing… ${analysed} done, ${remaining} remaining`);

        const analyseRes = await fetch('/api/analyse', { method: 'POST' });
        const result = await analyseRes.json();

        if (result.done) break;

        if (!analyseRes.ok) {
          consecutiveErrors++;
          if (consecutiveErrors >= 3) {
            showToast(
              `Analysis paused after ${analysed} article(s) — ${remaining} remaining. Try again later.`,
              'warning'
            );
            break;
          }
          continue;
        }

        consecutiveErrors = 0;
        analysed++;
        remaining = result.remaining ?? 0;
        onComplete?.();
      }

      if (consecutiveErrors < 3) {
        showToast(
          `Scan complete. ${analysed} article(s) analysed.`,
          'success'
        );
      }

      onComplete?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Scan failed';
      showToast(message, 'error');
    } finally {
      setScanning(false);
      setStatus('');
    }
  }

  return (
    <div className="flex items-center gap-3">
      <Button size="md" variant="secondary" onClick={handleScan} loading={scanning}>
        <Radar className="h-4 w-4" />
        {scanning ? 'Scanning…' : 'Scan for Coverage'}
      </Button>
      {status && (
        <span className="text-sm text-gray-500">{status}</span>
      )}
    </div>
  );
}
