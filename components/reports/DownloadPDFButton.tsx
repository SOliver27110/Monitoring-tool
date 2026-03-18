'use client';

import { useState } from 'react';
import { pdf } from '@react-pdf/renderer';
import { ReportPDF } from './ReportPDF';
import { Button } from '@/components/ui/Button';
import { Download } from 'lucide-react';
import type { ReportContent } from '@/lib/types';

interface DownloadPDFButtonProps {
  content: ReportContent;
  generatedAt: string;
  weekStart: string;
  weekEnd: string;
  fileName: string;
}

export function DownloadPDFButton({
  content,
  generatedAt,
  weekStart,
  weekEnd,
  fileName,
}: DownloadPDFButtonProps) {
  const [loading, setLoading] = useState(false);

  async function handleDownload() {
    setLoading(true);
    try {
      const blob = await pdf(
        <ReportPDF
          content={content}
          generatedAt={generatedAt}
          weekStart={weekStart}
          weekEnd={weekEnd}
        />
      ).toBlob();

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('PDF generation failed:', err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button variant="secondary" size="sm" onClick={handleDownload} loading={loading}>
      <Download className="h-4 w-4" />
      {loading ? 'Preparing...' : 'Download PDF'}
    </Button>
  );
}
