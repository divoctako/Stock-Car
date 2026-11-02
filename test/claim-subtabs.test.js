import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { initialState, mutate } from '../lib/domain.js';

test('non-vehicle claims move through receipts, inspection and completion independently', () => {
  const state = initialState();
  const first = { detail:'Marketing', amount:100, dateReceived:'', amountReceived:'', bank:'' };
  mutate(state, { action:'saveClaims', carId:0, claims:[first, { ...first, detail:'Training' }] });
  const [claim, unrelated] = state.otherClaims;
  assert.throws(() => mutate(state, { action:'markInspected', carId:0, claimId:claim.id }), /รับเงินเคลม/);
  mutate(state, { action:'saveClaims', carId:0, claims:[{ ...claim, dateReceived:'2026-10-24', amountReceived:100 }] });
  mutate(state, { action:'markInspected', carId:0, claimId:claim.id });
  assert.equal(claim.inspected, true);
  assert.equal(unrelated.dateReceived, '');
  mutate(state, { action:'saveClaims', carId:0, claims:[{ ...claim }] });
  assert.equal(claim.inspected, true, 'saving an unchanged claim preserves inspection');
  mutate(state, { action:'saveClaims', carId:0, claims:[{ ...claim, bank:'Updated bank' }] });
  assert.equal(claim.inspected, false, 'changed receipts require inspection again');
  assert.throws(() => mutate(state, { action:'markInspected', carId:0, claimId:9999 }), /ไม่พบรายการ/);
  assert.throws(() => mutate(state, { action:'markInspected', carId:0 }), /ไม่พบรายการ/);
});

test('all three claim pages keep vehicle and non-vehicle results in separate subtabs', async () => {
  const context = vm.createContext({ document:{ readyState:'loading', addEventListener() {} } });
  const source = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  vm.runInContext(source.replace("if (document.readyState === 'loading')", "globalThis.ui = { S, derive, viewClaims, viewInspect, viewClaimsDone };\nif (document.readyState === 'loading')"), context);
  const { S, derive, viewClaims, viewInspect, viewClaimsDone } = context.ui;
  const pending = { id:1, detail:'OTHER_PENDING', amount:100, dateReceived:'', amountReceived:'' };
  const received = { id:2, detail:'OTHER_INSPECT', amount:200, dateReceived:'2026-10-24', amountReceived:200 };
  const done = { ...received, id:3, detail:'OTHER_DONE', inspected:true };
  S.otherClaims = [pending, received, done];
  S.cars = [pending, received, done].map((claim, i) => ({
    id:i+1, model:'CAR_' + i, vin:'VIN_' + i, status:'Delivered', releaseDate:'2026-09-01',
    claims:[claim], inspected:i === 2
  }));
  for (const [page, view, expected, index] of [
    ['claims',viewClaims,'OTHER_PENDING',0], ['inspect',viewInspect,'OTHER_INSPECT',1], ['claimsdone',viewClaimsDone,'OTHER_DONE',2]
  ]) {
    let html = view(derive());
    assert.match(html, new RegExp('CAR_' + index));
    assert.doesNotMatch(html, /class="claim-title">OTHER_/);
    S.claimScopes[page] = 'other';
    html = view(derive());
    assert.match(html, new RegExp('class="claim-title">' + expected));
    assert.doesNotMatch(html, /CAR_\d/);
    assert.match(html, /role="tablist"/);
    assert.match(html, /aria-selected="true"/);
    assert.match(html, /role="tabpanel"/);
  }
  S.claimsDoneMonthFilter = '10'; S.claimsDoneYearFilter = '2026';
  assert.equal(derive().otherDoneRows.length, 1, 'other claims use receipt dates');
  S.claimsDoneMonthFilter = '09';
  assert.equal(derive().otherDoneRows.length, 0);
  S.claimQuery = 'missing';
  assert.match(viewClaims(derive()), /ไม่พบรายการที่ตรงกับการค้นหา/);
});
