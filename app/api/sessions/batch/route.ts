import { NextResponse } from 'next/server';
import getDb from '@/app/lib/db';
import { getSessionAssetIds } from '@/app/lib/apiHelpers';
import { cleanupOrphanedAssets } from '@/app/lib/assetCleanup';

// DELETE /api/sessions/batch — soft-delete multiple sessions
export async function DELETE(request: Request) {
  const { ids, hard } = await request.json() as { ids: string[]; hard?: boolean };

  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'ids array required' }, { status: 400 });
  }

  const db = getDb();
  const placeholders = ids.map(() => '?').join(',');

  if (hard) {
    // Hard delete: remove data and clean up assets
    const allAssetIds: string[] = [];
    for (const id of ids) {
      allAssetIds.push(...getSessionAssetIds(id));
    }
    db.prepare(`DELETE FROM sessions WHERE id IN (${placeholders})`).run(...ids);
    if (allAssetIds.length > 0) {
      cleanupOrphanedAssets(allAssetIds);
    }
  } else {
    // Soft delete
    const now = new Date().toISOString();
    db.prepare(`UPDATE sessions SET deleted_at = ? WHERE id IN (${placeholders})`).run(now, ...ids);
  }

  return NextResponse.json({ ok: true, deleted: ids.length });
}

// PATCH /api/sessions/batch — restore soft-deleted sessions
export async function PATCH(request: Request) {
  const { ids } = await request.json() as { ids: string[] };

  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'ids array required' }, { status: 400 });
  }

  const db = getDb();
  const placeholders = ids.map(() => '?').join(',');
  db.prepare(`UPDATE sessions SET deleted_at = NULL WHERE id IN (${placeholders})`).run(...ids);

  return NextResponse.json({ ok: true, restored: ids.length });
}
