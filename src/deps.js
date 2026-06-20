import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { commandExists, runCommand, runCommandCapture } from './system.js';
import { kv, section, spinner, subBox } from './ui.js';

// ── platform detection ────────────────────────────────────────────────────────
function isTermux() {
  return process.platform === 'android' ||
    (process.platform === 'linux' && (process.env.TERMUX_VERSION || process.env.PREFIX?.includes('com.termux')));
}

async function runPrivileged(command, args, options = {}) {
  if (process.platform === 'win32') return runCommand(command, args, options);
  if (isTermux()) return runCommand(command, args, options); // Termux: no sudo
  if (await commandExists('sudo')) return runCommand('sudo', [command, ...args], options);
  return runCommand(command, args, options);
}

function runPrivilegedShell(script, options = {}) {
  return runCommand('bash', ['-c', script], options);
}

// ── dependency definitions ────────────────────────────────────────────────────
const DEPENDENCIES = [
  {
    name: 'git',
    label: 'Git',
    check: () => checkWithPathRefresh('git'),
    install: installGit,
    manualUrl: 'https://git-scm.com/downloads'
  },
  {
    name: 'gh',
    label: 'GitHub CLI (gh)',
    check: () => checkWithPathRefresh('gh'),
    install: installGithubCli,
    manualUrl: 'https://github.com/cli/cli#installation'
  },
  {
    name: 'vercel',
    label: 'Vercel CLI (via npx)',
    check: checkVercelCli,
    install: warmVercelCli,
    manualUrl: 'https://vercel.com/docs/cli'
  }
];

// ── PATH helpers ──────────────────────────────────────────────────────────────
function addToPathIfDirectory(directory) {
  if (!directory || !fs.existsSync(directory)) return;
  const delimiter = path.delimiter;
  const current = process.env.PATH || '';
  const entries = current.split(delimiter).filter(Boolean);
  if (!entries.some((entry) => entry.toLowerCase() === directory.toLowerCase())) {
    process.env.PATH = `${directory}${delimiter}${current}`;
  }
}

function refreshWindowsToolPaths() {
  if (process.platform !== 'win32') return;
  const lad = process.env.LOCALAPPDATA;
  const pf  = process.env.ProgramFiles;
  const pf86 = process.env['ProgramFiles(x86)'];
  const pd  = process.env.ProgramData;
  addToPathIfDirectory(lad  && path.join(lad, 'Microsoft', 'WinGet', 'Links'));
  addToPathIfDirectory(pf   && path.join(pf, 'GitHub CLI'));
  addToPathIfDirectory(pf86 && path.join(pf86, 'GitHub CLI'));
  addToPathIfDirectory(pd   && path.join(pd, 'chocolatey', 'bin'));
  addToPathIfDirectory(pf   && path.join(pf, 'Git', 'cmd'));
  addToPathIfDirectory(pf   && path.join(pf, 'nodejs'));
}

async function checkWithPathRefresh(command) {
  refreshWindowsToolPaths();
  return commandExists(command);
}

async function runFirstSuccessful(candidates, options = {}) {
  for (const [command, args] of candidates) {
    const result = await runCommandCapture(command, args, options);
    if (result.code === 0) return result;
  }
  return { code: 1, stdout: '', stderr: 'All fallback commands failed' };
}

async function checkVercelCli() {
  refreshWindowsToolPaths();
  const result = await runFirstSuccessful([
    ['npx', ['--yes', 'vercel@latest', '--version']],
    ['npm', ['exec', '--yes', 'vercel@latest', '--', '--version']],
    ['vercel', ['--version']]
  ]);
  return result.code === 0;
}

async function warmVercelCli() {
  refreshWindowsToolPaths();
  const warmed = await runFirstSuccessful([
    ['npx', ['--yes', 'vercel@latest', '--version']],
    ['npm', ['exec', '--yes', 'vercel@latest', '--', '--version']],
    ['vercel', ['--version']]
  ]);
  if (warmed.code === 0) return;
  await runCommand('npm', ['install', '-g', 'vercel@latest'], { allowFailure: true });
}

