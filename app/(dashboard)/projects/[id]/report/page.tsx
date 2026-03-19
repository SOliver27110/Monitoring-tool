'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { RoleGate } from '@/components/ui/RoleGate';
import { ReportPreview } from '@/components/reports/ReportPreview';
import { useToast } from '@/components/ui/Toast';
import { FileText, Mail } from 'lucide-react';
import type { Report, ReportContent, Project } from '@/lib/types';

// Dynamic import for PDF button to avoid SSR issues with react-pdf
const DownloadPDFButton = dynamic(
  () => import('@/components/reports/DownloadPDFButton').then((mod) => mod.DownloadPDFButton),
  { ssr: false, loading: () => <Spinner size="sm" /> }
);

export default function ProjectReportPage() {
  const params = useParams();
  const projectId = params.id as string;
  const { showToast } = useToast();
  const [project, setProject] = useState<Project | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`/api/projects/${projectId}`).then((r) => r.json()),
      fetch(`/api/reports?project_id=${projectId}`).then((r) => r.json()),
    ])
      .then(([proj, reps]) => {
        setProject(proj);
        setReports(Array.isArray(reps) ? reps : []);
      })
      .catch(() => {
        showToast('Failed to load report data', 'error');
      })
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function generateReport() {
    setGenerating(true);
    try {
      const res = await fetch('/api/reports/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'Failed to generate report');
      }

      const newReport = await res.json();
      setReports((prev) => [newReport, ...prev]);
      showToast('Weekly report generated', 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate report';
      showToast(message, 'error');
    } finally {
      setGenerating(false);
    }
  }

  function openMailto(report: Report) {
    const content = report.report_content as ReportContent;
    const subject = encodeURIComponent(
      `Weekly Media Report: ${content.client_name} — ${content.site_name} (${new Date(report.week_end).toLocaleDateString('en-GB')})`
    );
    window.open(`mailto:?subject=${subject}`, '_blank');
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!project) {
    return <EmptyState title="Project not found" description="Unable to load project." />;
  }

  const latestReport = reports[0];

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Weekly Report</h1>
          <p className="mt-1 text-sm text-gray-500">
            {project.client_name} &mdash; {project.site_name}
          </p>
        </div>
        <RoleGate allowedRoles={['admin', 'project_lead']}>
          <Button onClick={generateReport} loading={generating}>
            <FileText className="h-4 w-4" />
            Generate Weekly Report
          </Button>
        </RoleGate>
      </div>

      {reports.length === 0 ? (
        <Card>
          <EmptyState
            title="No reports generated"
            description="Generate your first weekly report to see it here. Reports are locked on generation and cannot be edited."
            icon={<FileText className="h-12 w-12" />}
            action={
              <RoleGate allowedRoles={['admin', 'project_lead']}>
                <Button onClick={generateReport} loading={generating}>
                  Generate Report
                </Button>
              </RoleGate>
            }
          />
        </Card>
      ) : (
        <div className="space-y-6">
          {latestReport && (
            <div>
              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-lg font-semibold text-gray-900">Latest Report</h2>
                <div className="flex items-center gap-2">
                  <DownloadPDFButton
                    content={latestReport.report_content as ReportContent}
                    generatedAt={latestReport.locked_at}
                    weekStart={latestReport.week_start}
                    weekEnd={latestReport.week_end}
                    fileName={`report-${project.client_name.toLowerCase().replace(/\s+/g, '-')}-${latestReport.week_end}.pdf`}
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => openMailto(latestReport)}
                  >
                    <Mail className="h-4 w-4" />
                    Email
                  </Button>
                </div>
              </div>
              <p className="mb-3 text-xs text-gray-400">
                Step 1: Download the PDF. Step 2: Click Email to open your mail client with a pre-filled subject line, then attach the downloaded file.
              </p>
              <ReportPreview
                content={latestReport.report_content as ReportContent}
                generatedAt={latestReport.locked_at}
              />
            </div>
          )}

          {reports.length > 1 && (
            <Card>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Previous Reports</h3>
              <div className="divide-y divide-gray-100">
                {reports.slice(1).map((report) => (
                  <div key={report.id} className="flex items-center justify-between py-3">
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        Week of {new Date(report.week_start).toLocaleDateString('en-GB')} &ndash;{' '}
                        {new Date(report.week_end).toLocaleDateString('en-GB')}
                      </div>
                      <div className="text-xs text-gray-500">
                        {report.coverage_count} items &middot; {report.sentiment_trend} &middot;
                        Generated {new Date(report.locked_at).toLocaleDateString('en-GB')}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
