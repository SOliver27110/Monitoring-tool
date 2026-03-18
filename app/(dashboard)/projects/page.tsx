import { ProjectTable } from '@/components/projects/ProjectTable';

export default function ProjectsPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage client projects and planning applications
        </p>
      </div>
      <ProjectTable />
    </div>
  );
}
