'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Card, CardHeader } from '@/components/ui/Card';
import { ProjectAlertBadge } from '@/components/ui/AlertBadge';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';
import { RoleGate } from '@/components/ui/RoleGate';
import { EmptyState } from '@/components/ui/EmptyState';
import { SentimentTrend } from '@/components/dashboard/SentimentTrend';
import { CoverageVolume } from '@/components/dashboard/CoverageVolume';
import { NotableVoices } from '@/components/dashboard/NotableVoices';
import { ActionItems } from '@/components/dashboard/ActionItems';
import { ProjectFeeds } from '@/components/feeds/ProjectFeeds';
import { useToast } from '@/components/ui/Toast';
import { Pencil, FileText, BarChart3, Radar } from 'lucide-react';
import type { Project, AnalysisItem, AlertLevel, SentimentTrend as SentimentTrendType } from '@/lib/types';

function getWeekBounds(): { thisWeekStart: string; lastWeekStart: string; lastWeekEnd: string } {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

  const thisMonday = new Date(now);
  thisMonday.setDate(now.getDate() - diffToMonday);
  thisMonday.setHours(0, 0, 0, 0);

  const lastMonday = new Date(thisMonday);
  lastMonday.setDate(thisMonday.getDate() - 7);

  const lastSunday = new Date(thisMonday);
  lastSunday.setDate(thisMonday.getDate() - 1);
  lastSunday.setHours(23, 59, 59, 999);

  return {
    thisWeekStart: thisMonday.toISOString(),
    lastWeekStart: lastMonday.toISOString(),
    lastWeekEnd: lastSunday.toISOString(),
  };
}

function calculateSentimentTrend(
  thisWeekItems: AnalysisItem[],
  lastWeekItems: AnalysisItem[]
): { trend: SentimentTrendType; thisWeekPct: number; lastWeekPct: number } {
  const thisWeekSupportive = thisWeekItems.filter((i) => i.sentiment === 'Supportive').length;
  const thisWeekPct = thisWeekItems.length > 0
    ? Math.round((thisWeekSupportive / thisWeekItems.length) * 100)
    : 0;

  if (lastWeekItems.length === 0) {
    return { trend: 'stable', thisWeekPct, lastWeekPct: 0 };
  }

  const lastWeekSupportive = lastWeekItems.filter((i) => i.sentiment === 'Supportive').length;
  const lastWeekPct = Math.round((lastWeekSupportive / lastWeekItems.length) * 100);

  const diff = thisWeekPct - lastWeekPct;

  if (diff > 10) return { trend: 'improving', thisWeekPct, lastWeekPct };
  if (diff < -10) return { trend: 'worsening', thisWeekPct, lastWeekPct };
  return { trend: 'stable', thisWeekPct, lastWeekPct };
}

