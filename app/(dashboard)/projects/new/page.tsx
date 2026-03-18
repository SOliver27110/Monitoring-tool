import { Card } from '@/components/ui/Card';
import { ProjectForm } from '@/components/projects/ProjectForm';

export default function NewProjectPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Add Project</h1>
        <p className="mt-1 text-sm text-gray-500">
          Create a new client project for media monitoring
        </p>
      </div>
      <Card>
        <ProjectForm />
      </Card>
    </div>
  );
}
