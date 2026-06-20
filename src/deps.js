import process from 'node:process';
import { commandExists, runCommand, runCommandCapture } from './system.js';
import { kv, section, spinner } from './ui.js';

// Some systems (root containers, minimal CI images) have no `sudo` binary
// at all. Fall back to running the command directly in that case instead
// of failing outright.
async function runPrivileged(command, args, options = {}) {
  if (await commandExists('sudo')) {
    return runCommand('sudo', [command, ...args], options);
  }
  return runCommand(command, args, options);
}

function runPrivilegedShell(script, options = {}) {
  return runCommand('bash', ['-c', script], options);
}

// Dependencies the package actually shells out to. "git" and "gh" (GitHub
// CLI) are real external binaries we depend on; "vercel" is fetched on
// demand through npx so we just confirm npm/npx can resolve it.
const DEPENDENCIES = [
  {
    name: 'git',
    label: 'Git',
    check: () => commandExists('git'),
    install: installGit,
    manualUrl: 'https://git-scm.com/downloads'
  },
  {
    name: 'gh',
    label: 'GitHub CLI (gh)',
    check: () => commandExists('gh'),
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

async function checkVercelCli() {
  const result = await runCommandCapture('npx', ['--yes', 'vercel@latest', '--version']);
  return result.code === 0;
}

async function warmVercelCli() {
  // npx fetches vercel on first use, so "installing" it just means priming
  // the npm cache once so later `build`/`list` calls are instant.
  await runCommand('npx', ['--yes', 'vercel@latest', '--version'], { allowFailure: true });
}

async function installGit() {
  const platform = process.platform;
  if (platform === 'linux') {
    if (await commandExists('apt-get')) {
      await runPrivileged('apt-get', ['update'], { allowFailure: true });
      await runPrivileged('apt-get', ['install', '-y', 'git'], { allowFailure: true });
      return;
    }
    if (await commandExists('dnf')) return runPrivileged('dnf', ['install', '-y', 'git'], { allowFailure: true });
    if (await commandExists('yum')) return runPrivileged('yum', ['install', '-y', 'git'], { allowFailure: true });
    if (await commandExists('pacman')) return runPrivileged('pacman', ['-Sy', '--noconfirm', 'git'], { allowFailure: true });
  }
  if (platform === 'darwin') {
    if (await commandExists('brew')) return runCommand('brew', ['install', 'git'], { allowFailure: true });
  }
  if (platform === 'win32') {
    if (await commandExists('winget')) return runCommand('winget', ['install', '--id', 'Git.Git', '-e', '--source', 'winget'], { allowFailure: true });
    if (await commandExists('choco')) return runCommand('choco', ['install', 'git', '-y'], { allowFailure: true });
  }
}

async function installGithubCli() {
  const platform = process.platform;
  if (platform === 'linux') {
    if (await commandExists('apt-get')) {
      // Try the plain package first (present on newer Ubuntu/Debian).
      const direct = await (await commandExists('sudo')
        ? runCommandCapture('sudo', ['apt-get', 'install', '-y', 'gh'])
        : runCommandCapture('apt-get', ['install', '-y', 'gh']));
      if (direct.code === 0) return;
      // Fall back to the official GitHub CLI apt repository setup.
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
    if (await commandExists('dnf')) return runPrivileged('dnf', ['install', '-y', 'gh'], { allowFailure: true });
    if (await commandExists('pacman')) return runPrivileged('pacman', ['-Sy', '--noconfirm', 'github-cli'], { allowFailure: true });
  }
  if (platform === 'darwin') {
    if (await commandExists('brew')) return runCommand('brew', ['install', 'gh'], { allowFailure: true });
  }
  if (platform === 'win32') {
    if (await commandExists('winget')) return runCommand('winget', ['install', '--id', 'GitHub.cli', '-e', '--source', 'winget'], { allowFailure: true });
    if (await commandExists('choco')) return runCommand('choco', ['install', 'gh', '-y'], { allowFailure: true });
  }
}

export async function ensureDependencies({ autoInstall = true, names } = {}) {
  const targets = names ? DEPENDENCIES.filter((dep) => names.includes(dep.name)) : DEPENDENCIES;
  const results = [];
  for (const dep of targets) {
    const spin = spinner(`Checking ${dep.label}`);
    let present = await dep.check();
    if (present) {
      spin.succeed(`${dep.label} found`);
      results.push({ ...dep, present, installed: false });
      continue;
    }
    spin.fail(`${dep.label} missing`);
    if (!autoInstall) {
      results.push({ ...dep, present: false, installed: false });
      continue;
    }
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
  const results = await ensureDependencies();
  section('Summary');
  let allGood = true;
  for (const dep of results) {
    kv(dep.label, dep.present ? 'OK' : 'MISSING — install manually');
    if (!dep.present) {
      allGood = false;
      console.log(`  Manual install: ${dep.manualUrl}`);
    }
  }
  if (allGood) {
    console.log('\nAll dependencies are ready. You can run: fabrica build');
  } else {
    console.log('\nSome dependencies could not be installed automatically. Install them manually using the links above, then re-run "fabrica vins".');
    process.exitCode = 1;
  }
  return results;
}
