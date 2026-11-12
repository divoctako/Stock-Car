import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {initialState,mutate,previewCarImport} from '../lib/domain.js';
import {parseCarCSV,IMPORT_COLUMNS} from '../lib/car-import.js';
import {setup,executeWrite,readState} from '../lib/db.js';

function csv(rows){return '\uFEFF'+[IMPORT_COLUMNS,...rows.map(row=>IMPORT_COLUMNS.map(key=>row[key]??''))].map(row=>row.map(value=>'"'+String(value).replace(/"/g,'""')+'"').join(',')).join('\r\n');}
const base={vin:'001IMPORT',model:'Stock Seal',submodel:'Premium',color:'ขาว',location:'ไม่ระบุ Location',receiveDate:'2026-10-28',paymentDueDate:'2026-11-28',batteryNumber:'000BAT',frontMotorNumber:'000MOTOR',manufactureYear:'2026'};
const body=rows=>({action:'importCars',role:'admin',payload:{csv:csv(rows)}});

test('import accepts single-digit days and months from spreadsheet CSV exports',()=>{
  for(const receiveDate of ['11/2/2026','11/02/2026','1/2/2026','01/02/2026']) {
    const state=initialState();
    const request=body([{...base,receiveDate,paymentDueDate:'9/3/2026'}]);
    assert.equal(previewCarImport(state,request).invalid,0);
    mutate(state,request);
    assert.equal(state.cars[0].receiveDate,receiveDate.startsWith('11/')?'2026-02-11':'2026-02-01');
    assert.equal(state.cars[0].paymentDueDate,'2026-03-09');
  }
  for(const receiveDate of ['31/2/2026','29/2/2026','1/13/2026']) {
    const preview=previewCarImport(initialState(),body([{...base,receiveDate}]));
    assert.equal(preview.invalid,1);
    assert.ok(preview.rows[0].errors.some(error=>error.includes('DD/MM/YYYY')));
  }
});

test('CSV parses BOM, quotes, commas, multiline values, column order and rejects malformed files',()=>{
  const text=csv([{...base,submodel:'Premium, "Plus"\nEdition'}]);
  const rows=parseCarCSV(text);assert.equal(rows[0].payload.submodel,'Premium, "Plus"\nEdition');assert.equal(rows[0].line,2);
  assert.equal(rows[0].payload.batteryNumber,'000BAT');
  for(const bad of ['', 'vin,vin\nx,y', 'vin,model\nx,y', 'vin,model,submodel,color,location,receiveDate\na,b,c,d,e', '"unclosed'])assert.throws(()=>parseCarCSV(bad));
  assert.throws(()=>parseCarCSV(csv(Array.from({length:501},()=>base))));
  assert.throws(()=>parseCarCSV('x'.repeat(200*1024+1)));
});

test('preview is read-only; invalid dates, settings, status and duplicate VIN block the whole batch',()=>{
  const state=initialState();mutate(state,{action:'addCar',payload:base});
  const before=structuredClone(state);
  const invalids=[{...base,vin:'001import'},{...base,vin:'NEW',paymentDueDate:'2026-02-30'},
    {...base,vin:'NEW',model:'Unknown'}, {...base,vin:'NEW',status:'Delivered'},
    {...base,vin:'NEW',buyPrice:'-1'}, {...base,vin:'NEW',receiveDate:''}];
  for(const invalid of invalids){
    const request=body([{...base,vin:'GOOD'},invalid]);
    assert.ok(previewCarImport(state,request).invalid>0);
    assert.throws(()=>mutate(state,request));assert.deepEqual(state,before);
  }
  assert.equal(previewCarImport(state,body([{...base,vin:'dupe'},{...base,vin:'DUPE'}])).invalid,1);
  assert.throws(()=>mutate(state,{...body([base]),role:'sales'}));
  assert.deepEqual(state,before);
});

test('import preserves identifiers, optional blanks, explicit zero and reserved status',()=>{
  const state=initialState(),request=body([base,{...base,vin:'SECOND',buyPrice:'0',status:'จอง'}]);
  const before=structuredClone(state);const preview=previewCarImport(state,request);
  assert.equal(preview.valid,2);assert.deepEqual(state,before);
  mutate(state,request);assert.equal(state.cars.length,2);assert.equal(state.nextCarId,3);
  assert.equal(state.cars[0].vin,'001IMPORT');assert.equal(state.cars[0].batteryNumber,'000BAT');
  assert.equal(state.cars[0].frontMotorNumber,'000MOTOR');assert.equal(state.cars[0].buyPrice,null);
  assert.equal(state.cars[1].buyPrice,0);assert.equal(state.cars[1].status,'Reserved');
});

test('database import is atomic, revalidates stale previews and idempotent retries do not duplicate cars',async()=>{
  const pg=new PGlite();const db={query:(...args)=>pg.query(...args),connect:async()=>({query:(...args)=>pg.query(...args),release(){}})};
  try{
    await setup(db);
    const request={...body([base,{...base,vin:'NEXT'}]),requestId:'import-valid'};
    await executeWrite(request,'import-valid',db);await executeWrite(request,'import-valid',db);
    const before=await readState(db);assert.equal(before.cars.length,2);
    await assert.rejects(executeWrite({...body([{...base,vin:'GOOD'},base]),requestId:'import-stale'},'import-stale',db));
    assert.deepEqual(await readState(db),before);
  }finally{await pg.close();}
});

test('downloadable blank template matches the accepted import schema',async()=>{
  const text=await readFile(new URL('../public/stock-import-template.csv',import.meta.url),'utf8');
  assert.ok(text.startsWith('\uFEFF'));
  assert.throws(()=>parseCarCSV(text),/1–500/);
  assert.equal(parseCarCSV(text+csv([base]).split('\r\n').slice(1).join('\r\n'))[0].payload.vin,base.vin);
});
