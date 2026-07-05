import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readUidTokenFromFile } from './uid-token';

describe('readUidTokenFromFile', () => {
  it('reads a trimmed token from disk', () => {
    const dir = mkdtempSync(join(tmpdir(), 'akeyless-uid-'));
    const filePath = join(dir, 'uid-token');
    writeFileSync(filePath, '  u-test-token  \n', 'utf8');

    expect(readUidTokenFromFile(filePath)).toBe('u-test-token');
  });

  it('rejects empty files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'akeyless-uid-'));
    const filePath = join(dir, 'uid-token');
    writeFileSync(filePath, '   ', 'utf8');

    expect(() => readUidTokenFromFile(filePath)).toThrow('empty');
  });
});
