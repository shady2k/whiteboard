'use client';

import { useRef, useEffect } from 'react';

/**
 * Keep a ref always in sync with the latest value.
 * Eliminates the `useEffect(() => { ref.current = val }, [val])` boilerplate.
 */
export function useLatestRef<T>(value: T): React.RefObject<T> {
  const ref = useRef(value);
  useEffect(() => { ref.current = value; }, [value]);
  return ref;
}
