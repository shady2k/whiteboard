import { NextResponse } from 'next/server';
import getDb from '@/app/lib/db';
import { v4 as uuidv4 } from 'uuid';
import { tryClaimAction, completeAction, getPageAssetIds } from '@/app/lib/apiHelpers';

// POST /api/pages — add a page to a session
export async function POST(request: Request) {
  const { sessionId, position, backgroundPattern, backgroundColor } = await request.json();
  const db = getDb();
  const pageId = uuidv4();
  const now = new Date().toISOString();

  const transaction = db.transaction(() => {
    // Shift existing pages at or after this position
    db.prepare(
      'UPDATE pages SET position = position + 1 WHERE session_id = ? AND position >= ?'
    ).run(sessionId, position ?? 0);

    db.prepare(
      'INSERT INTO pages (id, session_id, position, background_pattern, background_color) VALUES (?, ?, ?, ?, ?)'
    ).run(pageId, sessionId, position ?? 0, backgroundPattern || 'blank', backgroundColor || '#ffffff');

    db.prepare('UPDATE sessions SET updated_at = ? WHERE id = ?').run(now, sessionId);
  });
  transaction();

  return NextResponse.json({
    id: pageId,
    session_id: sessionId,
    position: position ?? 0,
    background_pattern: backgroundPattern || 'blank',
    background_color: backgroundColor || '#ffffff',
    strokes: [],
  }, { status: 201 });
}

// PUT /api/pages — update page background
export async function PUT(request: Request) {
  const { pageId, backgroundPattern, backgroundColor, actionId } = await request.json();
  const db = getDb();

  // Atomic dedup: claim the action ID first
  const claimed = tryClaimAction(actionId, 'backgroundSync');
  if (claimed) return claimed;

  let newRevision = 0;
  const transaction = db.transaction(() => {
    db.prepare(
      'UPDATE pages SET background_pattern = ?, background_color = ?, background_revision = background_revision + 1 WHERE id = ?'
    ).run(backgroundPattern, backgroundColor, pageId);

    const updated = db.prepare('SELECT background_revision, session_id FROM pages WHERE id = ?').get(pageId) as { background_revision: number; session_id: string } | undefined;
    if (updated) {
      newRevision = updated.background_revision;
      const now = new Date().toISOString();
      db.prepare('UPDATE sessions SET updated_at = ? WHERE id = ?').run(now, updated.session_id);
    }
  });
  transaction();

  const result = { ok: true, revision: newRevision };

  // Update action log with result
  completeAction(actionId, result);

  return NextResponse.json(result);
}

// DELETE /api/pages — delete a page
export async function DELETE(request: Request) {
  const { pageId, sessionId } = await request.json();
  const db = getDb();
  const now = new Date().toISOString();

  // Collect asset IDs referenced by this page's strokes before cascade delete
  const assetIds = getPageAssetIds(pageId);

  const transaction = db.transaction(() => {
    const page = db.prepare('SELECT position FROM pages WHERE id = ?').get(pageId) as { position: number } | undefined;
    if (page) {
      db.prepare('DELETE FROM pages WHERE id = ?').run(pageId);
      db.prepare(
        'UPDATE pages SET position = position - 1 WHERE session_id = ? AND position > ?'
      ).run(sessionId, page.position);
    }
    db.prepare('UPDATE sessions SET updated_at = ? WHERE id = ?').run(now, sessionId);
  });
  transaction();

  // Clean up orphaned assets
  if (assetIds.length > 0) {
    const { cleanupOrphanedAssets } = await import('@/app/lib/assetCleanup');
    cleanupOrphanedAssets(assetIds);
  }

  return NextResponse.json({ ok: true });
}
