import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import https from 'node:https';
import os from 'node:os';
import process from 'node:process';
import { commandExists, runCommand, runCommandCapture } from './system.js';
import {
  kv, kvSuccess, kvFail, section, endSections, spinner,
  subBox, log, logInfo, logWarn, divider,
  orange, dimOrange, bold, dim, green, red, cyan, yellow,
} from './ui.js';

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

// ── PATH helpers ───────────────────────────────────────────────────────────────
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
  const up   = process.env.USERPROFILE;
  const pf   = process.env.ProgramFiles;
  const pf86 = process.env['ProgramFiles(x86)'];
  const pd   = process.env.ProgramData;
  // WinGet
  addToPathIfDirectory(lad  && path.join(lad,  'Microsoft', 'WinGet', 'Links'));
  addToPathIfDirectory(lad  && path.join(lad,  'Microsoft', 'WinGet', 'Packages', 'Git.Git_Microsoft.Winget.Source_8wekyb3d8bbwe', 'cmd'));
  // GitHub CLI
  addToPathIfDirectory(pf   && path.join(pf,   'GitHub CLI'));
  addToPathIfDirectory(pf86 && path.join(pf86, 'GitHub CLI'));
  // Scoop
  addToPathIfDirectory(up   && path.join(up,   'scoop', 'shims'));
  // Chocolatey
  addToPathIfDirectory(pd   && path.join(pd,   'chocolatey', 'bin'));
  // Git
  addToPathIfDirectory(pf   && path.join(pf,   'Git', 'cmd'));
  addToPathIfDirectory(pf86 && path.join(pf86, 'Git', 'cmd'));
  // Node
  addToPathIfDirectory(pf   && path.join(pf,   'nodejs'));
  addToPathIfDirectory(lad  && path.join(lad,  'Programs', 'nodejs'));
}

function refreshUnixToolPaths() {
  // User-local bin dirs (no root required)
  const home = os.homedir();
  addToPathIfDirectory(path.join(home, '.local', 'bin'));
  addToPathIfDirectory(path.join(home, 'bin'));
  addToPathIfDirectory(path.join(home, '.cargo', 'bin'));
  // Homebrew (macOS Intel / Linux)
  addToPathIfDirectory('/usr/local/bin');
  addToPathIfDirectory('/opt/homebrew/bin');     // macOS ARM
  addToPathIfDirectory('/home/linuxbrew/.linuxbrew/bin'); // Linuxbrew
  // Conda/Mamba
  addToPathIfDirectory(path.join(home, 'miniconda3', 'bin'));
  addToPathIfDirectory(path.join(home, 'anaconda3', 'bin'));
  addToPathIfDirectory(path.join(home, 'miniforge3', 'bin'));
  addToPathIfDirectory(path.join(home, 'mambaforge', 'bin'));
  // nix
  addToPathIfDirectory(path.join(home, '.nix-profile', 'bin'));
}

async function checkWithPathRefresh(cmd) {
  refreshWindowsToolPaths();
  refreshUnixToolPaths();
  return commandExists(cmd);
}

async function runFirstSuccessful(candidates, options = {}) {
  for (const [cmd, args] of candidates) {
    const r = await runCommandCapture(cmd, args, options);
    if (r.code === 0) return r;
  }
  return { code: 1, stdout: '', stderr: 'All fallback commands failed' };
}

// ── Privilege helper ───────────────────────────────────────────────────────────
// Try without sudo first; fall back to sudo if available
async function runPrivileged(command, args, options = {}) {
  const p = platform();
  if (p === 'win32' || p === 'termux') return runCommand(command, args, options);
  // Try without privilege first
  const direct = await runCommandCapture(command, args, options);
  if (direct.code === 0) return direct;
  // Fall back to sudo if available
  if (await commandExists('sudo')) {
    return runCommand('sudo', [command, ...args], { ...options, allowFailure: true });
  }
  return runCommand(command, args, { ...options, allowFailure: true });
}

