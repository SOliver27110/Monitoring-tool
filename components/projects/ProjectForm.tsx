'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/components/ui/Toast';
import type { ProjectFormData, AppUser, ApplicationStage, AlertLevel } from '@/lib/types';

const APPLICATION_STAGES: { value: ApplicationStage; label: string }[] = [
  { value: 'Pre-app', label: 'Pre-application' },
  { value: 'Submitted', label: 'Submitted' },
  { value: 'Consultation', label: 'Consultation' },
  { value: 'Committee', label: 'Committee' },
  { value: 'Appeal', label: 'Appeal' },
  { value: 'Approved', label: 'Approved' },
  { value: 'Refused', label: 'Refused' },
];

const ALERT_LEVELS: { value: AlertLevel; label: string }[] = [
  { value: 'green', label: '\uD83D\uDFE2 Green' },
  { value: 'yellow', label: '\uD83D\uDFE1 Amber' },
  { value: 'red', label: '\uD83D\uDD34 Red' },
];

interface ProjectFormProps {
  initialData?: ProjectFormData;
  projectId?: string;
}

export function ProjectForm({ initialData, projectId }: ProjectFormProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<AppUser[]>([]);

  const [form, setForm] = useState<ProjectFormData>(
    initialData ?? {
      client_name: '',
      site_name: '',
      planning_reference: null,
      lpa: '',
      boolean_search_terms: '',
      assigned_lead_id: null,
      application_stage: 'Pre-app',
      key_dates: {},
      alert_level: 'green',
    }
  );

  useEffect(() => {
    fetch('/api/users')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setUsers(data);
      })
      .catch(() => {
        /* users dropdown will be empty */
      });
  }, []);

  function updateField<K extends keyof ProjectFormData>(key: K, value: ProjectFormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function updateKeyDate(key: string, value: string) {
    setForm((prev) => ({
      ...prev,
      key_dates: { ...prev.key_dates, [key]: value },
    }));
  }

  // Auto-generate search terms for Google News RSS
  // Format: ("site_parts" AND "client") OR ("site_parts" AND "lpa_short")
  useEffect(() => {
    const LPA_STOP_WORDS = ['council', 'borough', 'district', 'county', 'city', 'authority'];
    const SITE_STOP_WORDS = [
      'land', 'north', 'south', 'east', 'west', 'of', 'at', 'the', 'off',
      'near', 'adjacent', 'behind', 'opposite', 'site', 'plot', 'phase',
      'area', 'proposed', 'development', 'former',
    ];
    const ROAD_SUFFIXES = [
      'road', 'street', 'lane', 'way', 'close', 'drive', 'avenue', 'crescent',
      'court', 'place', 'terrace', 'grove', 'gardens', 'park', 'hill', 'rise',
      'view', 'walk', 'mews', 'square', 'row', 'passage', 'boulevard', 'path',
      'trail', 'green', 'common', 'fields', 'meadow',
    ];

    // Process site name: remove stop words, split into segments at road suffixes,
    // then drop road-name segments when more specific place-name segments exist.
    function processSiteName(name: string): string[] {
      const words = name
        .split(/\s+/)
        .filter((w) => !SITE_STOP_WORDS.includes(w.toLowerCase()));
      if (words.length === 0) return [];

      // Split into segments — a road suffix ends the current segment
      const segments: string[][] = [];
      let current: string[] = [];
      for (const word of words) {
        current.push(word);
        if (ROAD_SUFFIXES.includes(word.toLowerCase())) {
          segments.push([...current]);
          current = [];
        }
      }
      if (current.length > 0) segments.push(current);

      // If we have both road-name and place-name segments, drop road-name ones
      if (segments.length > 1) {
        const placeSegments = segments.filter(
          (seg) => !ROAD_SUFFIXES.includes(seg[seg.length - 1].toLowerCase())
        );
        if (placeSegments.length > 0) return placeSegments.map((s) => s.join(' '));
      }

      return segments.map((s) => s.join(' '));
    }

    const siteParts = processSiteName(form.site_name);
    const siteTerms = siteParts.map((p) => `"${p}"`).join(' AND ');

    const lpaShort = form.lpa
      .split(' ')
      .filter((w) => !LPA_STOP_WORDS.includes(w.toLowerCase()))
      .join(' ')
      .trim();

    const clientQuoted = form.client_name ? `"${form.client_name}"` : '';
    const lpaQuoted = lpaShort ? `"${lpaShort}"` : '';

    let query = '';
    if (siteTerms && clientQuoted && lpaQuoted) {
      query = `(${siteTerms} AND ${clientQuoted}) OR (${siteTerms} AND ${lpaQuoted})`;
    } else if (siteTerms && clientQuoted) {
      query = `(${siteTerms} AND ${clientQuoted})`;
    } else if (siteTerms && lpaQuoted) {
      query = `(${siteTerms} AND ${lpaQuoted})`;
    } else if (siteTerms) {
      query = siteTerms;
    }

    if (query) {
      updateField('boolean_search_terms', query);
    }
  }, [form.site_name, form.client_name, form.lpa]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const url = projectId ? `/api/projects/${projectId}` : '/api/projects';
      const method = projectId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'Failed to save project');
      }

      showToast(projectId ? 'Project updated' : 'Project created', 'success');
      router.push('/projects');
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save project';
      showToast(message, 'error');
    } finally {
      setLoading(false);
    }
  }

  const userOptions = users.map((u) => ({
    value: u.id,
    label: [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email,
  }));

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid gap-6 sm:grid-cols-2">
        <Input
          id="client_name"
          label="Client Name"
          required
          value={form.client_name}
          onChange={(e) => updateField('client_name', e.target.value)}
          placeholder="e.g. Acme Developments"
        />
        <Input
          id="site_name"
          label="Site Name"
          required
          value={form.site_name}
          onChange={(e) => updateField('site_name', e.target.value)}
          placeholder="e.g. Land at Oak Lane"
        />
        <Input
          id="planning_reference"
          label="Planning Reference"
          value={form.planning_reference ?? ''}
          onChange={(e) => updateField('planning_reference', e.target.value || null)}
          placeholder="e.g. 24/01234/FUL"
        />
        <Input
          id="lpa"
          label="Local Planning Authority"
          required
          value={form.lpa}
          onChange={(e) => updateField('lpa', e.target.value)}
          placeholder="e.g. South Oxfordshire District Council"
        />
        <div className="sm:col-span-2">
          <Input
            id="boolean_search_terms"
            label="Boolean Search Terms"
            required
            value={form.boolean_search_terms}
            onChange={(e) => updateField('boolean_search_terms', e.target.value)}
            placeholder='e.g. "Castle Hills Solar Farm" OR "Total Energies"'
          />
          <p className="mt-1 text-xs text-gray-400">
            Auto-generated from site and client names. Edit to refine your Google News search query.
          </p>
        </div>
        <Select
          id="assigned_lead_id"
          label="Assigned DevComms Lead"
          options={userOptions}
          placeholder="Select a lead..."
          value={form.assigned_lead_id ?? ''}
          onChange={(e) => updateField('assigned_lead_id', e.target.value || null)}
        />
        <Select
          id="application_stage"
          label="Application Stage"
          options={APPLICATION_STAGES}
          value={form.application_stage}
          onChange={(e) => updateField('application_stage', e.target.value as ApplicationStage)}
        />
        <Select
          id="alert_level"
          label="Alert Level"
          options={ALERT_LEVELS}
          value={form.alert_level}
          onChange={(e) => updateField('alert_level', e.target.value as AlertLevel)}
        />
      </div>

      <div>
        <h3 className="mb-3 text-sm font-medium text-gray-700">Key Dates</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <Input
            id="date_submission"
            label="Submission"
            type="date"
            value={form.key_dates.submission ?? ''}
            onChange={(e) => updateKeyDate('submission', e.target.value)}
          />
          <Input
            id="date_consultation_end"
            label="Consultation End"
            type="date"
            value={form.key_dates.consultation_end ?? ''}
            onChange={(e) => updateKeyDate('consultation_end', e.target.value)}
          />
          <Input
            id="date_committee"
            label="Committee"
            type="date"
            value={form.key_dates.committee ?? ''}
            onChange={(e) => updateKeyDate('committee', e.target.value)}
          />
        </div>
      </div>

      <div className="flex items-center gap-3 border-t border-gray-200 pt-6">
        <Button type="submit" loading={loading}>
          {projectId ? 'Update Project' : 'Create Project'}
        </Button>
        <Button type="button" variant="secondary" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
