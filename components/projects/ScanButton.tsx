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
}

export function ScanButton({ onComplete }: { onComplete?: () => void }) {
  const [scanning, setScanning] = useState(false);
  const { showToast } = useToast();

  async function handleScan() {
    setScanning(true);
    try {
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
      showToast(data.message, 'success');
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