// ── User-local bin directory (no root) ────────────────────────────────────────
function userLocalBin() {
  const home = os.homedir();
  if (isTermux()) return process.env.PREFIX ? path.join(process.env.PREFIX, 'bin') : '/data/data/com.termux/files/usr/bin';
  if (process.platform === 'win32') return path.join(process.env.LOCALAPPDATA || home, 'Programs', 'bin');
  return path.join(home, '.local', 'bin');
}

async function ensureUserLocalBin() {
  const dir = userLocalBin();
  try { await fsp.mkdir(dir, { recursive: true }); } catch { /* ignore */ }
  addToPathIfDirectory(dir);
  return dir;
}

// ── HTTPS download helper ─────────────────────────────────────────────────────
function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    function get(u) {
      https.get(u, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) return get(res.headers.location);
        if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return; }
        res.pipe(file);
        file.on('finish', () => file.close(resolve));
      }).on('error', reject);
    }
    get(url);
  });
}

// ── Scoop installer for Windows (no admin) ────────────────────────────────────
async function installScoop() {
  if (process.platform !== 'win32') return false;
  if (await commandExists('scoop')) return true;
  // Install Scoop via PowerShell — no admin required
  const r = await runCommandCapture('powershell', [
    '-NoProfile', '-ExecutionPolicy', 'Bypass',
    '-Command',
    `Set-ExecutionPolicy RemoteSigned -Scope CurrentUser -Force; ` +
    `[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12; ` +
    `iex (New-Object System.Net.WebClient).DownloadString('https://get.scoop.sh')`,
  ], { allowFailure: true });
  if (r.code === 0) {
    refreshWindowsToolPaths();
    return await commandExists('scoop');
  }
  return false;
}

// ── Homebrew / Linuxbrew installer (no root) ──────────────────────────────────
async function installBrew() {
  if (await commandExists('brew')) return true;
  const r = await runCommandCapture('bash', [
    '-c',
    'NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"',
  ], { allowFailure: true });
  if (r.code === 0) {
    refreshUnixToolPaths();
    return await commandExists('brew');
  }
  return false;
}

// ── GitHub release binary download (no root, Linux/macOS) ────────────────────
async function downloadGhBinary() {
  if (process.platform === 'win32') return false;

  const spin = spinner('Downloading gh binary from GitHub releases…');
  try {
    const arch = process.arch === 'arm64' ? 'arm64' : 'amd64';
    const os_  = process.platform === 'darwin' ? 'macOS' : 'linux';
    const ext  = process.platform === 'darwin' ? 'zip' : 'tar.gz';

    // Fetch latest release tag
    const metaResult = await runCommandCapture('curl', [
      '-fsSL', 'https://api.github.com/repos/cli/cli/releases/latest',
    ], { allowFailure: true });
    if (metaResult.code !== 0) { spin.fail('Could not fetch gh release metadata'); return false; }

    const tag = JSON.parse(metaResult.stdout || '{}').tag_name;
    if (!tag) { spin.fail('Could not determine gh release version'); return false; }
    const ver = tag.replace(/^v/, '');

    const filename = `gh_${ver}_${os_.toLowerCase()}_${arch}.${ext}`;
    const url = `https://github.com/cli/cli/releases/download/${tag}/${filename}`;
    const tmp = path.join(os.tmpdir(), filename);

    await downloadFile(url, tmp);

    const binDir = await ensureUserLocalBin();

    if (ext === 'tar.gz') {
      await runCommandCapture('tar', ['-xzf', tmp, '-C', os.tmpdir()], { allowFailure: true });
      const extracted = path.join(os.tmpdir(), `gh_${ver}_linux_${arch}`, 'bin', 'gh');
      if (fs.existsSync(extracted)) {
        await fsp.copyFile(extracted, path.join(binDir, 'gh'));
        await fsp.chmod(path.join(binDir, 'gh'), 0o755);
        spin.succeed(`gh binary installed to ${binDir}`);
        refreshUnixToolPaths();
        return true;
      }
    } else {
      // macOS zip
      await runCommandCapture('unzip', ['-o', tmp, '-d', os.tmpdir()], { allowFailure: true });
      const extracted = path.join(os.tmpdir(), `gh_${ver}_macOS_${arch}`, 'bin', 'gh');
      if (fs.existsSync(extracted)) {
        await fsp.copyFile(extracted, path.join(binDir, 'gh'));
        await fsp.chmod(path.join(binDir, 'gh'), 0o755);
        spin.succeed(`gh binary installed to ${binDir}`);
        refreshUnixToolPaths();
        return true;
      }
    }
    spin.fail('Could not extract gh binary');
    return false;
  } catch (e) {
    spin.fail(`gh binary download failed: ${e.message}`);
    return false;
  }
}

