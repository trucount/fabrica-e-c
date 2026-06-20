import process from 'node:process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { connectSupabase } from './bridge.js';
import { collectEnv, cloneRepo, deployToVercel, updateProjectEnv, ensureVercelLogin, runLocally } from './deploy.js';
import { createGithubRepoFromClone } from './github.js';
import { ensureDependencies, vinsCommand } from './deps.js';
import { cleanCommand } from './clean.js';
import { BRIDGE_ORIGIN, STORE_REPO } from './config.js';
import { dataDir, readProjects } from './store.js';
import { choose, ask } from './prompt.js';
import { banner, help, kv, kvSuccess, kvFail, section, endSections, subBox, log, logInfo, logWarn, divider, stepHeader, orange, dimOrange, bold, dim, green, cyan } from './ui.js';
import { openUrl } from './system.js';

async function packageVersion() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const pkg = JSON.parse(await readFile(path.join(here, '..', 'package.json'), 'utf8'));
  return pkg.version;
}

// ── build ─────────────────────────────────────────────────────────────────────
async function build() {
  banner();

  stepHeader(1, 5, 'Dependency check');
  section('Dependency check');
  await ensureDependencies({ names: ['git'] });
  endSections();

  stepHeader(2, 5, 'Supabase connect');
  section('Supabase connect');
  kv('Bridge', 'ONLINE');
  kv('SQL',    'Prepared securely (hidden from UI)');
  const supabase = await connectSupabase();
  endSections();

  stepHeader(3, 5, 'Environment variables');
  const env = await collectEnv(supabase);

  stepHeader(4, 5, 'Clone storefront');
  const project = await cloneRepo();

  stepHeader(5, 5, 'Deploy target');
  section('Where should Fabrica deploy?');
  endSections();

  const target = await choose('Select deployment target:', [
    { name: '☁  Deploy on Vercel (cloud, shareable URL)', value: 'vercel' },
    { name: '💻  Run locally on this computer',           value: 'local' },
  ]);

  if (target === 'local') {
    await runLocally(project, env);
    return;
  }

  section('Cloud deployment — checking tools');
  await ensureDependencies({ names: ['gh', 'vercel'] });
  endSections();

  await ensureVercelLogin();
  const githubRepo = await createGithubRepoFromClone(project);
  const record = await deployToVercel(project, env, githubRepo);

  section('✓ Deployment complete');
  divider();
  kv('Project',    record.projectName);
  kv('GitHub',     record.githubRepo || dim('n/a'));
  kv('URL',        record.productionUrl || dim('n/a'));
  kv('Local path', record.target);
  divider();
  log(green('Your Fabrica store is live!'));
  endSections();
}

// ── list ──────────────────────────────────────────────────────────────────────
async function list() {
  banner();
  const projects = await readProjects();

  section('Your Fabrica projects');
  if (!projects.length) {
    logInfo('No projects found');
    log('Run: npx fabrica-e-commerce build');
    endSections();
    return;
  }

  kv('Total projects', String(projects.length));
  divider();
  for (const p of projects) {
    const type = p.type === 'local' ? cyan('local') : green('cloud');
    log(`${bold(p.projectName)}  ${type}  ${dim(p.createdAt?.slice(0,10) || '')}`);
  }
  endSections();

  const choices = projects.map((p) => ({
    name: `${p.projectName}  (${p.type === 'local' ? 'local' : 'cloud'})`,
    value: p.id,
  }));

  const selected = await choose('Select a project to view details:', choices);
  const project = projects.find((p) => p.id === selected);

  section(`Project: ${bold(project.projectName)}`);
  kv('Type',      project.type === 'local' ? cyan('local') : green('cloud'));
  kv('Created',   project.createdAt || dim('unknown'));
  kv('Path',      project.target || dim('n/a'));
  kv('GitHub',    project.githubRepo || dim('n/a'));
  kv('Supabase',  project.supabaseUrl || dim('n/a'));
  kv('URL',       project.productionUrl || dim('n/a'));
  kv('Env keys',  (project.envKeys || []).join(', ') || dim('none'));
  endSections();
}

