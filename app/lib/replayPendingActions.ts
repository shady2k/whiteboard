import { getPendingActions, clearPendingAction } from './idb';

/**
 * Replays queued session-level pending actions (create, delete, rename).
 * Used by both the sync engine (inside a whiteboard) and the session list.
 */
export async function replaySessionActions(): Promise<void> {
  if (!navigator.onLine) return;

  const pending = await getPendingActions();
  for (const action of pending) {
    if (action.type === 'sessionCreate') {
      try {
        const payload = JSON.parse(action.payload);
        const res = await fetch('/api/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (res.ok || res.status < 500) {
          await clearPendingAction(action.actionId);
        }
      } catch {
        // Will retry on next flush
      }
    } else if (action.type === 'sessionDelete') {
      try {
        const payload = JSON.parse(action.payload);
        const res = await fetch(`/api/sessions/${payload.id}`, {
          method: 'DELETE',
        });
        if (res.ok || res.status < 500) {
          await clearPendingAction(action.actionId);
        }
      } catch {
        // Will retry on next flush
      }
    } else if (action.type === 'sessionRename') {
      try {
        const payload = JSON.parse(action.payload);
        const res = await fetch(`/api/sessions/${payload.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: payload.name }),
        });
        if (res.ok || res.status < 500) {
          await clearPendingAction(action.actionId);
        }
      } catch {
        // Will retry on next flush
      }
    } else if (action.type === 'pageSync') {
      // Stale — will be picked up on next dirty page sync
      await clearPendingAction(action.actionId);
    }
  }
}
