import process from 'node:process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { connectSupabase } from './bridge.js';
import { collectEnv, cloneRepo, deployToVercel, updateProjectEnv, ensureVercelLogin, runLocally } from './deploy.js';
import { createGithubRepoFromClone } from './github.js';
import { ensureDependencies, vinsCommand } from './deps.js';
import { BRIDGE_ORIGIN, STORE_REPO } from './config.js';
import { dataDir, readProjects } from './store.js';
import { choose, ask } from './prompt.js';
import { banner, help, kv, section, subBox, resetSectionCount } from './ui.js';
import { openUrl } from './system.js';

async function packageVersion() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const pkg = JSON.parse(await readFile(path.join(here, '..', 'package.json'), 'utf8'));
  return pkg.version;
}

// ── build ─────────────────────────────────────────────────────────────────────
async function build() {
  banner();

  section('Dependency check');
  await ensureDependencies({ names: ['git'] });

  section('Supabase Connect');
  kv('BRIDGE', 'ONLINE');
  kv('SQL', 'Prepared securely (hidden from UI)');
  const supabase = await connectSupabase();
  const env = await collectEnv(supabase);
  const project = await cloneRepo();

  section('Run target');
  const target = await choose('Where should Fabrica run this storefront?', [
    { name: 'Deploy on Vercel cloud', value: 'vercel' },
    { name: 'Run locally on this computer', value: 'local' },
  ]);

  if (target === 'local') {
    await runLocally(project, env);
    return;
  }

  await ensureDependencies({ names: ['gh', 'vercel'] });
  await ensureVercelLogin();
  const githubRepo = await createGithubRepoFromClone(project);
  const record = await deployToVercel(project, env, githubRepo);

  section('Done');
  kv('Project', record.projectName);
  kv('GitHub repo', record.githubRepo || 'n/a');
  kv('URL', record.productionUrl || 'n/a');
  kv('Path', record.target);
}

// ── list ──────────────────────────────────────────────────────────────────────
async function list() {
  banner();
  const projects = await readProjects();
  if (!projects.length) {
    console.log('  No projects found. Run: fabrica build');
    return;
  }

  section('Your Fabrica projects');
  const choices = projects.map((p) => ({
    name: `${p.projectName} (${p.type === 'local' ? 'local' : 'cloud'})`,
    value: p.id,
  }));

  const selected = await choose('Select a project to view details:', choices);
  const project = projects.find((p) => p.id === selected);

  section(`Project: ${project.projectName}`);
  const lines = [
    `Name:       ${project.projectName}`,
    `Type:       ${project.type === 'local' ? 'local' : 'cloud'}`,
    `Created:    ${project.createdAt}`,
    `Path:       ${project.target}`,
    `GitHub:     ${project.githubRepo || 'n/a'}`,
    `Supabase:   ${project.supabaseUrl || 'n/a'}`,
    `URL:        ${project.productionUrl || 'n/a'}`,
    `Env keys:   ${(project.envKeys || []).join(', ')}`,
  ];
  subBox(lines);
}

// ── env ───────────────────────────────────────────────────────────────────────
async function env() {
  banner();
  const projects = await readProjects();
  if (!projects.length) {
    console.log('  No projects found. Run: fabrica build');
    return;
  }

  section('Environment manager');

  // Step 1 — pick project type filter
  const typeFilter = await choose('Which projects to show?', [
    { name: 'All projects', value: 'all' },
    { name: 'Local projects only', value: 'local' },
    { name: 'Cloud (Vercel) projects only', value: 'cloud' },
  ]);

  const filtered = typeFilter === 'all' ? projects : projects.filter((p) => p.type === typeFilter);
  if (!filtered.length) {
    console.log(`  No ${typeFilter} projects found.`);
    return;
  }

  // Step 2 — pick project
  const projectId = await choose('Select project:', filtered.map((p) => ({
    name: `${p.projectName} (${p.type === 'local' ? 'local' : 'cloud'})`,
    value: p.id,
  })));
  const project = filtered.find((p) => p.id === projectId);

  // Step 3 — pick env key
  const envKeys = project.envKeys || [];
  if (!envKeys.length) {
    console.log('  No env keys stored for this project.');
    return;
  }

  const key = await choose('Select env variable to update:', envKeys.map((k) => ({ name: k, value: k })));

  // Step 4 — new value
  const currentVal = (project.env || {})[key];
  const value = await ask(`New value for ${key}`, currentVal || '');

  section('Applying update');
  await updateProjectEnv(project, key, value);
  kv('Updated', `${key} → ${project.type === 'local' ? '.env.local' : 'Vercel + redeployed'}`);
}

