import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { dataDir, buildsDir, readProjects } from './store.js';
import { runCommandCapture, runCommand } from './system.js';
import { section, endSections, kv, kvSuccess, kvFail, log, logInfo, logWarn, divider, spinner, orange, dimOrange, bold, dim, green, red, cyan } from './ui.js';
import { choose as choosePrompt } from './prompt.js';

async function pathExists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

async function safeRm(p) {
  try { await fs.rm(p, { recursive: true, force: true }); return true; } catch { return false; }
}

// ── clean local project data ──────────────────────────────────────────────────
async function cleanProjectData() {
  section('Clean local project data');

  const projectsFile = path.join(dataDir, 'projects.json');
  const projectsExist = await pathExists(projectsFile);
  const buildsExist = await pathExists(buildsDir);

  if (!projectsExist && !buildsExist) {
    log('Nothing to clean — no local data found');
    endSections();
    return;
  }

  kv('Projects file', projectsExist ? projectsFile : dim('not found'));
  kv('Builds folder', buildsExist ? buildsDir : dim('not found'));
  logWarn('This will delete all locally tracked project records and cloned builds');
  endSections();

  const confirm = await choosePrompt(red('Are you sure you want to delete all local data?'), [
    { name: 'Yes, delete everything', value: 'yes' },
    { name: 'No, cancel',             value: 'no' },
  ]);

  if (confirm !== 'yes') {
    section('Clean cancelled');
    log('No changes made');
    endSections();
    return;
  }

  section('Removing local data');
  if (projectsExist) {
    const ok = await safeRm(projectsFile);
    ok ? kvSuccess('projects.json', 'Deleted') : kvFail('projects.json', 'Could not delete');
  }
  if (buildsExist) {
    const ok = await safeRm(buildsDir);
    ok ? kvSuccess('builds/', 'Deleted') : kvFail('builds/', 'Could not delete');
  }
  log(green('Local data cleaned successfully'));
  endSections();
}

// ── clean env files ───────────────────────────────────────────────────────────
async function cleanEnvFiles() {
  section('Clean .env files from local projects');
  const projects = await readProjects();
  const localProjects = projects.filter((p) => p.type === 'local');

  if (!localProjects.length) {
    log('No local projects found with env files');
    endSections();
    return;
  }

  for (const project of localProjects) {
    const envPath = path.join(project.target, '.env.local');
    if (await pathExists(envPath)) {
      const ok = await safeRm(envPath);
      ok ? kvSuccess(project.projectName, `.env.local deleted`) : kvFail(project.projectName, `Could not delete .env.local`);
    } else {
      log(`${project.projectName} — no .env.local found`);
    }
  }
  endSections();
}

// ── logout Vercel ─────────────────────────────────────────────────────────────
async function logoutVercel() {
  section('Vercel logout');
  const check = await runCommandCapture('npx', ['--yes', 'vercel@latest', 'whoami']);
  if (check.code !== 0) {
    log(dim('Not currently logged in to Vercel'));
    endSections();
    return;
  }
  const spin = spinner('Logging out of Vercel…');
  const result = await runCommandCapture('npx', ['--yes', 'vercel@latest', 'logout']);
  if (result.code === 0) spin.succeed('Logged out of Vercel');
  else                   spin.fail('Vercel logout failed — you may need to run: npx vercel logout');
  endSections();
}

// ── logout GitHub ─────────────────────────────────────────────────────────────
async function logoutGitHub() {
  section('GitHub logout');
  const check = await runCommandCapture('gh', ['auth', 'status']);
  if (check.code !== 0) {
    log(dim('Not currently logged in to GitHub CLI'));
    endSections();
    return;
  }
  const spin = spinner('Logging out of GitHub CLI…');
  const result = await runCommandCapture('gh', ['auth', 'logout', '--hostname', 'github.com']);
  if (result.code === 0) spin.succeed('Logged out of GitHub CLI');
  else                   spin.fail('GitHub logout failed — you may need to run: gh auth logout');
  endSections();
}

// ── main clean command ────────────────────────────────────────────────────────
export async function cleanCommand() {
  section('Clean — what do you want to remove?');
  logInfo('Choose what to clean:');
  endSections();

  const choice = await choosePrompt('Select clean mode:', [
    { name: 'Project data    — delete local project records & cloned builds', value: 'project' },
    { name: 'Total           — project data + env files + logout (Vercel & GitHub)',     value: 'total' },
    { name: 'Vercel logout   — log out from Vercel CLI only',                value: 'vercel' },
    { name: 'GitHub logout   — log out from GitHub CLI only',                value: 'github' },
    { name: 'Cancel',                                                         value: 'cancel' },
  ]);

  if (choice === 'cancel') {
    section('Clean');
    log('Cancelled — no changes made');
    endSections();
    return;
  }

  if (choice === 'project') {
    await cleanProjectData();
    return;
  }

  if (choice === 'vercel') {
    await logoutVercel();
    return;
  }

  if (choice === 'github') {
    await logoutGitHub();
    return;
  }

  if (choice === 'total') {
    section('Total clean — this will:');
    log('1. Delete all local project records & cloned builds');
    log('2. Delete all .env.local files from local projects');
    log('3. Log out from Vercel CLI');
    log('4. Log out from GitHub CLI');
    logWarn('This is a full reset of the Fabrica CLI environment');
    endSections();

    const confirm = await choosePrompt(red('Proceed with total clean?'), [
      { name: 'Yes, reset everything', value: 'yes' },
      { name: 'No, cancel',            value: 'no' },
    ]);

    if (confirm !== 'yes') {
      section('Total clean cancelled');
      log('No changes made');
      endSections();
      return;
    }

    await cleanProjectData();
    await cleanEnvFiles();
    await logoutVercel();
    await logoutGitHub();

    section('Total clean complete');
    log(green('All Fabrica local data and sessions have been cleared'));
    log('Run fabrica build to start fresh');
    endSections();
  }
}
