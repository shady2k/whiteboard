import { NextResponse } from 'next/server';
import getDb from '@/app/lib/db';
import { v4 as uuidv4 } from 'uuid';

// GET /api/sessions — list all sessions with preview info
export async function GET() {
  const db = getDb();
  const sessions = db.prepare(`
    SELECT s.*,
           COUNT(p.id) as page_count,
           (SELECT pp.background_color FROM pages pp WHERE pp.session_id = s.id ORDER BY pp.position LIMIT 1) as bg_color,
           (SELECT pp.background_pattern FROM pages pp WHERE pp.session_id = s.id ORDER BY pp.position LIMIT 1) as bg_pattern
    FROM sessions s
    LEFT JOIN pages p ON p.session_id = s.id
    GROUP BY s.id
    ORDER BY s.updated_at DESC
  `).all();
  return NextResponse.json(sessions);
}

// POST /api/sessions — create a new session
// Accepts optional client-provided id and pageId for offline-first creation
export async function POST(request: Request) {
  const body = await request.json();
  const name = body.name;
  const db = getDb();
  const sessionId = body.id || uuidv4();
  const pageId = body.pageId || uuidv4();
  const now = new Date().toISOString();

  // If session already exists (offline-created, now syncing), skip
  const existing = db.prepare('SELECT id FROM sessions WHERE id = ?').get(sessionId);
  if (existing) {
    return NextResponse.json({ id: sessionId, name: name || 'Untitled', created_at: now, updated_at: now }, { status: 200 });
  }

  const insertSession = db.prepare(
    'INSERT INTO sessions (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)'
  );
  const insertPage = db.prepare(
    'INSERT INTO pages (id, session_id, position, background_pattern, background_color) VALUES (?, ?, ?, ?, ?)'
  );

  const transaction = db.transaction(() => {
    insertSession.run(sessionId, name || 'Untitled', now, now);
    insertPage.run(pageId, sessionId, 0, 'blank', '#ffffff');
  });
  transaction();

  return NextResponse.json({ id: sessionId, name: name || 'Untitled', created_at: now, updated_at: now }, { status: 201 });
}
