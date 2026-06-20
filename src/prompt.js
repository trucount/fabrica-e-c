import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { orange, dimOrange, bold, dim, green, cyan } from './ui.js';

export async function ask(message, defaultValue = '') {
  const rl = readline.createInterface({ input, output });
  const suffix = defaultValue ? dim(` (${defaultValue})`) : '';
  const answer = await rl.question(`  ${orange('?')} ${bold(message)}${suffix}: `);
  rl.close();
  return answer.trim() || defaultValue;
}

export async function askPassword(message) {
  return new Promise((resolve) => {
    process.stdout.write(`  ${orange('🔒')} ${bold(message)}: `);

    if (!process.stdin.isTTY) {
      const rl = readline.createInterface({ input, output });
      rl.question('', (answer) => {
        rl.close();
        resolve(answer.trim());
      });
      return;
    }

    let password = '';
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    function onKey(key) {
      if (key === '\r' || key === '\n') {
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdin.removeListener('data', onKey);
        process.stdout.write('\n');
        resolve(password);
      } else if (key === '\u007f' || key === '\b') {
        if (password.length > 0) {
          password = password.slice(0, -1);
          process.stdout.write('\b \b');
        }
      } else if (key === '\x03') {
        process.stdin.setRawMode(false);
        process.exit(0);
      } else {
        password += key;
        process.stdout.write(dim('•'));
      }
    }

    process.stdin.on('data', onKey);
  });
}

export async function choose(message, choices) {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) {
      console.log(`\n  ${orange('◆')} ${bold(message)}`);
      choices.forEach((choice, i) =>
        console.log(`    ${dimOrange((i + 1) + '.')} ${choice.name}`)
      );
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
      if (!first) process.stdout.write(`\x1b[${choices.length + 1}A`);
      console.log(`\n  ${orange('◆')} ${bold(message)}`);
      choices.forEach((choice, i) => {
        const cursor = i === selected ? orange('▶ ') : '  ';
        const label  = i === selected ? bold(orange(choice.name)) : dimOrange(choice.name);
        console.log(`    ${cursor}${label}`);
      });
    }

    render(true);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    function onKey(key) {
      if (key === '\x1b[A' || key === '\x1b[D') {
        selected = (selected - 1 + choices.length) % choices.length;
        render(false);
      } else if (key === '\x1b[B' || key === '\x1b[C') {
        selected = (selected + 1) % choices.length;
        render(false);
      } else if (key === '\r' || key === '\n') {
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdin.removeListener('data', onKey);
        process.stdout.write(`\x1b[${choices.length + 1}A`);
        console.log(`\n  ${orange('◆')} ${bold(message)}`);
        choices.forEach((choice, i) => {
          if (i === selected) console.log(`    ${green('▶ ')}${bold(green(choice.name))}`);
          else                console.log(`    ${dimOrange('  ' + choice.name)}`);
        });
        resolve(choices[selected].value);
      } else if (key === '\x03') {
        process.stdin.setRawMode(false);
        process.exit(0);
      }
    }

    process.stdin.on('data', onKey);
  });
}
