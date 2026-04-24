import type { AlertLevel, ItemAlertLevel } from '@/lib/types';

interface ProjectAlertBadgeProps {
  level: AlertLevel;
}

const projectAlertConfig: Record<AlertLevel, { emoji: string; label: string; className: string }> = {
  green: { emoji: '\uD83D\uDFE2', label: 'Green', className: 'bg-green-50 text-green-700 border-green-200' },
  yellow: { emoji: '\uD83D\uDFE1', label: 'Amber', className: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  red: { emoji: '\uD83D\uDD34', label: 'Red', className: 'bg-red-50 text-red-700 border-red-200' },
};

export function ProjectAlertBadge({ level }: ProjectAlertBadgeProps) {
  const config = projectAlertConfig[level];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${config.className}`}>
      <span>{config.emoji}</span>
      {config.label}
    </span>
  );
}

interface ItemAlertBadgeProps {
  level: ItemAlertLevel | null | undefined;
}

const itemAlertConfig: Record<ItemAlertLevel, { className: string }> = {
  'Routine': { className: 'bg-green-50 text-green-700 border-green-200' },
  'Watch': { className: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  'Action Required': { className: 'bg-red-50 text-red-700 border-red-200' },
};

export function ItemAlertBadge({ level }: ItemAlertBadgeProps) {
  if (!level) return null;
  const config = itemAlertConfig[level];
  if (!config) return null;
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${config.className}`}>
      {level}
    </span>
  );
}
