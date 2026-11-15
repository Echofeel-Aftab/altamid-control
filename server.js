/**
 * Hostinger Nest entry (must be .js). Boots the Control API via tsx.
 */
const { spawn } = require('child_process');
const { join } = require('path');

const apiDir = join(__dirname, 'apps', 'api');
const child = spawn(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['tsx', 'src/main.ts'],
  { cwd: apiDir, stdio: 'inherit', env: process.env, shell: false },
);

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code == null ? 1 : code);
});
