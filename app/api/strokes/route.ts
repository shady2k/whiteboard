import { NextResponse } from 'next/server';
import getDb from '@/app/lib/db';
import { cleanupOrphanedAssets } from '@/app/lib/assetCleanup';
import { tryClaimAction, completeAction, getPageAssetIds } from '@/app/lib/apiHelpers';

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
  const { pageId, sessionId, strokes, actionId, expectedRevision } = await request.json();
  const db = getDb();

  // Atomic dedup: claim the action ID first
  const claimed = tryClaimAction(actionId, 'pageSync');
  if (claimed) return claimed;

  // Revision check: if client sends expectedRevision, verify it matches
  if (expectedRevision !== undefined) {
    const page = db.prepare('SELECT revision FROM pages WHERE id = ?').get(pageId) as { revision: number } | undefined;
    if (page && page.revision !== expectedRevision) {
      const currentStrokes = (db.prepare(
        'SELECT id, type, data FROM strokes WHERE page_id = ? ORDER BY z_order'
      ).all(pageId) as Array<{ id: string; type: string; data: string }>)
        .map(s => ({ ...JSON.parse(s.data), id: s.id, type: s.type }));
      return NextResponse.json({
        conflict: true,
        revision: page.revision,
        strokes: currentStrokes,
      }, { status: 409 });
    }
  }

  const now = new Date().toISOString();

  // Collect asset IDs referenced by old strokes before deleting
  const oldAssetIds = getPageAssetIds(pageId);

  const insert = db.prepare(
    'INSERT INTO strokes (id, page_id, type, data, z_order) VALUES (?, ?, ?, ?, ?)'
  );

  let newRevision = 0;
  const transaction = db.transaction(() => {
    db.prepare('DELETE FROM strokes WHERE page_id = ?').run(pageId);
    for (let i = 0; i < strokes.length; i++) {
      const stroke = strokes[i];
      const { id, type, ...rest } = stroke;
      insert.run(id, pageId, type, JSON.stringify(rest), i);
    }
    db.prepare('UPDATE pages SET revision = revision + 1 WHERE id = ?').run(pageId);
    const updated = db.prepare('SELECT revision FROM pages WHERE id = ?').get(pageId) as { revision: number };
    newRevision = updated.revision;
    db.prepare('UPDATE sessions SET updated_at = ? WHERE id = ?').run(now, sessionId);
  });
  transaction();

  // Clean up assets that are no longer referenced by any stroke
  if (oldAssetIds.length > 0) {
    cleanupOrphanedAssets(oldAssetIds);
  }

  const result = { ok: true, revision: newRevision };

  // Update action log with result
  completeAction(actionId, result);

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
