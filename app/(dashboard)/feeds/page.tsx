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
import type { Feed, FeedFormData, Project } from '@/lib/types';

const FEED_TYPES = [
  { value: 'google_news', label: 'Google News Search' },
  { value: 'rss_direct', label: 'Direct RSS Feed' },
];

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
    feed_url: '',
    enabled: true,
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
      setForm({ project_id: '', name: '', feed_type: 'google_news', feed_url: '', enabled: true });
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
        body: JSON.stringify({ enabled: !feed.enabled }),
      });

      if (!res.ok) throw new Error('Failed to update feed');

      setFeeds((prev) =>
        prev.map((f) => (f.id === feed.id ? { ...f, enabled: !f.enabled } : f))
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
                    feed_type: e.target.value as 'google_news' | 'rss_direct',
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
                value={form.feed_url}
                onChange={(e) => setForm((prev) => ({ ...prev, feed_url: e.target.value }))}
                placeholder={
                  form.feed_type === 'google_news'
                    ? 'e.g. "Oak Lane" OR "Acme Developments" planning'
                    : 'e.g. https://example.com/rss'
                }
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
                    <Badge variant={feed.feed_type === 'google_news' ? 'info' : 'purple'}>
                      {feed.feed_type === 'google_news' ? 'Google News' : 'RSS'}
                    </Badge>
                    <Badge variant={feed.enabled ? 'success' : 'default'}>
                      {feed.enabled ? 'Active' : 'Paused'}
                    </Badge>
                  </div>
                  <p className="text-sm text-gray-500 truncate">{getProjectName(feed.project_id)}</p>
                  <p className="text-xs text-gray-400 mt-1 truncate">
                    {feed.feed_type === 'google_news' ? 'Query' : 'URL'}: {feed.feed_url}
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
                    title={feed.enabled ? 'Pause feed' : 'Enable feed'}
                  >
                    {feed.enabled ? (
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
