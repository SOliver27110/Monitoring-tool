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
  project_matches: number;
  client_matches: number;
  errors: string[];
}

interface ScanResponse {
  message: string;
  results: ScanResult[];
}

interface ScanButtonProps {
  projectId?: string;
  onComplete?: () => void;
}

export function ScanButton({ projectId, onComplete }: ScanButtonProps) {
  const [scanning, setScanning] = useState(false);
  const { showToast } = useToast();

  async function handleScan() {
    setScanning(true);
    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: projectId ? { 'Content-Type': 'application/json' } : undefined,
        body: projectId ? JSON.stringify({ project_id: projectId }) : undefined,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'Scan failed');
      }

      const data = (await res.json()) as ScanResponse;

      if (projectId) {
        const result = data.results.find((r) => r.project_id === projectId);
        if (result) {
          const parts = [
            `${result.project_name}: ${result.articles_ingested} new article${
              result.articles_ingested === 1 ? '' : 's'
            }`,
          ];
          if (result.project_matches || result.client_matches) {
            parts.push(
              `(${result.project_matches} project, ${result.client_matches} client)`
            );
          }
          if (result.errors.length > 0) {
            parts.push(`${result.errors.length} error${result.errors.length === 1 ? '' : 's'}`);
          }
          showToast(parts.join(' '), result.errors.length > 0 ? 'info' : 'success');
        } else {
          showToast(data.message, 'success');
        }
      } else {
        showToast(data.message, 'success');
      }

      onComplete?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Scan failed';
      showToast(message, 'error');
    } finally {
      setScanning(false);
    }
  }

  const label = projectId
    ? scanning
      ? 'Scanning...'
      : 'Scan now'
    : scanning
      ? 'Scanning...'
      : 'Scan for Coverage';

  return (
    <Button size="md" variant="secondary" onClick={handleScan} loading={scanning}>
      <Radar className="h-4 w-4" />
      {label}
    </Button>
  );
}
