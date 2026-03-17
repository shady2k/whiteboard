export function registerServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

  // Don't register SW in development — it caches HTML/JS and conflicts with HMR
  if (process.env.NODE_ENV === 'development') return;

  const swVersion = process.env.NEXT_PUBLIC_SW_VERSION || 'dev';
  const swUrl = `/sw.js?v=${encodeURIComponent(swVersion)}`;

  let hasReloaded = false;
  let shouldReloadOnControllerChange = false;

  const reloadPage = () => {
    if (hasReloaded || !shouldReloadOnControllerChange) return;
    hasReloaded = true;
    window.location.reload();
  };

  const activateWaitingWorker = (registration: ServiceWorkerRegistration) => {
    if (!registration.waiting) return;
    shouldReloadOnControllerChange = true;
    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
  };

  const watchForUpdates = (registration: ServiceWorkerRegistration) => {
    if (registration.waiting && navigator.serviceWorker.controller) {
      activateWaitingWorker(registration);
    }

    registration.addEventListener('updatefound', () => {
      const installingWorker = registration.installing;
      if (!installingWorker) return;

      installingWorker.addEventListener('statechange', () => {
        if (
          installingWorker.state === 'installed' &&
          navigator.serviceWorker.controller
        ) {
          activateWaitingWorker(registration);
        }
      });
    });
  };

  const register = () => {
    navigator.serviceWorker
      .register(swUrl, { updateViaCache: 'none' })
      .then((registration) => {
        watchForUpdates(registration);

        // Check for updates immediately
        registration.update().catch(() => {});

        // Poll for updates every 60s
        window.setInterval(() => {
          registration.update().catch(() => {});
        }, 60_000);

        // Also check when tab becomes visible
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') {
            registration.update().catch(() => {});
          }
        });
      })
      .catch((err) => {
        console.error('SW registration failed:', err);
      });
  };

  navigator.serviceWorker.addEventListener('controllerchange', reloadPage);

  if (document.readyState === 'complete') {
    register();
  } else {
    window.addEventListener('load', register, { once: true });
  }
}
