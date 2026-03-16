import { notFound } from 'next/navigation';
import getDb from '@/app/lib/db';
import Whiteboard from '@/app/components/Whiteboard/Whiteboard';
import { Page } from '@/app/types';

interface SessionRow {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

interface PageRow {
  id: string;
  session_id: string;
  position: number;
  background_pattern: string;
  background_color: string;
}

interface StrokeRow {
  id: string;
  page_id: string;
  type: string;
  data: string;
  z_order: number;
}

export default async function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = getDb();

  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as SessionRow | undefined;
  if (!session) {
    notFound();
  }

  const pageRows = db.prepare(
    'SELECT * FROM pages WHERE session_id = ? ORDER BY position'
  ).all(id) as PageRow[];

  const pages: Page[] = pageRows.map(page => {
    const strokeRows = db.prepare(
      'SELECT * FROM strokes WHERE page_id = ? ORDER BY z_order'
    ).all(page.id) as StrokeRow[];

    return {
      id: page.id,
      sessionId: page.session_id,
      position: page.position,
      backgroundPattern: page.background_pattern as Page['backgroundPattern'],
      backgroundColor: page.background_color,
      strokes: strokeRows.map(s => ({
        ...JSON.parse(s.data),
        id: s.id,
        type: s.type,
      })),
    };
  });

  return (
    <Whiteboard
      sessionId={id}
      initialPages={pages}
      sessionName={session.name}
    />
  );
}
