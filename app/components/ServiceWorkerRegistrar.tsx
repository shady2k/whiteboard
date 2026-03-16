'use client';

import { useEffect } from 'react';
import { registerServiceWorker } from '@/app/lib/registerSW';

export function ServiceWorkerRegistrar() {
  useEffect(() => {
    registerServiceWorker();
  }, []);
  return null;
}
