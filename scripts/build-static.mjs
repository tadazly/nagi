import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const nextCli = join(process.cwd(), 'node_modules', 'next', 'dist', 'bin', 'next');
const result = spawnSync(process.execPath, [nextCli, 'build'], {
  env: { ...process.env, NAGI_STATIC_EXPORT: '1' },
  stdio: 'inherit',
});

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
