import { NextResponse } from 'next/server';
import getDb from '@/app/lib/db';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const ASSETS_DIR = path.join(DATA_DIR, 'assets');

const ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

// POST /api/assets — upload an asset (image)
export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get('file') as File;
  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  // Check actionId for deduplication (atomic via INSERT OR IGNORE + check)
  const actionId = formData.get('actionId') as string | null;
  if (actionId) {
    const db = getDb();
    // Try to claim the action ID first — if it already exists, return cached result
    const inserted = db.prepare(
      'INSERT OR IGNORE INTO action_log (action_id, type, result, created_at) VALUES (?, ?, NULL, ?)'
    ).run(actionId, 'assetUpload', new Date().toISOString());
    if (inserted.changes === 0) {
      // Another request already claimed this action ID
      const existing = db.prepare('SELECT result FROM action_log WHERE action_id = ?').get(actionId) as { result: string | null } | undefined;
      if (existing?.result) {
        return NextResponse.json(JSON.parse(existing.result), { status: 201 });
      }
      // result is NULL — another request is still processing, tell client to retry
      return NextResponse.json({ error: 'Action in progress' }, { status: 409 });
    }
  }

  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return NextResponse.json({ error: 'File type not allowed. Use PNG, JPEG, WebP, or GIF.' }, { status: 400 });
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'File too large. Maximum 20 MB.' }, { status: 400 });
  }

  const assetId = uuidv4();
  const ext = getExtension(file.type);
  const fileName = `${assetId}.${ext}`;
  const filePath = path.join(ASSETS_DIR, fileName);

  // Write file to disk
  const buffer = Buffer.from(await file.arrayBuffer());
  fs.mkdirSync(ASSETS_DIR, { recursive: true });
  fs.writeFileSync(filePath, buffer);

  // Save metadata to DB
  const db = getDb();
  db.prepare(
    'INSERT INTO assets (id, mime_type, file_path, size, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(assetId, file.type, fileName, buffer.length, new Date().toISOString());

  const result = { id: assetId, mimeType: file.type, size: buffer.length };

  // Update action log with result
  if (actionId) {
    db.prepare(
      'UPDATE action_log SET result = ? WHERE action_id = ?'
    ).run(JSON.stringify(result), actionId);
  }

  return NextResponse.json(result, { status: 201 });
}

// GET /api/assets?id=xxx — serve an asset file
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  }

  const db = getDb();
  const asset = db.prepare('SELECT * FROM assets WHERE id = ?').get(id) as { file_path: string; mime_type: string } | undefined;
  if (!asset) {
    return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
  }

  const filePath = path.join(ASSETS_DIR, asset.file_path);
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  const buffer = fs.readFileSync(filePath);
  return new Response(buffer, {
    headers: {
      'Content-Type': asset.mime_type,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function getExtension(mimeType: string): string {
  const map: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/svg+xml': 'svg',
  };
  return map[mimeType] || 'bin';
}
