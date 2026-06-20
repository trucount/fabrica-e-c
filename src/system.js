import { spawn } from 'node:child_process';
import process from 'node:process';

function executable(command) {
  if (process.platform !== 'win32') return command;
  if (['npm', 'npx'].includes(command)) return `${command}.cmd`;
  return command;
}

function shouldUseShell(command) {
  if (process.platform !== 'win32') return false;
  // Only Windows command shims need a shell. Real executables such as git.exe
  // must keep shell:false so arguments containing spaces (for example
  // `-c user.name=Fabrica CLI`) are passed intact instead of being split by
  // cmd.exe.
  return ['npm', 'npx'].includes(command) || /\.(cmd|bat)$/i.test(command);
}

function spawnOptions(command, options = {}, stdio) {
  return {
    stdio,
    shell: shouldUseShell(command),
    cwd: options.cwd,
    env: options.env || process.env
  };
}

export function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable(command), args, spawnOptions(command, options, options.input ? ['pipe', 'inherit', 'inherit'] : 'inherit'));
    if (options.input) child.stdin.end(options.input);
    child.on('error', (error) => {
      if (options.allowFailure) resolve();
      else reject(error);
    });
    child.on('exit', (code) => code === 0 || options.allowFailure ? resolve() : reject(new Error(`${command} ${args.join(' ')} exited with ${code}`)));
  });
}

// Same as runCommand but captures stdout/stderr instead of inheriting the
// parent terminal. Used for silent checks (login status, version probes)
// where we don't want tool noise printed to the user. Never rejects on a
// non-zero exit code or missing binary; callers inspect `code`/`error`.
export function runCommandCapture(command, args, options = {}) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(executable(command), args, spawnOptions(command, options, 'pipe'));
      if (options.input) child.stdin.end(options.input);
    } catch (error) {
      resolve({ code: null, stdout: '', stderr: '', error });
      return;
    }
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk) => { stdout += chunk; });
    child.stderr?.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => resolve({ code: null, stdout, stderr, error }));
    child.on('exit', (code) => resolve({ code, stdout, stderr }));
  });
}

export function commandExists(command) {
  const probe = process.platform === 'win32' ? ['where', [command]] : ['which', [command]];
  return runCommandCapture(probe[0], probe[1]).then((result) => result.code === 0);
}

export async function openUrl(url) {
  if (process.platform === 'win32') {
    await runCommand('cmd', ['/c', 'start', '', url], { allowFailure: true });
    return;
  }
  const command = process.platform === 'darwin' ? 'open' : 'xdg-open';
  await runCommand(command, [url], { allowFailure: true });
}