// ── env ───────────────────────────────────────────────────────────────────────
async function env() {
  banner();
  const projects = await readProjects();

  section('Environment manager');
  if (!projects.length) {
    logInfo('No projects found');
    log('Run: npx fabrica-e-commerce build');
    endSections();
    return;
  }
  endSections();

  const typeFilter = await choose('Which projects to show?', [
    { name: 'All projects',                 value: 'all' },
    { name: 'Local projects only',          value: 'local' },
    { name: 'Cloud (Vercel) projects only', value: 'cloud' },
  ]);

  const filtered = typeFilter === 'all' ? projects : projects.filter((p) => p.type === typeFilter);
  if (!filtered.length) {
    section('Environment manager');
    log(`No ${typeFilter} projects found`);
    endSections();
    return;
  }

  const projectId = await choose('Select project:', filtered.map((p) => ({
    name: `${p.projectName}  (${p.type === 'local' ? 'local' : 'cloud'})`,
    value: p.id,
  })));
  const project = filtered.find((p) => p.id === projectId);

  const envKeys = project.envKeys || [];
  if (!envKeys.length) {
    section('Environment manager');
    logWarn('No env keys stored for this project');
    endSections();
    return;
  }

  const key = await choose('Select env variable to update:', envKeys.map((k) => ({ name: k, value: k })));
  const currentVal = (project.env || {})[key];
  const value = await ask(`New value for ${key}`, currentVal || '');

  section('Applying update');
  await updateProjectEnv(project, key, value);
  kvSuccess('Updated', `${key} → ${project.type === 'local' ? '.env.local' : 'Vercel + redeployed'}`);
  endSections();
}

// ── rerun ─────────────────────────────────────────────────────────────────────
async function rerun() {
  banner();
  const projects = await readProjects();

  section('Re-run / re-open project');
  if (!projects.length) {
    logInfo('No projects found');
    log('Run: npx fabrica-e-commerce build');
    endSections();
    return;
  }
  endSections();

  const typeFilter = await choose('Which type of project?', [
    { name: 'All projects',              value: 'all' },
    { name: 'Local projects',            value: 'local' },
    { name: 'Cloud (Vercel) projects',   value: 'cloud' },
  ]);

  const filtered = typeFilter === 'all' ? projects : projects.filter((p) => p.type === typeFilter);
  if (!filtered.length) {
    section('Re-run / re-open project');
    log(`No ${typeFilter} projects found`);
    endSections();
    return;
  }

  const projectId = await choose('Select project to re-run:', filtered.map((p) => ({
    name: `${p.projectName}  (${p.type === 'local' ? 'local' : 'cloud'})`,
    value: p.id,
  })));
  const project = filtered.find((p) => p.id === projectId);

  section(`Re-running: ${bold(project.projectName)}`);

  if (project.type === 'local') {
    kv('Path', project.target);
    kv('URL',  'http://localhost:3000');
    log('Starting dev server — browser opens in 3s…');
    endSections();

    const { runCommand, runCommandCapture } = await import('./system.js');
    const { access } = await import('node:fs/promises');
    const hasPnpmLock = await access(path.join(project.target, 'pnpm-lock.yaml')).then(() => true, () => false);
    const pnpmAvailable = (await runCommandCapture('pnpm', ['--version'])).code === 0;
    const devCommand = hasPnpmLock && pnpmAvailable ? ['pnpm', ['run', 'dev']] : ['npm', ['run', 'dev']];
    setTimeout(() => openUrl('http://localhost:3000'), 3000);
    await runCommand(devCommand[0], devCommand[1], { cwd: project.target });
  } else {
    const url = project.productionUrl || null;
    kv('GitHub',  project.githubRepo || dim('n/a'));
    kv('URL',     url || dim('n/a'));
    kv('Inspect', project.inspectUrl || dim('n/a'));
    kv('Created', project.createdAt || dim('unknown'));
    if (url) log(`Opening ${url} …`);
    endSections();
    if (url) await openUrl(url);
  }
}

// ── info ──────────────────────────────────────────────────────────────────────
async function info() {
  banner();
  section('Package info');
  kv('Package',    `fabrica-e-commerce v${await packageVersion()}`);
  kv('Bridge',     BRIDGE_ORIGIN);
  kv('Store repo', STORE_REPO);
  kv('Local data', dataDir);
  kv('Node.js',    process.version);
  kv('Platform',   process.platform);
  kv('Creator',    'SPARROW AI SOLUTION');
  endSections();
}

// ── router ────────────────────────────────────────────────────────────────────
export async function run(args) {
  const command = args[0] || 'help';

  if (command === 'build')                                               return build();
  if (command === 'list')                                                return list();
  if (command === 'env')                                                 return env();
  if (command === 'rerun')                                               return rerun();
  if (command === 'clean')                                               return cleanCommand();
  if (command === 'info'  || command === '.info')                        return info();
  if (command === 'vins'  || command === '/vins')                        return vinsCommand();
  if (command === 'help'  || command === '--help' || command === '-h')   return help();

  console.error(`Unknown command: ${command}`);
  help();
  process.exitCode = 1;
}
