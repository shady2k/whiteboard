'use client';

import { useRef } from 'react';

/**
 * Keep a ref always in sync with the latest value.
 * Update during render so event handlers never observe a one-commit-stale value.
 */
export function useLatestRef<T>(value: T): React.RefObject<T> {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}
