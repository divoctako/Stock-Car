import { readFile } from 'node:fs/promises';
import pg from 'pg';
import {runSql} from '../lib/sql.js';

if (!process.env.DATABASE_URL) throw new Error('Missing DATABASE_URL');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000 });
try {
  await client.connect();
  await client.query('BEGIN');
  await client.query("SET LOCAL lock_timeout = '5s'");
  await client.query("SET LOCAL statement_timeout = '30s'");
  await runSql(client,await readFile(new URL('../sql/export-views.sql', import.meta.url), 'utf8'));
  const { rows } = await client.query(`SELECT
    (SELECT count(*) FROM public.export_cars) AS cars,
    (SELECT count(*) FROM public.export_claims) AS claims,
    (SELECT count(*) FROM public.export_audit) AS audit,
    (SELECT count(*) FROM public.cars) AS source_cars`);
  if (rows.length !== 1 || Number(rows[0].cars) !== Number(rows[0].source_cars)) throw new Error('Export car count does not match source');
  await client.query('COMMIT');
  console.log('Export views created and verified:', JSON.stringify(rows[0]));
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('Export view setup failed:', error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}

