import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { FileText } from 'lucide-react';

export default function ReportsPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
        <p className="mt-1 text-sm text-gray-500">Generated weekly reports for all projects</p>
      </div>
      <Card>
        <EmptyState
          title="No reports generated"
          description="Weekly reports will appear here once generated from project dashboards."
          icon={<FileText className="h-12 w-12" />}
        />
      </Card>
    </div>
  );
}
