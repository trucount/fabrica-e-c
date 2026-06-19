# @fabrica/e-commerce

Orange themed NPX CLI for launching a Fabrica e-commerce storefront from CMD or any terminal.

## Install / run

```bash
npx @fabrica/e-commerce help
npx @fabrica/e-commerce build
```

The package exposes both `fabrica` and `fabrica-e-commerce` binaries after global install.

```bash
npm install -g @fabrica/e-commerce
fabrica build
```


## Local NPX-style package test

Before publishing, test the package exactly like a fresh command-line install:

```bash
npm run build
npm pack --dry-run
npm exec --yes --package . -- fabrica help
npm exec --yes --package . -- fabrica info
```

You can also run the bundled pack test, which creates a real `.tgz` tarball and executes the installed binary from that tarball:

```bash
npm run test:pack
```

On Windows CMD, these commands do not require Unix tools such as `find` or `xargs`; the build script uses a Node.js checker instead.

## Commands

- `build` — creates a Fabrica Connect Supabase job, opens the OAuth bridge, asks for required secrets, clones `https://github.com/trucount/fabrica-final-e-c.git`, links a Vercel project, writes production environment variables, and deploys with `vercel --prod`.
- `list` — shows locally saved deployments and lets you replace a saved project's Vercel production environment variable, then redeploys.
- `info` / `.info` — prints package, bridge, repository, and local data paths.
- `help` — prints the command guide.

## Build flow

1. Posts the hidden schema/seed SQL to `https://sparrow-supabase-connect.lovable.app/api/public/jobs` using the configured bridge API key.
2. Opens the returned `connectUrl` in the browser and polls until `{ status: "done", url, anonKey }` is returned.
3. Prompts for user-owned secrets:
   - `RAZORPAY_KEY_ID`
   - `RAZORPAY_KEY_SECRET`
   - `OPENROUTER_API_KEY`
   - `UMAMI_WEBSITE_ID`
   - `UMAMI_API_KEY`
   - `SHIPPO_API_KEY`
4. Adds hardcoded values requested by the project:
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=0000`
   - `UMAMI_API_CLIENT_ENDPOINT=https://api.umami.is/v1`
   - `SUPABASE_SERVICE_ROLE_KEY=0000`
5. Adds `SUPABASE_URL` and `SUPABASE_ANON_KEY` from the bridge response.
6. Uses `npx vercel@latest link --yes --project <name>`, `vercel env add`, and `vercel --prod --yes` to deploy from the cloned repo.



## Windows Vercel command note

The CLI runs npm-launched commands through `npx.cmd` on Windows, so `npx vercel@latest ...` works from CMD and PowerShell instead of failing with `'vercel@latest' is not recognized`. If you still see Vercel login prompts, complete them in the browser and rerun the command.

## Automatic npm publishing from GitHub

The repository includes a GitHub Actions workflow at `.github/workflows/npm-publish.yml` that verifies the CLI and publishes it to npm on pushes to `main`, `master`, or `work`, and can also be started manually from the Actions tab.

Before the workflow can publish, add an npm automation token to your GitHub repository secrets:

1. Create an npm token with publish permissions from your npm account.
2. In GitHub, open **Settings → Secrets and variables → Actions**.
3. Add a repository secret named `NPM_TOKEN` with that npm token.

On every publish run, the workflow:

1. Runs `npm run build`.
2. Runs `npm run test:cli`.
3. Runs `npm run test:pack`.
4. Checks the current latest version on npm and bumps `package.json` to the next patch version when needed.
5. Runs `npm publish --access public --provenance`.
6. Commits the published version back to GitHub with `[skip npm-publish]` to avoid an infinite publish loop.

For scoped packages like `@fabrica/e-commerce`, `--access public` is required when publishing a public package to npm.

## Local project records

Deployment metadata is saved to `~/.fabrica-ecommerce/projects.json`. Secret values are not stored; only the variable names, project path, repo URL, created date, and Supabase URL are saved.

## Requirements

- Node.js 18.17+
- Git installed and available in PATH
- A Vercel account. The Vercel CLI will prompt/login when required.
