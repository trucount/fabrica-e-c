import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { commandExists, runCommand, runCommandCapture } from './system.js';
import { kv, kvSuccess, kvFail, section, endSections, spinner, subBox, log, logInfo, logWarn, divider, orange, dimOrange, bold, dim, green, red, cyan, yellow } from './ui.js';

export function isTermux() {
  return (
    process.platform === 'android' ||
    (process.platform === 'linux' &&
      (process.env.TERMUX_VERSION || process.env.PREFIX?.includes('com.termux')))
  );
}

function platform() {
  if (isTermux()) return 'termux';
  return process.platform; // win32 | linux | darwin
}

// ── PATH helpers ──────────────────────────────────────────────────────────────
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

async function checkWithPathRefresh(cmd) {
  refreshWindowsToolPaths();
  return commandExists(cmd);
}

async function runFirstSuccessful(candidates, options = {}) {
  for (const [cmd, args] of candidates) {
    const r = await runCommandCapture(cmd, args, options);
    if (r.code === 0) return r;
  }
  return { code: 1, stdout: '', stderr: 'All fallback commands failed' };
}

// ── Vercel ────────────────────────────────────────────────────────────────────
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

// ── Git ───────────────────────────────────────────────────────────────────────
async function installGit() {
  refreshWindowsToolPaths();
  const p = platform();

  if (p === 'termux') {
    return runCommand('pkg', ['install', '-y', 'git'], { allowFailure: true });
  }
  if (p === 'linux') {
    if (await commandExists('apt-get')) {
      await runPrivileged('apt-get', ['update', '-qq'], { allowFailure: true });
      return runPrivileged('apt-get', ['install', '-y', 'git'], { allowFailure: true });
    }
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
    if (await commandExists('winget')) {
      await runCommand('winget', ['install', '--id', 'Git.Git', '-e', '--source', 'winget', '--silent'], { allowFailure: true });
      refreshWindowsToolPaths();
      return;
    }
    if (await commandExists('choco')) {
      await runCommand('choco', ['install', 'git', '-y'], { allowFailure: true });
      refreshWindowsToolPaths();
    }
  }
}

