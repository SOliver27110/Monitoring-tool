'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { ProjectAlertBadge } from '@/components/ui/AlertBadge';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { RoleGate } from '@/components/ui/RoleGate';
import { Button } from '@/components/ui/Button';
import { ScanButton } from '@/components/projects/ScanButton';
import { FolderKanban, Plus, Pencil } from 'lucide-react';
import type { Project, AlertLevel } from '@/lib/types';

const ALERT_FILTER_OPTIONS = [
  { value: '', label: 'All levels' },
  { value: 'green', label: '\uD83D\uDFE2 Green' },
  { value: 'yellow', label: '\uD83D\uDFE1 Amber' },
  { value: 'red', label: '\uD83D\uDD34 Red' },
];

export function ProjectTable() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [alertFilter, setAlertFilter] = useState('');
  const [lpaFilter, setLpaFilter] = useState('');

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (alertFilter) params.set('alert_level', alertFilter);
      if (lpaFilter) params.set('lpa', lpaFilter);

      const res = await fetch(`/api/projects?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setProjects(data);
      }
    } catch {
      /* handled by empty state */
    } finally {
      setLoading(false);
    }
  }, [search, alertFilter, lpaFilter]);

  useEffect(() => {
    const timer = setTimeout(fetchProjects, 300);
    return () => clearTimeout(timer);
  }, [fetchProjects]);

  const lpaOptions = useMemo(() => {
    const lpas = [...new Set(projects.map((p) => p.lpa))].sort();
    return [
      { value: '', label: 'All LPAs' },
      ...lpas.map((l) => ({ value: l, label: l })),
    ];
  }, [projects]);

  return (
    <div>
      {/* Filters */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Input
            placeholder="Search projects, clients, references..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="w-full sm:w-44">
          <Select
            options={ALERT_FILTER_OPTIONS}
            value={alertFilter}
            onChange={(e) => setAlertFilter(e.target.value)}
          />
        </div>
        <div className="w-full sm:w-56">
          <Select
            options={lpaOptions}
            value={lpaFilter}
            onChange={(e) => setLpaFilter(e.target.value)}
          />
        </div>
        <RoleGate allowedRoles={['admin', 'project_lead']}>
          <ScanButton onComplete={fetchProjects} />
          <Link href="/projects/new">
            <Button size="md">
              <Plus className="h-4 w-4" />
              Add Project
            </Button>
          </Link>
        </RoleGate>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-12">
          <Spinner size="lg" />
        </div>
      )}

      {/* Empty state */}
      {!loading && projects.length === 0 && (
        <EmptyState
          title="No projects found"
          description={
            search || alertFilter || lpaFilter
              ? 'No projects match your search or filters. Try adjusting your criteria.'
              : 'Add your first client project to start monitoring media coverage.'
          }
          icon={<FolderKanban className="h-12 w-12" />}
          action={
            !search && !alertFilter && !lpaFilter ? (
              <RoleGate allowedRoles={['admin', 'project_lead']}>
                <Link href="/projects/new">
                  <Button>
                    <Plus className="h-4 w-4" />
                    Add Project
                  </Button>
                </Link>
              </RoleGate>
            ) : undefined
          }
        />
      )}

      {/* Table */}
      {!loading && projects.length > 0 && (
        <>
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto rounded-lg border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Client / Site</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Ref</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">LPA</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Stage</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Lead</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Alert</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {projects.map((project) => (
                  <tr key={project.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <Link href={`/projects/${project.id}`} className="group">
                        <div className="font-medium text-gray-900 group-hover:text-brand-purple">
                          {project.client_name}
                        </div>
                        <div className="text-xs text-gray-500">{project.site_name}</div>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{project.planning_reference ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600 max-w-[200px] truncate">{project.lpa}</td>
                    <td className="px-4 py-3">
                      <Badge variant="purple">{project.application_stage}</Badge>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {project.assigned_lead
                        ? [project.assigned_lead.first_name, project.assigned_lead.last_name]
                            .filter(Boolean)
                            .join(' ') || project.assigned_lead.email
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <ProjectAlertBadge level={project.alert_level as AlertLevel} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <RoleGate allowedRoles={['admin', 'project_lead']}>
                        <Link
                          href={`/projects/${project.id}/edit`}
                          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 hover:text-brand-purple"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Edit
                        </Link>
                      </RoleGate>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {projects.map((project) => (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                className="block rounded-lg border border-gray-200 bg-white p-4 hover:border-brand-purple/30 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-medium text-gray-900">{project.client_name}</div>
                    <div className="text-sm text-gray-500">{project.site_name}</div>
                  </div>
                  <ProjectAlertBadge level={project.alert_level as AlertLevel} />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                  {project.planning_reference && (
                    <>
                      <span>{project.planning_reference}</span>
                      <span>&middot;</span>
                    </>
                  )}
                  <Badge variant="purple">{project.application_stage}</Badge>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
