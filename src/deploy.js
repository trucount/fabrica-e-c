import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { HARDCODED_ENV, REQUIRED_ENV_KEYS, STORE_REPO } from './config.js';
import { buildsDir, saveProject } from './store.js';
import { runCommand, runCommandCapture, openUrl } from './system.js';
import { kv, section, endSections, spinner, subBox, log, red, dimOrange } from './ui.js';
import { ask, choose } from './prompt.js';

const VERCEL_ENVIRONMENTS = ['production', 'preview', 'development'];

export async function collectEnv(supabase) {
  section('Environment variables');
  const env = { ...HARDCODED_ENV, SUPABASE_URL: supabase.url, SUPABASE_ANON_KEY: supabase.anonKey };
  for (const key of REQUIRED_ENV_KEYS) {
    endSections();           // flush so the ask() prompt appears cleanly
    env[key] = await ask(`${key}`);
    section('Environment variables');
  }
  return env;
}

export async function cloneRepo() {
  endSections();
  section('Clone storefront');
  const projectName = await ask('Vercel project name', `fabrica-store-${Date.now()}`);
  section('Clone storefront');
  const id = crypto.randomUUID();
  const target = path.join(buildsDir, `${projectName}-${id.slice(0, 8)}`);
  // git clone output goes directly to inherited stdio — show it outside the box
  endSections();
  await runCommand('git', ['clone', STORE_REPO, target]);
  return { id, projectName, target };
}

export async function isLoggedInToVercel() {
  const result = await runCommandCapture('npx', ['--yes', 'vercel@latest', 'whoami']);
  return result.code === 0;
}

export async function ensureVercelLogin() {
  section('Vercel login');
  const spin = spinner('Checking Vercel login');
  if (await isLoggedInToVercel()) {
    spin.succeed('Already logged in to Vercel');
    return;
  }
  spin.fail('Not logged in to Vercel');
  log('Opening "vercel login" — finish the login in your browser...');
  endSections();
  await runCommand('npx', ['vercel@latest', 'login']);
  section('Vercel login');
  if (!(await isLoggedInToVercel())) {
    throw new Error('Vercel login was not completed. Run "fabrica build" again after logging in.');
  }
  kv('Vercel', 'Logged in');
}

// Capture vercel CLI output and add it into the current section buffer as a subBox
async function runVercelBoxed(args, options = {}) {
  const result = await runCommandCapture('npx', ['vercel@latest', ...args], options);
  const raw = ((result.stdout || '') + (result.stderr || '')).trim();
  if (!raw) return result;
  const lines = raw.split('\n').map((l) => l.trimEnd()).filter(Boolean);
  const isErr = result.code !== 0 || lines.some((l) => /^Error:/i.test(l));
  subBox(lines, { isError: isErr });
  return result;
}

async function setEnvEverywhere(project, env) {
  for (const [key, value] of Object.entries(env)) {
    const spin = spinner(`Setting ${key}`);
    for (const environment of VERCEL_ENVIRONMENTS) {
      await runVercelBoxed(['env', 'rm', key, environment, '--yes'], { cwd: project.target, allowFailure: true });
      await runVercelBoxed(['env', 'add', key, environment], { cwd: project.target, input: `${value}\n` });
    }
    spin.succeed(`Set ${key} (production, preview, development)`);
  }
}

async function connectGithubRepo(project, repoUrl) {
  const spin = spinner(`Connecting Vercel project to ${repoUrl}`);
  const attempts = 6;
  let lastError = '';
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const connect = await runCommandCapture('npx', ['--yes', 'vercel@latest', 'git', 'connect', repoUrl, '--yes'], { cwd: project.target });
    if (connect.code === 0) { spin.succeed('Vercel project connected to GitHub repo'); return true; }
    lastError = (connect.stderr || connect.stdout || '').trim();
    if (attempt < attempts) await new Promise((r) => setTimeout(r, attempt * 3000));
  }
  spin.fail('Could not auto-connect Git — continuing with a direct deploy');
  subBox([
    'This usually means one of two things:',
    `1) Vercel hasn't finished indexing the new fork yet`,
    `   Re-link: npx vercel git connect ${repoUrl}`,
    '2) Vercel GitHub App set to "Only select repositories"',
    '   Fix at: https://github.com/settings/installations',
    lastError ? `Last error: ${lastError}` : '',
  ].filter(Boolean), { isError: true });
  return false;
}

