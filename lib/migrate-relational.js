import {readFile} from 'node:fs/promises';
import {isDeepStrictEqual} from 'node:util';
import {runSql} from './sql.js';
import {loadDocument,persistDocument} from './relational.js';

// Caller owns BEGIN/COMMIT. A failure rolls back schema, rows and the JSON drop.
export async function migrateRelational(client) {
  await client.query("SET LOCAL lock_timeout = '10s'");
  await client.query("SET LOCAL statement_timeout = '120s'");
  await client.query('LOCK TABLE public.app_document IN ACCESS EXCLUSIVE MODE');
  const {rows}=await client.query('SELECT revision,document FROM public.app_document WHERE id=1');
  if(rows.length!==1)throw new Error('Expected exactly one source document');
  const original=rows[0].document;
  const existing=(await client.query("SELECT to_regclass('public.app_meta') AS name")).rows[0].name;
  if(existing)throw new Error('Relational schema already exists; refusing to overwrite it');
  await runSql(client,await readFile(new URL('../sql/relational-schema.sql',import.meta.url),'utf8'));
  await client.query("SELECT set_config('stock.app_write','1',true)");
  await persistDocument(client,original);
  const restored=await loadDocument(client);
  if(!isDeepStrictEqual(restored,original)) {
    const differences=[];
    const compare=(a,b,path)=>{
      if(isDeepStrictEqual(a,b)||differences.length>=15)return;
      if(a&&b&&typeof a==='object'&&typeof b==='object') {
        for(const key of new Set([...Object.keys(a),...Object.keys(b)]))compare(a[key],b[key],path+'.'+key);
      } else differences.push(path+' ('+(a===null?'null':typeof a)+' -> '+(b===null?'null':typeof b)+')');
    };
    compare(original,restored,'document');
    throw new Error('Migration round-trip differs in: '+differences.join(', '));
  }
  await client.query('UPDATE public.app_meta SET revision=$1 WHERE id=1',[Number(rows[0].revision)+1]);
  await runSql(client,await readFile(new URL('../sql/relational-triggers.sql',import.meta.url),'utf8'));
  // Known reporting views are recreated from relational columns. RESTRICT makes
  // any unexpected dependency abort the transaction instead of losing objects.
  for(const name of ['export_cars','export_claims','export_audit'])await client.query('DROP VIEW IF EXISTS public.'+name);
  await runSql(client,await readFile(new URL('../sql/export-views.sql',import.meta.url),'utf8'));
  await client.query('DROP TABLE public.app_document RESTRICT');
  const jsonColumns=(await client.query("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND data_type IN ('json','jsonb')")).rows;
  if(jsonColumns.length)throw new Error('Unexpected remaining JSON storage columns');
  return {cars:restored.state.cars.length,claims:restored.state.otherClaims.length+restored.state.cars.reduce((n,c)=>n+c.claims.length,0),audit:restored.audit.length,credentials:Object.keys(restored.state.roleCredentials||{}).length,verified:'every field round-tripped',legacyDeleted:true};
}
