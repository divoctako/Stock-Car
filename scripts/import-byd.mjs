import { readFile } from 'node:fs/promises';
import { setup, transact } from '../lib/db.js';

const source = JSON.parse(await readFile(new URL('../demo-data/byd-stock-import.json', import.meta.url), 'utf8'));
const vins = new Set();
for (const car of source.cars) {
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(car.vin) || vins.has(car.vin)) throw new Error('Invalid or duplicate VIN in source');
  vins.add(car.vin);
}
await setup();
const result = await transact(document => {
  const state = document.state;
  const existing = new Set(state.cars.map(car => car.vin));
  let nextId = Math.max(state.nextCarId || 1, ...state.cars.map(car => car.id + 1));
  let added = 0;
  for (const car of source.cars) {
    if (existing.has(car.vin)) continue;
    state.cars.push({ ...car, id: nextId++ });
    existing.add(car.vin); added++;
  }
  state.nextCarId = nextId;
  for (const key of ['models', 'colors', 'locations', 'banks']) state.config[key] = [...new Set([...(state.config[key] || []), ...source.config[key]])];
  state.config.colorHex = { ...source.config.colorHex, ...state.config.colorHex };
  state.configRevision = (state.configRevision || 0) + 1;
  document.audit.push({ role: 'admin', action: 'importBydWorkbook', timestamp: new Date().toISOString(), source: source.source, added });
  return { added, skipped: source.cars.length - added, total: state.cars.length };
});
console.log(JSON.stringify(result));
process.exitCode = 0;
