import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('latest cars use stock data, receipt dates, search and existing role permissions', async () => {
  const context = vm.createContext({document:{readyState:'loading',addEventListener(){}}});
  const source = await readFile(new URL('../public/app.js',import.meta.url),'utf8');
  vm.runInContext(source.replace("if (document.readyState === 'loading')", "globalThis.ui={S,derive,viewLatestCars};\nif (document.readyState === 'loading')"),context);
  const {S,derive,viewLatestCars}=context.ui;
  S.cars=[
    {id:1,vin:'OLD',model:'Seal',submodel:'Premium',status:'Available',color:'ดำ',receiveDate:'2026-09-01'},
    {id:2,vin:'NEW',model:'Dolphin',submodel:'Premium',status:'Reserved',color:'ขาว',receiveDate:'2026-10-01'},
    {id:3,vin:'SOLD',model:'Seal',status:'Delivered',claims:[],receiveDate:'2026-10-24'}
  ];
  let html=viewLatestCars(derive());
  assert.ok(html.indexOf('NEW')<html.indexOf('OLD'),'newest receipt date first');
  assert.doesNotMatch(html,/SOLD/);
  assert.match(html,/data-act="open-edit"/);
  S.latestQuery='จอง';
  html=viewLatestCars(derive());
  assert.match(html,/NEW/); assert.doesNotMatch(html,/OLD/);
  S.latestQuery='ดำ';
  assert.match(viewLatestCars(derive()),/OLD/);
  S.role='sales';
  assert.doesNotMatch(viewLatestCars(derive()),/data-act="open-edit"/);
  S.latestQuery='no results';
  assert.match(viewLatestCars(derive()),/ไม่พบรถที่ตรงกับการค้นหา/);
});