// ── Git portable binary download for Linux (no root) ─────────────────────────
async function downloadGitBinaryLinux() {
  if (process.platform !== 'linux' || isTermux()) return false;
  // Try conda as the most reliable no-root option on Linux
  if (await commandExists('conda')) {
    const r = await runCommandCapture('conda', ['install', '-y', '-c', 'conda-forge', 'git'], { allowFailure: true });
    if (r.code === 0) { refreshUnixToolPaths(); return true; }
  }
  if (await commandExists('mamba')) {
    const r = await runCommandCapture('mamba', ['install', '-y', '-c', 'conda-forge', 'git'], { allowFailure: true });
    if (r.code === 0) { refreshUnixToolPaths(); return true; }
  }
  return false;
}

// ── Vercel ─────────────────────────────────────────────────────────────────────
async function checkVercelCli() {
  refreshWindowsToolPaths();
  refreshUnixToolPaths();
  const r = await runFirstSuccessful([
    ['npx',    ['--yes', 'vercel@latest', '--version']],
    ['npm',    ['exec', '--yes', 'vercel@latest', '--', '--version']],
    ['vercel', ['--version']],
  ]);
  return r.code === 0;
}

async function warmVercelCli() {
  // Vercel CLI is always available via npx — no install needed
  const r = await runFirstSuccessful([
    ['npx',    ['--yes', 'vercel@latest', '--version']],
    ['npm',    ['exec', '--yes', 'vercel@latest', '--', '--version']],
    ['vercel', ['--version']],
  ]);
  if (r.code === 0) return;
  // Last resort: global install
  await runCommand('npm', ['install', '-g', 'vercel@latest'], { allowFailure: true });
}

