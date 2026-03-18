import { AnalyseForm } from '@/components/analyse/AnalyseForm';

export default function AnalysePage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Analyse</h1>
        <p className="mt-1 text-sm text-gray-500">
          Paste content for AI-powered media analysis. Results can be saved and assigned to projects.
        </p>
      </div>
      <AnalyseForm />
    </div>
  );
}
