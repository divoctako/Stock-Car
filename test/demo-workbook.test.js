import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

test('local Excel mockup reconciles VINs, active stock and source-only financial data',async(t)=>{
  let seed;
  try {seed=JSON.parse(await readFile(new URL('../demo-data/byd-stock.json',import.meta.url),'utf8'));}
  catch(error){if(error.code==='ENOENT'){t.skip('private local workbook fixture is not distributed');return;}throw error;}
  assert.equal(seed.cars.length,seed.source.sheets.reduce((n,sheet)=>n+sheet.vehicles,0));
  assert.equal(new Set(seed.cars.map(car=>car.vin)).size,seed.cars.length);
  assert.equal(seed.cars.length,218);
  assert.equal(seed.cars.filter(car=>car.status==='Available').length,107);
  assert.equal(seed.cars.filter(car=>car.status==='Delivered').length,111);
  assert.ok(seed.cars.every(car=>car.buyPrice===null && car.claims.length===0));
  assert.ok(seed.cars.every(car=>!car.receiveDate || /^20\d\d-\d\d-\d\d$/.test(car.receiveDate)));
  assert.ok(seed.cars.every(car=>seed.config.colors.includes(car.color)));
  assert.equal(seed.cars.filter(car=>!car.receiveDate).length,3);
  const context=vm.createContext({document:{readyState:'loading',addEventListener(){}}});
  const source=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
  vm.runInContext(source.replace("if (document.readyState === 'loading')","globalThis.ui={S,derive,stockColorGroups};\nif (document.readyState === 'loading')"),context);
  const {S,derive,stockColorGroups}=context.ui;S.cars=seed.cars;S.config=seed.config;
  const d=derive();
  assert.equal(d.stockAll.length,107);assert.equal(d.stockPriceMissing,107);
  assert.equal(d.deliveredPending.length,0,'missing claim data must not become invented pending claims');
  assert.equal(stockColorGroups(d.stockAll).total,107);
  assert.equal(d.claimItems,0);
});
