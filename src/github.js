import { commandExists, runCommand, runCommandCapture } from './system.js';
import { STORE_REPO } from './config.js';
import { choose } from './prompt.js';
import { dimOrange, kv, section, spinner } from './ui.js';

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

async function setOrigin(project, repoUrl) {
  const existing = await runCommandCapture('git', ['remote', 'get-url', 'origin'], { cwd: project.target });
  if (existing.code === 0) {
    await runCommand('git', ['remote', 'set-url', 'origin', repoUrl], { cwd: project.target });
  } else {
    await runCommand('git', ['remote', 'add', 'origin', repoUrl], { cwd: project.target });
  }
}

// Creates or reuses a GitHub repository from the hardcoded storefront source
// repository, so Vercel connects to user-owned code without requiring a local
// git push from this machine.
function sourceRepoFullName() {
  return STORE_REPO.replace(/^https:\/\/github\.com\//, '').replace(/\.git$/, '');
}

async function waitForGithubRepo(owner, repoName) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (await githubRepoExists(owner, repoName)) return;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(`Timed out waiting for ${owner}/${repoName} to appear on GitHub. GitHub forks happen asynchronously and can occasionally lag — try again in a minute, or check ${owner} on GitHub directly.`);
}

function sourceOwner() {
  return sourceRepoFullName().split('/')[0];
}

async function isMarkedAsTemplate(repoFullName) {
  const result = await runCommandCapture('gh', ['api', `repos/${repoFullName}`, '-q', '.is_template']);
  return result.code === 0 && result.stdout.trim() === 'true';
}

async function createFromTemplate(spin, owner, repoName, source) {
  if (!(await isMarkedAsTemplate(source))) {
    spin.fail(`${source} is not marked as a "Template repository" on GitHub`);
    throw new Error(`Creating ${owner}/${repoName} from ${source} requires ${source} to be a template repository. Go to https://github.com/${source}/settings, check "Template repository", then run "fabrica build" again.`);
  }
  const template = await runCommandCapture('gh', ['repo', 'create', `${owner}/${repoName}`, '--private', '--template', source, '--include-all-branches']);
  if (template.code === 0) {
    await waitForGithubRepo(owner, repoName);
    spin.succeed(`Created ${owner}/${repoName} from ${source}`);
    return repoName;
  }
  spin.fail('Could not create GitHub repo from source repo');
  throw new Error(template.stderr || 'GitHub repo creation from source failed');
}

async function forkSourceRepo(owner, repoName) {
  const source = sourceRepoFullName();
  const existing = await githubRepoExists(owner, repoName);
  if (existing) {
    const action = await choose(`GitHub repo ${owner}/${repoName} already exists. What should Fabrica do?`, [
      { name: 'Use the existing repo for Vercel', value: 'use' },
      { name: 'Stop so I can choose a different Vercel project/repo name', value: 'stop' }
    ]);
    if (action === 'stop') throw new Error(`GitHub repo ${owner}/${repoName} already exists. Re-run build with a different project name.`);
    return repoName;
  }

  // GitHub will not let an account fork a repository that account itself owns
  // — not even under a different name. The Fork API still returns success
  // (202 Accepted, since forking is asynchronous) and only fails the actual
  // creation in the background, which previously showed up as a false "✓
  // Forked" message followed by a 404. Skip the Fork API entirely here and go
  // straight to template-based creation, which has no such restriction.
  if (owner.toLowerCase() === sourceOwner().toLowerCase()) {
    const spin = spinner(`Creating GitHub repo ${owner}/${repoName} from template ${source} (can't fork into the same account that owns ${source})`);
    return createFromTemplate(spin, owner, repoName, source);
  }

  const spin = spinner(`Creating GitHub repo ${owner}/${repoName} from ${source}`);
  const fork = await runCommandCapture('gh', ['api', `repos/${source}/forks`, '--method', 'POST', '--input', '-'], {
    input: JSON.stringify({ name: repoName, default_branch_only: false })
  });
  if (fork.code === 0) {
    // The fork API can also return success while pointing at a DIFFERENT repo
    // than the one we asked for — e.g. if this account already has a fork of
    // `source` under another name, GitHub returns that existing fork and
    // silently ignores the requested "name". Read the actual name back from
    // the API response instead of assuming it matched.
    let actualName = repoName;
    try {
      const data = JSON.parse(fork.stdout);
      if (data?.name) actualName = data.name;
    } catch {
      // Response wasn't parseable JSON; fall back to assuming the requested
      // name was honored and let waitForGithubRepo confirm or throw below.
    }

    await waitForGithubRepo(owner, actualName);

    if (actualName !== repoName) {
      const renameSpin = spinner(`Renaming ${owner}/${actualName} to ${owner}/${repoName}`);
      const rename = await runCommandCapture('gh', ['api', `repos/${owner}/${actualName}`, '--method', 'PATCH', '-f', `name=${repoName}`]);
      if (rename.code === 0) {
        await waitForGithubRepo(owner, repoName);
        renameSpin.succeed(`Forked ${source} to ${owner}/${repoName} (GitHub had reused an existing fork named ${actualName})`);
        return repoName;
      }
      renameSpin.fail(`Could not rename — continuing with the existing fork name`);
      kv('GitHub repo', `https://github.com/${owner}/${actualName}`);
      console.log(dimOrange(`  Note: this is named "${actualName}", not "${repoName}", because your GitHub account already had a fork of ${source}.`));
      return actualName;
    }

    spin.succeed(`Forked ${source} to ${owner}/${repoName}`);
    return repoName;
  }

  return createFromTemplate(spin, owner, repoName, source);
}

export async function createGithubRepoFromClone(project) {
  section('GitHub repository');
  await ensureGithubLogin();
  const owner = await getGithubLogin();
  const requestedName = project.projectName;
  const repoName = await forkSourceRepo(owner, requestedName);

  const browserUrl = `https://github.com/${owner}/${repoName}`;
  const cloneUrl = `${browserUrl}.git`;
  await setOrigin(project, cloneUrl);
  kv('GitHub repo', browserUrl);
  return { owner, repoName, repoUrl: browserUrl };
}
