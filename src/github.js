import fs from 'node:fs/promises';
import path from 'node:path';
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

  const gitSpin = spinner('Configuring GitHub API credentials');
  if (await setupGithubGitCredentials()) {
    gitSpin.succeed('GitHub API credentials ready');
  } else {
    gitSpin.fail('Could not configure GitHub git credentials automatically');
    console.log('Continuing with GitHub API publishing; if Git later asks for credentials, run: gh auth setup-git');
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
      { name: 'Use the existing repo and publish this storefront to it', value: 'use' },
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


async function ghApiJson(args, body) {
  const result = await runCommandCapture('gh', ['api', ...args, '--input', '-'], { input: JSON.stringify(body) });
  if (result.code !== 0) throw new Error(result.stderr || result.stdout || `gh api ${args.join(' ')} failed`);
  return result.stdout ? JSON.parse(result.stdout) : {};
}

async function ghApiGet(args) {
  const result = await runCommandCapture('gh', ['api', ...args]);
  if (result.code !== 0) return null;
  return result.stdout ? JSON.parse(result.stdout) : {};
}

async function listTrackedFiles(project) {
  const result = await runCommandCapture('git', ['ls-files', '-z'], { cwd: project.target });
  if (result.code !== 0) throw new Error(result.stderr || 'Could not list storefront files for GitHub upload.');
  return result.stdout.split('\0').filter(Boolean);
}

async function createGithubBlob(project, owner, repoName, filePath) {
  const absolute = path.join(project.target, filePath);
  const content = await fs.readFile(absolute);
  const blob = await ghApiJson([`repos/${owner}/${repoName}/git/blobs`], {
    content: content.toString('base64'),
    encoding: 'base64'
  });
  return { path: filePath.replace(/\\/g, '/'), mode: '100644', type: 'blob', sha: blob.sha };
}

async function publishWithGithubApi(project, owner, repoName) {
  const spin = spinner('Publishing storefront through GitHub API');
  const files = await listTrackedFiles(project);
  const treeItems = [];
  for (const filePath of files) {
    treeItems.push(await createGithubBlob(project, owner, repoName, filePath));
  }

  const tree = await ghApiJson([`repos/${owner}/${repoName}/git/trees`], { tree: treeItems });

  const existingRef = await ghApiGet([`repos/${owner}/${repoName}/git/ref/heads/main`]);
  const parents = existingRef?.object?.sha ? [existingRef.object.sha] : [];
  const commit = await ghApiJson([`repos/${owner}/${repoName}/git/commits`], {
    message: 'Initial commit from Fabrica storefront',
    tree: tree.sha,
    parents
  });

  if (existingRef?.ref) {
    await ghApiJson([`repos/${owner}/${repoName}/git/refs/heads/main`, '--method', 'PATCH'], { sha: commit.sha, force: true });
  } else {
    await ghApiJson([`repos/${owner}/${repoName}/git/refs`], { ref: 'refs/heads/main', sha: commit.sha });
  }
  spin.succeed('Published storefront to GitHub without git push');
}


// Re-homes the cloned storefront code into a brand new GitHub repository
// owned by the logged-in user, so the deployed Vercel project can stay
// connected to that repo (future changes can auto deploy) instead of the original
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
  await publishWithGithubApi(project, owner, repoName);

  const browserUrl = `https://github.com/${owner}/${repoName}`;
  kv('GitHub repo', browserUrl);
  return { owner, repoName, repoUrl: browserUrl };
}
