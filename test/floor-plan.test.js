import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {PGlite} from '@electric-sql/pglite';
import {initialState,mutate,previewCarImport,snapshot,authorizeRole} from '../lib/domain.js';
import {verifyPassword,encryptPassword,revealRolePassword,hashPassword} from '../lib/passwords.js';
import {cookie,sessionIdentity} from '../lib/auth.js';
import {setup,executeWrite,readState} from '../lib/db.js';
process.env.ROLE_PASSWORD_KEY='test-only-encryption-key-at-least-32-characters';

const complete={vin:'FLOOR-001',model:'Stock Seal',submodel:'Premium',color:'ขาว',location:'ไม่ระบุ Location',buyPrice:0,status:'Reserved',receiveDate:'2026-11-01',paymentDueDate:'2026-12-01',batteryNumber:'000BAT',frontMotorNumber:'000MOTOR',manufactureYear:'2026'};
const command=(action,payload={},carId)=>({action,role:'admin',payload,carId});

test('Floor Plan accepts partial cars and blocks incomplete promotion without mutation',()=>{
  const state=initialState();mutate(state,command('addFloorCar',{}));mutate(state,command('addFloorCar',{model:'Stock Seal'}));
  assert.equal(state.cars.length,2);assert.equal(state.cars[0].vin,'');assert.equal(state.cars[0].buyPrice,null);assert.equal(state.cars[0].receiveDate,'');
  const before=structuredClone(state);
  assert.throws(()=>mutate(state,command('promoteFloorCar',{},1)),/ครบ/);assert.deepEqual(state,before);
  mutate(state,command('updateFloorCar',complete,1));
  mutate(state,command('promoteFloorCar',{},1));
  assert.equal(state.cars.length,2);assert.equal(state.cars[0].id,1);assert.equal(state.cars[0].status,'Reserved');assert.equal(state.cars[0].buyPrice,0);
  assert.equal(state.cars[0].batteryNumber,'000BAT');assert.throws(()=>mutate(state,command('promoteFloorCar',{},1)),/ไม่พบ/);
  assert.throws(()=>mutate(state,command('updateFloorCar',{...complete,vin:'floor-001'},2)),/VIN/);
});

test('floor CSV permits missing values; invalid dates and duplicate VIN still block the entire import',()=>{
  const state=initialState();
  const csv='vin,model,submodel,color,location,receiveDate\r\n,Stock Seal,,,,\r\nFLOOR-CSV,,,,,\r\n';
  const request=command('importCars',{csv,target:'floor'});
  assert.equal(previewCarImport(state,request).valid,2);mutate(state,request);
  assert.equal(state.cars.filter(c=>c.status==='FloorPlan').length,2);
  const before=structuredClone(state);assert.throws(()=>mutate(state,request),/VIN/);assert.deepEqual(state,before);
  assert.ok(previewCarImport(state,command('importCars',{csv:csv.replace('FLOOR-CSV,,,,,','NEW,,,,,2026-02-30'),target:'floor'})).invalid);
});

test('each role password is hashed, never appears in snapshots, and revokes previous sessions',()=>{
  const state=initialState(),password='test-only-password-123';
  assert.throws(()=>mutate(state,{...command('saveRolePassword',{targetRole:'keeper',password}),role:'keeper'}),/Admin/);
  mutate(state,command('saveRolePassword',{targetRole:'keeper',password}));
  assert.ok(verifyPassword(password,state.roleCredentials.keeper));assert.equal(verifyPassword('wrong',state.roleCredentials.keeper),false);
  assert.doesNotMatch(JSON.stringify(snapshot(state)),/test-only-password|"hash"|"salt"|roleCredentials/);
  assert.equal(snapshot(state).rolePasswordStatus.keeper,true);
  assert.throws(()=>authorizeRole(state,{role:'keeper',version:0},{action:'bootstrap'}),/เข้าสู่ระบบใหม่/);
  assert.doesNotThrow(()=>authorizeRole(state,{role:'keeper',version:1},{action:'addFloorCar',role:'keeper'}));
  assert.doesNotThrow(()=>authorizeRole(state,{role:'keeper',version:1},{action:'saveConfig',role:'keeper'}));
  assert.throws(()=>authorizeRole(state,{role:'sales',version:0},{action:'promoteFloorCar',role:'sales'}),/สิทธิ์/);
  assert.throws(()=>authorizeRole(state,{role:'keeper',version:1},{action:'addFloorCar',role:'admin'}),/ตำแหน่ง/);
  mutate(state,command('saveRolePassword',{targetRole:'keeper',password:'new-test-only-password'}));
  assert.throws(()=>authorizeRole(state,{role:'keeper',version:1},{action:'bootstrap'}),/เข้าสู่ระบบใหม่/);
});

