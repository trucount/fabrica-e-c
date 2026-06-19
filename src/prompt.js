import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

export async function ask(message, defaultValue = '') {
  const rl = readline.createInterface({ input, output });
  const suffix = defaultValue ? ` (${defaultValue})` : '';
  const answer = await rl.question(`${message}${suffix}: `);
  rl.close();
  return answer || defaultValue;
}

export async function choose(message, choices) {
  console.log(message);
  choices.forEach((choice, index) => console.log(`  ${index + 1}. ${choice.name}`));
  const answer = Number(await ask('Select number', '1'));
  return choices[Math.max(0, Math.min(choices.length - 1, answer - 1))].value;
}
