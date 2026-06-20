# fabrica-e-commerce

Orange-themed NPX CLI for launching a Fabrica e-commerce storefront (Supabase + Vercel + Next.js) from any terminal — Windows, macOS, Linux, and Termux (no root required).

## Quick start

```bash
npx fabrica-e-commerce build
```

Or install globally:

```bash
npm install -g fabrica-e-commerce
fabrica build
```

Both `fabrica` and `fabrica-e-commerce` binaries are available after a global install.

---

## Commands

| Command | Description |
|---------|-------------|
| `build` | Full deploy wizard — Supabase → secrets → admin password → clone → Vercel or local |
| `list`  | Show all projects and view details |
| `env`   | Update environment variables for any project |
| `rerun` | Re-open or restart an existing project |
| `vins`  | Verify and auto-install CLI dependencies (git, gh, vercel) |
| `clean` | Remove local data, env files, or logout from Vercel / GitHub |
| `info`  | Package, bridge, repo, and storage info |
| `help`  | Show the command guide |

---

## Build flow (6 steps)

### Step 1 — Dependency check
Verifies `git` is installed. Auto-installs it if missing.

### Step 2 — Supabase connect
Posts your schema/seed SQL to the Fabrica bridge (`sparrow-supabase-connect.lovable.app`), opens the OAuth connect URL in your browser, and polls until the Supabase project is provisioned and returns `{ url, anonKey }`.

### Step 3 — Environment variables
Prompts for your API keys:

| Variable | Purpose |
|----------|---------|
| `RAZORPAY_KEY_ID` | Razorpay payment key ID |
| `RAZORPAY_KEY_SECRET` | Razorpay payment secret |
| `OPENROUTER_API_KEY` | OpenRouter AI API key |
| `UMAMI_WEBSITE_ID` | Umami analytics website ID |
| `UMAMI_API_KEY` | Umami analytics API key |
| `SHIPPO_API_KEY` | Shippo shipping API key |

`SUPABASE_URL` and `SUPABASE_ANON_KEY` are filled automatically from the bridge response.

### Step 4 — Admin password
Prompts for a password to protect your store's admin and edit panel. Stored as the `PASS` environment variable.

### Step 5 — Clone storefront
Clones `https://github.com/trucount/fabrica-final-e-c.git` into a local builds directory. Asks for a project name (used as the Vercel project name).

### Step 6 — Deploy target
Choose how to run your store:

**Local mode**
- Writes all collected variables to `.env.local` inside the cloned app.
- Runs `pnpm install` (or `npm install`) and starts the Next.js dev server at `http://localhost:3000`.

**Vercel cloud mode**
- Checks and installs `gh` (GitHub CLI) and `vercel` CLI if missing.
- Logs in to Vercel interactively if needed.
- Logs in to GitHub CLI if needed and forks the storefront to a new user-owned repo.
- Links a new Vercel project and connects it to the GitHub repo for auto-deploys.
- Writes every environment variable to **production, preview, and development** environments with `vercel env add`.
- Deploys with `vercel --prod`.

---

## Dependency installer (`vins`)

`vins` checks for `git`, `gh`, and the Vercel CLI and auto-installs anything missing — **no root or admin required** on any platform.

```bash
npx fabrica-e-commerce vins
```

| Platform | Install strategy |
|----------|-----------------|
| **Termux** | `pkg install` — no root needed |
| **Linux (no root)** | Homebrew/Linuxbrew → system pkg manager (tries without sudo first) → conda/mamba → binary download from GitHub releases |
| **Linux (with sudo)** | apt-get / dnf / yum / pacman / zypper / apk |
| **macOS** | `brew install` → auto-installs Homebrew if missing → binary download |
| **Windows (no admin)** | `winget --scope user` → auto-installs Scoop → `scoop install` → Chocolatey |

If a tool still can't be installed automatically, `vins` prints the correct manual install command for your platform and exits with a non-zero status.

---

## Managing projects

### `list`
Shows all projects saved locally with their type (local/cloud), creation date, GitHub repo, Supabase URL, and live URL.

### `env`
Lets you update any environment variable for a saved project. For local projects it rewrites `.env.local`. For cloud projects it updates Vercel (production, preview, development) and triggers a redeploy.

### `rerun`
- **Local projects** — restarts the dev server at `http://localhost:3000`.
- **Cloud projects** — opens the production URL in your browser.

### `clean`
Offers four modes: delete local project records, wipe env files, logout from Vercel, logout from GitHub, or a full reset of all of the above.

---

## Local project records

Deployment metadata is saved to `~/.fabrica-ecommerce/projects.json`. Secret values are **not** stored — only variable names, project path, repo URL, creation date, and Supabase URL are recorded.

---

## Requirements

- **Node.js 18.17+**
- **Git** — run `npx fabrica-e-commerce vins` to auto-install
- **GitHub CLI (`gh`)** — run `vins` to auto-install; interactive login handled by `build`
- **Vercel account** — login is handled interactively by `build` if needed
- A **Supabase** account connected via the Fabrica bridge

---

## Automatic npm publishing (GitHub Actions)

The workflow at `.github/workflows/npm-publish.yml` verifies and publishes to npm on every push to `main`, `master`, or `work`, and can be triggered manually from the Actions tab.

**Setup — add your npm token once:**
1. Create an npm token with publish permissions.
2. In GitHub go to **Settings → Secrets and variables → Actions**.
3. Add a secret named `NPM_TOKEN`.

**What the workflow does on each run:**
1. Upgrades npm to the latest version (avoids bundled-npm bugs on GitHub runners).
2. Runs `npm install`, `npm run build`, `npm run test:cli`, `npm run test:pack`.
3. Bumps `package.json` to the next patch version if the current version is already published.
4. Publishes with `npm publish --access public --provenance`.
5. Commits the bumped version back to GitHub with `[skip npm-publish]` to prevent an infinite loop.

> The `repository.url` in `package.json` must match the GitHub repo used by the workflow — npm uses it to verify the provenance bundle.

---

## Windows notes

The CLI spawns npm commands through `npx.cmd` on Windows so `npx vercel@latest ...` works correctly from CMD and PowerShell. If you see a Vercel login prompt, complete it in your browser and the CLI will continue automatically.
