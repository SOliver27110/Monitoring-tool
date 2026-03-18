import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { FolderKanban } from 'lucide-react';

export default function ProjectsPage() {
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
          <p className="mt-1 text-sm text-gray-500">Manage client projects and planning applications</p>
        </div>
      </div>
      <Card>
        <EmptyState
          title="No projects yet"
          description="Add your first client project to start monitoring media coverage."
          icon={<FolderKanban className="h-12 w-12" />}
        />
      </Card>
    </div>
  );
}
