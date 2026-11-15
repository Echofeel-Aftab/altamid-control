/**
 * Hostinger Nest entry (must be .js). Boots the Control API via local tsx
 * (npx is often missing from the Node Web App PATH → spawn ENOENT).
 */
const { spawn } = require('child_process');
const { existsSync } = require('fs');
const { join } = require('path');

const apiDir = join(__dirname, 'apps', 'api');
const tsxCli = join(apiDir, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const tsxBin = join(apiDir, 'node_modules', '.bin', 'tsx');

let command;
let args;
if (existsSync(tsxCli)) {
  command = process.execPath;
  args = [tsxCli, 'src/main.ts'];
} else if (existsSync(tsxBin)) {
  command = tsxBin;
  args = ['src/main.ts'];
} else {
  console.error('tsx not found under apps/api/node_modules — run npm install');
  process.exit(1);
}

const child = spawn(command, args, {
  cwd: apiDir,
  stdio: 'inherit',
  env: process.env,
  shell: false,
});

child.on('error', (err) => {
  console.error('Failed to start Control API:', err.message);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code == null ? 1 : code);
});
