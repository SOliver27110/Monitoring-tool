'use client';

import { useEffect, useState } from 'react';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { Rss, Plus, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';
import type { Feed, FeedFormData, FeedType, Project } from '@/lib/types';

const FEED_TYPES: { value: FeedType; label: string }[] = [
  { value: 'google_news', label: 'Google News Search' },
  { value: 'local_news', label: 'Local News RSS' },
  { value: 'planning_press', label: 'Planning Press RSS' },
  { value: 'council', label: 'Council Feed' },
];

const feedTypeLabels: Record<FeedType, string> = {
  google_news: 'Google News',
  local_news: 'Local News',
  planning_press: 'Planning Press',
  council: 'Council',
};

export default function FeedsPage() {
  const { showToast } = useToast();
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState<FeedFormData>({
    project_id: '',
    name: '',
    feed_type: 'google_news',
    url: '',
  });

  async function loadData() {
    try {
      const [feedsRes, projectsRes] = await Promise.all([
        fetch('/api/feeds'),
        fetch('/api/projects'),
      ]);
      const feedsData = await feedsRes.json();
      const projectsData = await projectsRes.json();
      setFeeds(Array.isArray(feedsData) ? feedsData : []);
      setProjects(Array.isArray(projectsData) ? projectsData : []);
    } catch {
      showToast('Failed to load feeds', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    try {
      const res = await fetch('/api/feeds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'Failed to create feed');
      }

      showToast('Feed added', 'success');
      setShowForm(false);
      setForm({ project_id: '', name: '', feed_type: 'google_news', url: '' });
      await loadData();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create feed';
      showToast(message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function toggleFeed(feed: Feed) {
    try {
      const res = await fetch(`/api/feeds/${feed.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !feed.is_active }),
      });

      if (!res.ok) throw new Error('Failed to update feed');

      setFeeds((prev) =>
        prev.map((f) => (f.id === feed.id ? { ...f, is_active: !f.is_active } : f))
      );
    } catch {
      showToast('Failed to toggle feed', 'error');
    }
  }

  async function deleteFeed(feedId: string) {
    try {
      const res = await fetch(`/api/feeds/${feedId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete feed');

      setFeeds((prev) => prev.filter((f) => f.id !== feedId));
      showToast('Feed deleted', 'success');
    } catch {
      showToast('Failed to delete feed', 'error');
    }
  }

  function getProjectName(projectId: string): string {
    const project = projects.find((p) => p.id === projectId);
    return project ? `${project.client_name} – ${project.site_name}` : 'Unknown project';
  }

  const projectOptions = projects.map((p) => ({
    value: p.id,
    label: `${p.client_name} – ${p.site_name}`,
  }));

  const urlPlaceholders: Record<FeedType, string> = {
    google_news: 'e.g. "Oak Lane" OR "Acme Developments" planning',
    local_news: 'e.g. https://www.localnews.co.uk/rss',
    planning_press: 'e.g. https://www.planningresource.co.uk/rss',
    council: 'e.g. https://council.gov.uk/planning/feed',
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Feeds</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage RSS feeds and Google News searches for your projects
          </p>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>
          <Plus className="h-4 w-4" />
          Add Feed
        </Button>
      </div>

      {showForm && (
        <Card className="mb-6">
          <CardHeader title="Add New Feed" />
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Select
                id="feed_project"
                label="Project"
                options={projectOptions}
                placeholder="Select a project..."
                value={form.project_id}
                onChange={(e) => setForm((prev) => ({ ...prev, project_id: e.target.value }))}
              />
              <Select
                id="feed_type"
                label="Feed Type"
                options={FEED_TYPES}
                value={form.feed_type}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    feed_type: e.target.value as FeedType,
                  }))
                }
              />
              <Input
                id="feed_name"
                label="Feed Name"
                required
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="e.g. Local council news"
              />
              <Input
                id="feed_url"
                label={form.feed_type === 'google_news' ? 'Search Query' : 'RSS Feed URL'}
                required
                value={form.url}
                onChange={(e) => setForm((prev) => ({ ...prev, url: e.target.value }))}
                placeholder={urlPlaceholders[form.feed_type]}
              />
            </div>
            <div className="flex items-center gap-3">
              <Button type="submit" loading={saving}>
                Add Feed
              </Button>
              <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}

      {feeds.length === 0 ? (
        <Card>
          <EmptyState
            title="No feeds configured"
            description="Add RSS feeds or Google News searches to start monitoring. Projects without feeds will fall back to their boolean search terms."
            icon={<Rss className="h-12 w-12" />}
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {feeds.map((feed) => (
            <Card key={feed.id}>
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-gray-900 truncate">
                      {feed.name}
                    </span>
                    <Badge variant="info">
                      {feedTypeLabels[feed.feed_type] ?? feed.feed_type}
                    </Badge>
                    <Badge variant={feed.is_active ? 'success' : 'default'}>
                      {feed.is_active ? 'Active' : 'Paused'}
                    </Badge>
                  </div>
                  <p className="text-sm text-gray-500 truncate">{getProjectName(feed.project_id)}</p>
                  <p className="text-xs text-gray-400 mt-1 truncate">
                    {feed.feed_type === 'google_news' ? 'Query' : 'URL'}: {feed.url}
                  </p>
                  {feed.last_fetched_at && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      Last fetched: {new Date(feed.last_fetched_at).toLocaleString('en-GB')}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 ml-4">
                  <button
                    onClick={() => toggleFeed(feed)}
                    className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                    title={feed.is_active ? 'Pause feed' : 'Enable feed'}
                  >
                    {feed.is_active ? (
                      <ToggleRight className="h-5 w-5 text-green-500" />
                    ) : (
                      <ToggleLeft className="h-5 w-5" />
                    )}
                  </button>
                  <button
                    onClick={() => deleteFeed(feed.id)}
                    className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                    title="Delete feed"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
