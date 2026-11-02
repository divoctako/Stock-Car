import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

test('stacked stock chart groups model, submodel and color with one absolute scale',async()=>{
  const context=vm.createContext({document:{readyState:'loading',addEventListener(){}}});
  const source=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
  vm.runInContext(source.replace("if (document.readyState === 'loading')","globalThis.ui={S,stockColorGroups,viewStockColorChart,swatchTextColor};\nif (document.readyState === 'loading')"),context);
  const {S,stockColorGroups,viewStockColorChart,swatchTextColor}=context.ui;
  S.config.colors=['ขาว','ดำ'];S.config.colorHex={'ขาว':'#ffffff','ดำ':'#000000','สีเก่า':'#998877'};
  const base={model:'Seal',submodel:'Premium',color:'ขาว',status:'Available'};
  const cars=[base,{...base,status:'Reserved'},{...base,color:'ดำ'},
    {...base,submodel:'Performance',color:'สีเก่า'},
    {...base,status:'Delivered'},{...base,status:'Transferred'}];
  const chart=stockColorGroups(cars);
  assert.equal(chart.total,4);assert.equal(chart.rows.length,2);
  const premium=chart.rows.find(row=>row.submodel==='Premium');
  assert.equal(premium.total,3);assert.equal(premium.colors.get('ขาว'),2);assert.equal(premium.colors.get('ดำ'),1);
  assert.equal(chart.colors.join(','),'ขาว,ดำ,สีเก่า','historical colors are still shown');
  assert.ok(chart.max>=3);assert.ok(chart.step>=1);assert.ok(chart.max/chart.step<=5);
  const html=viewStockColorChart(cars);
  assert.match(html,/รวม 4 คัน/);assert.match(html,/Premium/);assert.match(html,/Performance/);assert.match(html,/ขาว 2 คัน/);
  assert.match(html,new RegExp('width:'+3/chart.max*100+'%'));
  assert.match(html,new RegExp('width:'+1/chart.max*100+'%'));
  assert.equal(swatchTextColor('#fff'),'#000000');assert.equal(swatchTextColor('#000000'),'#ffffff');
  assert.match(viewStockColorChart([]),/ยังไม่มีรถพร้อมขายหรือรถจอง/);
  const many=stockColorGroups(Array.from({length:501},()=>base));
  assert.ok(many.max>=501);assert.ok(many.max/many.step<=5);
});
