import { NextResponse } from 'next/server';
import getDb from '@/app/lib/db';

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
  const { pageId, sessionId, strokes } = await request.json();
  const db = getDb();
  const now = new Date().toISOString();

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

  return NextResponse.json({ ok: true });
}

// DELETE /api/strokes — delete a stroke by id
export async function DELETE(request: Request) {
  const { strokeId, sessionId } = await request.json();
  const db = getDb();
  const now = new Date().toISOString();

  db.prepare('DELETE FROM strokes WHERE id = ?').run(strokeId);
  db.prepare('UPDATE sessions SET updated_at = ? WHERE id = ?').run(now, sessionId);

  return NextResponse.json({ ok: true });
}
