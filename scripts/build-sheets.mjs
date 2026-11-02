import {readFile,writeFile} from 'node:fs/promises';
const gateway=await readFile(new URL('../google-sheets/Gateway.gs',import.meta.url),'utf8');
const codec=(await readFile(new URL('../lib/sheet-tables.js',import.meta.url),'utf8')).replaceAll('export function ','function ');
await writeFile(new URL('../google-sheets/Code.gs',import.meta.url),gateway+'\n'+codec);
console.log('Built google-sheets/Code.gs');
