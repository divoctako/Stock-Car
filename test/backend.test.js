import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { setup, readState, executeWrite, reserveLoginAttempt } from '../lib/db.js';
import { initialState, mutate } from '../lib/domain.js';
import { cookie, authenticated } from '../lib/auth.js';
import { sameOrigin } from '../lib/http.js';
import stock from '../api/stock.js';

const carForm = { vin: 'TEST000001', submodel: 'Extended', model: 'Stock Atto 3', buyPrice: 850000, receiveDate: '2026-10-23' };
const delivery = { salesCode: 'S001', customerName: 'ลูกค้าทดสอบ', releaseDate: '2026-10-23', sellPrice: 990000, claims: [{ detail: 'เงินสนับสนุน', amount: 10000 }] };
test('stock → delivery → receipts → inspection; other claims and transfers', () => {
  const state = initialState();
  mutate(state, { action: 'addCar', payload: carForm });
  assert.throws(() => mutate(state, { action: 'addCar', payload: { ...carForm, vin: carForm.vin.toLowerCase() } }), /VIN/);
  mutate(state, { action: 'deliverCar', carId: 1, payload: delivery });
  assert.equal(state.cars[0].status, 'Delivered');
  assert.throws(() => mutate(state, { action: 'markInspected', carId: 1 }), /รับเงินเคลม/);
  assert.throws(() => mutate(state, { action: 'deliverCar', carId: 1, payload: delivery }), /ส่งมอบหรือตัดขายแล้ว/);
  mutate(state, { action: 'saveClaims', carId: 1, claims: [{ id: 1, detail: 'เงินสนับสนุน', amount: 1, amountReceived: 10000, dateReceived: '2026-10-23', bank: 'บัญชีจริง' }] });
  assert.equal(state.cars[0].claims[0].amount, 10000, 'original claim amount stays locked');
  mutate(state, { action: 'markInspected', carId: 1 });
  assert.equal(state.cars[0].inspected, true);
  mutate(state, { action: 'saveClaims', carId: 0, claims: [{ detail: 'เคลมอื่น', amount: 500 }] });
  assert.equal(state.otherClaims.length, 1);
  assert.throws(() => mutate(state, { action: 'saveClaims', carId: 0, claims: [{ id: 1, detail: 'ข้ามรถ', amount: 500 }] }), /รหัสเคลม/);
  mutate(state, { action: 'addCar', payload: { ...carForm, vin: 'TRANSFER001' } });
  mutate(state, { action: 'transferCar', carId: 2, payload: { transferDate: '2026-10-23', transferTo: 'สาขาอื่น' } });
  assert.equal(state.cars[1].status, 'Transferred');
  assert.throws(() => mutate(state, { action: 'updateCar', carId: 2, payload: carForm }), /ส่งมอบหรือตัดขายแล้ว/);
});
test('invalid amounts and dates are rejected', () => {
  for (const payload of [{ ...carForm, buyPrice: -1 }, { ...carForm, buyPrice: 'NaN' }, { ...carForm, receiveDate: '2026-02-30' }])
    assert.throws(() => mutate(initialState(), { action: 'addCar', payload }));
});
test('vehicle payment date, battery, front motor and production year round-trip without losing zero prefixes', () => {
  const state = initialState();
  const extended = { ...carForm, paymentDueDate: '', batteryNumber: '000BAT0123', frontMotorNumber: '000MOTOR0456', manufactureYear: '2569' };
  mutate(state, { action: 'addCar', payload: extended });
  assert.equal(state.cars[0].paymentDueDate, '', 'payment due date is optional');
  assert.equal(state.cars[0].batteryNumber, '000BAT0123');
  assert.equal(state.cars[0].frontMotorNumber, '000MOTOR0456');
  assert.equal(state.cars[0].manufactureYear, '2569');
  mutate(state, { action: 'updateCar', carId: 1, payload: { ...extended, paymentDueDate: '2026-11-15', manufactureYear: '2026' } });
  assert.equal(state.cars[0].paymentDueDate, '2026-11-15');
  assert.equal(state.cars[0].manufactureYear, '2026');
  mutate(state, { action: 'updateCar', carId: 1, payload: carForm });
  assert.equal(state.cars[0].batteryNumber, '000BAT0123', 'older API clients cannot erase new fields by omitting them');
  assert.equal(state.cars[0].paymentDueDate, '2026-11-15');
  mutate(state, { action: 'updateCar', carId: 1, payload: { ...carForm, paymentDueDate: '', batteryNumber: '', frontMotorNumber: '', manufactureYear: '' } });
  assert.equal(state.cars[0].paymentDueDate, '', 'an explicit blank clears an optional field');
  for (const fields of [{ paymentDueDate: '2026-02-30' }, { manufactureYear: '26' }, { manufactureYear: '2026.5' }, { batteryNumber: 'A'.repeat(121) }])
    assert.throws(() => mutate(initialState(), { action: 'addCar', payload: { ...carForm, ...fields } }));
  const legacy = initialState();
  mutate(legacy, { action: 'addCar', payload: carForm });
  assert.equal(legacy.cars[0].batteryNumber, '');
});
test('PostgreSQL schema, durable writes, rollback, idempotency, and login limits', async () => {
  const pg = new PGlite();
  const db = { query: (...args) => pg.query(...args), connect: async () => ({ query: (...args) => pg.query(...args), release() {} }) };
  try {
    await setup(db);
    await setup(db);
    const add = { action: 'addCar', payload: { ...carForm, paymentDueDate: '2026-11-15', batteryNumber: '000BAT01', frontMotorNumber: '000MOTOR01', manufactureYear: '2026' }, requestId: 'test-request-add-001' };
    await executeWrite(add, 'same-fingerprint', db);
    await executeWrite(add, 'same-fingerprint', db);
    assert.equal((await readState(db)).cars.length, 1, 'retry does not add another car');
    const storedCar = (await readState(db)).cars[0];
    assert.equal(storedCar.batteryNumber, '000BAT01');
    assert.equal(storedCar.frontMotorNumber, '000MOTOR01');
    assert.equal(storedCar.paymentDueDate, '2026-11-15');
    assert.equal(storedCar.manufactureYear, '2026');
    await assert.rejects(executeWrite(add, 'different-fingerprint', db), /ข้อมูลอื่น/);
    const badDelivery = { action: 'deliverCar', carId: 1, payload: { ...delivery, claims: [{ detail: 'valid', amount: 10 }, { detail: 'invalid', amount: -1 }] }, requestId: 'test-request-bad-001' };
    await assert.rejects(executeWrite(badDelivery, 'bad-delivery', db));
    let state = await readState(db);
    assert.equal(state.cars[0].status, 'Available', 'failed delivery rolled back');
    assert.equal(state.nextClaimId, 1, 'claim ID increments rolled back');
    await executeWrite({ ...badDelivery, payload: delivery, requestId: 'test-request-good-001' }, 'good-delivery', db);
    state = await readState(db);
    assert.equal(state.cars[0].claims.length, 1);
    await assert.rejects(executeWrite({ action: 'addCar', payload: carForm, requestId: 'duplicate-vin-request' }, 'duplicate-vin', db), /VIN/);
    assert.equal((await db.query('SELECT * FROM audit_log')).rows.length, 2, 'only committed changes logged');
    const beforeSettings = structuredClone(await readState(db));
    const config = structuredClone(beforeSettings.config);
    config.locations.push('สาขาเพิ่มจาก Setting');
    const configBody = { action: 'saveConfig', role: 'admin', payload: { config, expectedRevision: 0 }, requestId: 'settings-request-001' };
    const saved = await executeWrite(configBody, 'settings-fingerprint', db);
    assert.equal(saved.config.locations.at(-1), 'สาขาเพิ่มจาก Setting');
    assert.equal(saved.configRevision, 1);
    assert.deepEqual(saved.cars, beforeSettings.cars, 'settings never rewrite historical cars or claims');
    await executeWrite(configBody, 'settings-fingerprint', db);
    assert.equal((await readState(db)).configRevision, 1, 'configuration retries are idempotent');
    await assert.rejects(executeWrite({ ...configBody, requestId: 'settings-stale-request' }, 'settings-stale', db), /ถูกแก้ไขแล้ว/);
    assert.equal((await db.query('SELECT * FROM audit_log')).rows.length, 3);
    for (let i = 0; i < 8; i++) assert.equal(await reserveLoginAttempt('ip-hash', db), true);
    assert.equal(await reserveLoginAttempt('ip-hash', db), false);
    await db.query("UPDATE login_attempts SET first_at = now() - interval '11 minutes'");
    assert.equal(await reserveLoginAttempt('ip-hash', db), true);
  } finally { await pg.close(); }
});
test('dropdown settings validate duplicates, required lists, colors, roles and preserve historical colors', () => {
  const state = initialState();
  const previousWhite = state.config.colorHex['ขาว'];
  const draft = structuredClone(state.config);
  draft.colors = ['สีใหม่']; draft.colorHex = { 'สีใหม่': '#123ABC' };
  draft.models.reverse(); draft.banks = ['บัญชีทดสอบ'];
  draft.statusLabels = { Available: 'พร้อมส่ง', Reserved: 'จองแล้ว', Delivered: 'ส่งมอบ', Transferred: 'โอนออก' };
  draft.claimPayLabels = { some: 'รับแล้วบางรายการ', none: 'ยังไม่รับ' };
  const save = config => mutate(state, { action: 'saveConfig', role: 'admin', payload: { config, expectedRevision: state.configRevision || 0 } });
  save(draft);
  assert.equal(state.config.colorHex['ขาว'], previousWhite, 'retired colors still render historical vehicles');
  assert.equal(state.config.colorHex['สีใหม่'], '#123abc');
  assert.equal(state.config.models[0], draft.models[0]);
  assert.equal(state.config.settings.brandName, 'Stock');
  for (const config of [
    { ...draft, models: [] }, { ...draft, models: [' Atto ', 'atto'] },
    { ...draft, colors: ['สีใหม่'], colorHex: { 'สีใหม่': 'red' } },
    { ...draft, monthNames: ['ไม่ครบ'] }, { ...draft, banks: [''] }
  ]) assert.throws(() => save(config));
  assert.equal(state.configRevision, 1, 'invalid configurations leave revision unchanged');
  assert.throws(() => mutate(state, { action: 'saveConfig', role: 'sales', payload: { config: draft, expectedRevision: 1 } }), error=>error.status===403);
});
test('session validation, logout cookie, cross-origin and unauthorized API protection', async () => {
  process.env.APP_PIN = 'test-pin';
  process.env.SESSION_SECRET = 'test-secret-that-is-longer-than-32-characters';
  const session = cookie().split(';')[0];
  assert.equal(authenticated({ headers: { cookie: session } }), true);
  assert.equal(authenticated({ headers: { cookie: session + 'x' } }), false);
  process.env.APP_PIN = 'changed-pin';
  assert.equal(authenticated({ headers: { cookie: session } }), false);
  assert.match(cookie(true), /Max-Age=0/);
  assert.throws(() => sameOrigin({ headers: { host: 'localhost:3000', origin: 'https://attacker.test' } }), /เว็บไซต์อื่น/);
  const response = { statusCode: 200, setHeader() {}, status(n) { this.statusCode = n; return this; }, json(data) { this.data = data; } };
  await stock({ method: 'POST', headers: { 'content-type': 'application/json' }, body: { action: 'bootstrap' } }, response);
  assert.equal(response.statusCode, 401);
  assert.equal(response.data.error, 'NEED_CODE');
});
