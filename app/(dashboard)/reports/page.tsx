'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { Badge } from '@/components/ui/Badge';
import { ProjectAlertBadge } from '@/components/ui/AlertBadge';
import { useToast } from '@/components/ui/Toast';
import { FileText } from 'lucide-react';
import type { Report, AlertLevel } from '@/lib/types';

export default function ReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();

  useEffect(() => {
    fetch('/api/reports')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setReports(data);
      })
      .catch(() => {
        showToast('Failed to load reports', 'error');
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div>
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
          <p className="mt-1 text-sm text-gray-500">Generated weekly reports for all projects</p>
        </div>
        <div className="flex justify-center py-12">
          <Spinner size="lg" />
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
        <p className="mt-1 text-sm text-gray-500">Generated weekly reports for all projects</p>
      </div>

      {reports.length === 0 ? (
        <Card>
          <EmptyState
            title="No reports generated"
            description="Weekly reports will appear here once generated from project dashboards."
            icon={<FileText className="h-12 w-12" />}
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {reports.map((report) => {
            const project = report.project;
            return (
              <Link
                key={report.id}
                href={`/projects/${report.project_id}/report`}
                className="block rounded-lg border border-gray-200 bg-white p-4 hover:border-brand-purple/30 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-medium text-gray-900">
                      {project?.client_name ?? 'Unknown'} &mdash; {project?.site_name ?? ''}
                    </div>
                    <div className="mt-1 text-sm text-gray-500">
                      Week of {new Date(report.week_start).toLocaleDateString('en-GB')} &ndash;{' '}
                      {new Date(report.week_end).toLocaleDateString('en-GB')}
                    </div>
                  </div>
                  <ProjectAlertBadge level={report.alert_level as AlertLevel} />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                  <span>{report.coverage_count} items</span>
                  <span>&middot;</span>
                  <Badge
                    variant={
                      report.sentiment_trend === 'improving' ? 'success' :
                      report.sentiment_trend === 'worsening' ? 'danger' : 'default'
                    }
                  >
                    {report.sentiment_trend}
                  </Badge>
                  <span>&middot;</span>
                  <span>
                    Generated {new Date(report.locked_at).toLocaleDateString('en-GB')}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
