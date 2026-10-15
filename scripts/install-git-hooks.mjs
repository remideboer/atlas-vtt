import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const MARKER = 'atlas-vtt: unit suite CI parity';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function gitPath(name) {
  try {
    return execFileSync('git', ['rev-parse', '--git-path', name], { cwd: root, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

const hooksDir = gitPath('hooks');
if (!hooksDir) process.exit(0);

const dir = path.isAbsolute(hooksDir) ? hooksDir : path.resolve(root, hooksDir);
mkdirSync(dir, { recursive: true });
const hookPath = path.join(dir, 'pre-push');
const hook = `#!/bin/sh
# ${MARKER}
root="$(git rev-parse --show-toplevel)" || exit 1
cd "$root" || exit 1
exec node scripts/pre-push.mjs
`;
writeFileSync(hookPath, hook);
try {
  chmodSync(hookPath, 0o755);
} catch {
  // Windows filesystems may refuse POSIX mode bits; Git for Windows still runs the hook.
}
