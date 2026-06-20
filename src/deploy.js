import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { HARDCODED_ENV, REQUIRED_ENV_KEYS, STORE_REPO } from './config.js';
import { buildsDir, saveProject } from './store.js';
import { runCommand, runCommandCapture } from './system.js';
import { dimOrange, kv, section, spinner } from './ui.js';
import { ask, choose } from './prompt.js';

const VERCEL_ENVIRONMENTS = ['production', 'preview', 'development'];

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
export async function isLoggedInToVercel() {
  const result = await runCommandCapture('npx', ['--yes', 'vercel@latest', 'whoami']);
  return result.code === 0;
}

// Step 3: verify Vercel login before anything else touches Vercel. If the
// user isn't logged in, run the real interactive `vercel login` flow (same
// as typing it in a terminal) and block until it succeeds.
export async function ensureVercelLogin() {
  section('Vercel login');
  const spin = spinner('Checking Vercel login');
  if (await isLoggedInToVercel()) {
    spin.succeed('Already logged in to Vercel');
    return;
  }
  spin.fail('Not logged in to Vercel');
  console.log('Opening "vercel login" — finish the login in your browser...');
  await runCommand('npx', ['vercel@latest', 'login']);
  if (!(await isLoggedInToVercel())) {
    throw new Error('Vercel login was not completed. Run "fabrica build" again after logging in.');
  }
  kv('Vercel', 'Logged in');
}

// Sets every env var across production, preview, and development so the
// values are permanent for the project, not just the one deploy.
async function setEnvEverywhere(project, env) {
  for (const [key, value] of Object.entries(env)) {
    const spin = spinner(`Setting ${key}`);
    for (const environment of VERCEL_ENVIRONMENTS) {
      await runCommand('npx', ['vercel@latest', 'env', 'rm', key, environment, '--yes'], { cwd: project.target, allowFailure: true });
      await runCommand('npx', ['vercel@latest', 'env', 'add', key, environment], { cwd: project.target, input: `${value}\n` });
    }
    spin.succeed(`Set ${key} (production, preview, development)`);
  }
}

// Vercel's GitHub App integration indexes newly created/forked repos on its
// own delay, separate from GitHub itself being aware of the repo. Right after
// a fork, `vercel git connect` can fail simply because Vercel hasn't synced
// yet — not because anything is actually wrong. Retry with backoff before
// giving up, then fall back to a direct deploy with clear next steps.
async function connectGithubRepo(project, repoUrl) {
  const spin = spinner(`Connecting Vercel project to ${repoUrl}`);
  const attempts = 6;
  let lastError = '';
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const connect = await runCommandCapture('npx', ['--yes', 'vercel@latest', 'git', 'connect', repoUrl, '--yes'], { cwd: project.target });
    if (connect.code === 0) {
      spin.succeed('Vercel project connected to GitHub repo (future pushes auto-deploy)');
      return true;
    }
    lastError = (connect.stderr || connect.stdout || '').trim();
    if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 3000));
  }
  spin.fail('Could not auto-connect Git — continuing with a direct deploy');
  console.log(dimOrange('  This usually means one of two things:'));
  console.log(dimOrange(`  1) Vercel hasn't finished indexing the new fork yet (run "fabrica list" in a minute and re-link manually with: npx vercel git connect ${repoUrl})`));
  console.log(dimOrange('  2) The "Vercel" GitHub App is set to "Only select repositories" and was never granted access to the new fork — fix at https://github.com/settings/installations'));
  if (lastError) console.log(dimOrange(`  Last error: ${lastError}`));
  return false;
}

export async function deployToVercel(project, env, githubRepo) {
  section('Vercel deployment');
  await ensureVercelLogin();

  await runCommand('npx', ['vercel@latest', 'link', '--yes', '--project', project.projectName], { cwd: project.target });

  if (githubRepo?.repoUrl) {
    await connectGithubRepo(project, githubRepo.repoUrl);
  }

  await setEnvEverywhere(project, env);

  const deploySpin = spinner('Creating production deployment');
  await runCommand('npx', ['vercel@latest', '--prod', '--yes'], { cwd: project.target });
  deploySpin.succeed('Production deployment created');

  const record = {
    ...project,
    repo: STORE_REPO,
    githubRepo: githubRepo?.repoUrl || null,
    createdAt: new Date().toISOString(),
    envKeys: Object.keys(env),
    supabaseUrl: env.SUPABASE_URL
  };
  await saveProject(record);
  return record;
}
export async function editProjectEnv(projects) {
  if (!projects.length) { console.log('No deployed projects saved yet. Run build first.'); return; }
  const projectId = await choose('Select project:', projects.map((project) => ({ name: `${project.projectName} (${project.createdAt})`, value: project.id })));
  const project = projects.find((item) => item.id === projectId);
  const key = await choose('Variable to replace:', project.envKeys.map((item) => ({ name: item, value: item })));
  const value = await ask(`New value for ${key}`);
  await ensureVercelLogin();
  for (const environment of VERCEL_ENVIRONMENTS) {
    await runCommand('npx', ['vercel@latest', 'env', 'rm', key, environment, '--yes'], { cwd: project.target, allowFailure: true });
    await runCommand('npx', ['vercel@latest', 'env', 'add', key, environment], { cwd: project.target, input: `${value}\n` });
  }
  await runCommand('npx', ['vercel@latest', '--prod', '--yes'], { cwd: project.target });
  kv('Redeployed', project.projectName);
}


export async function runLocally(project, env) {
  section('Local Next.js setup');
  const envPath = path.join(project.target, '.env.local');
  const contents = Object.entries(env).map(([key, value]) => `${key}=${String(value).replace(/\n/g, '\\n')}`).join('\n') + '\n';
  await fs.writeFile(envPath, contents, 'utf8');
  kv('Env file', envPath);

  const hasPnpmLock = await fs.access(path.join(project.target, 'pnpm-lock.yaml')).then(() => true, () => false);
  const pnpmAvailable = (await runCommandCapture('pnpm', ['--version'])).code === 0;
  const installCommand = hasPnpmLock && pnpmAvailable ? ['pnpm', ['install']] : ['npm', ['install']];
  const devCommand = hasPnpmLock && pnpmAvailable ? ['pnpm', ['run', 'dev']] : ['npm', ['run', 'dev']];

  await runCommand(installCommand[0], installCommand[1], { cwd: project.target });
  section('Local app');
  kv('Path', project.target);
  kv('URL', 'http://localhost:3000');
  console.log('Starting the Next.js dev server. Press Ctrl+C to stop it.');
  await runCommand(devCommand[0], devCommand[1], { cwd: project.target });
}
