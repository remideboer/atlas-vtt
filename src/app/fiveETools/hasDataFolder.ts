import { accessSync, constants } from 'fs';
import { join } from 'path';

/** Whether `root` looks like a 5e.tools checkout (contains a readable `data/` folder). */
export function hasDataFolder(root: string): boolean {
  const trimmed = root.trim();
  if (!trimmed) return false;
  try {
    accessSync(join(trimmed, 'data'), constants.R_OK);
    return true;
  } catch {
    return false;
  }
}