function aggregateVoices(items: AnalysisItem[]): Array<{ name: string; count: number }> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    for (const voice of item.notable_voices) {
      counts[voice] = (counts[voice] || 0) + 1;
    }
  }
  return Object.entries(counts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

export default function ProjectDashboardPage() {
  const params = useParams();
  const projectId = params.id as string;
  const [project, setProject] = useState<Project | null>(null);
  const [allItems, setAllItems] = useState<AnalysisItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const { showToast } = useToast();

  function loadData() {
    return Promise.all([
      fetch(`/api/projects/${projectId}`).then((r) => r.json()),
      fetch(`/api/items?project_id=${projectId}&review_status=approved`).then((r) => r.json()),
    ])
      .then(([proj, items]) => {
        setProject(proj);
        setAllItems(Array.isArray(items) ? items : []);
      })
      .catch(() => {});
  }

  useEffect(() => {
    loadData().finally(() => setLoading(false));
  }, [projectId]);

  async function handleScan() {
    setScanning(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/scan`, { method: 'POST' });
      const text = await res.text();

      let data: { message?: string; error?: string };
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error('Scan returned an unexpected response — it may have timed out. Try again.');
      }

      if (!res.ok) {
        throw new Error(data.error ?? 'Scan failed');
      }

      showToast(data.message ?? 'Scan complete', 'success');
      // Refresh dashboard data after scan
      await loadData();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Scan failed';
      showToast(message, 'error');
    } finally {
      setScanning(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!project) {
    return (
      <EmptyState
        title="Project not found"
        description="The project you are looking for does not exist."
      />
    );
  }

  const { thisWeekStart, lastWeekStart, lastWeekEnd } = getWeekBounds();

  const thisWeekItems = allItems.filter(
    (i) => new Date(i.created_at) >= new Date(thisWeekStart)
  );
  const lastWeekItems = allItems.filter(
    (i) =>
      new Date(i.created_at) >= new Date(lastWeekStart) &&
      new Date(i.created_at) <= new Date(lastWeekEnd)
  );

  const { trend, thisWeekPct, lastWeekPct } = calculateSentimentTrend(thisWeekItems, lastWeekItems);
  const voices = aggregateVoices(thisWeekItems);
  const actionItems = thisWeekItems.filter((i) => i.alert_level === 'Action Required');
  const projectSpecificItems = thisWeekItems.filter((i) => i.match_type === 'project_specific');
  const areaIntelItems = thisWeekItems.filter((i) => i.match_type !== 'project_specific');
  const hasData = allItems.length > 0;

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{project.client_name}</h1>
          <p className="mt-1 text-sm text-gray-500">{project.site_name}</p>
        </div>
        <div className="flex items-center gap-3">
          <ProjectAlertBadge level={project.alert_level as AlertLevel} />
          <RoleGate allowedRoles={['admin', 'project_lead']}>
            <Link href={`/projects/${projectId}/edit`}>
              <Button variant="secondary" size="sm">
                <Pencil className="h-4 w-4" />
                Edit
              </Button>
            </Link>
          </RoleGate>
          <Button
            variant="primary"
            size="sm"
            onClick={handleScan}
            loading={scanning}
          >
            <Radar className="h-4 w-4" />
            {scanning ? 'Scanning...' : 'Scan for Coverage'}
          </Button>
          <Link href={`/projects/${projectId}/report`}>
            <Button variant="secondary" size="sm">
              <FileText className="h-4 w-4" />
              Report
            </Button>
          </Link>
        </div>
      </div>

      {/* Project details */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <Card>
          <div className="text-sm text-gray-500">Planning Reference</div>
          <div className="mt-1 font-medium">{project.planning_reference}</div>
        </Card>
        <Card>
          <div className="text-sm text-gray-500">LPA</div>
          <div className="mt-1 font-medium">{project.lpa}</div>
        </Card>
        <Card>
          <div className="text-sm text-gray-500">Stage</div>
          <div className="mt-1">
            <Badge variant="purple">{project.application_stage}</Badge>
          </div>
        </Card>
        <Card>
          <div className="text-sm text-gray-500">Lead</div>
          <div className="mt-1 font-medium">
            {project.assigned_lead
              ? [project.assigned_lead.first_name, project.assigned_lead.last_name]
                  .filter(Boolean)
                  .join(' ') || project.assigned_lead.email
              : '\u2014'}
          </div>
        </Card>
      </div>

      {/* Feeds section */}
      <div className="mb-6">
        <ProjectFeeds project={project} />
      </div>

      {!hasData ? (
        <Card>
          <EmptyState
            title="No coverage data yet"
            description="Analyse content and assign it to this project to see dashboard metrics."
            icon={<BarChart3 className="h-12 w-12" />}
          />
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Action items first */}
          <ActionItems items={actionItems} />

          {/* Metrics row */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <CoverageVolume thisWeek={thisWeekItems.length} lastWeek={lastWeekItems.length} />
            <SentimentTrend
              trend={trend}
              thisWeekSupportive={thisWeekPct}
              lastWeekSupportive={lastWeekPct}
            />
            <NotableVoices voices={voices} />
          </div>

          {/* Project-specific coverage */}
          <Card>
            <CardHeader
              title="Project Coverage This Week"
              description={`${projectSpecificItems.length} item${projectSpecificItems.length !== 1 ? 's' : ''} directly mentioning this project`}
            />
            {projectSpecificItems.length === 0 ? (
              <p className="text-sm text-gray-500 py-4">No project-specific mentions this week</p>
            ) : (
              <div className="space-y-3">
                {projectSpecificItems.map((item) => (
                  <div key={item.id} className="rounded-lg border border-gray-100 p-3">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <Badge variant="info">Project</Badge>
                      <Badge
                        variant={
                          item.sentiment === 'Supportive' ? 'success' :
                          item.sentiment === 'Opposed' ? 'danger' :
                          item.sentiment === 'Mixed' ? 'warning' : 'default'
                        }
                      >
                        {item.sentiment}
                      </Badge>
                      <span className="text-xs text-gray-400">
                        {new Date(item.created_at).toLocaleDateString('en-GB')}
                      </span>
                    </div>
                    <p className="text-sm text-gray-900">{item.summary}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Area intelligence */}
          <Card>
            <CardHeader
              title="Area Intelligence This Week"
              description={`${areaIntelItems.length} item${areaIntelItems.length !== 1 ? 's' : ''} from the wider area`}
            />
            {areaIntelItems.length === 0 ? (
              <p className="text-sm text-gray-500 py-4">No area intelligence this week</p>
            ) : (
              <div className="space-y-3">
                {areaIntelItems.map((item) => (
                  <div key={item.id} className="rounded-lg border border-gray-100 p-3">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <Badge variant="default">Area Intel</Badge>
                      <Badge
                        variant={
                          item.sentiment === 'Supportive' ? 'success' :
                          item.sentiment === 'Opposed' ? 'danger' :
                          item.sentiment === 'Mixed' ? 'warning' : 'default'
                        }
                      >
                        {item.sentiment}
                      </Badge>
                      <span className="text-xs text-gray-400">
                        {new Date(item.created_at).toLocaleDateString('en-GB')}
                      </span>
                    </div>
                    <p className="text-sm text-gray-900">{item.summary}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
