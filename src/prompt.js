import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { orange, dimOrange, bold } from './ui.js';

// Raw readline ask (no frills)
export async function ask(message, defaultValue = '') {
  const rl = readline.createInterface({ input, output });
  const suffix = defaultValue ? ` (${defaultValue})` : '';
  const answer = await rl.question(`  ${orange('?')} ${bold(message)}${dimOrange(suffix)}: `);
  rl.close();
  return answer.trim() || defaultValue;
}

// Arrow-key + Enter dropdown selector
export async function choose(message, choices) {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) {
      // Fallback for non-TTY (piped): numbered list
      console.log(`  ${orange('◆')} ${bold(message)}`);
      choices.forEach((choice, i) => console.log(`    ${dimOrange((i + 1) + '.')} ${choice.name}`));
      const rl = readline.createInterface({ input, output });
      rl.question(`  ${orange('?')} Select number (1): `, (answer) => {
        rl.close();
        const idx = Math.max(0, Math.min(choices.length - 1, (parseInt(answer, 10) || 1) - 1));
        resolve(choices[idx].value);
      });
      return;
    }

    const ESC = '\x1b[';
    let selected = 0;

    function render(first) {
      if (!first) {
        // Move up to redraw
        process.stdout.write(`\x1b[${choices.length + 1}A`);
      }
      console.log(`  ${orange('◆')} ${bold(message)}`);
      choices.forEach((choice, i) => {
        const cursor = i === selected ? orange('▶ ') : '  ';
        const label = i === selected ? bold(orange(choice.name)) : dimOrange(choice.name);
        console.log(`    ${cursor}${label}`);
      });
    }

    render(true);

    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    function onKey(key) {
      if (key === '\x1b[A' || key === '\x1b[D') { // up / left
        selected = (selected - 1 + choices.length) % choices.length;
        render(false);
      } else if (key === '\x1b[B' || key === '\x1b[C') { // down / right
        selected = (selected + 1) % choices.length;
        render(false);
      } else if (key === '\r' || key === '\n') {
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdin.removeListener('data', onKey);
        // print selected
        process.stdout.write(`\x1b[${choices.length + 1}A`);
        console.log(`  ${orange('◆')} ${bold(message)}`);
        choices.forEach((choice, i) => {
          if (i === selected) console.log(`    ${orange('▶ ')}${bold(orange(choice.name))}`);
          else console.log(`    ${dimOrange('  ' + choice.name)}`);
        });
        resolve(choices[selected].value);
      } else if (key === '\x03') { // Ctrl+C
        process.stdin.setRawMode(false);
        process.exit(0);
      }
    }

    process.stdin.on('data', onKey);
  });
}
