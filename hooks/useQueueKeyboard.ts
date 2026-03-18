'use client';

import { useEffect, useCallback } from 'react';

interface UseQueueKeyboardProps {
  itemCount: number;
  selectedIndex: number;
  onSelect: (index: number) => void;
  onApprove: (index: number) => void;
  onDismiss: (index: number) => void;
  onAssign: (index: number) => void;
  enabled: boolean;
}

export function useQueueKeyboard({
  itemCount,
  selectedIndex,
  onSelect,
  onApprove,
  onDismiss,
  onAssign,
  enabled,
}: UseQueueKeyboardProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!enabled || itemCount === 0) return;

      // Don't capture if typing in an input
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
        return;
      }

      switch (e.key) {
        case 'j':
        case 'ArrowDown':
          e.preventDefault();
          onSelect(Math.min(selectedIndex + 1, itemCount - 1));
          break;
        case 'k':
        case 'ArrowUp':
          e.preventDefault();
          onSelect(Math.max(selectedIndex - 1, 0));
          break;
        case 'a':
          e.preventDefault();
          onApprove(selectedIndex);
          break;
        case 'd':
          e.preventDefault();
          onDismiss(selectedIndex);
          break;
        case 'p':
          e.preventDefault();
          onAssign(selectedIndex);
          break;
      }
    },
    [enabled, itemCount, selectedIndex, onSelect, onApprove, onDismiss, onAssign]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
