import { NextResponse } from 'next/server';
import getDb from '@/app/lib/db';
import { v4 as uuidv4 } from 'uuid';

// GET /api/sessions — list all sessions
export async function GET() {
  const db = getDb();
  const sessions = db.prepare(`
    SELECT s.*, COUNT(p.id) as page_count
    FROM sessions s
    LEFT JOIN pages p ON p.session_id = s.id
    GROUP BY s.id
    ORDER BY s.updated_at DESC
  `).all();
  return NextResponse.json(sessions);
}

// POST /api/sessions — create a new session
export async function POST(request: Request) {
  const { name } = await request.json();
  const db = getDb();
  const sessionId = uuidv4();
  const pageId = uuidv4();
  const now = new Date().toISOString();

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
