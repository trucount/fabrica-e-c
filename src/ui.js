import process from 'node:process';
import boxen from 'boxen';

// ── colors ────────────────────────────────────────────────────────────────────
const ESC = '\x1b[';
export const orange    = (t) => `${ESC}38;2;255;138;0m${t}${ESC}0m`;
export const dimOrange = (t) => `${ESC}38;2;182;95;0m${t}${ESC}0m`;
export const bold      = (t) => `${ESC}1m${t}${ESC}0m`;
export const red       = (t) => `${ESC}38;2;220;50;50m${t}${ESC}0m`;
export const dim       = (t) => `${ESC}2m${t}${ESC}0m`;
export const green     = (t) => `${ESC}38;2;80;200;80m${t}${ESC}0m`;

// strip ANSI for length calculations
function stripAnsi(s) { return s.replace(/\x1b\[[0-9;]*m/g, ''); }

// ── section buffer ─────────────────────────────────────────────────────────────
// Each section accumulates lines, then flushes as ONE boxen box when the
// next section (or flushSection) is called.
let _currentTitle = null;
let _lines = [];          // raw strings (may contain ANSI)
let _sectionCount = 0;
let _isError = false;

function flushSection() {
  if (_currentTitle === null) return;

  const content = _lines.join('\n');
  const rendered = boxen(content || ' ', {
    title: bold(orange(_currentTitle)),
    titleAlignment: 'left',
    padding: { top: 0, bottom: 0, left: 1, right: 1 },
    margin: { top: 0, bottom: 0, left: 0, right: 0 },
    borderStyle: 'round',
    borderColor: '#ff8a00',
  });

  if (_sectionCount > 1) console.log(orange('  │'));
  console.log(rendered);

  _currentTitle = null;
  _lines = [];
  _isError = false;
}

// Add a line into the current section buffer
function addLine(text) {
  _lines.push(text);
}

export function resetSectionCount() {
  flushSection();
  _sectionCount = 0;
}

// ── public API ────────────────────────────────────────────────────────────────

// Start a new named section (flushes previous one)
export function section(title) {
  flushSection();
  _sectionCount++;
  _currentTitle = title;
  _lines = [];
}

// Force-flush the current section (call at end of a command)
export function endSections() {
  flushSection();
}

// kv row inside current section
export function kv(key, value) {
  addLine(`  ${dimOrange('›')} ${bold(key)} ${dimOrange('→')} ${value}`);
}

// spinner — writes inline to stdout while running, then adds result line to buffer
const CLEAR_LINE = '\x1b[K';
export function spinner(text) {
  process.stdout.write(`  ${dimOrange('○')} ${text}`);
  return {
    succeed(msg) {
      process.stdout.write(`\r${CLEAR_LINE}`);
      addLine(`  ${orange('✓')} ${msg}`);
    },
    fail(msg) {
      process.stdout.write(`\r${CLEAR_LINE}`);
      addLine(`  ${red('✗')} ${msg}`);
    },
  };
}

// plain log inside current section
export function log(text) {
  addLine(`  ${text}`);
}

// sub-step block (e.g. raw Vercel output) — indented, dimmer border
export function subBox(lines, { isError = false } = {}) {
  if (!lines || !lines.length) return;
  const colored = isError ? lines.map((l) => red(l)) : lines.map((l) => dimOrange(l));
  const content = colored.join('\n');
  const rendered = boxen(content, {
    padding: { top: 0, bottom: 0, left: 1, right: 1 },
    margin: { top: 0, bottom: 0, left: 2, right: 0 },
    borderStyle: 'single',
    borderColor: isError ? '#dc3232' : '#b65f00',
  });
  // add each rendered line into buffer so it stays inside the section box
  for (const line of rendered.split('\n')) addLine(line);
}

// ── banner ────────────────────────────────────────────────────────────────────
export function banner() {
  flushSection();
  _sectionCount = 0;
  _currentTitle = null;
  _lines = [];

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
  console.log(boxen(content, {
    title: bold(orange('Help')),
    titleAlignment: 'left',
    padding: { top: 0, bottom: 0, left: 1, right: 1 },
    borderStyle: 'round',
    borderColor: '#ff8a00',
  }));
}
