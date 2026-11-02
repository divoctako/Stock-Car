import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, mutate, writeActions } from '../lib/domain.js';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { PGlite } from '@electric-sql/pglite';
import { setup, executeWrite, readState } from '../lib/db.js';

test('append a claim to an existing stock car without changing vehicle data or losing earlier claims', () => {
  const state = initialState();
  mutate(state, { action:'addCar', payload:{ vin:'EXISTING-001', model:'Stock Seal', submodel:'Premium', buyPrice:500000, receiveDate:'2026-10-01' } });
  const car = state.cars[0];
  const original = structuredClone(car);
  assert.ok(writeActions.has('addVehicleClaim'));
  mutate(state, { action:'addVehicleClaim', carId:car.id, payload:{ detail:'Parts support', amount:1200 } });
  assert.equal(car.status, original.status);
  assert.equal(car.vin, original.vin);
  assert.equal(car.model, original.model);
  const claim = car.claims[0];
  mutate(state, { action:'saveClaims', carId:car.id, claims:[{ ...claim, dateReceived:'2026-10-24', amountReceived:1200, bank:'Bank' }] });
  mutate(state, { action:'markInspected', carId:car.id });
  assert.equal(car.inspected, true);
  mutate(state, { action:'addVehicleClaim', carId:car.id, payload:{ detail:'Additional support', amount:500 } });
  assert.equal(car.claims.length, 2);
  assert.equal(car.claims[0].amountReceived, 1200);
  assert.equal(car.inspected, false);
  mutate(state, { action:'deliverCar', carId:car.id, payload:{ salesCode:'S001', customerName:'Test', releaseDate:'2026-10-24', sellPrice:600000, claims:[{ detail:'Delivery claim', amount:300 }] } });
  assert.equal(car.claims.length, 3, 'delivery keeps claims created while in stock');
  assert.equal(car.claims[0].id, claim.id);
  assert.equal(car.claims[0].bank, 'Bank');
  assert.throws(() => mutate(state, { action:'addVehicleClaim', carId:999, payload:{ detail:'Invalid', amount:1 } }), /ไม่พบข้อมูลรถ/);
  for (const payload of [{detail:'',amount:1},{detail:'Invalid',amount:0},{detail:'Invalid',amount:-1}]) {
    assert.throws(() => mutate(state, { action:'addVehicleClaim', carId:car.id, payload }));
  }
  assert.equal(car.claims.length, 3);
});

test('vehicle claim wizard references the selected car and stock claims appear in the claim queue', async () => {
  const context = vm.createContext({ document:{ readyState:'loading', addEventListener() {} } });
  const source = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  vm.runInContext(source.replace("if (document.readyState === 'loading')", "globalThis.ui = { S, derive, viewModal, viewClaims };\nif (document.readyState === 'loading')"), context);
  const { S, derive, viewModal, viewClaims } = context.ui;
  S.cars = [{ id:1, status:'Available', model:'Existing model', submodel:'Premium', color:'ดำ', vin:'VIN123', location:'Branch', claims:[{id:1, detail:'Parts', amount:100}] }];
  S.modal = {type:'select-claim-car'}; S.form = {claimCarIds:[1],carSearch:'',appliedCarSearch:'',detail:'Parts',amount:100};
  assert.match(viewModal(), /VIN123/);
  assert.match(viewModal(), /type="checkbox"/);
  S.modal = {type:'add-vehicle-claim'};
  const html = viewModal();
  assert.match(html, /VIN123/);
  assert.match(html, /Branch/);
  assert.match(html, /form-detail/);
  assert.match(html, /form-amount/);
  assert.equal(derive().claimCars.length, 1);
  assert.equal(derive().claimPending, 100);
  assert.match(viewClaims(derive()), /เพิ่มงานเคลมเกี่ยวกับรถ/);
});

