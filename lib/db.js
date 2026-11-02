import pg from 'pg';
import { initialState, mutate, snapshot, authorizeRole, AppError, validateConfig } from './domain.js';

const { Pool } = pg;
let pool;
function getPool() {
  if (!process.env.DATABASE_URL) throw new Error('กรุณาตั้ง DATABASE_URL ของ Neon PostgreSQL');
  return pool ||= new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 5, idleTimeoutMillis: 10000, connectionTimeoutMillis: 10000 });
}
export function database() { return { request: postgresRequest }; }
async function postgresRequest(operation, payload = {}) {
  const db = getPool();
  if (operation === 'setup') {
    await db.query(`CREATE TABLE IF NOT EXISTS app_document (id smallint PRIMARY KEY CHECK (id=1), revision bigint NOT NULL DEFAULT 1, document jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`);
    await db.query('INSERT INTO app_document(id, document) VALUES(1, $1) ON CONFLICT(id) DO NOTHING', [JSON.stringify({ state: payload.state || initialState(), audit: [], receipts: [], attempts: [] })]);
    return { ok: true };
  }
  const client = await db.connect();
  try {
    if (operation === 'read') { const { rows } = await client.query('SELECT revision, document FROM app_document WHERE id=1'); if (!rows[0]) throw new Error('ฐานข้อมูลยังไม่พร้อม กรุณารัน npm run db:setup'); return { document: rows[0].document, revision: Number(rows[0].revision) }; }
    if (operation === 'commit') {
      const { rows } = await client.query('UPDATE app_document SET document=$1, revision=revision+1, updated_at=now() WHERE id=1 AND revision=$2 RETURNING revision', [JSON.stringify(payload.document), payload.revision]);
      if (!rows[0]) throw new AppError('ข้อมูลมีการเปลี่ยนแปลงพร้อมกัน กรุณาลองใหม่',409,'REVISION_CONFLICT'); return { ok: true, revision: Number(rows[0].revision) };
    }
    throw new Error('Unknown database operation');
  } finally { client.release(); }
}
export async function setup(db = database()) { return db.request('setup', { state: initialState() }); }
export async function readState(db = database()) { return (await db.request('read')).document.state; }
export async function transact(change, db = database()) {
  for (let attempt = 0; attempt < 4; attempt++) { const { document, revision } = await db.request('read'); const result = change(document); try { await db.request('commit', { revision, document }); return result; } catch (error) { if (error.code !== 'REVISION_CONFLICT') throw error; } }
  throw new AppError('ข้อมูลมีการเปลี่ยนแปลงพร้อมกัน กรุณาลองใหม่', 409, 'CONFLICT');
}
export async function executeWrite(body, fingerprint, db = database()) {
  return transact(document => { const state=document.state; if(body._session)authorizeRole(state,body._session,body); const previous=document.receipts.find(item=>item.requestId===body.requestId); let message;
    if(previous){if(previous.fingerprint!==fingerprint)throw new AppError('requestId นี้ถูกใช้กับข้อมูลอื่นแล้ว',409,'CONFLICT');message=previous.message;}
    else {const outcome=mutate(state,body);message=outcome.message;const timestamp=new Date().toISOString();document.receipts.push({requestId:body.requestId,fingerprint,message,timestamp});document.audit.push({role:body._session?.role||body.role||'admin',action:body.action,carId:outcome.carId,requestId:body.requestId,timestamp});}
    return snapshot(state,message,body._session?.role||'admin');
  },db);
}
export async function reserveLoginAttempt(key,db=database()){return transact(document=>{const now=Date.now();document.attempts=document.attempts.filter(item=>now-item.firstAt<600000);let item=document.attempts.find(item=>item.key===key);if(!item){item={key,count:0,firstAt:now};document.attempts.push(item);}return ++item.count<=8;},db);}
export async function clearLoginAttempts(key,db=database()){return transact(document=>{document.attempts=document.attempts.filter(item=>item.key!==key);},db);}
export async function updateConfig(config,db=database()){return transact(document=>{document.state.config=validateConfig(config,document.state.config);document.state.configRevision=(document.state.configRevision||0)+1;},db);}
