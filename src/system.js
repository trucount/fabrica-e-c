import { spawn } from 'node:child_process';
import process from 'node:process';
export function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: options.input ? ['pipe', 'inherit', 'inherit'] : 'inherit', shell: process.platform === 'win32', cwd: options.cwd });
    if (options.input) child.stdin.end(options.input);
    child.on('exit', (code) => code === 0 || options.allowFailure ? resolve() : reject(new Error(`${command} ${args.join(' ')} exited with ${code}`)));
  });
}
export async function openUrl(url) {
  const command = process.platform === 'win32' ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  await runCommand(command, args, { allowFailure: true });
}
