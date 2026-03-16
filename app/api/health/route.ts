import { NextResponse } from 'next/server';
import getDb from '@/app/lib/db';

export async function GET() {
  try {
    const db = getDb();
    db.prepare('SELECT 1').get();
    return NextResponse.json({ status: 'ok', timestamp: new Date().toISOString() });
  } catch {
    return NextResponse.json({ status: 'error', timestamp: new Date().toISOString() }, { status: 503 });
  }
}
