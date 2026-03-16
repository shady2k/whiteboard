import { NextResponse } from 'next/server';
import getDb from '@/app/lib/db';

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
      })),
    };
  });

  return NextResponse.json({ ...session, pages: pagesWithStrokes });
}

// PUT /api/sessions/:id — update session name
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { name } = await request.json();
  const db = getDb();
  const now = new Date().toISOString();

  db.prepare('UPDATE sessions SET name = ?, updated_at = ? WHERE id = ?').run(name, now, id);
  return NextResponse.json({ ok: true });
}

// DELETE /api/sessions/:id — delete session and all its data
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();

  db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
  return NextResponse.json({ ok: true });
}
