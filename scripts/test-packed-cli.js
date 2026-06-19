#!/usr/bin/env node
import { rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const pack = spawnSync('npm', ['pack', '--silent'], { encoding: 'utf8', shell: process.platform === 'win32' });
if (pack.status !== 0) {
  process.stderr.write(pack.stderr || 'npm pack failed\n');
  process.exit(pack.status ?? 1);
}

const tarball = pack.stdout.trim().split(/\r?\n/).at(-1);
try {
  run('npm', ['exec', '--yes', '--package', `./${tarball}`, '--', 'fabrica', 'help']);
  run('npm', ['exec', '--yes', '--package', `./${tarball}`, '--', 'fabrica', 'info']);
} finally {
  await rm(tarball, { force: true });
}
