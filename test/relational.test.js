import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {setup,readState,executeWrite} from '../lib/db.js';
import {loadDocument} from '../lib/relational.js';
import {migrateRelational} from '../lib/migrate-relational.js';
import {initialState} from '../lib/domain.js';
const adapter=pg=>({query:(...a)=>pg.query(...a),connect:async()=>({query:(...a)=>pg.query(...a),release(){}})});

test('SQL edits round-trip, option renames cascade, claim edits reset inspection, deletes cascade and audit survives',async()=>{
 const pg=new PGlite(),db=adapter(pg);
 try {
  await setup(db);
  await executeWrite({action:'addCar',payload:{vin:'000SQLVIN',model:'Stock Atto 3',color:'ขาว',location:'ไม่ระบุ Location',submodel:'A',buyPrice:10},requestId:'sql-test-add'},'add',db);
  await pg.query("INSERT INTO claims(car_id,detail,amount,amount_received,date_received) VALUES(1,'ทดสอบ',100,100,'2026-11-02')");
  await pg.query('UPDATE cars SET inspected=true WHERE id=1');
  await pg.query("UPDATE claims SET detail='แก้ผ่าน SQL' WHERE car_id=1");
  let state=await readState(db);assert.equal(state.cars[0].inspected,false);assert.equal(state.cars[0].claims[0].detail,'แก้ผ่าน SQL');
  await pg.query("UPDATE app_options SET value='ขาวมุก' WHERE option_group='colors' AND value='ขาว'");
  state=await readState(db);assert.equal(state.cars[0].color,'ขาวมุก');assert.ok(state.config.colors.includes('ขาวมุก'));
  await executeWrite({action:'updateCar',carId:1,payload:{...state.cars[0],submodel:'B'},requestId:'sql-test-update'},'update',db);
  state=await readState(db);assert.equal(state.cars[0].color,'ขาวมุก');assert.equal(state.cars[0].claims[0].detail,'แก้ผ่าน SQL');
  await pg.query('DELETE FROM cars WHERE id=1');
  assert.equal((await pg.query('SELECT count(*) FROM claims')).rows[0].count,0);
  assert.ok((await pg.query("SELECT * FROM audit_log WHERE action='sql:delete:cars'")).rows.length);
  await assert.rejects(pg.query('TRUNCATE cars CASCADE'),/Use DELETE/);
  await pg.query("INSERT INTO cars(vin,status) VALUES('SECOND','Available')");
  assert.equal(Number((await pg.query('SELECT id FROM cars')).rows[0].id),2,'deleted IDs are not reused');
  await assert.rejects(pg.query("INSERT INTO cars(vin,status) VALUES('second','Available')"),/unique/);
 } finally {await pg.close();}
});

test('app settings rename propagates to cars while reordering keeps labels',async()=>{
 const pg=new PGlite(),db=adapter(pg);
 try {
  await setup(db);
  await executeWrite({action:'addCar',payload:{vin:'RENAME',model:'Stock Atto 3',color:'ขาว',submodel:'A',buyPrice:10},requestId:'rename-add'},'a',db);
  let state=await readState(db);let config=structuredClone(state.config);config.colors[0]='ขาวมุก';config.colorHex['ขาวมุก']='#ffffff';
  await executeWrite({action:'saveConfig',role:'admin',payload:{config,expectedRevision:0},requestId:'rename-config'},'b',db);
  state=await readState(db);assert.equal(state.cars[0].color,'ขาวมุก');config=structuredClone(state.config);config.colors.reverse();
  await executeWrite({action:'saveConfig',role:'admin',payload:{config,expectedRevision:1},requestId:'reorder-config'},'c',db);
  assert.equal((await readState(db)).cars[0].color,'ขาวมุก');
 } finally {await pg.close();}
});

test('an SQL write between app read and commit forces retry and preserves the SQL changes',async()=>{
 const pg=new PGlite(),db=adapter(pg);
 try {
  await setup(db);
  await executeWrite({action:'addCar',payload:{vin:'RACE',model:'Stock Atto 3',color:'ขาว',submodel:'A',buyPrice:10},requestId:'race-add'},'a',db);
  let connections=0;
  const racing={...db,connect:async()=>{
    if(++connections===2)await pg.query("UPDATE cars SET battery_number='000MANUAL' WHERE id=1");
    return db.connect();
  }};
  await executeWrite({action:'addVehicleClaim',carId:1,payload:{detail:'เคลม',amount:100},requestId:'race-claim'},'b',racing);
  const car=(await readState(db)).cars[0];
  assert.equal(car.batteryNumber,'000MANUAL');assert.equal(car.claims.length,1);assert.ok(connections>=4);
 } finally {await pg.close();}
});

test('migration preserves every source field, drops JSON and exports relational columns atomically',async()=>{
 const pg=new PGlite();
 try {
  const source={config:initialState().config,source:{filename:'fixture.xlsx',sheets:['รถ'],notes:[],warnings:[]},cars:Array.from({length:300},(_,i)=>({id:i+1,vin:'000FIXTURE'+String(i).padStart(5,'0'),model:'Stock Atto 3',submodel:'A',color:'ขาว',location:'สาขาทดสอบ',status:'Available',buyPrice:null,sellPrice:0,amountFinanced:0,receiveDate:'2026-11-02',paymentDueDate:'',manufactureYear:'2569',batteryNumber:'000001',frontMotorNumber:'000002',inspected:false,claims:[],source:{sheet:'รถ',row:i+2,paymentNote:'',tags:[]}}))};
  const state={...initialState(),cars:source.cars,config:source.config,nextCarId:301,roleCredentials:{admin:{version:1,salt:'000salt',hash:'000hash',encryptedPassword:{iv:'iv',ciphertext:'cipher',tag:'tag'}}}};
  const document={state,audit:[{role:'admin',action:'import',timestamp:'2026-11-02T00:00:00.000Z',source:source.source}],receipts:[{requestId:'migration-receipt',fingerprint:'f',message:'ok',timestamp:'2026-11-02T00:00:00.000Z'}],attempts:[{key:'ip',count:2,firstAt:1793577600000}]};
  await pg.query('CREATE TABLE app_document(id smallint PRIMARY KEY,revision bigint,document jsonb)');
  await pg.query('INSERT INTO app_document VALUES(1,100,$1)',[JSON.stringify(document)]);
  await pg.query('BEGIN');const report=await migrateRelational(pg);assert.equal(report.cars,300);
  assert.deepEqual(await loadDocument(pg),document);
  assert.equal((await pg.query('SELECT count(*) FROM export_cars')).rows[0].count,300);
  assert.equal((await pg.query("SELECT to_regclass('app_document') AS name")).rows[0].name,null);
  await pg.query('ROLLBACK');
  assert.ok((await pg.query("SELECT to_regclass('app_document') AS name")).rows[0].name);
  assert.equal((await pg.query("SELECT to_regclass('cars') AS name")).rows[0].name,null);
 } finally {await pg.close();}
});
