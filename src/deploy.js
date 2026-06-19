import path from 'node:path';
import crypto from 'node:crypto';
import { HARDCODED_ENV, REQUIRED_ENV_KEYS, STORE_REPO } from './config.js';
import { buildsDir, saveProject } from './store.js';
import { runCommand } from './system.js';
import { kv, section, spinner } from './ui.js';
import { ask, choose } from './prompt.js';

export async function collectEnv(supabase) {
  section('Environment variables');
  const env = { ...HARDCODED_ENV, SUPABASE_URL: supabase.url, SUPABASE_ANON_KEY: supabase.anonKey };
  for (const key of REQUIRED_ENV_KEYS) env[key] = await ask(`${key}`);
  return env;
}
export async function cloneRepo() {
  section('Clone storefront');
  const projectName = await ask('Vercel project name', `fabrica-store-${Date.now()}`);
  const id = crypto.randomUUID();
  const target = path.join(buildsDir, `${projectName}-${id.slice(0, 8)}`);
  await runCommand('git', ['clone', STORE_REPO, target]);
  return { id, projectName, target };
}
export async function deployToVercel(project, env) {
  section('Vercel deployment');
  await runCommand('npx', ['vercel@latest', 'link', '--yes', '--project', project.projectName], { cwd: project.target });
  for (const [key, value] of Object.entries(env)) {
    const spin = spinner(`Setting ${key}`);
    await runCommand('npx', ['vercel@latest', 'env', 'rm', key, 'production', '--yes'], { cwd: project.target, allowFailure: true });
    await runCommand('npx', ['vercel@latest', 'env', 'add', key, 'production'], { cwd: project.target, input: `${value}\n` });
    spin.succeed(`Set ${key}`);
  }
  await runCommand('npx', ['vercel@latest', '--prod', '--yes'], { cwd: project.target });
  const record = { ...project, repo: STORE_REPO, createdAt: new Date().toISOString(), envKeys: Object.keys(env), supabaseUrl: env.SUPABASE_URL };
  await saveProject(record);
  return record;
}
export async function editProjectEnv(projects) {
  if (!projects.length) { console.log('No deployed projects saved yet. Run build first.'); return; }
  const projectId = await choose('Select project:', projects.map((project) => ({ name: `${project.projectName} (${project.createdAt})`, value: project.id })));
  const project = projects.find((item) => item.id === projectId);
  const key = await choose('Variable to replace:', project.envKeys.map((item) => ({ name: item, value: item })));
  const value = await ask(`New value for ${key}`);
  await runCommand('npx', ['vercel@latest', 'env', 'rm', key, 'production', '--yes'], { cwd: project.target, allowFailure: true });
  await runCommand('npx', ['vercel@latest', 'env', 'add', key, 'production'], { cwd: project.target, input: `${value}\n` });
  await runCommand('npx', ['vercel@latest', '--prod', '--yes'], { cwd: project.target });
  kv('Redeployed', project.projectName);
}
