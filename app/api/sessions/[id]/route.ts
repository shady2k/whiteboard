import { NextResponse } from 'next/server';
import getDb from '@/app/lib/db';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';

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

  const pagesWithStrokes = pages.map(page => {
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

// DELETE /api/sessions/:id — delete session and all its data
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();

  // Collect asset IDs referenced by this session's strokes
  const assetIds = (db.prepare(`
    SELECT DISTINCT json_extract(s.data, '$.assetId') as assetId
    FROM strokes s
    INNER JOIN pages p ON s.page_id = p.id
    WHERE p.session_id = ? AND s.type = 'image'
  `).all(id) as Array<{ assetId: string | null }>)
    .map(r => r.assetId)
    .filter((aid): aid is string => aid !== null);

  // Delete session (cascades to pages and strokes)
  db.prepare('DELETE FROM sessions WHERE id = ?').run(id);

  // Clean up assets that are no longer referenced by any remaining stroke
  if (assetIds.length > 0) {
    const { cleanupOrphanedAssets } = await import('@/app/lib/assetCleanup');
    cleanupOrphanedAssets(assetIds);
  }

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