// ── GitHub CLI ────────────────────────────────────────────────────────────────
async function installGithubCli() {
  refreshWindowsToolPaths();
  const p = platform();

  if (p === 'termux') {
    return runCommand('pkg', ['install', '-y', 'gh'], { allowFailure: true });
  }
  if (p === 'linux') {
    if (await commandExists('apt-get')) {
      // Try direct first (gh is in Ubuntu 22.04+ repos)
      const direct = await runCommandCapture('apt-get', ['install', '-y', 'gh']);
      if (direct.code === 0) return;
      // Fall back to GitHub's official APT repo
      const pre = (await commandExists('sudo')) ? 'sudo ' : '';
      await runCommand('bash', ['-c', [
        'set -e',
        `${pre}apt-get update -qq`,
        `${pre}apt-get install -y curl ca-certificates gnupg`,
        `${pre}mkdir -p -m 755 /etc/apt/keyrings`,
        `curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | ${pre}tee /etc/apt/keyrings/githubcli-archive-keyring.gpg > /dev/null`,
        `${pre}chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg`,
        `echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | ${pre}tee /etc/apt/sources.list.d/github-cli.list > /dev/null`,
        `${pre}apt-get update -qq`,
        `${pre}apt-get install -y gh`,
      ].join(' && ')], { allowFailure: true });
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
    if (await commandExists('winget')) {
      await runCommand('winget', ['install', '--id', 'GitHub.cli', '-e', '--source', 'winget', '--silent'], { allowFailure: true });
      refreshWindowsToolPaths();
      return;
    }
    if (await commandExists('choco')) {
      await runCommand('choco', ['install', 'gh', '-y'], { allowFailure: true });
      refreshWindowsToolPaths();
    }
  }
}

async function runPrivileged(command, args, options = {}) {
  const p = platform();
  if (p === 'win32' || p === 'termux') return runCommand(command, args, options);
  if (await commandExists('sudo')) return runCommand('sudo', [command, ...args], options);
  return runCommand(command, args, options);
}

// ── dependency table ──────────────────────────────────────────────────────────
const DEPENDENCIES = [
  {
    name: 'git',
    label: 'Git',
    description: 'Version control — clones the storefront repo',
    check: () => checkWithPathRefresh('git'),
    install: installGit,
    manualUrl: 'https://git-scm.com/downloads',
    termuxPkg: 'git',
  },
  {
    name: 'gh',
    label: 'GitHub CLI',
    description: 'Creates your GitHub repo and manages auth',
    check: () => checkWithPathRefresh('gh'),
    install: installGithubCli,
    manualUrl: 'https://github.com/cli/cli#installation',
    termuxPkg: 'gh',
  },
  {
    name: 'vercel',
    label: 'Vercel CLI',
    description: 'Deploys the storefront to Vercel cloud',
    check: checkVercelCli,
    install: warmVercelCli,
    manualUrl: 'https://vercel.com/docs/cli',
    termuxPkg: null, // via npx only
  },
];

// ── ensureDependencies (shared) ───────────────────────────────────────────────
export async function ensureDependencies({ autoInstall = true, names } = {}) {
  const targets = names ? DEPENDENCIES.filter((d) => names.includes(d.name)) : DEPENDENCIES;
  const results = [];
  for (const dep of targets) {
    const spin = spinner(`Checking ${dep.label}…`);
    let present = await dep.check();
    if (present) {
      spin.succeed(`${green(dep.label)} is ready`);
      results.push({ ...dep, present, installed: false });
      continue;
    }
    spin.fail(`${dep.label} not found`);
    if (!autoInstall) { results.push({ ...dep, present: false, installed: false }); continue; }

    const p = platform();
    if (p === 'termux' && dep.termuxPkg === null) {
      // Vercel on Termux — npx-only, attempt inline
      const wSpin = spinner(`Warming Vercel CLI via npx (Termux)…`);
      await dep.install();
      present = await dep.check();
      if (present) wSpin.succeed(`Vercel CLI ready via npx`);
      else         wSpin.fail(`Vercel CLI not available — use: npx vercel`);
    } else {
      const installSpin = spinner(`Auto-installing ${dep.label}…`);
      await dep.install();
      present = await dep.check();
      if (present) installSpin.succeed(`${green(dep.label)} installed successfully`);
      else         installSpin.fail(`${red(dep.label)} could not be installed automatically`);
    }
    results.push({ ...dep, present, installed: present });
  }
  return results;
}

// ── vins command ──────────────────────────────────────────────────────────────
export async function vinsCommand() {
  const p = platform();
  const platformLabel = p === 'termux' ? 'Termux / Android' : p === 'win32' ? 'Windows' : p === 'darwin' ? 'macOS' : 'Linux';

  section('System info');
  kv('Platform', platformLabel);
  kv('Node.js',  process.version);
  kv('Arch',     process.arch);
  if (p === 'termux') {
    logInfo('Termux detected — using pkg for native installs, npx for Node tools');
  }

  section('Checking dependencies');
  const results = await ensureDependencies();

  section('Dependency summary');
  divider();
  let allGood = true;
  for (const dep of results) {
    if (dep.present) {
      kvSuccess(dep.label, dep.description);
    } else {
      kvFail(dep.label, `Missing — ${dep.description}`);
      allGood = false;
    }
  }
  divider();

  const missing = results.filter((d) => !d.present);
  if (missing.length) {
    logWarn(`${missing.length} dependency(ies) could not be installed automatically`);
    for (const dep of missing) {
      if (p === 'termux' && dep.termuxPkg) {
        log(`Install ${dep.label}: ${cyan(`pkg install ${dep.termuxPkg}`)}`);
      } else {
        log(`Install ${dep.label}: ${cyan(dep.manualUrl)}`);
      }
    }
    log('Then re-run: fabrica vins');
  } else {
    log(green('All dependencies ready — run: fabrica build'));
  }

  endSections();
  if (!allGood) process.exitCode = 1;
  return results;
}