test('signed login sessions bind role and credential version',()=>{
  process.env.APP_PIN='test-pin';process.env.SESSION_SECRET='test-secret-longer-than-thirty-two-characters';
  const token=cookie(false,'keeper',3).split(';')[0];
  assert.deepEqual(sessionIdentity({headers:{cookie:token}}),{role:'keeper',version:3});
  assert.equal(sessionIdentity({headers:{cookie:token.replace('.keeper.','.admin.')}}),null);
});

test('only Admin can reveal encrypted passwords; legacy hashes and unset roles have explicit unavailable states',()=>{
  const state=initialState(),password='reveal-test-only-123';
  mutate(state,command('saveRolePassword',{targetRole:'keeper',password}));
  assert.equal(revealRolePassword(state,{role:'admin'},'keeper','initial').password,password);
  assert.doesNotMatch(JSON.stringify(state),/reveal-test-only-123/);
  assert.doesNotMatch(JSON.stringify(snapshot(state)),/encryptedPassword|ciphertext|"hash"|"salt"/);
  for(const role of ['sales','keeper'])assert.throws(()=>revealRolePassword(state,{role},'keeper','initial'),/Admin/);
  assert.throws(()=>authorizeRole(state,{role:'sales',version:0},{action:'revealRolePassword',role:'sales'}),/Admin/);
  assert.equal(revealRolePassword(state,{role:'admin'},'admin','initial').password,'initial');
  assert.equal(revealRolePassword(state,{role:'admin'},'sales','initial').password,null);
  state.roleCredentials.keeper=hashPassword(password);
  assert.match(revealRolePassword(state,{role:'admin'},'keeper').reason,/hash/);
  state.roleCredentials.keeper.encryptedPassword=encryptPassword(password,'sales');
  assert.equal(revealRolePassword(state,{role:'admin'},'keeper').password,null,'ciphertext cannot be swapped between roles');
});

test('floor promotion is transactional and retries preserve the same car',async()=>{
  const pg=new PGlite(),db={query:(...a)=>pg.query(...a),connect:async()=>({query:(...a)=>pg.query(...a),release(){}})};
  try{
    await setup(db);
    await executeWrite({...command('addFloorCar',{}),requestId:'floor-add'},'floor-add',db);
    const before=await readState(db);
    await assert.rejects(executeWrite({...command('promoteFloorCar',{},1),requestId:'floor-bad'},'floor-bad',db));
    assert.deepEqual(await readState(db),before);
    await executeWrite({...command('updateFloorCar',complete,1),requestId:'floor-edit'},'floor-edit',db);
    const request={...command('promoteFloorCar',{},1),requestId:'floor-promote'};
    await executeWrite(request,'floor-promote',db);await executeWrite(request,'floor-promote',db);
    const saved=await readState(db);assert.equal(saved.cars.length,1);assert.equal(saved.cars[0].status,'Reserved');
  }finally{await pg.close();}
});

test('floor tab precedes stock; incomplete cars are excluded from dashboard and management is role aware',async()=>{
  const context=vm.createContext({document:{readyState:'loading',addEventListener(){}}});
  const source=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
  vm.runInContext(source.replace("if (document.readyState === 'loading')","globalThis.ui={S,derive,viewFloor,viewSidebar};\nif (document.readyState === 'loading')"),context);
  const {S,derive,viewFloor,viewSidebar}=context.ui;
  S.cars=[{id:1,status:'FloorPlan',model:'Stock Seal',vin:''},{id:2,...complete,status:'Available'}];
  const d=derive();assert.equal(d.stockAll.length,1);assert.equal(d.dashboardCars.length,1);
  assert.match(viewFloor(),/นำเข้า CSV/);assert.match(viewFloor(),/open-promote-floor/);
  const sidebar=viewSidebar(d);assert.ok(sidebar.indexOf('data-v="floor"')<sidebar.indexOf('data-v="stock"'));
  S.role='sales';assert.doesNotMatch(viewFloor(),/data-act="open-(add|import-cars|promote-floor)"/);
});
