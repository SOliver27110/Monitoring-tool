'use client';

import { useState, useEffect, useCallback } from 'react';
import { QueueItem } from './QueueItem';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { useQueueKeyboard } from '@/hooks/useQueueKeyboard';
import { Inbox } from 'lucide-react';
import type { AnalysisItem, Project } from '@/lib/types';

const ALERT_ORDER: Record<string, number> = {
  'Action Required': 0,
  'Watch': 1,
  'Routine': 2,
};

export function QueueList() {
  const { showToast } = useToast();
  const [items, setItems] = useState<AnalysisItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [assignModal, setAssignModal] = useState(false);
  const [assignItemIndex, setAssignItemIndex] = useState(-1);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch('/api/items?review_status=unreviewed');
      if (res.ok) {
        const data = await res.json();
        const sorted = (data as AnalysisItem[]).sort(
          (a, b) => (ALERT_ORDER[a.alert_level] ?? 3) - (ALERT_ORDER[b.alert_level] ?? 3)
        );
        setItems(sorted);
      }
    } catch {
      /* empty */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  useEffect(() => {
    fetch('/api/projects')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setProjects(data);
      })
      .catch(() => {});
  }, []);

  async function reviewItem(index: number, action: 'approve' | 'dismiss') {
    const item = items[index];
    if (!item) return;

    try {
      const res = await fetch(`/api/items/${item.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });

      if (!res.ok) throw new Error('Review failed');

      setItems((prev) => prev.filter((_, i) => i !== index));
      setSelectedIndex((prev) => Math.min(prev, items.length - 2));
      showToast(
        action === 'approve' ? 'Item approved' : 'Item dismissed',
        action === 'approve' ? 'success' : 'info'
      );
    } catch {
      showToast('Failed to review item', 'error');
    }
  }

  function openAssignModal(index: number) {
    const item = items[index];
    if (!item) return;
    setAssignItemIndex(index);
    setSelectedProjectId(item.project_id ?? '');
    setAssignModal(true);
  }

  async function assignProject() {
    const item = items[assignItemIndex];
    if (!item) return;

    try {
      const res = await fetch(`/api/items/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: selectedProjectId || null }),
      });

      if (!res.ok) throw new Error('Failed to assign');

      setItems((prev) =>
        prev.map((it, i) =>
          i === assignItemIndex ? { ...it, project_id: selectedProjectId || null } : it
        )
      );
      setAssignModal(false);
      showToast('Project assigned', 'success');
    } catch {
      showToast('Failed to assign project', 'error');
    }
  }

  useQueueKeyboard({
    itemCount: items.length,
    selectedIndex,
    onSelect: setSelectedIndex,
    onApprove: (i) => reviewItem(i, 'approve'),
    onDismiss: (i) => reviewItem(i, 'dismiss'),
    onAssign: openAssignModal,
    enabled: !assignModal,
  });

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        title="Queue is empty"
        description="All items have been reviewed. New items will appear here after analysis."
        icon={<Inbox className="h-12 w-12" />}
      />
    );
  }

  const projectOptions = projects.map((p) => ({
    value: p.id,
    label: `${p.client_name} — ${p.site_name}`,
  }));

  return (
    <>
      <div className="space-y-3">
        {items.map((item, index) => (
          <QueueItem
            key={item.id}
            item={item}
            selected={index === selectedIndex}
            onApprove={() => reviewItem(index, 'approve')}
            onDismiss={() => reviewItem(index, 'dismiss')}
            onClick={() => setSelectedIndex(index)}
          />
        ))}
      </div>

      {/* Keyboard hints */}
      <div className="mt-4 flex flex-wrap items-center gap-4 rounded-lg bg-gray-50 px-4 py-2.5 text-xs text-gray-500">
        <span><kbd className="rounded bg-gray-200 px-1.5 py-0.5 font-mono">j</kbd> / <kbd className="rounded bg-gray-200 px-1.5 py-0.5 font-mono">k</kbd> Navigate</span>
        <span><kbd className="rounded bg-gray-200 px-1.5 py-0.5 font-mono">a</kbd> Approve</span>
        <span><kbd className="rounded bg-gray-200 px-1.5 py-0.5 font-mono">d</kbd> Dismiss</span>
        <span><kbd className="rounded bg-gray-200 px-1.5 py-0.5 font-mono">p</kbd> Assign project</span>
      </div>

      {/* Assign project modal */}
      <Modal
        open={assignModal}
        onClose={() => setAssignModal(false)}
        title="Assign to Project"
      >
        <div className="space-y-4">
          <Select
            id="assign_project"
            label="Project"
            options={projectOptions}
            placeholder="Select a project..."
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
          />
          <div className="flex gap-2">
            <Button onClick={assignProject}>Assign</Button>
            <Button variant="secondary" onClick={() => setAssignModal(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
