import { useState } from 'react';

/**
 * Purity-safe replacement for Date.now() during render: captures the
 * timestamp once when the component mounts and keeps it stable across
 * re-renders. Freshness ages are display-only, so a mount-time snapshot
 * is the intended semantic.
 */
export function useNow(): number {
  const [now] = useState(() => Date.now());
  return now;
}
