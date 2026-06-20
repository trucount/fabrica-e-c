import process from 'node:process';
import boxen from 'boxen';

// ── color helpers (raw ANSI, no deps) ────────────────────────────────────────
const ESC = '\x1b[';
export const orange  = (t) => `${ESC}38;2;255;138;0m${t}${ESC}0m`;
export const dimOrange = (t) => `${ESC}38;2;182;95;0m${t}${ESC}0m`;
export const bold    = (t) => `${ESC}1m${t}${ESC}0m`;
export const red     = (t) => `${ESC}38;2;220;50;50m${t}${ESC}0m`;
export const dim     = (t) => `${ESC}2m${t}${ESC}0m`;
export const green   = (t) => `${ESC}38;2;80;200;80m${t}${ESC}0m`;

// ── boxen presets ─────────────────────────────────────────────────────────────
// Main section box — rounded corners, orange border
function sectionBox(content, title) {
  return boxen(content, {
    title: title ? bold(orange(title)) : undefined,
    titleAlignment: 'left',
    padding: { top: 0, bottom: 0, left: 1, right: 1 },
    margin: { top: 0, bottom: 0, left: 0, right: 0 },
    borderStyle: 'round',
    borderColor: '#ff8a00',
  });
}

// Sub-step box — single border, indented, dim orange or red
function subStepBox(content, isError = false) {
  return boxen(content, {
    padding: { top: 0, bottom: 0, left: 1, right: 1 },
    margin: { top: 0, bottom: 0, left: 4, right: 0 },
    borderStyle: 'single',
    borderColor: isError ? '#dc3232' : '#b65f00',
  });
}

// ── section tracking (connector │ lines between boxes) ───────────────────────
let _sectionCount = 0;
export function resetSectionCount() { _sectionCount = 0; }

export function section(title) {
  if (_sectionCount > 0) console.log(orange('  │'));
  _sectionCount++;
  console.log(sectionBox('', title));
}

// Print content in a section-style box (with optional title)
export function box(lines, title) {
  const content = lines.join('\n');
  console.log(sectionBox(content, title));
}

// Print a sub-step box (indented, for raw tool output)
export function subBox(lines, { isError = false } = {}) {
  if (!lines || !lines.length) return;
  const content = (isError ? lines.map((l) => red(l)) : lines.map((l) => dimOrange(l))).join('\n');
  console.log(subStepBox(content, isError));
}

// kv inside current flow
export function kv(key, value) {
  console.log(`  ${dimOrange('›')} ${bold(key)} ${dimOrange('→')} ${value}`);
}

// ── spinner ───────────────────────────────────────────────────────────────────
const CLEAR_LINE = '\x1b[K';
export function spinner(text) {
  process.stdout.write('  ' + dimOrange('○ ') + text);
  return {
    succeed(msg) { process.stdout.write(`\r${CLEAR_LINE}  ${orange('✓')} ${msg}\n`); },
    fail(msg)    { process.stdout.write(`\r${CLEAR_LINE}  ${red('✗')} ${msg}\n`); },
  };
}

// ── banner ────────────────────────────────────────────────────────────────────
export function banner() {
  _sectionCount = 0;
  const art = [
    '███████╗ █████╗ ██████╗ ██████╗ ██╗ ██████╗ █████╗ ',
    '██╔════╝██╔══██╗██╔══██╗██╔══██╗██║██╔════╝██╔══██╗',
    '█████╗  ███████║██████╔╝██████╔╝██║██║     ███████║',
    '██╔══╝  ██╔══██║██╔══██╗██╔══██╗██║██║     ██╔══██║',
    '██║     ██║  ██║██████╔╝██║  ██║██║╚██████╗██║  ██║',
    '╚═╝     ╚═╝  ╚═╝╚═════╝ ╚═╝  ╚═╝╚═╝ ╚═════╝╚═╝  ╚═╝',
  ].map((l) => orange(l)).join('\n');

  const subtitle = [
    dimOrange('CMD → OAUTH BRIDGE // SUPABASE + VERCEL DEPLOYER'),
    dim('by SPARROW AI SOLUTION'),
  ].join('\n');

  console.log(boxen(`${art}\n\n${subtitle}`, {
    padding: { top: 0, bottom: 0, left: 1, right: 1 },
    margin: { top: 0, bottom: 0, left: 0, right: 0 },
    borderStyle: 'double',
    borderColor: '#ff8a00',
  }));
}

// ── help ──────────────────────────────────────────────────────────────────────
export function help() {
  banner();
  const content = [
    bold(orange('Commands')),
    '',
    `  ${bold('build')}    Connect Supabase, collect secrets, deploy or run locally`,
    `  ${bold('list')}     Show Fabrica projects (local & cloud)`,
    `  ${bold('env')}      View and update environment variables for any project`,
    `  ${bold('rerun')}    Re-run or re-open an existing project`,
    `  ${bold('vins')}     Verify & auto-install CLI dependencies`,
    `  ${bold('info')}     Package, bridge, repo and storage info`,
    `  ${bold('help')}     Show this screen`,
    '',
    bold(orange('Examples')),
    '',
    `  ${dimOrange('$')} npx fabrica-e-commerce build`,
    `  ${dimOrange('$')} npx fabrica-e-commerce env`,
    `  ${dimOrange('$')} npx fabrica-e-commerce rerun`,
    `  ${dimOrange('$')} npx fabrica-e-commerce list`,
    '',
    dim('Creator: SPARROW AI SOLUTION'),
  ].join('\n');

  console.log(orange('  │'));
  console.log(sectionBox(content, 'Help'));
}
