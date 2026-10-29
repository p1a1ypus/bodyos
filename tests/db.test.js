// Хранилище: запись, мягкое удаление, экспорт/импорт, CSV.
import { test, assert, eq } from './harness.js';
import { Store, toCSV } from '../js/data/db.js';

test('хранилище: put, мягкое удаление видно в экспорте, импорт восстанавливает', async () => {
  const s = await new Store('bodyos-test-' + Date.now()).open();
  try {
    const w = await s.put('weights', { day: '2026-10-01', kg: 80 });
    await s.put('weights', { day: '2026-10-02', kg: 79.8 });
    await s.remove('weights', w.id);
    eq(s.all('weights').length, 1);
    eq(s.all('weights', { withDeleted: true }).length, 2);
    const dump = s.exportJSON();
    eq(dump.data.weights.length, 2);
    await s.put('weights', { day: '2026-10-03', kg: 79.5 });
    await s.importJSON(dump);
    eq(s.all('weights').length, 1);
    const s2 = await new Store(s.name).open();
    eq(s2.all('weights', { withDeleted: true }).length, 2, 'после переоткрытия');
    s2.db.close();
  } finally {
    await s.wipe();
  }
});

test('CSV: «;», BOM и экранирование', () => {
  const csv = toCSV([{ day: '2026-10-01', name: 'Суп; с "лапшой"', kcal: 300 }], ['day', 'name', 'kcal']);
  assert(csv.startsWith('﻿day;name;kcal'));
  assert(csv.includes('"Суп; с ""лапшой"""'));
});
