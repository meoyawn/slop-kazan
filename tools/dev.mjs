import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const software = args.includes('--software');
const child = spawn(process.execPath, [fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url)),
  ...args.filter((arg) => arg !== '--software')], {
  stdio: 'inherit',
  env: { ...process.env, KAZAN_SOFTWARE_PREVIEW: software ? '1' : '0' }
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', (code) => process.exit(code ?? 0));
