import getDb from '@/app/lib/db';
import WhiteboardLoader from '@/app/components/Whiteboard/WhiteboardLoader';
import { Page } from '@/app/types';

// Disable Next.js router cache — ensures fresh server data and full remount
// when navigating back to a session (canvas state doesn't survive cache reuse)
export const dynamic = 'force-dynamic';

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
  revision: number;
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

  // If session doesn't exist on server (e.g. created offline), render with empty
  // initialPages — WhiteboardLoader will load data from IDB
  if (!session) {
    return (
      <WhiteboardLoader
        sessionId={id}
        initialPages={[]}
        sessionName="Untitled"
        serverSessionExists={false}
      />
    );
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
      revision: page.revision,
      strokes: strokeRows.map(s => ({
        ...JSON.parse(s.data),
        id: s.id,
        type: s.type,
      })),
    };
  });

  return (
    <WhiteboardLoader
      sessionId={id}
      initialPages={pages}
      sessionName={session.name}
      serverSessionExists={true}
    />
  );
}
