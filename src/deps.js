import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { commandExists, runCommand, runCommandCapture } from './system.js';
import { kv, section, endSections, spinner, subBox, log } from './ui.js';

function isTermux() {
  return process.platform === 'android' ||
    (process.platform === 'linux' && (process.env.TERMUX_VERSION || process.env.PREFIX?.includes('com.termux')));
}

async function runPrivileged(command, args, options = {}) {
  if (process.platform === 'win32' || isTermux()) return runCommand(command, args, options);
  if (await commandExists('sudo')) return runCommand('sudo', [command, ...args], options);
  return runCommand(command, args, options);
}

function runPrivilegedShell(script, options = {}) {
  return runCommand('bash', ['-c', script], options);
}

const DEPENDENCIES = [
  { name: 'git',     label: 'Git',                  check: () => checkWithPathRefresh('git'),     install: installGit,        manualUrl: 'https://git-scm.com/downloads' },
  { name: 'gh',      label: 'GitHub CLI (gh)',       check: () => checkWithPathRefresh('gh'),      install: installGithubCli,  manualUrl: 'https://github.com/cli/cli#installation' },
  { name: 'vercel',  label: 'Vercel CLI (via npx)',  check: checkVercelCli,                        install: warmVercelCli,     manualUrl: 'https://vercel.com/docs/cli' },
];

function addToPathIfDirectory(directory) {
  if (!directory || !fs.existsSync(directory)) return;
  const current = process.env.PATH || '';
  const entries = current.split(path.delimiter).filter(Boolean);
  if (!entries.some((e) => e.toLowerCase() === directory.toLowerCase()))
    process.env.PATH = `${directory}${path.delimiter}${current}`;
}

function refreshWindowsToolPaths() {
  if (process.platform !== 'win32') return;
  const lad = process.env.LOCALAPPDATA;
  const pf   = process.env.ProgramFiles;
  const pf86 = process.env['ProgramFiles(x86)'];
  const pd   = process.env.ProgramData;
  addToPathIfDirectory(lad  && path.join(lad,  'Microsoft', 'WinGet', 'Links'));
  addToPathIfDirectory(pf   && path.join(pf,   'GitHub CLI'));
  addToPathIfDirectory(pf86 && path.join(pf86, 'GitHub CLI'));
  addToPathIfDirectory(pd   && path.join(pd,   'chocolatey', 'bin'));
  addToPathIfDirectory(pf   && path.join(pf,   'Git', 'cmd'));
  addToPathIfDirectory(pf   && path.join(pf,   'nodejs'));
}

async function checkWithPathRefresh(cmd) { refreshWindowsToolPaths(); return commandExists(cmd); }

async function runFirstSuccessful(candidates, options = {}) {
  for (const [cmd, args] of candidates) {
    const r = await runCommandCapture(cmd, args, options);
    if (r.code === 0) return r;
  }
  return { code: 1, stdout: '', stderr: 'All fallback commands failed' };
}

async function checkVercelCli() {
  refreshWindowsToolPaths();
  const r = await runFirstSuccessful([
    ['npx',    ['--yes', 'vercel@latest', '--version']],
    ['npm',    ['exec', '--yes', 'vercel@latest', '--', '--version']],
    ['vercel', ['--version']],
  ]);
  return r.code === 0;
}

async function warmVercelCli() {
  refreshWindowsToolPaths();
  const r = await runFirstSuccessful([
    ['npx',    ['--yes', 'vercel@latest', '--version']],
    ['npm',    ['exec', '--yes', 'vercel@latest', '--', '--version']],
    ['vercel', ['--version']],
  ]);
  if (r.code === 0) return;
  await runCommand('npm', ['install', '-g', 'vercel@latest'], { allowFailure: true });
}

async function installGit() {
  refreshWindowsToolPaths();
  const p = process.platform;
  if (isTermux()) return runCommand('pkg', ['install', '-y', 'git'], { allowFailure: true });
  if (p === 'linux') {
    if (await commandExists('apt-get')) { await runPrivileged('apt-get', ['update'], { allowFailure: true }); return runPrivileged('apt-get', ['install', '-y', 'git'], { allowFailure: true }); }
    if (await commandExists('dnf'))    return runPrivileged('dnf',    ['install', '-y', 'git'], { allowFailure: true });
    if (await commandExists('yum'))    return runPrivileged('yum',    ['install', '-y', 'git'], { allowFailure: true });
    if (await commandExists('pacman')) return runPrivileged('pacman', ['-Sy', '--noconfirm', 'git'], { allowFailure: true });
    if (await commandExists('zypper')) return runPrivileged('zypper', ['install', '-y', 'git'], { allowFailure: true });
    if (await commandExists('apk'))    return runPrivileged('apk',    ['add', 'git'], { allowFailure: true });
  }
  if (p === 'darwin') {
    if (await commandExists('brew')) return runCommand('brew', ['install', 'git'], { allowFailure: true });
    return runCommand('xcode-select', ['--install'], { allowFailure: true });
  }
  if (p === 'win32') {
    if (await commandExists('winget')) { await runCommand('winget', ['install', '--id', 'Git.Git', '-e', '--source', 'winget'], { allowFailure: true }); refreshWindowsToolPaths(); return; }
    if (await commandExists('choco'))  { await runCommand('choco',  ['install', 'git', '-y'], { allowFailure: true }); refreshWindowsToolPaths(); }
  }
}