// ── Git installer ──────────────────────────────────────────────────────────────
async function installGit() {
  refreshWindowsToolPaths();
  refreshUnixToolPaths();
  const p = platform();

  // ── Termux (no root) ────────────────────────────────────────────────────────
  if (p === 'termux') {
    return runCommand('pkg', ['install', '-y', 'git'], { allowFailure: true });
  }

  // ── macOS ────────────────────────────────────────────────────────────────────
  if (p === 'darwin') {
    if (await commandExists('brew')) {
      return runCommand('brew', ['install', 'git'], { allowFailure: true });
    }
    // Install Homebrew (no root) then git
    const brewOk = await installBrew();
    if (brewOk) return runCommand('brew', ['install', 'git'], { allowFailure: true });
    // Xcode tools as final fallback
    return runCommand('xcode-select', ['--install'], { allowFailure: true });
  }

  // ── Linux ────────────────────────────────────────────────────────────────────
  if (p === 'linux') {
    // 1. Try Homebrew/Linuxbrew (no root)
    if (await commandExists('brew')) {
      const r = await runCommandCapture('brew', ['install', 'git'], { allowFailure: true });
      if (r.code === 0) { refreshUnixToolPaths(); return; }
    }

    // 2. Try system package managers (with or without root)
    if (await commandExists('apt-get')) {
      await runPrivileged('apt-get', ['update', '-qq'], { allowFailure: true });
      const r = await runPrivileged('apt-get', ['install', '-y', 'git'], { allowFailure: true });
      if (await commandExists('git')) return;
    }
    if (await commandExists('dnf')) {
      await runPrivileged('dnf', ['install', '-y', 'git'], { allowFailure: true });
      if (await commandExists('git')) return;
    }
    if (await commandExists('yum')) {
      await runPrivileged('yum', ['install', '-y', 'git'], { allowFailure: true });
      if (await commandExists('git')) return;
    }
    if (await commandExists('pacman')) {
      await runPrivileged('pacman', ['-Sy', '--noconfirm', 'git'], { allowFailure: true });
      if (await commandExists('git')) return;
    }
    if (await commandExists('zypper')) {
      await runPrivileged('zypper', ['install', '-y', 'git'], { allowFailure: true });
      if (await commandExists('git')) return;
    }
    if (await commandExists('apk')) {
      await runPrivileged('apk', ['add', 'git'], { allowFailure: true });
      if (await commandExists('git')) return;
    }

    // 3. Try conda/mamba (no root)
    await downloadGitBinaryLinux();

    // 4. Install Linuxbrew as last resort (no root)
    const brewOk = await installBrew();
    if (brewOk) {
      await runCommand('brew', ['install', 'git'], { allowFailure: true });
    }
    return;
  }

  // ── Windows ───────────────────────────────────────────────────────────────────
  if (p === 'win32') {
    // 1. WinGet (no admin for user-scope installs)
    if (await commandExists('winget')) {
      const r = await runCommandCapture('winget', [
        'install', '--id', 'Git.Git', '-e', '--source', 'winget',
        '--scope', 'user', '--silent', '--accept-package-agreements', '--accept-source-agreements',
      ], { allowFailure: true });
      refreshWindowsToolPaths();
      if (await commandExists('git')) return;
    }

    // 2. Scoop (no admin)
    const scoopOk = await commandExists('scoop') || await installScoop();
    if (scoopOk) {
      await runCommand('scoop', ['install', 'git'], { allowFailure: true });
      refreshWindowsToolPaths();
      if (await commandExists('git')) return;
    }

    // 3. Chocolatey (may need admin, try anyway)
    if (await commandExists('choco')) {
      await runCommand('choco', ['install', 'git', '-y'], { allowFailure: true });
      refreshWindowsToolPaths();
    }
  }
}

