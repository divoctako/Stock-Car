import {readFile,writeFile} from 'node:fs/promises';
import {setup,readState,updateConfig} from '../lib/db.js';
try {
 const command=process.argv[2];
 if(command==='setup'){await setup();console.log('PostgreSQL initialized; existing data preserved');}
 else if(command==='export'){const file=process.argv[3] || `backup-${Date.now()}.json`;await writeFile(file,JSON.stringify(await readState(),null,2),{flag:'wx'});console.log('Exported:',file);}
 else if(command==='config'){await updateConfig(JSON.parse(await readFile(process.argv[3] || 'config.example.json','utf8')));console.log('Configuration saved');}
 else throw Error('Use setup, export, or config');
} catch(error){console.error(error.message);process.exitCode=1;}