async function installGithubCli() {
  refreshWindowsToolPaths();
  const p = process.platform;
  if (isTermux()) return runCommand('pkg', ['install', '-y', 'gh'], { allowFailure: true });
  if (p === 'linux') {
    if (await commandExists('apt-get')) {
      const direct = await (await commandExists('sudo')
        ? runCommandCapture('sudo', ['apt-get', 'install', '-y', 'gh'])
        : runCommandCapture('apt-get', ['install', '-y', 'gh']));
      if (direct.code === 0) return;
      const pre = (await commandExists('sudo')) ? 'sudo ' : '';
      await runPrivilegedShell([
        'set -e', `${pre}apt-get update`, `${pre}apt-get install -y curl ca-certificates gnupg`,
        `${pre}mkdir -p -m 755 /etc/apt/keyrings`,
        `curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | ${pre}tee /etc/apt/keyrings/githubcli-archive-keyring.gpg > /dev/null`,
        `${pre}chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg`,
        `echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | ${pre}tee /etc/apt/sources.list.d/github-cli.list > /dev/null`,
        `${pre}apt-get update`, `${pre}apt-get install -y gh`,
      ].join(' && '), { allowFailure: true });
      return;
    }
    if (await commandExists('dnf'))    return runPrivileged('dnf',    ['install', '-y', 'gh'], { allowFailure: true });
    if (await commandExists('pacman')) return runPrivileged('pacman', ['-Sy', '--noconfirm', 'github-cli'], { allowFailure: true });
    if (await commandExists('zypper')) return runPrivileged('zypper', ['install', '-y', 'gh'], { allowFailure: true });
    if (await commandExists('apk'))    return runCommand('apk', ['add', 'github-cli'], { allowFailure: true });
  }
  if (p === 'darwin') {
    if (await commandExists('brew')) return runCommand('brew', ['install', 'gh'], { allowFailure: true });
  }
  if (p === 'win32') {
    if (await commandExists('winget')) { await runCommand('winget', ['install', '--id', 'GitHub.cli', '-e', '--source', 'winget'], { allowFailure: true }); refreshWindowsToolPaths(); return; }
    if (await commandExists('choco'))  { await runCommand('choco',  ['install', 'gh', '-y'], { allowFailure: true }); refreshWindowsToolPaths(); }
  }
}

export async function ensureDependencies({ autoInstall = true, names } = {}) {
  const targets = names ? DEPENDENCIES.filter((d) => names.includes(d.name)) : DEPENDENCIES;
  const results = [];
  for (const dep of targets) {
    const spin = spinner(`Checking ${dep.label}`);
    let present = await dep.check();
    if (present) { spin.succeed(`${dep.label} found`); results.push({ ...dep, present, installed: false }); continue; }
    spin.fail(`${dep.label} missing`);
    if (!autoInstall) { results.push({ ...dep, present: false, installed: false }); continue; }
    const installSpin = spinner(`Installing ${dep.label}`);
    await dep.install();
    present = await dep.check();
    if (present) installSpin.succeed(`${dep.label} installed`);
    else         installSpin.fail(`${dep.label} could not be installed automatically`);
    results.push({ ...dep, present, installed: present });
  }
  return results;
}

export async function vinsCommand() {
  section('Fabrica dependency check (vins)');
  kv('Platform', isTermux() ? 'Termux/Android' : process.platform);
  const results = await ensureDependencies();

  section('Summary');
  const summaryLines = [];
  let allGood = true;
  for (const dep of results) {
    summaryLines.push(`${dep.label}: ${dep.present ? '✓ OK' : '✗ MISSING — install manually'}`);
    if (!dep.present) { allGood = false; summaryLines.push(`  Manual: ${dep.manualUrl}`); }
  }
  subBox(summaryLines, { isError: !allGood });
  if (allGood) log('All dependencies ready. Run: fabrica build');
  else         log('Some deps could not be installed. See links above.');
  endSections();
  if (!allGood) process.exitCode = 1;
  return results;
}