test('batch claim validates every selected car before appending one unique claim per car', () => {
  const state = initialState();
  for (const vin of ['BATCH1','BATCH2']) mutate(state, {action:'addCar',payload:{vin,model:'Stock Seal',submodel:'Premium',buyPrice:1,receiveDate:'2026-10-24'}});
  const payload = {detail:'Shared support',amount:2500};
  const before = structuredClone(state);
  for (const carIds of [[],[1,1],[1,999],[0],['1']]) {
    assert.throws(() => mutate(state, {action:'addVehicleClaim',carIds,payload}));
    assert.deepEqual(state,before,'invalid selection cannot leave partial claims');
  }
  assert.throws(() => mutate(state, {action:'addVehicleClaim',carIds:[1,2],payload:{detail:'',amount:1}}));
  assert.deepEqual(state,before);
  mutate(state, {action:'addVehicleClaim',carIds:[1,2],payload});
  assert.equal(state.cars[0].claims[0].amount,2500);
  assert.equal(state.cars[1].claims[0].amount,2500);
  assert.notEqual(state.cars[0].claims[0].id,state.cars[1].claims[0].id);
  assert.equal(state.cars[0].claims[0].detail,'Shared support');
  assert.equal(state.cars[0].status,before.cars[0].status);
});

test('search keeps selections across results and checkbox input/change cannot duplicate cars', async () => {
  const document = {readyState:'loading',addEventListener(){},querySelectorAll(){return [];},querySelector(){return null;}};
  const context = vm.createContext({document});
  const source = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  vm.runInContext(source.replace("if (document.readyState === 'loading')", "globalThis.ui = {S, matchingClaimCars, selectedClaimCars, onInputEvent, viewModal};\nif (document.readyState === 'loading')"), context);
  const {S,matchingClaimCars,selectedClaimCars,onInputEvent,viewModal} = context.ui;
  S.cars = [{id:1,vin:'VIN-A',model:'Seal',color:'ดำ'}, {id:2,vin:'VIN-B',model:'Dolphin',color:'ขาว'}];
  S.form = {claimCarIds:[],appliedCarSearch:'seal',amount:2500,detail:'Shared'};
  S.modal = {type:'select-claim-car'};
  assert.equal(matchingClaimCars()[0].id,1);
  const target = {value:'on',checked:true,getAttribute(name){return name === 'data-in' ? 'claim-car-selection' : '1';}};
  onInputEvent({type:'input',target}); onInputEvent({type:'change',target});
  assert.equal(S.form.claimCarIds.length,1);
  S.form.appliedCarSearch='VIN-B';
  assert.equal(matchingClaimCars()[0].id,2);
  assert.equal(selectedClaimCars()[0].id,1);
  target.getAttribute = name => name === 'data-in' ? 'claim-car-selection' : '2';
  onInputEvent({type:'input',target});
  S.modal={type:'add-vehicle-claim'};
  assert.match(viewModal(),/5,000 ฿/);
  assert.match(viewModal(),/VIN-A/); assert.match(viewModal(),/VIN-B/);
});

test('batch claim transaction persists all cars once and rolls back invalid selections', async () => {
  const pg = new PGlite();
  const db = {query:(...args)=>pg.query(...args),connect:async()=>({query:(...args)=>pg.query(...args),release(){}})};
  try {
    await setup(db);
    for (const vin of ['DB-BATCH1','DB-BATCH2']) await executeWrite({action:'addCar',payload:{vin,model:'Stock Seal',submodel:'Premium',buyPrice:1,receiveDate:'2026-10-24'},requestId:vin},vin,db);
    const before = await readState(db);
    await assert.rejects(executeWrite({action:'addVehicleClaim',carIds:[1,999],payload:{detail:'Support',amount:2500},requestId:'bad-batch'},'bad-batch',db));
    assert.deepEqual(await readState(db),before);
    const body = {action:'addVehicleClaim',carIds:[1,2],payload:{detail:'Support',amount:2500},requestId:'valid-batch'};
    await executeWrite(body,'valid-batch',db);
    await executeWrite(body,'valid-batch',db);
    const stored = await readState(db);
    assert.deepEqual(stored.cars.map(car=>car.claims.length),[1,1]);
    assert.deepEqual(stored.cars.map(car=>car.claims[0].amount),[2500,2500]);
  } finally { await pg.close(); }
});
