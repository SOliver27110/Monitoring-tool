'use client';

import { useEffect, useState, useCallback } from 'react';
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
import { ProjectReview } from '@/components/review/ProjectReview';
import { useToast } from '@/components/ui/Toast';
import { Pencil, FileText, BarChart3, Radar, Trash2 } from 'lucide-react';
import type { Project, AnalysisItem, AlertLevel, SentimentTrend as SentimentTrendType } from '@/lib/types';

// ─── Helpers ─────────────────────────────────────────────────────────

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

// ─── Page tabs ───────────────────────────────────────────────────────

type PageTab = 'dashboard' | 'review' | 'feeds';

// ─── Component ───────────────────────────────────────────────────────

export default function ProjectDashboardPage() {
  const params = useParams();
  const projectId = params.id as string;
  const [project, setProject] = useState<Project | null>(null);
  const [allItems, setAllItems] = useState<AnalysisItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [activeTab, setActiveTab] = useState<PageTab>('review');
  const [lastScanStats, setLastScanStats] = useState<{
    articles_found: number;
    articles_fetched: number;
    articles_matched: number;
    articles_skipped_duplicate: number;
  } | null>(null);
  const { showToast } = useToast();

  const loadDashboardData = useCallback(() => {
    return Promise.all([
      fetch(`/api/projects/${projectId}`).then((r) => r.json()),
      fetch(`/api/items?project_id=${projectId}&review_status=approved`).then((r) => r.json()),
    ])
      .then(([proj, approved]) => {
        setProject(proj);
        setAllItems(Array.isArray(approved) ? approved : []);
      })
      .catch(() => {});
  }, [projectId]);

  useEffect(() => {
    loadDashboardData().finally(() => setLoading(false));
  }, [loadDashboardData]);

  async function runScan() {
    const res = await fetch(`/api/projects/${projectId}/scan`, { method: 'POST' });
    const text = await res.text();

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error('Scan returned an unexpected response — it may have timed out. Try again.');
    }

    if (!res.ok) {
      throw new Error((data.error as string) ?? 'Scan failed');
    }

    setLastScanStats({
      articles_found: (data.articles_found as number) ?? 0,
      articles_fetched: (data.articles_fetched as number) ?? 0,
      articles_matched: (data.articles_matched as number) ?? 0,
      articles_skipped_duplicate: (data.articles_skipped_duplicate as number) ?? 0,
    });

    showToast((data.message as string) ?? 'Scan complete', 'success');
  }

  async function handleScan() {
    setScanning(true);
    setLastScanStats(null);
    try {
      await runScan();
      // Switch to review tab to show new articles
      setActiveTab('review');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Scan failed';
      showToast(message, 'error');
    } finally {
      setScanning(false);
    }
  }

  async function handleClearAndRescan() {
    setScanning(true);
    setLastScanStats(null);
    try {
      const clearRes = await fetch(`/api/projects/${projectId}/clear`, { method: 'DELETE' });
      if (!clearRes.ok) throw new Error('Failed to clear existing data');
      const clearData = await clearRes.json();
      showToast(clearData.message, 'info');

      await runScan();
      setActiveTab('review');
      await loadDashboardData();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Clear & rescan failed';
      showToast(message, 'error');
    } finally {
      setScanning(false);
    }
  }

  // ─── Loading / not found ─────────────────────────────────────────

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

  // ─── Dashboard tab data ──────────────────────────────────────────

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

  // ─── Render ──────────────────────────────────────────────────────

  return (
    <div>
      {/* Header */}
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
          <RoleGate allowedRoles={['admin', 'project_lead']}>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleClearAndRescan}
              loading={scanning}
            >
              <Trash2 className="h-4 w-4" />
              Clear &amp; Rescan
            </Button>
          </RoleGate>
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

      {/* Scan stats banner */}
      {lastScanStats && (
        <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
          <div className="flex flex-wrap gap-4 text-sm">
            <span className="text-blue-900 font-medium">Scan complete:</span>
            <span className="text-blue-700">{lastScanStats.articles_found} found</span>
            <span className="text-blue-700">{lastScanStats.articles_fetched} new</span>
            <span className="text-blue-700">{lastScanStats.articles_matched} project matches</span>
            {lastScanStats.articles_skipped_duplicate > 0 && (
              <span className="text-blue-500">{lastScanStats.articles_skipped_duplicate} duplicates skipped</span>
            )}
          </div>
        </div>
      )}

      {/* Tab navigation */}
      <div className="flex items-center gap-1 border-b border-gray-200 mb-6">
        {([
          { key: 'review' as const, label: 'Review Articles' },
          { key: 'dashboard' as const, label: 'Dashboard' },
          { key: 'feeds' as const, label: 'Feeds' },
        ]).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-brand-purple text-brand-purple'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'review' && (
        <ProjectReview
          projectId={projectId}
          onArticlesChanged={loadDashboardData}
        />
      )}

      {activeTab === 'feeds' && (
        <ProjectFeeds project={project} />
      )}

      {activeTab === 'dashboard' && (
        <>
          {!hasData ? (
            <Card>
              <EmptyState
                title="No coverage data yet"
                description="Scan for articles and approve them to see dashboard metrics."
                icon={<BarChart3 className="h-12 w-12" />}
              />
            </Card>
          ) : (
            <div className="space-y-6">
              <ActionItems items={actionItems} />

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <CoverageVolume thisWeek={thisWeekItems.length} lastWeek={lastWeekItems.length} />
                <SentimentTrend
                  trend={trend}
                  thisWeekSupportive={thisWeekPct}
                  lastWeekSupportive={lastWeekPct}
                />
                <NotableVoices voices={voices} />
              </div>

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
        </>
      )}
    </div>
  );
}
