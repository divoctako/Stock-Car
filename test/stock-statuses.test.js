import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {initialState,validateConfig,previewCarImport,snapshot,mutate} from '../lib/domain.js';
import {IMPORT_COLUMNS} from '../lib/car-import.js';
import {setup,executeWrite,readState} from '../lib/db.js';
import {runSql} from '../lib/sql.js';
const statuses=['Available','Reserved','test drive','mobile','coutersy'];
const payload={vin:'CUSTOMSTATUS',model:'Stock Atto 3',submodel:'Premium',color:'ขาว',location:'ไม่ระบุ Location',buyPrice:100,receiveDate:'2026-11-11',status:'test drive'};
const csv=rows=>IMPORT_COLUMNS.join(',')+'\n'+rows.map(row=>IMPORT_COLUMNS.map(key=>row[key]??'').join(',')).join('\n');

test('stock statuses are configurable while system transitions and required defaults remain protected',()=>{
 const base=initialState().config;
 const result=validateConfig({...base,stockStatuses:statuses},base);assert.deepEqual(result.stockStatuses,statuses);
 for(const stockStatuses of [null,['Available'],['Available','Reserved','Delivered'],['Available','Reserved','Test',' test ']])assert.throws(()=>validateConfig({...base,stockStatuses},base));
});

test('custom CSV statuses persist, support stock actions, and reject unknown statuses',async()=>{
 const pg=new PGlite(),db={query:(...a)=>pg.query(...a),connect:async()=>({query:(...a)=>pg.query(...a),release(){}})};
 try {
  await setup(db);
  await pg.query('ALTER TABLE cars DROP CONSTRAINT cars_status_valid');
  await pg.query("ALTER TABLE cars ADD CONSTRAINT cars_status_check CHECK(status IN ('Available','Reserved','Delivered','Transferred','FloorPlan'))");
  await runSql(pg,await readFile(new URL('../sql/custom-stock-statuses.sql',import.meta.url),'utf8'));
  await executeWrite({action:'saveConfig',role:'keeper',requestId:'statuses-config',payload:{expectedRevision:0,config:{stockStatuses:statuses}}},'config',db);
  let state=await readState(db);const text=csv(['test drive','mobile','coutersy'].map((status,i)=>({...payload,vin:'STATUS'+i,status})));
  const preview=previewCarImport(state,{role:'admin',payload:{csv:text}});assert.equal(preview.valid,3);
  await executeWrite({action:'importCars',role:'admin',requestId:'statuses-import',payload:{csv:text}},'import',db);
  state=await readState(db);assert.deepEqual(state.cars.map(car=>car.status),['test drive','mobile','coutersy']);assert.equal(snapshot(state,'','sales').cars.length,3);
  assert.equal(previewCarImport(state,{role:'admin',payload:{csv:csv([{...payload,vin:'UNKNOWN',status:'unknown'}])}}).invalid,1);
  assert.equal(previewCarImport(state,{role:'admin',payload:{csv:csv([{...payload,vin:'UPPER',status:'TEST DRIVE'}])}}).rows[0].payload.status,'test drive');
  await assert.rejects(executeWrite({action:'saveConfig',role:'claim',requestId:'statuses-no-claim',payload:{expectedRevision:1,config:{stockStatuses:statuses}}},'forbidden',db),e=>e.status===403);
  await assert.rejects(pg.query("UPDATE cars SET status='unknown' WHERE id=1"),/status|สถานะ/i);
  await executeWrite({action:'transferCar',role:'keeper',carId:1,requestId:'statuses-transfer',payload:{transferDate:'2026-11-11',transferTo:'สาขาทดสอบ'}},'transfer',db);
  assert.equal((await readState(db)).cars[0].status,'Transferred');
 } finally {await pg.close();}
});

test('custom stock statuses appear in dashboards, filters, forms and settings',async()=>{
 const context=vm.createContext({document:{readyState:'loading',addEventListener(){}}});
 const source=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
 vm.runInContext(source.replace("if (document.readyState === 'loading')","globalThis.ui={S,derive,viewStock,viewModal,viewSettings};\nif (document.readyState === 'loading')"),context);
 const {S,derive,viewStock,viewModal,viewSettings}=context.ui;
 S.config={...initialState().config,stockStatuses:statuses};S.cars=['test drive','mobile','coutersy'].map((status,i)=>({...payload,id:i+1,vin:'STATUS'+i,status,claims:[]}));
 let d=derive();assert.equal(d.stockAll.length,3);assert.equal(d.dashboardCars.length,3);assert.ok(viewStock(d).includes('test drive'));
 S.stockStatusFilter='mobile';assert.equal(derive().stockCars.length,1);
 S.modal={type:'edit',carId:1};S.form={...S.cars[0]};assert.ok(viewModal().includes('value="coutersy"'));
 assert.ok(viewSettings().includes('data-group="stockStatuses"'));
});

test('Floor Plan preserves custom stock status when promoted',()=>{
 const state=initialState();state.config.stockStatuses=statuses;
 mutate(state,{action:'addFloorCar',role:'admin',payload:{...payload,status:'mobile',paymentDueDate:'2026-11-20',batteryNumber:'B',frontMotorNumber:'M',manufactureYear:'2026'}});
 assert.equal(state.cars[0].stockStatus,'mobile');
 mutate(state,{action:'promoteFloorCar',role:'admin',carId:1});assert.equal(state.cars[0].status,'mobile');
});

test('status rename updates vehicles and Floor Plan while removal preserves historical stock',()=>{
 const state=initialState();state.config.stockStatuses=statuses;
 state.cars=[{...payload,id:1,status:'test drive',claims:[]},{...payload,id:2,vin:'FLOOR',status:'FloorPlan',stockStatus:'test drive',claims:[]},{...payload,id:3,vin:'MOBILE',status:'mobile',claims:[]}];
 const config={...state.config,stockStatuses:['Available','Reserved','demo car','mobile','coutersy']};
 mutate(state,{action:'saveConfig',role:'admin',payload:{config,expectedRevision:0}});
 assert.equal(state.cars[0].status,'demo car');assert.equal(state.cars[1].stockStatus,'demo car');
 mutate(state,{action:'saveConfig',role:'admin',payload:{config:{...state.config,stockStatuses:['Available','Reserved','demo car','coutersy']},expectedRevision:1}});
 assert.equal(state.cars[2].status,'mobile');
 assert.doesNotThrow(()=>mutate(state,{action:'updateCar',carId:3,payload:{...state.cars[2],buyPrice:200}}));
 assert.throws(()=>mutate(state,{action:'addCar',payload:{...payload,vin:'NEW',status:'mobile'}}),/สถานะต้องตรง/);
});
