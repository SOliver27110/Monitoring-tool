'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { Radar } from 'lucide-react';

interface ScanStats {
  total_fetched: number;
  unique_after_dedup: number;
  matched_at_least_one_project: number;
  matched_multiple_projects: number;
  analysed: number;
}

interface ScanResponse {
  message: string;
  stats: ScanStats | null;
  errors?: string[];
}

function formatStats(stats: ScanStats): string {
  return [
    `${stats.total_fetched} fetched`,
    `${stats.unique_after_dedup} unique`,
    `${stats.matched_at_least_one_project} matched`,
    `${stats.matched_multiple_projects} multi-project`,
    `${stats.analysed} analysed`,
  ].join(' · ');
}

export function ScanButton({ onComplete }: { onComplete?: () => void }) {
  const [scanning, setScanning] = useState(false);
  const { showToast } = useToast();

  async function handleScan() {
    setScanning(true);
    try {
      const res = await fetch('/api/scan', { method: 'POST' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'Scan failed');
      }

      const data = (await res.json()) as ScanResponse;
      const detail = data.stats ? formatStats(data.stats) : data.message;
      showToast(`Scan complete: ${detail}`, 'success');
      onComplete?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Scan failed';
      showToast(message, 'error');
    } finally {
      setScanning(false);
    }
  }

  return (
    <Button size="md" variant="secondary" onClick={handleScan} loading={scanning}>
      <Radar className="h-4 w-4" />
      {scanning ? 'Scanning...' : 'Scan for Coverage'}
    </Button>
  );
}
