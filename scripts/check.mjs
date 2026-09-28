import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
for (const dir of ['src', 'bin', 'scripts', 'test']) {
  for (const name of fs.readdirSync(dir).filter(x => x.endsWith('.mjs'))) {
    const result = spawnSync(process.execPath, ['--check', `${dir}/${name}`], { stdio: 'inherit' });
    if (result.status !== 0) process.exit(result.status || 1);
  }
}
console.log('Syntax checks passed.');
