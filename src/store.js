import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

export const dataDir = path.join(homedir(), '.fabrica-ecommerce');
export const projectsFile = path.join(dataDir, 'projects.json');
export const buildsDir = path.join(dataDir, 'builds');

export async function ensureStore() {
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
