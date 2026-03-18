import { Users } from 'lucide-react';

interface NotableVoicesProps {
  voices: Array<{ name: string; count: number }>;
}

export function NotableVoices({ voices }: NotableVoicesProps) {
  if (voices.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="text-sm text-gray-500 mb-2">Notable Voices</div>
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <Users className="h-4 w-4" />
          No notable voices this week
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="text-sm text-gray-500 mb-3">Notable Voices</div>
      <div className="space-y-2">
        {voices.map((voice) => (
          <div key={voice.name} className="flex items-center justify-between">
            <span className="text-sm text-gray-900">{voice.name}</span>
            <span className="text-xs text-gray-500 bg-gray-100 rounded-full px-2 py-0.5">
              {voice.count} mention{voice.count !== 1 ? 's' : ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
