import getDb from './db';
import fs from 'fs';
import path from 'path';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const ASSETS_DIR = path.join(DATA_DIR, 'assets');

/**
 * Delete asset rows and files for any asset IDs that are no longer
 * referenced by any stroke in the database.
 */
export function cleanupOrphanedAssets(assetIds: string[]): void {
  if (assetIds.length === 0) return;

  const db = getDb();

  for (const assetId of assetIds) {
    // Check if any stroke still references this asset
    const ref = db.prepare(
      "SELECT 1 FROM strokes WHERE json_extract(data, '$.assetId') = ? LIMIT 1"
    ).get(assetId);

    if (ref) continue; // Still referenced, skip

    // Get file path before deleting the row
    const asset = db.prepare('SELECT file_path FROM assets WHERE id = ?').get(assetId) as { file_path: string } | undefined;
    if (!asset) continue;

    db.prepare('DELETE FROM assets WHERE id = ?').run(assetId);

    try {
      fs.unlinkSync(path.join(ASSETS_DIR, path.basename(asset.file_path)));
    } catch {
      // File may already be gone
    }
  }
}