// ── GitHub CLI installer ───────────────────────────────────────────────────────
async function installGithubCli() {
  refreshWindowsToolPaths();
  refreshUnixToolPaths();
  const p = platform();

  // ── Termux (no root) ────────────────────────────────────────────────────────
  if (p === 'termux') {
    return runCommand('pkg', ['install', '-y', 'gh'], { allowFailure: true });
  }

  // ── macOS ────────────────────────────────────────────────────────────────────
  if (p === 'darwin') {
    if (await commandExists('brew')) {
      return runCommand('brew', ['install', 'gh'], { allowFailure: true });
    }
    const brewOk = await installBrew();
    if (brewOk) return runCommand('brew', ['install', 'gh'], { allowFailure: true });
    // Binary download fallback
    await downloadGhBinary();
    return;
  }

  // ── Linux ────────────────────────────────────────────────────────────────────
  if (p === 'linux') {
    // 1. Try Homebrew/Linuxbrew (no root)
    if (await commandExists('brew')) {
      const r = await runCommandCapture('brew', ['install', 'gh'], { allowFailure: true });
      if (r.code === 0) { refreshUnixToolPaths(); return; }
    }

    // 2. Try system package managers
    if (await commandExists('apt-get')) {
      // Try direct first (gh is in Ubuntu 22.04+ repos)
      const direct = await runPrivileged('apt-get', ['install', '-y', 'gh'], { allowFailure: true });
      if (await commandExists('gh')) return;

      // GitHub's official APT repo
      const hasSudo = await commandExists('sudo');
      const pre = hasSudo ? 'sudo ' : '';
      await runCommand('bash', ['-c', [
        `${pre}apt-get update -qq`,
        `${pre}apt-get install -y curl ca-certificates`,
        `${pre}mkdir -p -m 755 /etc/apt/keyrings`,
        `curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | ${pre}tee /etc/apt/keyrings/githubcli-archive-keyring.gpg > /dev/null`,
        `${pre}chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg`,
        `echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | ${pre}tee /etc/apt/sources.list.d/github-cli.list > /dev/null`,
        `${pre}apt-get update -qq`,
        `${pre}apt-get install -y gh`,
      ].join(' && ')], { allowFailure: true });
      if (await commandExists('gh')) return;
    }
    if (await commandExists('dnf')) {
      await runPrivileged('dnf', ['install', '-y', 'gh'], { allowFailure: true });
      if (await commandExists('gh')) return;
    }
    if (await commandExists('pacman')) {
      await runPrivileged('pacman', ['-Sy', '--noconfirm', 'github-cli'], { allowFailure: true });
      if (await commandExists('gh')) return;
    }
    if (await commandExists('zypper')) {
      await runPrivileged('zypper', ['install', '-y', 'gh'], { allowFailure: true });
      if (await commandExists('gh')) return;
    }
    if (await commandExists('apk')) {
      await runCommandCapture('apk', ['add', 'github-cli'], { allowFailure: true });
      if (await commandExists('gh')) return;
    }

    // 3. Binary download (no root, works everywhere)
    await downloadGhBinary();
    return;
  }

  // ── Windows ───────────────────────────────────────────────────────────────────
  if (p === 'win32') {
    // 1. WinGet user-scope (no admin)
    if (await commandExists('winget')) {
      await runCommandCapture('winget', [
        'install', '--id', 'GitHub.cli', '-e', '--source', 'winget',
        '--scope', 'user', '--silent', '--accept-package-agreements', '--accept-source-agreements',
      ], { allowFailure: true });
      refreshWindowsToolPaths();
      if (await commandExists('gh')) return;
    }

    // 2. Scoop (no admin)
    const scoopOk = await commandExists('scoop') || await installScoop();
    if (scoopOk) {
      await runCommand('scoop', ['install', 'gh'], { allowFailure: true });
      refreshWindowsToolPaths();
      if (await commandExists('gh')) return;
    }

    // 3. Chocolatey
    if (await commandExists('choco')) {
      await runCommand('choco', ['install', 'gh', '-y'], { allowFailure: true });
      refreshWindowsToolPaths();
    }
  }
}

// ── dependency table ───────────────────────────────────────────────────────────
const DEPENDENCIES = [
  {
    name: 'git',
    label: 'Git',
    description: 'Version control — clones the storefront repo',
    check: () => checkWithPathRefresh('git'),
    install: installGit,
    manualUrl: 'https://git-scm.com/downloads',
    termuxPkg: 'git',
    winScoopPkg: 'git',
    brewPkg: 'git',
  },
  {
    name: 'gh',
    label: 'GitHub CLI',
    description: 'Creates your GitHub repo and manages auth',
    check: () => checkWithPathRefresh('gh'),
    install: installGithubCli,
    manualUrl: 'https://github.com/cli/cli#installation',
    termuxPkg: 'gh',
    winScoopPkg: 'gh',
    brewPkg: 'gh',
  },
  {
    name: 'vercel',
    label: 'Vercel CLI',
    description: 'Deploys the storefront to Vercel cloud',
    check: checkVercelCli,
    install: warmVercelCli,
    manualUrl: 'https://vercel.com/docs/cli',
    termuxPkg: null,
    note: 'Runs via npx — no global install needed',
  },
];

