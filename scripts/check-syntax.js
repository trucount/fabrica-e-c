#!/usr/bin/env node
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const files = [path.join('bin', 'fabrica.js')];

async function collectJsFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) await collectJsFiles(fullPath);
    if (entry.isFile() && entry.name.endsWith('.js')) files.push(fullPath);
  }
}

await collectJsFiles(path.join(root, 'src'));

for (const file of files) {
  const relativeFile = path.relative(root, file);
  const result = spawnSync(process.execPath, ['--check', relativeFile], { stdio: 'inherit', cwd: root });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log(`Checked ${files.length} JavaScript files.`);
