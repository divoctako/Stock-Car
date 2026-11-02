import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState} from '../lib/domain.js';
import {encodeTables,decodeTables} from '../lib/sheet-tables.js';
const make=()=>({state:{...initialState(),roleCredentials:{}},audit:[],receipts:[],attempts:[]});
test('readable tables preserve settings, custom status labels, months and encrypted credentials',()=>{const doc=make();doc.state.config.statusLabels={Available:'พร้อมขาย',Reserved:'จอง',Delivered:'ขายแล้ว',Transferred:'โอน'};doc.state.config.monthNames=Array.from({length:12},(_,i)=>'เดือน '+(i+1));doc.state.roleCredentials={admin:{salt:'salt',hash:'hash',version:2,encryptedPassword:{iv:'iv',tag:'tag',ciphertext:'encrypted'}}};assert.deepEqual(decodeTables(encodeTables(doc,4)),{revision:4,document:doc});});
test('cars, vehicle claims, other claims, false booleans and leading zero identifiers survive',()=>{const doc=make();doc.state.cars=[{id:1,vin:'000001',model:'รถ',submodel:'',color:'ขาว',location:'สาขา',status:'Available',buyPrice:0,receiveDate:'2026-11-02',inspected:false,claims:[{id:2,detail:'เคลม',amount:100,dateReceived:'',amountReceived:'',bank:''}]}];doc.state.otherClaims=[{id:3,detail:'อื่น',amount:0,dateReceived:'',amountReceived:'',bank:''}];assert.deepEqual(decodeTables(encodeTables(doc,0)).document,doc);const tables=encodeTables(doc,0);tables['เคลม'][1][1]=999;assert.throws(()=>decodeTables(tables),/missing car/);});

