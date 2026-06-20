import process from 'node:process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { connectSupabase } from './bridge.js';
import {
  collectEnv, collectAdminPassword, cloneRepo,
  deployToVercel, updateProjectEnv, ensureVercelLogin, runLocally,
} from './deploy.js';
import { createGithubRepoFromClone } from './github.js';
import { ensureDependencies, vinsCommand } from './deps.js';
import { cleanCommand } from './clean.js';
import { BRIDGE_ORIGIN, STORE_REPO } from './config.js';
import { dataDir, readProjects } from './store.js';
import { choose, ask } from './prompt.js';
import {
  banner, help, kv, kvSuccess, kvFail, section, endSections, subBox,
  log, logInfo, logWarn, logSuccess, divider, stepHeader,
  orange, dimOrange, bold, dim, green, cyan, yellow, red, white,
} from './ui.js';
import { openUrl } from './system.js';

async function packageVersion() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const pkg = JSON.parse(await readFile(path.join(here, '..', 'package.json'), 'utf8'));
  return pkg.version;
}

// ── build ─────────────────────────────────────────────────────────────────────
async function build() {
  banner();

  // Step 1 — Dependency check
  stepHeader(1, 6, 'Dependency check');
  section('Dependency check');
  await ensureDependencies({ names: ['git'] });
  endSections();

  // Step 2 — Supabase connect
  stepHeader(2, 6, 'Supabase connect');
  section('Supabase connect');
  kv('Bridge', 'ONLINE');
  kv('SQL',    'Prepared securely (hidden from UI)');
  const supabase = await connectSupabase();
  endSections();

  // Step 3 — Environment variables
  stepHeader(3, 6, 'Environment variables');
  const env = await collectEnv(supabase);

  // Step 4 — Admin password
  stepHeader(4, 6, 'Admin password');
  const adminPassword = await collectAdminPassword();
  env['PASS'] = adminPassword;

  // Step 5 — Clone storefront
  stepHeader(5, 6, 'Clone storefront');
  const project = await cloneRepo();

  // Step 6 — Deploy target
  stepHeader(6, 6, 'Deploy target');
  section('Where should Fabrica deploy?');
  logInfo('Choose how you want to run your store:');
  endSections();

  const target = await choose('Select deployment target:', [
    { name: '☁   Deploy on Vercel  —  cloud, shareable URL', value: 'vercel' },
    { name: '💻  Run locally         —  development on this machine', value: 'local' },
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

  section('✓  Deployment complete');
  divider();
  kvSuccess('Project',    record.projectName);
  kv('GitHub',     record.githubRepo || dim('n/a'));
  kv('Live URL',   record.productionUrl || dim('n/a'));
  kv('Local path', dim(record.target));
  divider();
  logSuccess('Your Fabrica store is live! 🎉');
  endSections();
}

// ── list ──────────────────────────────────────────────────────────────────────
async function list() {
  banner();
  const projects = await readProjects();

  section('Your Fabrica projects');
  if (!projects.length) {
    logInfo('No projects found yet');
    log(`Run ${cyan('npx fabrica-e-commerce build')} to create your first store`);
    endSections();
    return;
  }

  kv('Total', String(projects.length) + ' project' + (projects.length !== 1 ? 's' : ''));
  divider();
  for (const p of projects) {
    const badge = p.type === 'local'
      ? `${yellow('◉')} ${yellow('local')}`
      : `${green('◉')} ${green('cloud')}`;
    log(`${bold(white(p.projectName))}  ${badge}  ${dim(p.createdAt?.slice(0, 10) || '')}`);
  }
  divider();
  logInfo('Select a project to view its details');
  endSections();

  const choices = projects.map((p) => ({
    name: `${p.projectName}  (${p.type === 'local' ? 'local' : 'cloud'})`,
    value: p.id,
  }));

  const selected = await choose('Select a project to view details:', choices);
  const project = projects.find((p) => p.id === selected);

  section(`Project — ${bold(orange(project.projectName))}`);
  divider();
  const typeBadge = project.type === 'local' ? yellow('local') : green('cloud');
  kv('Type',      typeBadge);
  kv('Created',   project.createdAt ? project.createdAt.slice(0, 19).replace('T', ' ') : dim('unknown'));
  kv('Path',      dim(project.target || 'n/a'));
  kv('GitHub',    project.githubRepo || dim('n/a'));
  kv('Supabase',  project.supabaseUrl || dim('n/a'));
  kv('URL',       project.productionUrl || dim('n/a'));
  kv('Env keys',  (project.envKeys || []).length
    ? (project.envKeys || []).join(dim('  ·  '))
    : dim('none'));
  divider();
  endSections();
}

// ── env ───────────────────────────────────────────────────────────────────────
async function env() {
  banner();
  const projects = await readProjects();

  section('Environment manager');
  logInfo('Update API keys and secrets for any project.');
  if (!projects.length) {
    divider();
    log(`No projects found — run ${cyan('npx fabrica-e-commerce build')} first`);
    endSections();
    return;
  }
  kv('Total projects', String(projects.length));
  endSections();

  const typeFilter = await choose('Which projects to show?', [
    { name: '📋  All projects',                  value: 'all' },
    { name: '💻  Local projects only',           value: 'local' },
    { name: '☁   Cloud (Vercel) projects only',  value: 'cloud' },
  ]);

  const filtered = typeFilter === 'all' ? projects : projects.filter((p) => p.type === typeFilter);
  if (!filtered.length) {
    section('Environment manager');
    logWarn(`No ${typeFilter} projects found`);
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

  section(`Env keys — ${bold(orange(project.projectName))}`);
  divider();
  for (const k of envKeys) log(`${orange('·')} ${white(k)}`);
  divider();
  endSections();

  const key = await choose('Select env variable to update:', envKeys.map((k) => ({ name: k, value: k })));
  const currentVal = (project.env || {})[key];

  console.log();
  const value = await ask(`New value for ${orange(key)}`, currentVal || '');
  console.log();

  section('Applying update');
  await updateProjectEnv(project, key, value);
  kvSuccess('Updated', `${key}  →  ${project.type === 'local' ? '.env.local' : 'Vercel + redeployed'}`);
  endSections();
}

// ── rerun ─────────────────────────────────────────────────────────────────────
async function rerun() {
  banner();
  const projects = await readProjects();

  section('Re-run / re-open project');
  if (!projects.length) {
    logInfo('No projects found yet');
    log(`Run ${cyan('npx fabrica-e-commerce build')} to create your first store`);
    endSections();
    return;
  }
  kv('Total', String(projects.length) + ' project' + (projects.length !== 1 ? 's' : ''));
  endSections();

  const typeFilter = await choose('Which type of project?', [
    { name: '📋  All projects',               value: 'all' },
    { name: '💻  Local projects',             value: 'local' },
    { name: '☁   Cloud (Vercel) projects',    value: 'cloud' },
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

  section(`Re-running — ${bold(orange(project.projectName))}`);

  if (project.type === 'local') {
    divider();
    kv('Path', dim(project.target));
    kv('URL',  'http://localhost:3000');
    log(dim('Starting dev server — browser opens in 3s…'));
    divider();
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
    divider();
    kv('GitHub',  project.githubRepo || dim('n/a'));
    kv('URL',     url || dim('n/a'));
    kv('Inspect', project.inspectUrl || dim('n/a'));
    kv('Created', project.createdAt ? project.createdAt.slice(0, 19).replace('T', ' ') : dim('unknown'));
    divider();
    if (url) log(dim(`Opening ${url}…`));
    endSections();
    if (url) await openUrl(url);
  }
}

// ── info ──────────────────────────────────────────────────────────────────────
async function info() {
  banner();
  const version = await packageVersion();

  section('Package info');
  divider();
  kvSuccess('Package',   `fabrica-e-commerce  v${version}`);
  kv('Bridge',     BRIDGE_ORIGIN);
  kv('Store repo', STORE_REPO);
  kv('Local data', dim(dataDir));
  divider();
  kv('Node.js',    process.version);
  kv('Platform',   process.platform);
  kv('Arch',       process.arch);
  divider();
  kv('Creator',    'SPARROW AI SOLUTION');
  kv('License',    'MIT');
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

  section('Unknown command');
  logWarn(`"${command}" is not a valid command`);
  log(`Run ${cyan('npx fabrica-e-commerce help')} to see all commands`);
  endSections();
  process.exitCode = 1;
}
