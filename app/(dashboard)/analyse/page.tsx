import { Card } from '@/components/ui/Card';
import { FileSearch } from 'lucide-react';

export default function AnalysePage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Analyse</h1>
        <p className="mt-1 text-sm text-gray-500">Paste content for AI-powered media analysis</p>
      </div>
      <Card>
        <div className="flex flex-col items-center py-12 text-center">
          <FileSearch className="h-12 w-12 text-gray-400 mb-4" />
          <h3 className="text-lg font-semibold text-gray-900">Analyst Workspace</h3>
          <p className="mt-1 text-sm text-gray-500">Coming in Phase 3</p>
        </div>
      </Card>
    </div>
  );
}
