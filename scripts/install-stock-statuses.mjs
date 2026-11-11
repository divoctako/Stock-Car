import pg from 'pg';
import {readFile} from 'node:fs/promises';
import {runSql} from '../lib/sql.js';
if(!process.env.DATABASE_URL)throw new Error('Missing DATABASE_URL');
const client=new pg.Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:10000});
try {
 await client.connect();await client.query('BEGIN');
 await client.query("SET LOCAL lock_timeout='10s'");await client.query("SET LOCAL statement_timeout='60s'");
 await runSql(client,await readFile(new URL('../sql/custom-stock-statuses.sql',import.meta.url),'utf8'));
 const sql=await readFile(new URL('../sql/relational-triggers.sql',import.meta.url),'utf8');
 const start=sql.indexOf('CREATE OR REPLACE FUNCTION public.stock_row_rules()');
 const end=sql.indexOf('END $$;',start)+'END $$;'.length;
 if(start<0||end<=start)throw new Error('Missing stock row rules');
 await runSql(client,sql.slice(start,end));
 await client.query('COMMIT');console.log('Custom stock status constraints and SQL validation installed; vehicle data preserved');
} catch(error) {await client.query('ROLLBACK').catch(()=>{});console.error('Status schema upgrade rolled back:',error.message);process.exitCode=1;}
finally{await client.end();}
