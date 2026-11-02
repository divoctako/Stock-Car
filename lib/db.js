import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { loadDocument, persistDocument } from './relational.js';
import { runSql } from './sql.js';
import { initialState, mutate, snapshot, authorizeRole, AppError, validateConfig,applyOptionRenames } from './domain.js';

const { Pool } = pg;
let pool;
function getPool() {
  if (!process.env.DATABASE_URL) throw new AppError('ยังไม่ได้ตั้ง DATABASE_URL ของ Neon PostgreSQL ใน Vercel Production กรุณาตั้งค่าแล้ว Redeploy', 503, 'CONFIGURATION_ERROR');
  return pool ||= new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 5, idleTimeoutMillis: 10000, connectionTimeoutMillis: 10000 });
}
export function database() { return getPool(); }
async function relationalRequest(db,operation,payload={}) {
  const client=await db.connect();
  try {
    if(operation==='setup') {
      await client.query('BEGIN');
      // Existing JSON installations switch through the dedicated migration only.
      const legacy=(await client.query("SELECT to_regclass('public.app_document') AS name")).rows[0].name;
      const ready=(await client.query("SELECT to_regclass('public.app_meta') AS name")).rows[0].name;
      if(legacy && !ready) {await client.query('COMMIT');return {ok:true};}
      await runSql(client,await readFile(new URL('../sql/relational-schema.sql',import.meta.url),'utf8'));
      await client.query("SELECT set_config('stock.app_write','1',true)");
      const count=(await client.query('SELECT count(*) FROM public.app_values')).rows[0].count;
      if(Number(count)===0)await persistDocument(client,{state:payload.state||initialState(),audit:[],receipts:[],attempts:[]});
      await runSql(client,await readFile(new URL('../sql/relational-triggers.sql',import.meta.url),'utf8'));
      await client.query('COMMIT');return {ok:true};
    }
    const ready=(await client.query("SELECT to_regclass('public.app_meta') AS name")).rows[0].name;
    if(!ready)return await legacyRequest(client,operation,payload);
    await client.query(operation==='read'?'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY':'BEGIN');
    if(operation==='read') {
      const {rows}=await client.query('SELECT revision FROM public.app_meta WHERE id=1');
      const document=await loadDocument(client);
      await client.query('COMMIT');return {document,revision:Number(rows[0].revision)};
    }
    if(operation==='commit') {
      const {rows}=await client.query('SELECT revision FROM public.app_meta WHERE id=1 FOR UPDATE');
      if(Number(rows[0].revision)!==payload.revision)throw new AppError('ข้อมูลมีการเปลี่ยนแปลงพร้อมกัน กรุณาลองใหม่',409,'REVISION_CONFLICT');
      await client.query("SELECT set_config('stock.app_write','1',true)");
      const previous=await loadDocument(client);
      await persistDocument(client,payload.document,previous);
      const result=await client.query('UPDATE public.app_meta SET revision=revision+1,updated_at=now() WHERE id=1 RETURNING revision');
      await client.query('COMMIT');return {ok:true,revision:Number(result.rows[0].revision)};
    }
    throw new Error('Unknown database operation');
  } catch(error) {await client.query('ROLLBACK').catch(()=>{});throw error;}
  finally {client.release();}
}
async function request(db,operation,payload={}) {
  return db.request?db.request(operation,payload):relationalRequest(db,operation,payload);
}
// Temporary deployment compatibility: used only until the migration removes app_document.
async function legacyRequest(client,operation,payload) {
  if(operation==='read') {
    const {rows}=await client.query('SELECT revision,document FROM public.app_document WHERE id=1');
    return {document:rows[0].document,revision:Number(rows[0].revision)};
  }
  if(operation==='commit') {
    const {rows}=await client.query('UPDATE public.app_document SET document=$1,revision=revision+1,updated_at=now() WHERE id=1 AND revision=$2 RETURNING revision',[JSON.stringify(payload.document),payload.revision]);
    if(!rows[0])throw new AppError('ข้อมูลมีการเปลี่ยนแปลงพร้อมกัน กรุณาลองใหม่',409,'REVISION_CONFLICT');
    return {ok:true,revision:Number(rows[0].revision)};
  }
  throw new Error('Unknown legacy operation');
}
export async function setup(db = database()) { return request(db,'setup', { state: initialState() }); }
export async function readState(db = database()) { return (await request(db,'read')).document.state; }
export async function transact(change, db = database()) {
  for (let attempt = 0; attempt < 4; attempt++) { const { document, revision } = await request(db,'read'); const result = change(document); try { await request(db,'commit', { revision, document }); return result; } catch (error) { if (!['REVISION_CONFLICT','40001','40P01'].includes(error.code)) throw error; } }
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
export async function updateConfig(config,db=database()){return transact(document=>{const next=validateConfig(config,document.state.config);applyOptionRenames(document.state,document.state.config,next);document.state.config=next;document.state.configRevision=(document.state.configRevision||0)+1;},db);}