// ── rerun ─────────────────────────────────────────────────────────────────────
async function rerun() {
  banner();
  const projects = await readProjects();
  if (!projects.length) {
    console.log('  No projects found. Run: fabrica build');
    return;
  }

  section('Re-run / re-open project');

  // Step 1 — local or cloud
  const typeFilter = await choose('Which type of project?', [
    { name: 'All projects', value: 'all' },
    { name: 'Local projects', value: 'local' },
    { name: 'Cloud (Vercel) projects', value: 'cloud' },
  ]);

  const filtered = typeFilter === 'all' ? projects : projects.filter((p) => p.type === typeFilter);
  if (!filtered.length) {
    console.log(`  No ${typeFilter} projects found.`);
    return;
  }

  // Step 2 — pick project
  const projectId = await choose('Select project to re-run:', filtered.map((p) => ({
    name: `${p.projectName} (${p.type === 'local' ? 'local' : 'cloud'})`,
    value: p.id,
  })));
  const project = filtered.find((p) => p.id === projectId);

  section(`Re-running: ${project.projectName}`);

  if (project.type === 'local') {
    // Re-run local dev server
    kv('Path', project.target);
    kv('URL', 'http://localhost:3000');

    const { runCommand } = await import('./system.js');
    const { access } = await import('node:fs/promises');
    const hasPnpmLock = await access(path.join(project.target, 'pnpm-lock.yaml')).then(() => true, () => false);
    const { runCommandCapture } = await import('./system.js');
    const pnpmAvailable = (await runCommandCapture('pnpm', ['--version'])).code === 0;
    const devCommand = hasPnpmLock && pnpmAvailable ? ['pnpm', ['run', 'dev']] : ['npm', ['run', 'dev']];

    console.log('  Starting dev server... auto-opening browser in 3s');
    setTimeout(() => openUrl('http://localhost:3000'), 3000);
    await runCommand(devCommand[0], devCommand[1], { cwd: project.target });
  } else {
    // Cloud: show info + open URL
    const url = project.productionUrl || null;
    const lines = [
      `Project:  ${project.projectName}`,
      `GitHub:   ${project.githubRepo || 'n/a'}`,
      `URL:      ${url || 'n/a'}`,
      `Inspect:  ${project.inspectUrl || 'n/a'}`,
      `Created:  ${project.createdAt}`,
    ];
    subBox(lines);
    if (url) {
      kv('Opening', url);
      await openUrl(url);
    } else {
      console.log('  No URL found for this project.');
    }
  }
}

// ── info ──────────────────────────────────────────────────────────────────────
async function info() {
  banner();
  section('Package info');
  const lines = [
    `Package:   fabrica-e-commerce v${await packageVersion()}`,
    `Bridge:    ${BRIDGE_ORIGIN}`,
    `Store repo: ${STORE_REPO}`,
    `Local data: ${dataDir}`,
    `Node:      ${process.version}`,
    '',
    'Creator:   SPARROW AI SOLUTION',
  ];
  subBox(lines);
}

// ── router ────────────────────────────────────────────────────────────────────
export async function run(args) {
  const command = args[0] || 'help';
  if (command === 'build')                                         return build();
  if (command === 'list')                                          return list();
  if (command === 'env')                                           return env();
  if (command === 'rerun')                                         return rerun();
  if (command === 'info'  || command === '.info')                  return info();
  if (command === 'vins'  || command === '/vins')                  return vinsCommand();
  if (command === 'help'  || command === '--help' || command === '-h') return help();
  console.error(`Unknown command: ${command}`);
  help();
  process.exitCode = 1;
}
