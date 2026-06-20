const ESC = '\x1b[';
export const orange = (text) => `${ESC}38;2;255;138;0m${text}${ESC}0m`;
export const dimOrange = (text) => `${ESC}38;2;182;95;0m${text}${ESC}0m`;
export const bold = (text) => `${ESC}1m${text}${ESC}0m`;

export function banner() {
  console.log(orange(String.raw`
███████╗ █████╗ ██████╗ ██████╗ ██╗ ██████╗ █████╗ 
██╔════╝██╔══██╗██╔══██╗██╔══██╗██║██╔════╝██╔══██╗
█████╗  ███████║██████╔╝██████╔╝██║██║     ███████║
██╔══╝  ██╔══██║██╔══██╗██╔══██╗██║██║     ██╔══██║
██║     ██║  ██║██████╔╝██║  ██║██║╚██████╗██║  ██║
╚═╝     ╚═╝  ╚═╝╚═════╝ ╚═╝  ╚═╝╚═╝ ╚═════╝╚═╝  ╚═╝`));
  console.log(dimOrange('      CMD → OAUTH BRIDGE // SUPABASE + VERCEL DEPLOYER'));
  console.log(orange('──────────────────────────────────────────────────────'));
}
export function section(title) { console.log('\n' + orange(`◆ ${title}`)); }
export function kv(key, value) { console.log(`${dimOrange('>')} ${bold(key)} ${dimOrange('→')} ${value}`); }
// Clear the rest of the line (\x1b[K) before writing the final message so a
// shorter success/fail message never leaves leftover characters from the
// longer spinner text trailing after it (e.g. "✓ Git foundGit").
const CLEAR_LINE = '\x1b[K';
export function spinner(text) {
  process.stdout.write(dimOrange('> ') + text);
  return {
    succeed(msg) { process.stdout.write(`\r${CLEAR_LINE}${orange('✓')} ${msg}\n`); },
    fail(msg) { process.stdout.write(`\r${CLEAR_LINE}${orange('✗')} ${msg}\n`); }
  };
}
export function help() {
  banner();
  console.log(`
${orange('Commands')}
  ${bold('build')}      Connect Supabase, collect secrets, then run locally or deploy to Vercel
  ${bold('list')}       Show deployed Fabrica projects and edit env variables
  ${bold('vins')}       Verify CLI dependencies (git, gh, vercel) and auto-install anything missing
  ${bold('info')}       Show package, bridge, repo, and local storage information
  ${bold('help')}       Show this help screen

${orange('Examples')}
  npx fabrica-e-commerce build
  npx fabrica-e-commerce list
  npx fabrica-e-commerce vins
  npx fabrica-e-commerce info
`);
}
