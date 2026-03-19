'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import {
  Check,
  X,
  CheckCheck,
  XCircle,
  ExternalLink,
  Inbox,
  Loader2,
} from 'lucide-react';
import type { FetchedArticle } from '@/lib/types';

interface ProjectReviewProps {
  projectId: string;
  /** Called after articles are approved so the parent can refresh dashboard data */
  onArticlesChanged?: () => void;
}

type ReviewTab = 'pending' | 'approved' | 'dismissed';

export function ProjectReview({ projectId, onArticlesChanged }: ProjectReviewProps) {
  const { showToast } = useToast();
  const [articles, setArticles] = useState<FetchedArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ReviewTab>('pending');
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const [bulkProcessing, setBulkProcessing] = useState(false);

  const statusForTab: Record<ReviewTab, string> = {
    pending: 'matched,pending,unmatched',
    approved: 'analysed',
    dismissed: 'dismissed',
  };

  const loadArticles = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/projects/${projectId}/articles?status=${statusForTab[activeTab]}`
      );
      if (res.ok) {
        const data = await res.json();
        setArticles(Array.isArray(data) ? data : []);
      }
    } catch {
      showToast('Failed to load articles', 'error');
    } finally {
      setLoading(false);
    }
  }, [projectId, activeTab]);

  useEffect(() => {
    setLoading(true);
    loadArticles();
  }, [loadArticles]);

  async function handleAction(articleId: string, action: 'approve' | 'dismiss') {
    setProcessingIds((prev) => new Set(prev).add(articleId));

    try {
      const res = await fetch(
        `/api/projects/${projectId}/articles/${articleId}/analyse`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action }),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? `Failed to ${action}`);
      }

      // Remove from current list
      setArticles((prev) => prev.filter((a) => a.id !== articleId));
      onArticlesChanged?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : `Failed to ${action}`;
      showToast(message, 'error');
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(articleId);
        return next;
      });
    }
  }

  async function handleBulkAction(action: 'approve' | 'dismiss') {
    setBulkProcessing(true);
    let count = 0;

    for (const article of articles) {
      try {
        const res = await fetch(
          `/api/projects/${projectId}/articles/${article.id}/analyse`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action }),
          }
        );
        if (res.ok) count++;
      } catch {
        // continue
      }
    }

    setArticles([]);
    setBulkProcessing(false);
    showToast(
      `${count} article${count !== 1 ? 's' : ''} ${action === 'approve' ? 'approved' : 'dismissed'}`,
      'success'
    );
    onArticlesChanged?.();
  }

  const tabs: { key: ReviewTab; label: string }[] = [
    { key: 'pending', label: `To Review (${activeTab === 'pending' ? articles.length : '...'})` },
    { key: 'approved', label: 'Approved' },
    { key: 'dismissed', label: 'Dismissed' },
  ];

  return (
    <Card>
      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-gray-200 mb-4">
        {tabs.map((tab) => (
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

      {loading ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : articles.length === 0 ? (
        <EmptyState
          title={
            activeTab === 'pending'
              ? 'No articles to review'
              : activeTab === 'approved'
                ? 'No approved articles yet'
                : 'No dismissed articles'
          }
          description={
            activeTab === 'pending'
              ? 'Run a scan to fetch new articles from your configured feeds.'
              : activeTab === 'approved'
                ? 'Approved articles appear in the dashboard.'
                : 'Dismissed articles are hidden from the dashboard.'
          }
          icon={<Inbox className="h-10 w-10" />}
        />
      ) : (
        <>
          {/* Bulk actions (pending tab only) */}
          {activeTab === 'pending' && (
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-gray-500">
                {articles.length} article{articles.length !== 1 ? 's' : ''} to review
              </p>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => handleBulkAction('approve')}
                  loading={bulkProcessing}
                >
                  <CheckCheck className="h-4 w-4" />
                  Approve All
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => handleBulkAction('dismiss')}
                  loading={bulkProcessing}
                >
                  <XCircle className="h-4 w-4" />
                  Dismiss All
                </Button>
              </div>
            </div>
          )}

          {/* Article list */}
          <div className="space-y-3">
            {articles.map((article) => {
              const isProcessing = processingIds.has(article.id);
              const isProjectMatch =
                article.matched_by?.startsWith('Matched:') ||
                article.matched_by?.startsWith('Partial match:');

              return (
                <div
                  key={article.id}
                  className={`rounded-lg border p-4 transition-opacity ${
                    isProcessing ? 'opacity-50' : ''
                  } ${
                    isProjectMatch
                      ? 'border-l-4 border-l-brand-purple border-gray-200'
                      : 'border-gray-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1.5">
                        <Badge variant={isProjectMatch ? 'info' : 'default'}>
                          {isProjectMatch ? 'Project Match' : 'Area Intel'}
                        </Badge>
                        {article.source_name && (
                          <span className="text-xs text-gray-400">{article.source_name}</span>
                        )}
                        {article.published_at && (
                          <span className="text-xs text-gray-400">
                            {new Date(article.published_at).toLocaleDateString('en-GB')}
                          </span>
                        )}
                      </div>

                      <h4 className="text-sm font-medium text-gray-900 mb-1">
                        {article.title}
                      </h4>

                      {article.excerpt && (
                        <p className="text-xs text-gray-500 line-clamp-2 mb-1.5">
                          {article.excerpt}
                        </p>
                      )}

                      <div className="flex items-center gap-3">
                        {article.matched_by && (
                          <span className="text-xs text-gray-400 italic">
                            {article.matched_by}
                          </span>
                        )}
                        {article.url && (
                          <a
                            href={article.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-brand-purple hover:underline"
                          >
                            <ExternalLink className="h-3 w-3" />
                            Source
                          </a>
                        )}
                      </div>
                    </div>

                    {/* Actions (pending tab only) */}
                    {activeTab === 'pending' && (
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {isProcessing ? (
                          <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                        ) : (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleAction(article.id, 'approve')}
                              title="Approve — analyse and add to dashboard"
                              className="text-green-600 hover:text-green-700 hover:bg-green-50"
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleAction(article.id, 'dismiss')}
                              title="Dismiss — hide this article"
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </Card>
  );
}
