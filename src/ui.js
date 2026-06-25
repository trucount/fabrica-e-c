import process from 'node:process';
import boxen from 'boxen';
import chalk from 'chalk';
import gradient from 'gradient-string';
import figures from 'figures';

// ── palette ───────────────────────────────────────────────────────────────────
export const orange    = (t) => chalk.hex('#ff8a00')(t);
export const dimOrange = (t) => chalk.hex('#b65f00')(t);
export const bold      = (t) => chalk.bold(t);
export const red       = (t) => chalk.hex('#dc3232')(t);
export const dim       = (t) => chalk.dim(t);
export const green     = (t) => chalk.hex('#50c850')(t);
export const cyan      = (t) => chalk.hex('#00c8ff')(t);
export const yellow    = (t) => chalk.hex('#ffc846')(t);
export const gray      = (t) => chalk.hex('#888888')(t);
export const white     = (t) => chalk.white(t);

function stripAnsi(s) { return s.replace(/\x1b\[[0-9;]*m/g, ''); }

// ── section buffer ─────────────────────────────────────────────────────────────
let _currentTitle = null;
let _lines = [];
let _sectionCount = 0;

function flushSection() {
  if (_currentTitle === null) return;
  const content = _lines.join('\n');
  const rendered = boxen(content || ' ', {
    title: ` ${bold(orange(_currentTitle))} `,
    titleAlignment: 'left',
    padding: { top: 0, bottom: 0, left: 2, right: 2 },
    margin: { top: 0, bottom: 0, left: 0, right: 0 },
    borderStyle: 'round',
    borderColor: '#ff8a00',
  });
  if (_sectionCount > 1) console.log(dimOrange('  │'));
  console.log(rendered);
  _currentTitle = null;
  _lines = [];
}

function addLine(text) { _lines.push(text); }

export function resetSectionCount() { flushSection(); _sectionCount = 0; }

export function section(title) {
  flushSection();
  _sectionCount++;
  _currentTitle = title;
  _lines = [];
}

export function endSections() { flushSection(); }

export function kv(key, value) {
  const k = bold(orange(key));
  const arrow = dimOrange(figures.arrowRight);
  const v = typeof value === 'string' && value.startsWith('http')
    ? cyan(value)
    : white(String(value));
  addLine(`   ${dimOrange(figures.pointer)} ${k} ${arrow} ${v}`);
}

export function kvSuccess(key, value) {
  addLine(`   ${green(figures.tick)} ${bold(white(key))} ${dimOrange(figures.arrowRight)} ${green(String(value))}`);
}

export function kvFail(key, value) {
  addLine(`   ${red(figures.cross)} ${bold(key)} ${dimOrange(figures.arrowRight)} ${red(String(value))}`);
}

export function kvPending(key, value) {
  addLine(`   ${dimOrange(figures.bullet)} ${bold(dimOrange(key))} ${dimOrange(figures.arrowRight)} ${dim(String(value))}`);
}

// spinner — inline stdout, then adds result line to buffer
const CLEAR_LINE = '\x1b[K';
export function spinner(text) {
  process.stdout.write(`   ${dimOrange(figures.ellipsis)} ${dim(text)}`);
  return {
    succeed(msg) {
      process.stdout.write(`\r${CLEAR_LINE}`);
      addLine(`   ${green(figures.tick)} ${white(msg)}`);
    },
    fail(msg) {
      process.stdout.write(`\r${CLEAR_LINE}`);
      addLine(`   ${red(figures.cross)} ${msg}`);
    },
  };
}

export function log(text)     { addLine(`   ${dimOrange(figures.line)} ${text}`); }
export function logInfo(text) { addLine(`   ${cyan(figures.info)} ${cyan(text)}`); }
export function logWarn(text) { addLine(`   ${yellow(figures.warning)} ${yellow(text)}`); }
export function logSuccess(text) { addLine(`   ${green(figures.tick)} ${green(text)}`); }

// Prints immediately to the terminal instead of buffering into the current
// section box. Use for time-sensitive messages (e.g. a URL the user needs to
// see right now, before a long-running wait) that would otherwise stay
// invisible until the section flushes.
export function logLive(text) { console.log(`   ${cyan(figures.line)} ${text}`); }

export function divider() { addLine(`   ${dimOrange('─'.repeat(50))}`); }

// sub-step block
export function subBox(lines, { isError = false } = {}) {
  if (!lines || !lines.length) return;
  const colored = isError ? lines.map((l) => red(l)) : lines.map((l) => dim(l));
  const content = colored.join('\n');
  const rendered = boxen(content, {
    padding: { top: 0, bottom: 0, left: 2, right: 2 },
    margin: { top: 0, bottom: 0, left: 3, right: 0 },
    borderStyle: 'single',
    borderColor: isError ? '#dc3232' : '#b65f00',
  });
  for (const line of rendered.split('\n')) addLine(line);
}

// ── banner ────────────────────────────────────────────────────────────────────
export function banner() {
  flushSection();
  _sectionCount = 0;
  _currentTitle = null;
  _lines = [];

  const art = [
    '███████╗ █████╗ ██████╗ ██████╗ ██╗ ██████╗ █████╗',
    '██╔════╝██╔══██╗██╔══██╗██╔══██╗██║██╔════╝██╔══██╗',
    '█████╗  ███████║██████╔╝██████╔╝██║██║     ███████║',
    '██╔══╝  ██╔══██║██╔══██╗██╔══██╗██║██║     ██╔══██║',
    '██║     ██║  ██║██████╔╝██║  ██║██║╚██████╗██║  ██║',
    '╚═╝     ╚═╝  ╚═╝╚═════╝ ╚═╝  ╚═╝╚═╝ ╚═════╝╚═╝  ╚═╝',
  ];

  const gradientArt = gradient(['#ff8a00', '#ff4500', '#ff8a00'])(art.join('\n'));

  const subtitle = [
    cyan('  Supabase + Vercel   ·   Deploy in minutes'),
    dim('           by SPARROW AI SOLUTION'),
  ].join('\n');

  console.log(boxen(`${gradientArt}\n\n${subtitle}`, {
    padding: { top: 1, bottom: 1, left: 3, right: 3 },
    borderStyle: 'double',
    borderColor: '#ff8a00',
    textAlignment: 'center',
  }));
}

// ── help ──────────────────────────────────────────────────────────────────────
export function help() {
  banner();

  const commands = [
    { cmd: 'build',  desc: 'Connect Supabase · collect secrets · deploy or run locally' },
    { cmd: 'list',   desc: 'Show all Fabrica projects (local & cloud)'                  },
    { cmd: 'env',    desc: 'View and update environment variables for any project'      },
    { cmd: 'rerun',  desc: 'Re-run or re-open an existing project'                      },
    { cmd: 'vins',   desc: 'Verify & auto-install CLI deps (git, gh, vercel)'           },
    { cmd: 'clean',  desc: 'Clean data, env files, or logout from Vercel / GitHub'      },
    { cmd: 'info',   desc: 'Package, bridge, repo and storage info'                     },
    { cmd: 'help',   desc: 'Show this help screen'                                      },
  ];

  const cmdRows = commands.map(({ cmd, desc }) =>
    `   ${dimOrange(figures.pointer)} ${bold(orange(cmd.padEnd(10)))}  ${dim(desc)}`
  ).join('\n');

  const examples = [
    `   ${dimOrange('$')} ${cyan('npx fabrica-e-commerce build')}   ${dim('# start a new store')}`,
    `   ${dimOrange('$')} ${cyan('npx fabrica-e-commerce vins')}    ${dim('# check dependencies')}`,
    `   ${dimOrange('$')} ${cyan('npx fabrica-e-commerce list')}    ${dim('# see all projects')}`,
    `   ${dimOrange('$')} ${cyan('npx fabrica-e-commerce rerun')}   ${dim('# open existing project')}`,
    `   ${dimOrange('$')} ${cyan('npx fabrica-e-commerce env')}     ${dim('# update env variables')}`,
    `   ${dimOrange('$')} ${cyan('npx fabrica-e-commerce clean')}   ${dim('# clean up data / logout')}`,
  ].join('\n');

  const content = [
    bold(orange(' Commands')),
    dimOrange('  ' + '─'.repeat(60)),
    '',
    cmdRows,
    '',
    bold(orange(' Examples')),
    dimOrange('  ' + '─'.repeat(60)),
    '',
    examples,
    '',
    dimOrange('  ' + '─'.repeat(60)),
    dim(`   Creator: SPARROW AI SOLUTION   ·   MIT License   ·   v${process.env.npm_package_version || ''}`),
  ].join('\n');

  console.log(dimOrange('  │'));
  console.log(boxen(content, {
    title: ` ${bold(orange('Help & Commands'))} `,
    titleAlignment: 'left',
    padding: { top: 1, bottom: 1, left: 1, right: 2 },
    borderStyle: 'round',
    borderColor: '#ff8a00',
  }));
}

// ── step progress ─────────────────────────────────────────────────────────────
export function stepHeader(step, total, title) {
  endSections();
  const pill = chalk.bgHex('#ff8a00').black(` ${step}/${total} `);
  const line = `${pill} ${bold(white(title))}`;
  const bar = dimOrange('─'.repeat(Math.max(0, 52 - stripAnsi(title).length - 6)));
  console.log(`\n  ${dimOrange(figures.arrowRight)} ${line}  ${bar}`);
}
