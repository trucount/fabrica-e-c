import process from 'node:process';
import { commandExists, runCommand, runCommandCapture } from './system.js';
import { kv, section, spinner } from './ui.js';

export async function isGithubCliInstalled() {
  return commandExists('gh');
}

export async function isLoggedInToGithub() {
  const result = await runCommandCapture('gh', ['auth', 'status']);
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
    return;
  }
  spin.fail('Not logged in to GitHub');
  console.log('A browser/device flow will open so you can log in with "gh auth login"...');
  await runCommand('gh', ['auth', 'login', '--hostname', 'github.com', '--git-protocol', 'https', '--web']);
  if (!(await isLoggedInToGithub())) {
    throw new Error('GitHub login was not completed. Run "fabrica build" again after logging in with "gh auth login".');
  }
  kv('GitHub', 'Logged in');
}

async function getGithubLogin() {
  const result = await runCommandCapture('gh', ['api', 'user', '-q', '.login']);
  if (result.code !== 0) throw new Error('Could not determine the logged in GitHub account.');
  return result.stdout.trim();
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

  const spin = spinner(`Creating GitHub repo ${owner}/${repoName}`);
  const create = await runCommandCapture('gh', ['repo', 'create', repoName, '--private', '--source', '.', '--remote', 'origin', '--push'], { cwd: project.target });
  if (create.code !== 0) {
    spin.fail('Could not create GitHub repository');
    throw new Error(create.stderr || 'gh repo create failed');
  }
  spin.succeed(`Pushed code to ${owner}/${repoName}`);

  const repoUrl = `https://github.com/${owner}/${repoName}`;
  kv('GitHub repo', repoUrl);
  return { owner, repoName, repoUrl };
}
