'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import { Select } from '@/components/ui/Select';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { AnalysisResult } from './AnalysisResult';
import { BatchProgress } from './BatchProgress';
import type { AnalysisResult as AnalysisResultType, SourceType, Project } from '@/lib/types';

const CHAR_WARNING = 10000;

const SOURCE_TYPES = [
  { value: 'news_article', label: 'News Article' },
  { value: 'social_media', label: 'Social Media' },
  { value: 'committee_report', label: 'Committee Report' },
  { value: 'planning_document', label: 'Planning Document' },
  { value: 'other', label: 'Other' },
];

interface SavedResult {
  result: AnalysisResultType;
  sourceText: string;
  saved: boolean;
}

export function AnalyseForm() {
  const { showToast } = useToast();
  const [text, setText] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [sourceType, setSourceType] = useState<SourceType | ''>('');
  const [projectId, setProjectId] = useState('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SavedResult[]>([]);
  const [batchMode, setBatchMode] = useState(false);
  const [batchCurrent, setBatchCurrent] = useState(0);
  const [batchTotal, setBatchTotal] = useState(0);

  useEffect(() => {
    fetch('/api/projects')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setProjects(data);
      })
      .catch(() => {});
  }, []);

  const charCount = text.length;
  const charWarning = charCount > CHAR_WARNING;

  async function analyseText(content: string): Promise<AnalysisResultType | null> {
    const res = await fetch('/api/analyse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: content }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error ?? 'Analysis failed');
    }

    return res.json();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;

    setLoading(true);
    setResults([]);

    try {
      if (batchMode) {
        const items = text
          .split('---')
          .map((s) => s.trim())
          .filter((s) => s.length > 0);

        setBatchTotal(items.length);
        const batchResults: SavedResult[] = [];

        for (let i = 0; i < items.length; i++) {
          setBatchCurrent(i + 1);
          try {
            const result = await analyseText(items[i]);
            if (result) {
              batchResults.push({ result, sourceText: items[i], saved: false });
            }
          } catch (err) {
            const message = err instanceof Error ? err.message : 'Analysis failed';
            showToast(`Item ${i + 1} failed: ${message}`, 'error');
          }
        }

        setResults(batchResults);
        setBatchCurrent(0);
        setBatchTotal(0);
        if (batchResults.length > 0) {
          showToast(`Analysed ${batchResults.length} of ${items.length} items`, 'success');
        }
      } else {
        const result = await analyseText(text);
        if (result) {
          setResults([{ result, sourceText: text, saved: false }]);
          showToast('Analysis complete', 'success');
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Analysis failed — please try again.';
      showToast(message, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function saveResult(index: number) {
    const item = results[index];
    if (!item || item.saved) return;

    try {
      const res = await fetch('/api/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId || null,
          source_text: item.sourceText,
          source_type: sourceType || null,
          source_url: sourceUrl || null,
          ...item.result,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'Failed to save');
      }

      setResults((prev) =>
        prev.map((r, i) => (i === index ? { ...r, saved: true } : r))
      );
      showToast('Item saved to review queue', 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save';
      showToast(message, 'error');
    }
  }

  async function saveAll() {
    for (let i = 0; i < results.length; i++) {
      if (!results[i].saved) {
        await saveResult(i);
      }
    }
  }

  const projectOptions = projects.map((p) => ({
    value: p.id,
    label: `${p.client_name} — ${p.site_name}`,
  }));

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <Select
            id="source_type"
            label="Source Type"
            options={SOURCE_TYPES}
            placeholder="Select type..."
            value={sourceType}
            onChange={(e) => setSourceType(e.target.value as SourceType)}
          />
          <Select
            id="project_id"
            label="Assign to Project"
            options={projectOptions}
            placeholder="Select project..."
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
          />
          <Input
            id="source_url"
            label="Source URL"
            type="url"
            placeholder="https://..."
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
          />
        </div>

        <div>
          <Textarea
            id="analyse_text"
            label="Content to Analyse"
            required
            rows={12}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={
              batchMode
                ? 'Paste multiple items separated by --- (three dashes on a new line)'
                : 'Paste a news article, social media post, committee report, or planning document...'
            }
          />
          <div className="mt-1 flex items-center justify-between text-xs">
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={batchMode}
                  onChange={(e) => setBatchMode(e.target.checked)}
                  className="rounded border-gray-300 text-brand-purple focus:ring-brand-purple"
                />
                <span className="text-gray-600">Batch mode (separate items with ---)</span>
              </label>
            </div>
            <span className={charWarning ? 'text-yellow-600 font-medium' : 'text-gray-400'}>
              {charCount.toLocaleString()} characters
              {charWarning && ' — content will be truncated at 12,000'}
            </span>
          </div>
        </div>

        <Button type="submit" loading={loading} disabled={!text.trim()}>
          {batchMode ? 'Analyse All' : 'Analyse'}
        </Button>
      </form>

      {batchTotal > 0 && (
        <BatchProgress current={batchCurrent} total={batchTotal} />
      )}

      {results.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">
              Results ({results.length})
            </h3>
            {results.length > 1 && results.some((r) => !r.saved) && (
              <Button variant="secondary" size="sm" onClick={saveAll}>
                Save All to Queue
              </Button>
            )}
          </div>

          {results.map((item, index) => (
            <Card key={index}>
              <AnalysisResult result={item.result} />
              <div className="mt-4 flex items-center gap-2 border-t border-gray-100 pt-4">
                {item.saved ? (
                  <span className="text-sm text-green-600 font-medium">
                    Saved to review queue
                  </span>
                ) : (
                  <Button size="sm" onClick={() => saveResult(index)}>
                    Save to Queue
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
