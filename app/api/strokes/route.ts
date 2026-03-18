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

  // Strokes-specific revision check
  if (expectedRevision !== undefined) {
    const page = db.prepare('SELECT strokes_revision FROM pages WHERE id = ?').get(pageId) as { strokes_revision: number } | undefined;
    if (page && page.strokes_revision !== expectedRevision) {
      const currentStrokes = (db.prepare(
        'SELECT id, type, data FROM strokes WHERE page_id = ? ORDER BY z_order'
      ).all(pageId) as Array<{ id: string; type: string; data: string }>)
        .map(s => ({ ...JSON.parse(s.data), id: s.id, type: s.type }));
      return NextResponse.json({
        conflict: true,
        revision: page.strokes_revision,
        strokes: currentStrokes,
      }, { status: 409 });
    }
  }

  const now = new Date().toISOString();

  // Collect asset IDs referenced by old strokes before deleting
  const oldAssetIds = getPageAssetIds(pageId);

  const upsert = db.prepare(
    `INSERT INTO strokes (id, page_id, type, data, z_order) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET data = excluded.data, z_order = excluded.z_order, type = excluded.type`
  );

  // Deduplicate strokes by ID (last occurrence wins)
  const seen = new Map<string, number>();
  for (let i = 0; i < strokes.length; i++) seen.set(strokes[i].id, i);
  const deduped = [...seen.values()].sort((a: number, b: number) => a - b).map((i: number) => strokes[i]);

  let newRevision = 0;
  const transaction = db.transaction(() => {
    db.prepare('DELETE FROM strokes WHERE page_id = ?').run(pageId);
    for (let i = 0; i < deduped.length; i++) {
      const stroke = deduped[i];
      const { id, type, ...rest } = stroke;
      upsert.run(id, pageId, type, JSON.stringify(rest), i);
    }
    db.prepare('UPDATE pages SET strokes_revision = strokes_revision + 1 WHERE id = ?').run(pageId);
    const updated = db.prepare('SELECT strokes_revision FROM pages WHERE id = ?').get(pageId) as { strokes_revision: number };
    newRevision = updated.strokes_revision;
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

// PATCH /api/strokes — diff-based sync (upsert + remove + reorder)
export async function PATCH(request: Request) {
  const { pageId, sessionId, upserted, removed, strokeOrder, actionId, expectedRevision } = await request.json();
  const db = getDb();

  // Atomic dedup: claim the action ID first
  const claimed = tryClaimAction(actionId, 'pageSync');
  if (claimed) return claimed;

  // Strokes-specific revision check (independent of background_revision)
  if (expectedRevision !== undefined) {
    const page = db.prepare('SELECT strokes_revision FROM pages WHERE id = ?').get(pageId) as { strokes_revision: number } | undefined;
    if (page && page.strokes_revision !== expectedRevision) {
      const currentStrokes = (db.prepare(
        'SELECT id, type, data FROM strokes WHERE page_id = ? ORDER BY z_order'
      ).all(pageId) as Array<{ id: string; type: string; data: string }>)
        .map(s => ({ ...JSON.parse(s.data), id: s.id, type: s.type }));
      return NextResponse.json({
        conflict: true,
        revision: page.strokes_revision,
        strokes: currentStrokes,
      }, { status: 409 });
    }
  }

  const now = new Date().toISOString();

  // Collect asset IDs from strokes being removed (for cleanup)
  const removedAssetIds: string[] = [];
  if (removed && removed.length > 0) {
    for (const strokeId of removed) {
      const row = db.prepare('SELECT data, type FROM strokes WHERE id = ?').get(strokeId) as { data: string; type: string } | undefined;
      if (row?.type === 'image') {
        try {
          const assetId = JSON.parse(row.data).assetId;
          if (assetId) removedAssetIds.push(assetId);
        } catch { /* ignore */ }
      }
    }
  }

  const upsertStmt = db.prepare(`
    INSERT INTO strokes (id, page_id, type, data, z_order) VALUES (?, ?, ?, ?, 0)
    ON CONFLICT(id) DO UPDATE SET data = excluded.data, type = excluded.type
  `);
  const deleteStmt = db.prepare('DELETE FROM strokes WHERE id = ? AND page_id = ?');
  const updateOrder = db.prepare('UPDATE strokes SET z_order = ? WHERE id = ? AND page_id = ?');

  let newRevision = 0;
  let orderError = false;
  const transaction = db.transaction(() => {
    // Remove deleted strokes
    if (removed) {
      for (const strokeId of removed) {
        deleteStmt.run(strokeId, pageId);
      }
    }

    // Upsert new/changed strokes
    if (upserted) {
      for (const stroke of upserted) {
        const { id, type, ...rest } = stroke;
        upsertStmt.run(id, pageId, type, JSON.stringify(rest));
      }
    }

    // Validate and reindex z_order from strokeOrder
    if (strokeOrder && Array.isArray(strokeOrder)) {
      const surviving = db.prepare(
        'SELECT id FROM strokes WHERE page_id = ?'
      ).all(pageId) as Array<{ id: string }>;
      const survivingIds = new Set(surviving.map(s => s.id));
      const orderIds = new Set<string>();
      let valid = true;
      for (const id of strokeOrder) {
        if (orderIds.has(id) || !survivingIds.has(id)) { valid = false; break; }
        orderIds.add(id);
      }
      if (!valid || orderIds.size !== survivingIds.size) {
        orderError = true;
        throw new Error('Invalid strokeOrder');
      }
      for (let i = 0; i < strokeOrder.length; i++) {
        updateOrder.run(i, strokeOrder[i], pageId);
      }
    }

    db.prepare('UPDATE pages SET strokes_revision = strokes_revision + 1 WHERE id = ?').run(pageId);
    const updated = db.prepare('SELECT strokes_revision FROM pages WHERE id = ?').get(pageId) as { strokes_revision: number };
    newRevision = updated.strokes_revision;
    db.prepare('UPDATE sessions SET updated_at = ? WHERE id = ?').run(now, sessionId);
  });
  try {
    transaction();
  } catch (e) {
    if (orderError) {
      return NextResponse.json({ error: 'Invalid strokeOrder' }, { status: 400 });
    }
    throw e;
  }

  // Clean up orphaned assets
  if (removedAssetIds.length > 0) {
    cleanupOrphanedAssets(removedAssetIds);
  }

  const result = { ok: true, revision: newRevision };
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
