import { NextResponse } from 'next/server';
import getDb from '@/app/lib/db';

// GET /api/sessions/:id/data — lightweight JSON endpoint for background sync
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();

  const session = db.prepare('SELECT id, name, updated_at FROM sessions WHERE id = ?').get(id) as
    | { id: string; name: string; updated_at: string }
    | undefined;

  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  const pages = db.prepare(
    'SELECT * FROM pages WHERE session_id = ? ORDER BY position'
  ).all(id) as Array<Record<string, unknown>>;

  const pagesWithStrokes = pages.map((page) => {
    const strokes = db.prepare(
      'SELECT * FROM strokes WHERE page_id = ? ORDER BY z_order'
    ).all(page.id as string) as Array<Record<string, unknown>>;

    return {
      ...page,
      strokes: strokes.map((s) => ({
        ...JSON.parse(s.data as string),
        id: s.id,
        type: s.type,
      })),
    };
  });

  return NextResponse.json({
    id: session.id,
    name: session.name,
    updatedAt: session.updated_at,
    pages: pagesWithStrokes,
  });
}
