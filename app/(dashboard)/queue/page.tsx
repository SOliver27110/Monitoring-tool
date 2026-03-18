import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Inbox } from 'lucide-react';

export default function QueuePage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Review Queue</h1>
        <p className="mt-1 text-sm text-gray-500">Review and triage unreviewed analysis items</p>
      </div>
      <Card>
        <EmptyState
          title="Queue is empty"
          description="All items have been reviewed. New items will appear here after analysis."
          icon={<Inbox className="h-12 w-12" />}
        />
      </Card>
    </div>
  );
}
