import { spawn } from 'node:child_process';
import process from 'node:process';

function executable(command) {
  if (process.platform !== 'win32') return command;
  if (['npm', 'npx'].includes(command)) return `${command}.cmd`;
  return command;
}

export function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable(command), args, {
      stdio: options.input ? ['pipe', 'inherit', 'inherit'] : 'inherit',
      shell: false,
      cwd: options.cwd
    });
    if (options.input) child.stdin.end(options.input);
    child.on('error', (error) => {
      if (options.allowFailure) resolve();
      else reject(error);
    });
    child.on('exit', (code) => code === 0 || options.allowFailure ? resolve() : reject(new Error(`${command} ${args.join(' ')} exited with ${code}`)));
  });
}

export async function openUrl(url) {
  if (process.platform === 'win32') {
    await runCommand('cmd', ['/c', 'start', '', url], { allowFailure: true });
    return;
  }
  const command = process.platform === 'darwin' ? 'open' : 'xdg-open';
  await runCommand(command, [url], { allowFailure: true });
}
