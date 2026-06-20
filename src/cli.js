import process from 'node:process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { connectSupabase } from './bridge.js';
import { collectEnv, cloneRepo, deployToVercel, editProjectEnv, ensureVercelLogin } from './deploy.js';
import { createGithubRepoFromClone } from './github.js';
import { ensureDependencies, vinsCommand } from './deps.js';
import { BRIDGE_ORIGIN, STORE_REPO } from './config.js';
import { dataDir, readProjects } from './store.js';
import { banner, help, kv, section } from './ui.js';

async function packageVersion() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const pkg = JSON.parse(await readFile(path.join(here, '..', 'package.json'), 'utf8'));
  return pkg.version;
}

async function build() {
  banner();

  section('Dependency check');
  await ensureDependencies({ names: ['git', 'gh', 'vercel'] });

  section('Supabase Connect');
  kv('BRIDGE', 'ONLINE');
  kv('SQL', 'Prepared securely (hidden from UI)');
  const supabase = await connectSupabase();
  const env = await collectEnv(supabase);
  const project = await cloneRepo();

  // Step 3: log in to Vercel first, push the cloned code into a brand new
  // GitHub repo owned by the user, then deploy that repo to a new Vercel
  // project with every env variable (including Supabase) set permanently.
  await ensureVercelLogin();
  const githubRepo = await createGithubRepoFromClone(project);
  const record = await deployToVercel(project, env, githubRepo);
  section('Done');
  kv('Project', record.projectName);
  kv('GitHub repo', record.githubRepo || 'n/a');
  kv('Path', record.target);
}

async function list() {
  banner();
  const projects = await readProjects();
  if (!projects.length) {
    console.log('No projects found. Run: fabrica build');
    return;
  }
  projects.forEach((project, index) => {
    console.log(`\n${index + 1}. ${project.projectName}`);
    kv('Created', project.createdAt);
    kv('Path', project.target);
    kv('GitHub repo', project.githubRepo || 'n/a');
    kv('Supabase', project.supabaseUrl);
    kv('Env keys', project.envKeys.join(', '));
  });
  await editProjectEnv(projects);
}

async function info() {
  banner();
  kv('Package', `fabrica-e-commerce v${await packageVersion()}`);
  kv('Bridge', BRIDGE_ORIGIN);
  kv('Store repo', STORE_REPO);
  kv('Local data', dataDir);
  kv('Node', process.version);
}

export async function run(args) {
  const command = args[0] || 'help';
  if (command === 'build') return build();
  if (command === 'list') return list();
  if (command === 'info' || command === '.info') return info();
  if (command === 'vins' || command === '/vins') return vinsCommand();
  if (command === 'help' || command === '--help' || command === '-h') return help();
  console.error(`Unknown command: ${command}`);
  help();
  process.exitCode = 1;
}
