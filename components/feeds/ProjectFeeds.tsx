'use client';

import { useEffect, useState } from 'react';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import {
  Rss,
  Plus,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Sparkles,
  Check,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';
import type { Feed, FeedType, Project } from '@/lib/types';

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

interface Suggestion {
  name: string;
  url: string;
  feed_type: string;
  verified: boolean | null; // null = google_news (always valid), true = RSS verified, false = RSS failed
  selected: boolean;
}

interface ProjectFeedsProps {
  project: Project;
}

export function ProjectFeeds({ project }: ProjectFeedsProps) {
  const { showToast } = useToast();
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [loading, setLoading] = useState(true);
  const [showManualForm, setShowManualForm] = useState(false);
  const [saving, setSaving] = useState(false);

  // Suggestion state
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [suggesting, setSuggesting] = useState(false);
  const [addingSuggestions, setAddingSuggestions] = useState(false);

  // Manual add form
  const [manualName, setManualName] = useState('');
  const [manualUrl, setManualUrl] = useState('');
  const [manualType, setManualType] = useState<FeedType>('google_news');

  async function loadFeeds() {
    try {
      const res = await fetch(`/api/feeds?project_id=${project.id}`);
      const data = await res.json();
      setFeeds(Array.isArray(data) ? data : []);
    } catch {
      showToast('Failed to load feeds', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadFeeds();
  }, [project.id]);

  async function handleSuggest() {
    setSuggesting(true);
    setSuggestions([]);

    try {
      const res = await fetch('/api/feeds/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lpa: project.lpa,
          client_name: project.client_name,
          site_name: project.site_name,
          planning_reference: project.planning_reference,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'Failed to get suggestions');
      }

      const data = await res.json();
      // Filter out feeds that already exist (by URL)
      const existingUrls = new Set(feeds.map((f) => f.url));
      const filtered = (data as Array<{ name: string; url: string; feed_type: string; verified: boolean | null }>)
        .filter((s) => !existingUrls.has(s.url))
        .map((s) => ({
          ...s,
          // Auto-select verified and google_news, deselect unverified RSS
          selected: s.verified !== false,
        }));

      if (filtered.length === 0) {
        showToast('No new feeds to suggest — all suggestions already exist', 'info');
      }

      const verified = filtered.filter((s) => s.verified === true).length;
      const unverified = filtered.filter((s) => s.verified === false).length;
      if (unverified > 0) {
        showToast(
          `${verified} RSS feed${verified !== 1 ? 's' : ''} verified, ${unverified} could not be reached (deselected)`,
          'info'
        );
      }

      setSuggestions(filtered);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get suggestions';
      showToast(message, 'error');
    } finally {
      setSuggesting(false);
    }
  }

  async function addSelectedSuggestions() {
    const selected = suggestions.filter((s) => s.selected);
    if (selected.length === 0) return;

    setAddingSuggestions(true);

    let added = 0;
    for (const suggestion of selected) {
      try {
        const res = await fetch('/api/feeds', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project_id: project.id,
            name: suggestion.name,
            url: suggestion.url,
            feed_type: suggestion.feed_type,
          }),
        });

        if (res.ok) added++;
      } catch {
        // skip failed ones
      }
    }

    showToast(`${added} feed${added !== 1 ? 's' : ''} added`, 'success');
    setSuggestions([]);
    setAddingSuggestions(false);
    await loadFeeds();
  }

  function toggleSuggestion(index: number) {
    setSuggestions((prev) =>
      prev.map((s, i) => (i === index ? { ...s, selected: !s.selected } : s))
    );
  }

  async function handleManualAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    try {
      const res = await fetch('/api/feeds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: project.id,
          name: manualName,
          url: manualUrl,
          feed_type: manualType,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'Failed to add feed');
      }

      showToast('Feed added', 'success');
      setShowManualForm(false);
      setManualName('');
      setManualUrl('');
      setManualType('google_news');
      await loadFeeds();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add feed';
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

  const urlPlaceholders: Record<FeedType, string> = {
    google_news: 'e.g. "Oak Lane" planning Buckinghamshire',
    local_news: 'e.g. https://www.localnews.co.uk/rss',
    planning_press: 'e.g. https://www.planningresource.co.uk/rss',
    council: 'e.g. https://council.gov.uk/planning/feed',
  };

  if (loading) {
    return (
      <Card>
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <CardHeader
          title="Feeds"
          description={`${feeds.length} feed${feeds.length !== 1 ? 's' : ''} configured`}
        />
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleSuggest}
            loading={suggesting}
          >
            <Sparkles className="h-4 w-4" />
            Suggest Feeds
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowManualForm(!showManualForm)}
          >
            <Plus className="h-4 w-4" />
            Add
          </Button>
        </div>
      </div>

      {/* AI Suggestions */}
      {suggestions.length > 0 && (
        <div className="mb-4 rounded-lg border border-purple-200 bg-purple-50 p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-medium text-purple-900">
              Suggested feeds — select which to add
            </h4>
            <Button
              size="sm"
              onClick={addSelectedSuggestions}
              loading={addingSuggestions}
              disabled={suggestions.filter((s) => s.selected).length === 0}
            >
              <Check className="h-4 w-4" />
              Add {suggestions.filter((s) => s.selected).length} selected
            </Button>
          </div>
          <div className="space-y-2">
            {suggestions.map((suggestion, i) => (
              <label
                key={i}
                className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer hover:border-purple-300 ${
                  suggestion.verified === false
                    ? 'border-red-200 bg-red-50/50'
                    : 'border-purple-100 bg-white'
                }`}
              >
                <input
                  type="checkbox"
                  checked={suggestion.selected}
                  onChange={() => toggleSuggestion(i)}
                  className="mt-0.5 rounded border-gray-300 text-brand-purple focus:ring-brand-purple"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">
                      {suggestion.name}
                    </span>
                    <Badge variant="info">
                      {feedTypeLabels[suggestion.feed_type as FeedType] ?? suggestion.feed_type}
                    </Badge>
                    {suggestion.verified === true && (
                      <span className="flex items-center gap-0.5 text-xs text-green-600">
                        <CheckCircle className="h-3.5 w-3.5" />
                        Verified
                      </span>
                    )}
                    {suggestion.verified === false && (
                      <span className="flex items-center gap-0.5 text-xs text-red-500">
                        <AlertCircle className="h-3.5 w-3.5" />
                        Not reachable
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5 truncate">
                    {suggestion.url}
                  </p>
                </div>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Manual add form */}
      {showManualForm && (
        <form onSubmit={handleManualAdd} className="mb-4 rounded-lg border border-gray-200 p-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <Input
              id="manual_name"
              label="Name"
              required
              value={manualName}
              onChange={(e) => setManualName(e.target.value)}
              placeholder="e.g. Bucks Free Press"
            />
            <Select
              id="manual_type"
              label="Type"
              options={FEED_TYPES}
              value={manualType}
              onChange={(e) => setManualType(e.target.value as FeedType)}
            />
            <Input
              id="manual_url"
              label={manualType === 'google_news' ? 'Search Query' : 'RSS URL'}
              required
              value={manualUrl}
              onChange={(e) => setManualUrl(e.target.value)}
              placeholder={urlPlaceholders[manualType]}
            />
          </div>
          <div className="flex items-center gap-2">
            <Button type="submit" size="sm" loading={saving}>
              Add Feed
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setShowManualForm(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}

      {/* Feed list */}
      {feeds.length === 0 ? (
        <div className="text-center py-6">
          <Rss className="h-8 w-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">No feeds yet.</p>
          <p className="text-xs text-gray-400 mt-1">
            Click &quot;Suggest Feeds&quot; to get AI-powered recommendations, or add manually.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {feeds.map((feed) => (
            <div
              key={feed.id}
              className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900 truncate">
                    {feed.name}
                  </span>
                  <Badge variant="info">
                    {feedTypeLabels[feed.feed_type] ?? feed.feed_type}
                  </Badge>
                  {!feed.is_active && (
                    <Badge variant="default">Paused</Badge>
                  )}
                </div>
                <p className="text-xs text-gray-400 truncate mt-0.5">
                  {feed.url}
                </p>
              </div>
              <div className="flex items-center gap-1 ml-3">
                <button
                  onClick={() => toggleFeed(feed)}
                  className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                  title={feed.is_active ? 'Pause' : 'Enable'}
                >
                  {feed.is_active ? (
                    <ToggleRight className="h-4 w-4 text-green-500" />
                  ) : (
                    <ToggleLeft className="h-4 w-4" />
                  )}
                </button>
                <button
                  onClick={() => deleteFeed(feed.id)}
                  className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                  title="Delete"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
