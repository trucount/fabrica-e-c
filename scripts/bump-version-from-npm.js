#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';

const packagePath = new URL('../package.json', import.meta.url);
const pkg = JSON.parse(await readFile(packagePath, 'utf8'));

function parseVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-.+)?$/.exec(version);
  if (!match) throw new Error(`Unsupported semver version: ${version}`);
  return match.slice(1).map(Number);
}

function compareVersions(a, b) {
  const left = parseVersion(a);
  const right = parseVersion(b);
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

function nextPatch(version) {
  const [major, minor, patch] = parseVersion(version);
  return `${major}.${minor}.${patch + 1}`;
}

async function latestPublishedVersion(name) {
  const url = `https://registry.npmjs.org/${encodeURIComponent(name).replace('%2F', '/')}`;
  const response = await fetch(url, { headers: { Accept: 'application/vnd.npm.install-v1+json' } });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`npm registry lookup failed: ${response.status} ${await response.text()}`);
  const metadata = await response.json();
  return metadata?.['dist-tags']?.latest ?? null;
}

const latest = await latestPublishedVersion(pkg.name);
const base = latest && compareVersions(latest, pkg.version) >= 0 ? latest : pkg.version;
const next = latest ? nextPatch(base) : pkg.version;

pkg.version = next;
await writeFile(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);

console.log(latest ? `Bumped ${pkg.name} from npm latest ${latest} to ${next}.` : `No npm release found; keeping ${pkg.name} at ${next}.`);
