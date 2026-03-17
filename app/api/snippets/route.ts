import { NextResponse } from 'next/server';
import getDb from '@/app/lib/db';

// GET /api/snippets — list all snippets
export async function GET() {
  const db = getDb();
  const rows = db.prepare(
    'SELECT id, name, strokes, width, height, thumbnail, created_at, updated_at FROM snippets ORDER BY created_at DESC'
  ).all() as Array<{
    id: string;
    name: string;
    strokes: string;
    width: number;
    height: number;
    thumbnail: string | null;
    created_at: string;
    updated_at: string;
  }>;

  const snippets = rows.flatMap(r => {
    try {
      return [{
        id: r.id,
        name: r.name,
        strokes: JSON.parse(r.strokes),
        width: r.width,
        height: r.height,
        thumbnail: r.thumbnail ?? '',
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }];
    } catch {
      return []; // Skip malformed rows
    }
  });

  return NextResponse.json(snippets);
}

// POST /api/snippets — create a snippet
export async function POST(request: Request) {
  const { id, name, strokes, width, height, thumbnail, actionId } = await request.json();
  const db = getDb();
  const now = new Date().toISOString();

  // Idempotency via action_log
  if (actionId) {
    const inserted = db.prepare(
      'INSERT OR IGNORE INTO action_log (action_id, type, result, created_at) VALUES (?, ?, NULL, ?)'
    ).run(actionId, 'snippetCreate', now);
    if (inserted.changes === 0) {
      const existing = db.prepare('SELECT result FROM action_log WHERE action_id = ?').get(actionId) as { result: string | null } | undefined;
      if (existing?.result) {
        return NextResponse.json(JSON.parse(existing.result));
      }
      return NextResponse.json({ ok: true, id });
    }
  }

  const result = { ok: true, id };

  db.prepare(
    'INSERT OR REPLACE INTO snippets (id, name, strokes, width, height, thumbnail, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, name, JSON.stringify(strokes), width, height, thumbnail ?? null, now, now);

  if (actionId) {
    db.prepare('UPDATE action_log SET result = ? WHERE action_id = ?').run(JSON.stringify(result), actionId);
  }

  return NextResponse.json(result);
}

// DELETE /api/snippets?id=xxx — delete a snippet
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  }

  const db = getDb();
  db.prepare('DELETE FROM snippets WHERE id = ?').run(id);

  return NextResponse.json({ ok: true });
}
