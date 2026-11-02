import { readFile, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
for (const dir of ['api', 'lib', 'public']) {
  for (const file of await readdir(dir)) if (file.endsWith('.js')) execFileSync(process.execPath, ['--check', `${dir}/${file}`]);
}
const html = await readFile('public/index.html', 'utf8');
const app = await readFile('public/app.js', 'utf8');
if (/script\.google\.com|google\.script|GAS_URL|gasJsonp|Code\.gs/.test(html + app)) throw new Error('Legacy backend reference found');
console.log('Syntax and Vercel native frontend checks passed');
