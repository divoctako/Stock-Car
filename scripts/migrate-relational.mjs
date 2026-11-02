import pg from 'pg';
import {migrateRelational} from '../lib/migrate-relational.js';
const mode=process.argv[2];
if(!['dry-run','apply'].includes(mode))throw new Error('Use dry-run or apply');
if(!process.env.DATABASE_URL)throw new Error('Missing DATABASE_URL');
const client=new pg.Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:10000});
try {
  await client.connect();await client.query('BEGIN');
  const report=await migrateRelational(client);
  await client.query(mode==='apply'?'COMMIT':'ROLLBACK');
  console.log(JSON.stringify({mode,...report,committed:mode==='apply'}));
} catch(error) {
  await client.query('ROLLBACK').catch(()=>{});
  console.error('Migration rolled back:',error.message||error.code||'Connection failed');process.exitCode=1;
} finally {await client.end();}
