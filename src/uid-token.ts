import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const DEFAULT_UID_TOKEN_FILE = join(
  homedir(),
  '.akeyless',
  'uid_rotator',
  'uid-token',
);

export function readUidTokenFromFile(filePath: string): string {
  const resolved = filePath.trim();
  if (!resolved) {
    throw new Error('Universal Identity token file path is required');
  }

  const token = readFileSync(resolved, 'utf8').trim();
  if (!token) {
    throw new Error(`Universal Identity token file is empty: ${resolved}`);
  }
  return token;
}
