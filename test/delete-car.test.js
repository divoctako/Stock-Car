import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {initialState,mutate,authorizeRole} from '../lib/domain.js';
import {setup,executeWrite,readState} from '../lib/db.js';

test('only Admin can delete, including when another role spoofs the request body',()=>{
 for(const role of ['keeper','sales','claim']) {
  const state=initialState();state.cars=[{id:1,status:'Available',claims:[]}];
  assert.throws(()=>authorizeRole(state,{role,version:0},{action:'deleteCar',role:'admin',carId:1}),e=>e.status===403);
  assert.throws(()=>mutate(state,{action:'deleteCar',role,carId:1}),e=>e.status===403);
  assert.equal(state.cars.length,1);
 }
 for(const status of ['Available','Reserved','FloorPlan','Delivered','Transferred']) {
  const state=initialState();state.cars=[{id:1,vin:'DELETE',status,claims:[{id:1,amount:10}]}];state.otherClaims=[{id:2}];
  const outcome=mutate(state,{action:'deleteCar',role:'admin',carId:1});
  assert.equal(state.cars.length,0);assert.equal(state.otherClaims.length,1);assert.equal(outcome.audit.deletedClaims,1);
  assert.throws(()=>mutate(state,{action:'deleteCar',role:'admin',carId:1}),e=>e.status===404);
 }
});

test('deletion is durable and idempotent, removes claims and provenance, retains audit and other vehicles',async()=>{
 const pg=new PGlite(),db={query:(...a)=>pg.query(...a),connect:async()=>({query:(...a)=>pg.query(...a),release(){}})};
 try {
  await setup(db);
  for(const [index,vin] of ['REMOVE','KEEP'].entries())await executeWrite({action:'addCar',role:'admin',payload:{vin,model:'Stock Atto 3',submodel:'A',buyPrice:100},requestId:'delete-test-add-'+index},vin,db);
  await executeWrite({action:'addVehicleClaim',role:'admin',carId:1,payload:{detail:'Claim',amount:10},requestId:'delete-test-claim'},'claim',db);
  const body={action:'deleteCar',role:'admin',carId:1,requestId:'delete-test-delete'};
  await executeWrite(body,'delete',db);await executeWrite(body,'delete',db);
  assert.deepEqual((await readState(db)).cars.map(c=>c.vin),['KEEP']);
  assert.equal(Number((await pg.query('SELECT count(*) FROM claims WHERE car_id=1')).rows[0].count),0);
  assert.equal(Number((await pg.query("SELECT count(*) FROM app_values WHERE scope='car' AND owner='1'")).rows[0].count),0);
  assert.equal(Number((await pg.query("SELECT count(*) FROM audit_log WHERE action='deleteCar'")).rows[0].count),1);
  await assert.rejects(executeWrite(body,'different',db),/ข้อมูลอื่น/);
 } finally {await pg.close();}
});

test('delete buttons and confirmation are Admin-only and cancellation does not issue a delete',async()=>{
 const context=vm.createContext({document:{readyState:'loading',addEventListener(){},getElementById(){return null;}}});
 const source=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
 vm.runInContext(source.replace("if (document.readyState === 'loading')","globalThis.ui={S,can,derive,viewStock,viewModal,deleteCarButton,doConfirm,closeModal,setCall(fn){call=fn;}};\nif (document.readyState === 'loading')"),context);
 const {S,can,derive,viewStock,viewModal,deleteCarButton,doConfirm,closeModal,setCall}=context.ui;
 const car={id:1,vin:'<DELETE>',model:'BYD',submodel:'A',status:'Available',claims:[{id:1}]};S.cars=[car];S.sessionRole='admin';
 for(const role of ['admin','keeper','sales','claim']) {
  S.role=role;assert.equal(deleteCarButton(car).includes('open-delete-car'),role==='admin');
  assert.equal(viewStock(derive()).includes('open-delete-car'),role==='admin');
 }
 S.role='admin';S.sessionRole='keeper';assert.equal(can().deleteCars,false);
 S.sessionRole='admin';S.modal={type:'delete-car',carId:1};S.form={};
 const html=viewModal();assert.ok(html.includes('&lt;DELETE&gt;'));assert.ok(html.includes('1 รายการ'));assert.ok(html.includes('ไม่สามารถกู้คืน'));assert.ok(html.includes('ยืนยันลบรถ'));
 let sent;setCall((action,body,callback)=>{sent={action,body};callback();});
 closeModal();assert.equal(sent,undefined);
 S.modal={type:'delete-car',carId:1};doConfirm();assert.equal(sent.action,'deleteCar');assert.equal(sent.body.carId,1);assert.equal(S.modal,null);
});
