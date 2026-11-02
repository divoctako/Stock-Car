import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createDemoState} from '../lib/demo-state.js';
import {verifyPassword} from '../lib/passwords.js';

test('synthetic demo populates every tab, both claim scopes, settings, and all role logins',async()=>{
 process.env.ROLE_PASSWORD_KEY='demo-test-key-at-least-32-characters-long';
 const state=createDemoState();assert.equal(state.cars.length,30);assert.equal(state.otherClaims.length,6);
 for(const role of ['admin','keeper','sales','claim'])assert.equal(verifyPassword('demo1234',state.roleCredentials[role]),true);
 const ids=[...state.otherClaims,...state.cars.flatMap(car=>car.claims)].map(claim=>claim.id);assert.equal(new Set(ids).size,ids.length);
 const context=vm.createContext({document:{readyState:'loading',addEventListener(){}}});
 const source=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
 vm.runInContext(source.replace("if (document.readyState === 'loading')","globalThis.demoUI={S,derive,floorMissing};\nif (document.readyState === 'loading')"),context);
 Object.assign(context.demoUI.S,{cars:state.cars,otherClaims:state.otherClaims,config:state.config});
 const d=context.demoUI.derive();
 for(const key of ['dashboardCars','stockCars','claimCars','inspectCars','claimsDoneCars','transferCars','otherPendingRows','otherInspectRows','otherDoneRows'])assert.ok(d[key].length>0,key);
 const floor=state.cars.filter(car=>car.status==='FloorPlan');assert.equal(floor.length,3);
 assert.ok(floor.some(car=>context.demoUI.floorMissing(car).length===0));assert.ok(floor.some(car=>context.demoUI.floorMissing(car).length>0));
 assert.ok(state.config.models.length&&state.config.colors.length&&state.config.locations.length&&state.config.banks.length);
});
