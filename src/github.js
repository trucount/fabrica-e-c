import process from 'node:process';
import { commandExists, runCommand, runCommandCapture } from './system.js';
import { choose } from './prompt.js';
import { kv, section, spinner } from './ui.js';

export async function isGithubCliInstalled() {
  return commandExists('gh');
}

export async function isLoggedInToGithub() {
  const result = await runCommandCapture('gh', ['auth', 'status']);
  return result.code === 0;
}

async function setupGithubGitCredentials() {
  const result = await runCommandCapture('gh', ['auth', 'setup-git']);
  return result.code === 0;
}

export async function ensureGithubLogin() {
  section('GitHub login');
  if (!(await isGithubCliInstalled())) {
    throw new Error('GitHub CLI (gh) is not installed. Run "fabrica vins" to install dependencies, then try again.');
  }
  const spin = spinner('Checking GitHub CLI login');
  if (await isLoggedInToGithub()) {
    spin.succeed('Already logged in to GitHub');
  } else {
    spin.fail('Not logged in to GitHub');
    console.log('A browser/device flow will open so you can log in with "gh auth login"...');
    await runCommand('gh', ['auth', 'login', '--hostname', 'github.com', '--git-protocol', 'https', '--web']);
    if (!(await isLoggedInToGithub())) {
      throw new Error('GitHub login was not completed. Run "fabrica build" again after logging in with "gh auth login".');
    }
    kv('GitHub', 'Logged in');
  }

  const gitSpin = spinner('Configuring GitHub credentials for git push');
  if (await setupGithubGitCredentials()) {
    gitSpin.succeed('GitHub credentials ready for git push');
  } else {
    gitSpin.fail('Could not configure GitHub git credentials automatically');
    console.log('If git push asks for credentials, complete the prompt or run: gh auth setup-git');
  }
}

async function getGithubLogin() {
  const result = await runCommandCapture('gh', ['api', 'user', '-q', '.login']);
  if (result.code !== 0) throw new Error('Could not determine the logged in GitHub account.');
  return result.stdout.trim();
}

async function githubRepoExists(owner, repoName) {
  const result = await runCommandCapture('gh', ['repo', 'view', `${owner}/${repoName}`, '--json', 'name']);
  return result.code === 0;
}

async function ensureGithubRepo(owner, repoName) {
  const fullName = `${owner}/${repoName}`;
  if (await githubRepoExists(owner, repoName)) {
    const action = await choose(`GitHub repo ${fullName} already exists. What should Fabrica do?`, [
      { name: 'Use the existing repo and push this storefront to it', value: 'use' },
      { name: 'Stop so I can choose a different Vercel project/repo name', value: 'stop' }
    ]);
    if (action === 'stop') throw new Error(`GitHub repo ${fullName} already exists. Re-run build with a different project name.`);
    return;
  }

  const spin = spinner(`Creating GitHub repo ${fullName}`);
  const create = await runCommandCapture('gh', ['repo', 'create', fullName, '--private']);
  if (create.code !== 0) {
    spin.fail('Could not create GitHub repository');
    throw new Error(create.stderr || 'gh repo create failed');
  }
  spin.succeed(`Created GitHub repo ${fullName}`);
}

async function setOrigin(project, repoUrl) {
  const existing = await runCommandCapture('git', ['remote', 'get-url', 'origin'], { cwd: project.target });
  if (existing.code === 0) {
    await runCommand('git', ['remote', 'set-url', 'origin', repoUrl], { cwd: project.target });
  } else {
    await runCommand('git', ['remote', 'add', 'origin', repoUrl], { cwd: project.target });
  }
}

async function pushWithCredentialFallback(project) {
  const spin = spinner('Pushing storefront to GitHub');
  let push = await runCommandCapture('git', ['push', '-u', 'origin', 'main'], { cwd: project.target });
  if (push.code === 0) {
    spin.succeed('Pushed storefront to GitHub');
    return;
  }

  spin.fail('Initial git push failed');
  console.log('GitHub rejected the push credentials. Re-configuring GitHub CLI credentials and retrying...');
  await setupGithubGitCredentials();
  push = await runCommandCapture('git', ['push', '-u', 'origin', 'main'], { cwd: project.target });
  if (push.code === 0) {
    kv('GitHub push', 'Succeeded after refreshing credentials');
    return;
  }

  console.log(push.stderr || push.stdout || 'git push failed');
  const action = await choose('GitHub push still needs authentication. What should Fabrica do?', [
    { name: 'Open GitHub login again, then retry push', value: 'login' },
    { name: 'Stop so I can fix GitHub credentials manually', value: 'stop' }
  ]);
  if (action === 'login') {
    await runCommand('gh', ['auth', 'login', '--hostname', 'github.com', '--git-protocol', 'https', '--web']);
    await setupGithubGitCredentials();
    await runCommand('git', ['push', '-u', 'origin', 'main'], { cwd: project.target });
    kv('GitHub push', 'Succeeded after login');
    return;
  }
  throw new Error('GitHub push failed. Run "gh auth setup-git" or "gh auth login", then rerun build.');
}

// Re-homes the cloned storefront code into a brand new GitHub repository
// owned by the logged-in user, so the deployed Vercel project can stay
// connected to that repo (git push -> auto deploy) instead of the original
// template repository.
export async function createGithubRepoFromClone(project) {
  section('GitHub repository');
  await ensureGithubLogin();
  const owner = await getGithubLogin();
  const repoName = project.projectName;
  const repoUrl = `https://github.com/${owner}/${repoName}.git`;

  // Detach from the template's git history and start a clean repo so we
  // don't try to push into someone else's repository history.
  if (process.platform === 'win32') {
    await runCommand('cmd', ['/c', 'rmdir', '/s', '/q', '.git'], { cwd: project.target, allowFailure: true });
  } else {
    await runCommand('rm', ['-rf', '.git'], { cwd: project.target, allowFailure: true });
  }
  await runCommand('git', ['init', '-b', 'main'], { cwd: project.target });
  await runCommand('git', ['add', '-A'], { cwd: project.target });
  await runCommand('git', ['-c', 'user.email=fabrica-cli@local', '-c', 'user.name=Fabrica CLI', 'commit', '-m', 'Initial commit from Fabrica storefront'], { cwd: project.target });

  await ensureGithubRepo(owner, repoName);
  await setOrigin(project, repoUrl);
  await pushWithCredentialFallback(project);

  const browserUrl = `https://github.com/${owner}/${repoName}`;
  kv('GitHub repo', browserUrl);
  return { owner, repoName, repoUrl: browserUrl };
}
