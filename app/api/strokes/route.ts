import { NextResponse } from 'next/server';
import getDb from '@/app/lib/db';
import { cleanupOrphanedAssets } from '@/app/lib/assetCleanup';

// POST /api/strokes — save strokes (batch upsert)
export async function POST(request: Request) {
  const { pageId, sessionId, strokes } = await request.json();
  const db = getDb();
  const now = new Date().toISOString();

  const upsert = db.prepare(`
    INSERT INTO strokes (id, page_id, type, data, z_order)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET data = excluded.data, z_order = excluded.z_order
  `);

  const transaction = db.transaction(() => {
    for (let i = 0; i < strokes.length; i++) {
      const stroke = strokes[i];
      const { id, type, ...rest } = stroke;
      upsert.run(id, pageId, type, JSON.stringify(rest), i);
    }
    db.prepare('UPDATE sessions SET updated_at = ? WHERE id = ?').run(now, sessionId);
  });
  transaction();

  return NextResponse.json({ ok: true });
}

// PUT /api/strokes — replace all strokes for a page (used after clear/undo)
export async function PUT(request: Request) {
  const { pageId, sessionId, strokes, actionId } = await request.json();
  const db = getDb();

  // Atomic dedup: claim the action ID first
  if (actionId) {
    const inserted = db.prepare(
      'INSERT OR IGNORE INTO action_log (action_id, type, result, created_at) VALUES (?, ?, NULL, ?)'
    ).run(actionId, 'pageSync', new Date().toISOString());
    if (inserted.changes === 0) {
      const existing = db.prepare('SELECT result FROM action_log WHERE action_id = ?').get(actionId) as { result: string | null } | undefined;
      if (existing?.result) {
        return NextResponse.json(JSON.parse(existing.result));
      }
      return NextResponse.json({ error: 'Action in progress' }, { status: 409 });
    }
  }
  const now = new Date().toISOString();

  // Collect asset IDs referenced by old strokes before deleting
  const oldAssetIds = (db.prepare(
    "SELECT json_extract(data, '$.assetId') as assetId FROM strokes WHERE page_id = ? AND type = 'image'"
  ).all(pageId) as Array<{ assetId: string | null }>)
    .map(r => r.assetId)
    .filter((id): id is string => id !== null);

  const insert = db.prepare(
    'INSERT INTO strokes (id, page_id, type, data, z_order) VALUES (?, ?, ?, ?, ?)'
  );

  const transaction = db.transaction(() => {
    db.prepare('DELETE FROM strokes WHERE page_id = ?').run(pageId);
    for (let i = 0; i < strokes.length; i++) {
      const stroke = strokes[i];
      const { id, type, ...rest } = stroke;
      insert.run(id, pageId, type, JSON.stringify(rest), i);
    }
    db.prepare('UPDATE sessions SET updated_at = ? WHERE id = ?').run(now, sessionId);
  });
  transaction();

  // Clean up assets that are no longer referenced by any stroke
  if (oldAssetIds.length > 0) {
    cleanupOrphanedAssets(oldAssetIds);
  }

  const result = { ok: true };

  // Update action log with result
  if (actionId) {
    db.prepare('UPDATE action_log SET result = ? WHERE action_id = ?').run(JSON.stringify(result), actionId);
  }

  return NextResponse.json(result);
}

// DELETE /api/strokes — delete a stroke by id
export async function DELETE(request: Request) {
  const { strokeId, sessionId } = await request.json();
  const db = getDb();
  const now = new Date().toISOString();

  // Check if this stroke references an asset before deleting
  const stroke = db.prepare('SELECT data, type FROM strokes WHERE id = ?').get(strokeId) as { data: string; type: string } | undefined;
  let assetId: string | null = null;
  if (stroke?.type === 'image') {
    try {
      assetId = JSON.parse(stroke.data).assetId ?? null;
    } catch { /* ignore */ }
  }

  db.prepare('DELETE FROM strokes WHERE id = ?').run(strokeId);
  db.prepare('UPDATE sessions SET updated_at = ? WHERE id = ?').run(now, sessionId);

  // Clean up the asset if it's no longer referenced
  if (assetId) {
    cleanupOrphanedAssets([assetId]);
  }

  return NextResponse.json({ ok: true });
}