// ── Git install ───────────────────────────────────────────────────────────────
async function installGit() {
  refreshWindowsToolPaths();
  const platform = process.platform;

  if (isTermux()) {
    await runCommand('pkg', ['install', '-y', 'git'], { allowFailure: true });
    return;
  }

  if (platform === 'linux') {
    if (await commandExists('apt-get')) {
      await runPrivileged('apt-get', ['update'], { allowFailure: true });
      await runPrivileged('apt-get', ['install', '-y', 'git'], { allowFailure: true });
      return;
    }
    if (await commandExists('dnf'))    return runPrivileged('dnf',    ['install', '-y', 'git'], { allowFailure: true });
    if (await commandExists('yum'))    return runPrivileged('yum',    ['install', '-y', 'git'], { allowFailure: true });
    if (await commandExists('pacman')) return runPrivileged('pacman', ['-Sy', '--noconfirm', 'git'], { allowFailure: true });
    if (await commandExists('zypper')) return runPrivileged('zypper', ['install', '-y', 'git'], { allowFailure: true });
    if (await commandExists('apk'))    return runPrivileged('apk',    ['add', 'git'], { allowFailure: true });
  }
  if (platform === 'darwin') {
    if (await commandExists('brew')) return runCommand('brew', ['install', 'git'], { allowFailure: true });
    // Xcode command line tools
    await runCommand('xcode-select', ['--install'], { allowFailure: true });
  }
  if (platform === 'win32') {
    if (await commandExists('winget')) {
      await runCommand('winget', ['install', '--id', 'Git.Git', '-e', '--source', 'winget'], { allowFailure: true });
      refreshWindowsToolPaths();
      return;
    }
    if (await commandExists('choco')) {
      await runCommand('choco', ['install', 'git', '-y'], { allowFailure: true });
      refreshWindowsToolPaths();
    }
  }
}

// ── GitHub CLI install ────────────────────────────────────────────────────────
async function installGithubCli() {
  refreshWindowsToolPaths();
  const platform = process.platform;

  if (isTermux()) {
    await runCommand('pkg', ['install', '-y', 'gh'], { allowFailure: true });
    return;
  }

  if (platform === 'linux') {
    if (await commandExists('apt-get')) {
      const direct = await (await commandExists('sudo')
        ? runCommandCapture('sudo', ['apt-get', 'install', '-y', 'gh'])
        : runCommandCapture('apt-get', ['install', '-y', 'gh']));
      if (direct.code === 0) return;
      const usesSudo = await commandExists('sudo');
      const prefix = usesSudo ? 'sudo ' : '';
      await runPrivilegedShell([
        'set -e',
        `${prefix}apt-get update`,
        `${prefix}apt-get install -y curl ca-certificates gnupg`,
        `${prefix}mkdir -p -m 755 /etc/apt/keyrings`,
        `curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | ${prefix}tee /etc/apt/keyrings/githubcli-archive-keyring.gpg > /dev/null`,
        `${prefix}chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg`,
        `echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | ${prefix}tee /etc/apt/sources.list.d/github-cli.list > /dev/null`,
        `${prefix}apt-get update`,
        `${prefix}apt-get install -y gh`
      ].join(' && '), { allowFailure: true });
      return;
    }
    if (await commandExists('dnf'))    return runPrivileged('dnf',    ['install', '-y', 'gh'], { allowFailure: true });
    if (await commandExists('pacman')) return runPrivileged('pacman', ['-Sy', '--noconfirm', 'github-cli'], { allowFailure: true });
    if (await commandExists('zypper')) return runPrivileged('zypper', ['install', '-y', 'gh'], { allowFailure: true });
    if (await commandExists('apk'))    return runCommand('apk', ['add', 'github-cli'], { allowFailure: true });
  }
  if (platform === 'darwin') {
    if (await commandExists('brew')) return runCommand('brew', ['install', 'gh'], { allowFailure: true });
  }
  if (platform === 'win32') {
    if (await commandExists('winget')) {
      await runCommand('winget', ['install', '--id', 'GitHub.cli', '-e', '--source', 'winget'], { allowFailure: true });
      refreshWindowsToolPaths();
      return;
    }
    if (await commandExists('choco')) {
      await runCommand('choco', ['install', 'gh', '-y'], { allowFailure: true });
      refreshWindowsToolPaths();
    }
  }
}

// ── Public API ────────────────────────────────────────────────────────────────
export async function ensureDependencies({ autoInstall = true, names } = {}) {
  const targets = names ? DEPENDENCIES.filter((dep) => names.includes(dep.name)) : DEPENDENCIES;
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
    else installSpin.fail(`${dep.label} could not be installed automatically`);
    results.push({ ...dep, present, installed: present });
  }
  return results;
}

export async function vinsCommand() {
  section('Fabrica dependency check (vins)');
  const platform = isTermux() ? 'Termux/Android' : process.platform;
  kv('Platform', platform);
  const results = await ensureDependencies();
  section('Summary');
  let allGood = true;
  const summaryLines = [];
  for (const dep of results) {
    summaryLines.push(`${dep.label}: ${dep.present ? '✓ OK' : '✗ MISSING — install manually'}`);
    if (!dep.present) { allGood = false; summaryLines.push(`  Manual: ${dep.manualUrl}`); }
  }
  subBox(summaryLines, { isError: !allGood });
  if (allGood) console.log('\n  All dependencies ready. Run: fabrica build');
  else { console.log('\n  Some deps could not be installed automatically.'); process.exitCode = 1; }
  return results;
}
