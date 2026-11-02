import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

test('stock search combines submodel, color, year and existing filters without including sold cars',async()=>{
  const context=vm.createContext({document:{readyState:'loading',addEventListener(){}}});
  const source=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
  vm.runInContext(source.replace("if (document.readyState === 'loading')","globalThis.ui={S,derive,viewStock};\nif (document.readyState === 'loading')"),context);
  const {S,derive,viewStock}=context.ui;
  const car={id:1,vin:'VIN-1',model:'Seal',submodel:'Premium',color:'ขาว',location:'ขอนแก่น',manufactureYear:'2026',status:'Available',batteryNumber:'BAT001',frontMotorNumber:'MOTOR001'};
  S.cars=[car,{...car,id:2,vin:'VIN-2',submodel:'Performance',color:'ดำ',manufactureYear:'2025',status:'Reserved'},
    {...car,id:3,vin:'VIN-3',model:'Dolphin',submodel:'Dynamic',location:'สกลนคร'},
    {...car,id:4,vin:'SOLD',status:'Delivered',claims:[]}];
  S.config.models=['Seal','Dolphin'];S.config.colors=['ขาว','ดำ'];S.config.locations=['ขอนแก่น','สกลนคร'];
  S.stockModelFilter='Seal';S.stockSubmodelFilter='Premium';S.stockColorFilter='ขาว';S.stockYearFilter='2026';
  assert.equal(derive().stockCars.length,1);
  assert.equal(derive().stockSubmodels.join(','),'Performance,Premium');
  S.stockColorFilter='ดำ';assert.equal(derive().stockCars.length,0);
  S.stockModelFilter='';S.stockSubmodelFilter='';S.stockColorFilter='';S.stockYearFilter='';
  for(const [query,count] of [['ขาว',2],['ขอนแก่น',2],['BAT001',3],['MOTOR001',3],['Premium',1],['2026',2],['พร้อมขาย',2]]) {
    S.stockQuery=query;const data=derive();assert.equal(data.stockCars.length,count,query);
    assert.ok(data.stockCars.every(c=>c.status!=='Delivered'));
  }
  S.stockQuery='VIN-2';S.stockYearFilter='2025';S.stockStatusFilter='Reserved';
  assert.equal(derive().stockCars[0].id,2);
  const html=viewStock(derive());
  assert.match(html,/ค้นหาสต๊อกรถ/);assert.match(html,/ทุกรุ่นย่อย/);assert.match(html,/ทุกสี/);assert.match(html,/ทุกปีผลิต/);
  assert.match(html,/แสดง <strong>1<\/strong> จาก 3 คัน/);
});