export async function deployToVercel(project, env, githubRepo) {
  section('Vercel deployment');
  await ensureVercelLogin();
  section('Vercel deployment');

  await runVercelBoxed(['link', '--yes', '--project', project.projectName], { cwd: project.target });

  if (githubRepo?.repoUrl) {
    await connectGithubRepo(project, githubRepo.repoUrl);
  }

  await setEnvEverywhere(project, env);

  const deploySpin = spinner('Creating production deployment');
  const deployResult = await runCommandCapture('npx', ['vercel@latest', '--prod', '--yes'], { cwd: project.target });
  const deployOutput = ((deployResult.stdout || '') + (deployResult.stderr || '')).trim();

  let productionUrl = null;
  let aliasedUrl = null;
  let inspectUrl = null;
  for (const line of deployOutput.split('\n')) {
    const m = line.match(/Production\s+(\S+)/); if (m) productionUrl = m[1];
    const a = line.match(/Aliased\s+(\S+)/);    if (a) aliasedUrl = a[1];
    const i = line.match(/Inspect\s+(\S+)/);    if (i) inspectUrl = i[1];
  }

  subBox(deployOutput.split('\n').filter(Boolean));
  deploySpin.succeed('Production deployment created');

  const openTarget = aliasedUrl || productionUrl;
  if (openTarget) {
    kv('Opening', openTarget);
    // open after flush
    process.nextTick(() => openUrl(openTarget));
  }

  const record = {
    ...project,
    type: 'cloud',
    repo: STORE_REPO,
    githubRepo: githubRepo?.repoUrl || null,
    createdAt: new Date().toISOString(),
    envKeys: Object.keys(env),
    env,
    supabaseUrl: env.SUPABASE_URL,
    productionUrl: aliasedUrl || productionUrl || null,
    inspectUrl: inspectUrl || null,
  };
  await saveProject(record);
  return record;
}

export async function updateProjectEnv(project, key, value) {
  if (project.type === 'local') {
    const envPath = path.join(project.target, '.env.local');
    let contents = '';
    try { contents = await fs.readFile(envPath, 'utf8'); } catch { /* new file */ }
    const lines = contents.split('\n');
    const idx = lines.findIndex((l) => l.startsWith(`${key}=`));
    if (idx >= 0) lines[idx] = `${key}=${value}`;
    else lines.push(`${key}=${value}`);
    await fs.writeFile(envPath, lines.join('\n'), 'utf8');
    kv('Updated', `${key} in .env.local`);
  } else {
    await ensureVercelLogin();
    section('Applying update');
    for (const environment of VERCEL_ENVIRONMENTS) {
      await runVercelBoxed(['env', 'rm', key, environment, '--yes'], { cwd: project.target, allowFailure: true });
      await runVercelBoxed(['env', 'add', key, environment], { cwd: project.target, input: `${value}\n` });
    }
    const spin = spinner('Redeploying...');
    await runVercelBoxed(['--prod', '--yes'], { cwd: project.target });
    spin.succeed(`Redeployed ${project.projectName}`);
  }
  const updated = { ...project, env: { ...(project.env || {}), [key]: value } };
  await saveProject(updated);
}

export async function runLocally(project, env) {
  section('Local setup');
  const envPath = path.join(project.target, '.env.local');
  const contents = Object.entries(env).map(([k, v]) => `${k}=${String(v).replace(/\n/g, '\\n')}`).join('\n') + '\n';
  await fs.writeFile(envPath, contents, 'utf8');
  kv('Env file', envPath);

  const hasPnpmLock = await fs.access(path.join(project.target, 'pnpm-lock.yaml')).then(() => true, () => false);
  const pnpmAvailable = (await runCommandCapture('pnpm', ['--version'])).code === 0;
  const installCmd = hasPnpmLock && pnpmAvailable ? ['pnpm', ['install']] : ['npm', ['install']];
  const devCmd     = hasPnpmLock && pnpmAvailable ? ['pnpm', ['run', 'dev']] : ['npm', ['run', 'dev']];

  const record = {
    ...project, type: 'local', repo: STORE_REPO, githubRepo: null,
    createdAt: new Date().toISOString(), envKeys: Object.keys(env),
    env, supabaseUrl: env.SUPABASE_URL, productionUrl: 'http://localhost:3000',
  };
  await saveProject(record);

  kv('URL', 'http://localhost:3000');
  log('Installing dependencies...');
  endSections();
  await runCommand(installCmd[0], installCmd[1], { cwd: project.target });

  section('Local app');
  kv('Path', project.target);
  kv('URL',  'http://localhost:3000');
  log('Starting dev server — browser opens in 3s...');
  endSections();
  setTimeout(() => openUrl('http://localhost:3000'), 3000);
  await runCommand(devCmd[0], devCmd[1], { cwd: project.target });
}
