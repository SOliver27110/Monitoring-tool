import { QueueList } from '@/components/queue/QueueList';

export default function QueuePage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Review Queue</h1>
        <p className="mt-1 text-sm text-gray-500">
          Review and triage unreviewed analysis items. Action Required items are shown first.
        </p>
      </div>
      <QueueList />
    </div>
  );
}
