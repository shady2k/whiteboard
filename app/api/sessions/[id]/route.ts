import { NextResponse } from 'next/server';
import getDb from '@/app/lib/db';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { getSessionAssetIds, loadPagesWithStrokes } from '@/app/lib/apiHelpers';

// GET /api/sessions/:id — get full session with pages and strokes
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();

  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  const pages = db.prepare(
    'SELECT * FROM pages WHERE session_id = ? ORDER BY position'
  ).all(id) as Array<Record<string, unknown>>;

  const pagesWithStrokes = loadPagesWithStrokes(db, pages);

  return NextResponse.json({ ...session, pages: pagesWithStrokes });
}

// PUT /api/sessions/:id — update session name and/or thumbnail
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const db = getDb();
  const now = new Date().toISOString();

  if (body.name) {
    db.prepare('UPDATE sessions SET name = ?, updated_at = ? WHERE id = ?').run(body.name, now, id);
  }
  if (body.thumbnail !== undefined) {
    db.prepare('UPDATE sessions SET thumbnail = ?, updated_at = ? WHERE id = ?').run(body.thumbnail, now, id);
  }
  return NextResponse.json({ ok: true });
}

// DELETE /api/sessions/:id — soft-delete session
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();
  const url = new URL(request.url);
  const hard = url.searchParams.get('hard') === '1';

  if (hard) {
    // Hard delete: remove data and clean up assets
    const assetIds = getSessionAssetIds(id);
    db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
    if (assetIds.length > 0) {
      const { cleanupOrphanedAssets } = await import('@/app/lib/assetCleanup');
      cleanupOrphanedAssets(assetIds);
    }
  } else {
    // Soft delete: mark as deleted
    const now = new Date().toISOString();
    db.prepare('UPDATE sessions SET deleted_at = ? WHERE id = ?').run(now, id);
  }

  return NextResponse.json({ ok: true });
}

// PATCH /api/sessions/:id — restore soft-deleted session
export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();
  db.prepare('UPDATE sessions SET deleted_at = NULL WHERE id = ?').run(id);
  return NextResponse.json({ ok: true });
}

// POST /api/sessions/:id — clone session
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();

  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  const newSessionId = uuidv4();
  const now = new Date().toISOString();
  const newName = `${session.name} (copy)`;

  const pages = db.prepare(
    'SELECT * FROM pages WHERE session_id = ? ORDER BY position'
  ).all(id) as Array<Record<string, unknown>>;

  const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');

  const transaction = db.transaction(() => {
    db.prepare(
      'INSERT INTO sessions (id, name, thumbnail, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
    ).run(newSessionId, newName, session.thumbnail ?? null, now, now);

    for (const page of pages) {
      const newPageId = uuidv4();
      db.prepare(
        'INSERT INTO pages (id, session_id, position, background_pattern, background_color) VALUES (?, ?, ?, ?, ?)'
      ).run(newPageId, newSessionId, page.position, page.background_pattern, page.background_color);

      const strokes = db.prepare(
        'SELECT * FROM strokes WHERE page_id = ? ORDER BY z_order'
      ).all(page.id as string) as Array<Record<string, unknown>>;

      for (const stroke of strokes) {
        const newStrokeId = uuidv4();
        const strokeData = JSON.parse(stroke.data as string);

        // If stroke references an asset, copy the asset file too
        if (strokeData.assetId) {
          const asset = db.prepare('SELECT * FROM assets WHERE id = ?').get(strokeData.assetId) as Record<string, unknown> | undefined;
          if (asset) {
            const newAssetId = uuidv4();
            const oldPath = asset.file_path as string;
            const ext = path.extname(oldPath);
            const newFileName = `${newAssetId}${ext}`;
            const srcPath = path.join(DATA_DIR, 'assets', path.basename(oldPath));
            const destPath = path.join(DATA_DIR, 'assets', newFileName);
            try {
              fs.copyFileSync(srcPath, destPath);
              db.prepare(
                'INSERT INTO assets (id, mime_type, file_path, size, created_at) VALUES (?, ?, ?, ?, ?)'
              ).run(newAssetId, asset.mime_type, newFileName, asset.size, now);
              strokeData.assetId = newAssetId;
            } catch {
              // If copy fails, reuse the original asset reference
            }
          }
        }

        db.prepare(
          'INSERT INTO strokes (id, page_id, type, data, z_order) VALUES (?, ?, ?, ?, ?)'
        ).run(newStrokeId, newPageId, stroke.type, JSON.stringify(strokeData), stroke.z_order);
      }
    }
  });

  transaction();

  return NextResponse.json({ id: newSessionId, name: newName }, { status: 201 });
}
