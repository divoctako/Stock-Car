import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('receipt spinner updates status and totals without rebuilding or blurring the form', async () => {
  const classes = new Set();
  const classList = { toggle(name, on) { if (on) classes.add(name); else classes.delete(name); } };
  const badge = { classList, textContent: '' };
  const row = { classList, querySelector: () => badge };
  const received = { textContent: '' }, pending = { textContent: '' };
  const overlay = { querySelector(selector) {
    if (selector.startsWith('[data-claim-index=')) return row;
    return selector.includes('received') ? received : pending;
  } };
  let blurCount = 0;
  const input = { value: '', blur() { blurCount++; }, getAttribute: () => 'claim-0-amountReceived' };
  const document = {
    readyState: 'loading', addEventListener() {}, activeElement: input,
    getElementById(id) { assert.equal(id, 'overlay-root', 'must not rebuild the app'); return overlay; }
  };
  Object.defineProperty(overlay, 'innerHTML', { set() { assert.fail('must not replace modal DOM'); } });
  const context = vm.createContext({ document });
  const source = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  vm.runInContext(source.replace("if (document.readyState === 'loading')", "globalThis.testUI = { S, onInputEvent };\nif (document.readyState === 'loading')"), context);
  const { S, onInputEvent } = context.testUI;
  S.modal = { type: 'claim' };
  S.form = { claims: [
    { amount: 100, dateReceived: '2026-10-24', amountReceived: '' },
    { amount: 200, dateReceived: '', amountReceived: '' }
  ] };
  for (const type of ['input', 'change', 'input', 'change']) {
    input.value = String(Number(input.value) + 1);
    onInputEvent({ type, target: input });
  }
  assert.equal(S.form.claims[0].amountReceived, '4');
  assert.equal(received.textContent, '4 ฿');
  assert.equal(pending.textContent, '200 ฿');
  assert.equal(badge.textContent, 'รับแล้ว');
  assert.ok(classes.has('paid'));
  input.value = '0';
  onInputEvent({ type: 'change', target: input });
  assert.equal(badge.textContent, 'รอรับ');
  assert.equal(pending.textContent, '300 ฿');
  assert.equal(received.textContent, '0 ฿');
  assert.equal(blurCount, 0);
  assert.equal(document.activeElement, input);
});

test('adding delivery claim rows appends only the new row without rebuilding the live modal', async () => {
  const rows = [];
  const list = { appendChild(row) { rows.push(row); } };
  const document = {
    readyState:'loading', addEventListener(){},
    querySelector(selector) { assert.equal(selector,'#overlay-root [data-claim-list]'); return list; },
    getElementById() { assert.fail('must not rebuild root or overlay'); },
    createElement(tag) {
      assert.equal(tag,'template');
      return { innerHTML:'', content:{ querySelector(selector) { return { selector }; } } };
    }
  };
  const context = vm.createContext({document});
  const source = await readFile(new URL('../public/app.js',import.meta.url),'utf8');
  vm.runInContext(source.replace("if (document.readyState === 'loading')", "globalThis.ui = {S,addDraftClaim};\nif (document.readyState === 'loading')"),context);
  const {S,addDraftClaim}=context.ui;
  S.modal={type:'deliver',carId:1};
  S.cars=[{id:1,model:'Stock Seal',vin:'TEST',submodel:'Premium',color:'ดำ'}];
  S.form={salesCode:'EXISTING',customerName:'Customer',claims:[{detail:'Keep me',amount:'1200'}]};
  addDraftClaim(); addDraftClaim();
  assert.equal(rows.length,2);
  assert.equal(rows[0].selector,'[data-claim-index="1"]');
  assert.equal(rows[1].selector,'[data-claim-index="2"]');
  assert.equal(S.form.salesCode,'EXISTING');
  assert.equal(S.form.claims[0].detail,'Keep me');
  assert.equal(S.form.claims[0].amount,'1200');
});