// ── ensureDependencies ─────────────────────────────────────────────────────────
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

    spin.fail(`${dep.label} not found — attempting auto-install`);
    if (!autoInstall) { results.push({ ...dep, present: false, installed: false }); continue; }

    const p = platform();
    const installSpin = spinner(`Installing ${dep.label}…`);

    if (p === 'termux' && dep.termuxPkg === null) {
      // Vercel on Termux via npx only
      await dep.install();
      present = await dep.check();
      if (present) installSpin.succeed(`${green(dep.label)} ready via npx`);
      else         installSpin.fail(`${red(dep.label)} not available — run: npx vercel`);
    } else {
      await dep.install();
      refreshWindowsToolPaths();
      refreshUnixToolPaths();
      present = await dep.check();
      if (present) installSpin.succeed(`${green(dep.label)} installed successfully`);
      else         installSpin.fail(`${red(dep.label)} could not be installed automatically`);
    }

    results.push({ ...dep, present, installed: present });
  }
  return results;
}

// ── vins command ───────────────────────────────────────────────────────────────
export async function vinsCommand() {
  const p = platform();
  const platformLabel =
    p === 'termux' ? 'Termux / Android' :
    p === 'win32'  ? 'Windows' :
    p === 'darwin' ? 'macOS' : 'Linux';

  const hasSudo   = process.platform !== 'win32' && !isTermux() && await commandExists('sudo');
  const hasBrew   = await commandExists('brew');
  const hasScoop  = process.platform === 'win32' && await commandExists('scoop');
  const hasWinget = process.platform === 'win32' && await commandExists('winget');
  const hasConda  = await commandExists('conda') || await commandExists('mamba');

  section('System info');
  kv('Platform', platformLabel);
  kv('Node.js',  process.version);
  kv('Arch',     process.arch);
  divider();
  kv('Sudo',     hasSudo   ? green('available') : dim('not available'));
  kv('Homebrew', hasBrew   ? green('available') : dim('not detected'));
  if (process.platform === 'win32') {
    kv('WinGet', hasWinget ? green('available') : dim('not detected'));
    kv('Scoop',  hasScoop  ? green('available') : dim('not detected — will auto-install if needed'));
  }
  if (hasConda) kv('Conda', green('available'));
  if (p === 'termux') {
    logInfo('Termux — using pkg for all installs (no root required)');
  } else if (!hasSudo && p === 'linux') {
    logInfo('No sudo detected — will use Homebrew, conda, or binary download');
  }

  section('Checking & installing dependencies');
  const results = await ensureDependencies();

  section('Dependency summary');
  divider();
  let allGood = true;
  for (const dep of results) {
    if (dep.present) {
      kvSuccess(dep.label, dep.description + (dep.note ? `  ${dim('·')}  ${dim(dep.note)}` : ''));
    } else {
      kvFail(dep.label, dep.description);
      allGood = false;
    }
  }
  divider();

  const missing = results.filter((d) => !d.present);
  if (missing.length) {
    logWarn(`${missing.length} tool(s) could not be installed automatically`);
    log(dim('Manual install instructions:'));
    for (const dep of missing) {
      if (p === 'termux' && dep.termuxPkg) {
        log(`  ${orange(dep.label)}: ${cyan(`pkg install ${dep.termuxPkg}`)}`);
      } else if (p === 'win32') {
        log(`  ${orange(dep.label)}: ${cyan(`scoop install ${dep.winScoopPkg || dep.name}`)}`);
        log(`            ${dim('or')} ${cyan(dep.manualUrl)}`);
      } else if (p === 'linux' && !hasSudo) {
        log(`  ${orange(dep.label)}: ${cyan(`brew install ${dep.brewPkg || dep.name}`)}`);
        log(`            ${dim('or')} ${cyan(dep.manualUrl)}`);
      } else {
        log(`  ${orange(dep.label)}: ${cyan(dep.manualUrl)}`);
      }
    }
    log(dim('Then re-run: npx fabrica-e-commerce vins'));
  } else {
    logInfo(green('All dependencies ready'));
    log(`Run ${cyan('npx fabrica-e-commerce build')} to deploy your store`);
  }

  endSections();
  if (!allGood) process.exitCode = 1;
  return results;
}
