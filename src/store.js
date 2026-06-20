import { access, cp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

// Use the same "app data" convention native desktop apps use, so the data
// survives even when Fabrica is run via `npx` and never actually installed
// (npx's own package cache can be cleared at any time — this folder can't be,
// since it isn't part of the npx cache at all).
//   Windows: %APPDATA%\FABRICA\E-COMMERCE         (...\AppData\Roaming\...)
//   macOS:   ~/Library/Application Support/FABRICA/E-COMMERCE
//   Linux:   $XDG_DATA_HOME/FABRICA/E-COMMERCE  or  ~/.local/share/FABRICA/E-COMMERCE
function platformAppDataRoot() {
  if (process.platform === 'win32') {
    return process.env.APPDATA || path.join(homedir(), 'AppData', 'Roaming');
  }
  if (process.platform === 'darwin') {
    return path.join(homedir(), 'Library', 'Application Support');
  }
  return process.env.XDG_DATA_HOME || path.join(homedir(), '.local', 'share');
}

export const dataDir = path.join(platformAppDataRoot(), 'FABRICA', 'E-COMMERCE');
export const projectsFile = path.join(dataDir, 'projects.json');
export const buildsDir = path.join(dataDir, 'builds');

// Versions before this change stored everything under ~/.fabrica-ecommerce.
// Migrate that data once, automatically, so upgrading never loses existing
// projects/builds — it just moves them to the new standard location.
const legacyDataDir = path.join(homedir(), '.fabrica-ecommerce');

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

async function migrateLegacyDataIfNeeded() {
  if (legacyDataDir === dataDir) return;
  if (!(await exists(legacyDataDir))) return;
  if (await exists(dataDir)) return; // new location already has data, don't touch it

  await mkdir(path.dirname(dataDir), { recursive: true });
  try {
    await rename(legacyDataDir, dataDir);
  } catch {
    // rename() can fail across drives/filesystems (e.g. EXDEV on some Windows
    // setups) — fall back to a recursive copy, then remove the old folder.
    await cp(legacyDataDir, dataDir, { recursive: true });
    await rm(legacyDataDir, { recursive: true, force: true });
  }
}

export async function ensureStore() {
  await migrateLegacyDataIfNeeded();
  await mkdir(buildsDir, { recursive: true });
}

export async function readProjects() {
  await ensureStore();
  try {
    return JSON.parse(await readFile(projectsFile, 'utf8'));
  } catch {
    return [];
  }
}

export async function saveProject(project) {
  const projects = await readProjects();
  const next = [project, ...projects.filter((item) => item.id !== project.id)];
  await writeFile(projectsFile, JSON.stringify(next, null, 2));
}
