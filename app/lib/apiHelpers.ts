import { NextResponse } from 'next/server';
import type Database from 'better-sqlite3';
import getDb from './db';

/**
 * Try to claim an action ID for idempotency. Returns:
 * - `null` if the action was claimed (caller should proceed)
 * - A `NextResponse` if the action was already claimed (caller should return it)
 */
export function tryClaimAction(
  actionId: string | null | undefined,
  actionType: string
): NextResponse | null {
  if (!actionId) return null;

  const db = getDb();
  const inserted = db.prepare(
    'INSERT OR IGNORE INTO action_log (action_id, type, result, created_at) VALUES (?, ?, NULL, ?)'
  ).run(actionId, actionType, new Date().toISOString());

  if (inserted.changes === 0) {
    const existing = db.prepare(
      'SELECT result FROM action_log WHERE action_id = ?'
    ).get(actionId) as { result: string | null } | undefined;
    if (existing?.result) {
      return NextResponse.json(JSON.parse(existing.result));
    }
    return NextResponse.json({ error: 'Action in progress' }, { status: 409 });
  }

  return null;
}

/**
 * Store the result of a completed action in the action log.
 */
export function completeAction(actionId: string | null | undefined, result: unknown): void {
  if (!actionId) return;
  const db = getDb();
  db.prepare('UPDATE action_log SET result = ? WHERE action_id = ?')
    .run(JSON.stringify(result), actionId);
}

/**
 * Extract asset IDs referenced by image strokes on a given page.
 */
export function getPageAssetIds(pageId: string): string[] {
  const db = getDb();
  return (db.prepare(
    "SELECT json_extract(data, '$.assetId') as assetId FROM strokes WHERE page_id = ? AND type = 'image'"
  ).all(pageId) as Array<{ assetId: string | null }>)
    .map(r => r.assetId)
    .filter((id): id is string => id !== null);
}

/**
 * Extract asset IDs referenced by image strokes across all pages of a session.
 */
export function getSessionAssetIds(sessionId: string): string[] {
  const db = getDb();
  return (db.prepare(`
    SELECT DISTINCT json_extract(s.data, '$.assetId') as assetId
    FROM strokes s
    INNER JOIN pages p ON s.page_id = p.id
    WHERE p.session_id = ? AND s.type = 'image'
  `).all(sessionId) as Array<{ assetId: string | null }>)
    .map(r => r.assetId)
    .filter((id): id is string => id !== null);
}

/**
 * Load pages for a session with their strokes reconstructed from DB rows.
 */
export function loadPagesWithStrokes(
  db: Database.Database,
  pages: Array<Record<string, unknown>>
): Array<Record<string, unknown>> {
  return pages.map(page => {
    const strokes = db.prepare(
      'SELECT * FROM strokes WHERE page_id = ? ORDER BY z_order'
    ).all(page.id as string) as Array<Record<string, unknown>>;

    return {
      ...page,
      strokes: strokes.map(s => ({
        ...JSON.parse(s.data as string),
        id: s.id,
        type: s.type,
      })),
    };
  });
}
