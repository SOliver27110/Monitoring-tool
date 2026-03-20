'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { ProjectForm } from '@/components/projects/ProjectForm';
import { Spinner } from '@/components/ui/Spinner';
import type { ProjectFormData } from '@/lib/types';

export default function EditProjectPage() {
  const params = useParams();
  const projectId = params.id as string;
  const [initialData, setInitialData] = useState<ProjectFormData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`/api/projects/${projectId}`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load project');
        return res.json();
      })
      .then((project) => {
        setInitialData({
          client_name: project.client_name,
          site_name: project.site_name,
          planning_reference: project.planning_reference,
          lpa: project.lpa,
          boolean_search_terms: project.boolean_search_terms,
          exclusion_terms: project.exclusion_terms ?? '',
          assigned_lead_id: project.assigned_lead_id,
          application_stage: project.application_stage,
          key_dates: project.key_dates ?? {},
          alert_level: project.alert_level,
        });
      })
      .catch((err) => setError(err.message));
  }, [projectId]);

  if (error) {
    return (
      <Card>
        <p className="text-red-600">{error}</p>
      </Card>
    );
  }

  if (!initialData) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Edit Project</h1>
        <p className="mt-1 text-sm text-gray-500">Update project details</p>
      </div>
      <Card>
        <ProjectForm initialData={initialData} projectId={projectId} />
      </Card>
    </div>
  );
}
