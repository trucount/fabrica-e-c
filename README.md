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

## Local project records

Deployment metadata is saved to `~/.fabrica-ecommerce/projects.json`. Secret values are not stored; only the variable names, project path, repo URL, created date, and Supabase URL are saved.

## Requirements

- Node.js 18.17+
- Git installed and available in PATH
- A Vercel account. The Vercel CLI will prompt/login when required.
