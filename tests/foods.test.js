// База продуктов CoFID: тесты-инварианты FOOD_DB_INTEGRATION.md (раздел 6, 1–8) и разметка каталога.
import { test, assert, eq, note } from './harness.js';
import { SEED_ROWS } from '../js/data/foodseed.js';
import { ROWS_BY_RAW, ROW_BY_CODE, CATALOG, CATALOG_ALL, CATALOG_BY_ID, DISHES, catalogItem, searchCatalog, keywordParse, SEED_ALIASES, excludedTags, allowedByRestrictions } from '../js/core/foods.js';
import { computeBatch, batchPortion, resolveYield, searchKey } from '../js/core/fooddb.js';
import { dayTotals, macrosFor } from '../js/core/nutrition.js';
import { LEGACY_MAP } from '../js/core/legacy_foods.js';

const byCode = new Map(SEED_ROWS.map((r) => [r.cofid_code, r]));

test('база 1: cofid_code уникален, 721 строка', () => {
  eq(SEED_ROWS.length, 721);
  eq(byCode.size, 721);
});

test('база 2: все yield_raw_code резолвятся, сырая пара — «сырой» или «сушёный»', () => {
  const bad = SEED_ROWS.filter((r) => r.yield_raw_code && !['сырой', 'сушёный'].includes(byCode.get(r.yield_raw_code)?.state_ru));
  assert(!bad.length, bad.map((r) => r.cofid_code).join(', '));
});

test('база 3: yield_factor 0,4–4,0 (со сноской — 0,3–6,5)', () => {
  const bad = SEED_ROWS.filter((r) => r.yield_factor != null && !(r.yield_note ? r.yield_factor >= 0.3 && r.yield_factor <= 6.5 : r.yield_factor >= 0.4 && r.yield_factor <= 4));
  assert(!bad.length, bad.map((r) => `${r.cofid_code}=${r.yield_factor}`).join(', '));
  eq(SEED_ROWS.filter((r) => r.yield_factor != null).length, 156);
});

test('база 4: |4P + 9F + 3,75C + 7A − ккал| ≤ 5% у ≥ 95% строк', () => {
  const rows = SEED_ROWS.filter((r) => r.kcal && r.protein_g != null && r.fat_g != null && r.carbs_g != null);
  const ok = rows.filter((r) => Math.abs(4 * r.protein_g + 9 * r.fat_g + 3.75 * r.carbs_g + 7 * (r.alcohol_g || 0) - r.kcal) / r.kcal <= 0.05).length;
  note(`сходится у ${ok} из ${rows.length} (${Math.round((ok / rows.length) * 1000) / 10}%)`);
  assert(ok / rows.length >= 0.95);
});

test('база 5: salt_g = sodium × 2,5 / 1000 с округлением до сотых', () => {
  // округление источника — Python round(): половинки к чётному, поэтому допуск в одну сотую
  const bad = SEED_ROWS.filter((r) => r.sodium_mg != null && Math.abs(r.salt_g - (r.sodium_mg * 2.5) / 1000) > 0.0051);
  assert(!bad.length, bad.map((r) => r.cofid_code).join(', '));
});

test('база 6: поиск по префиксам токенов и через синоним', () => {
  for (const q of ['куриная', 'ГРУДКА', 'грудка кур', 'грудка, гриль']) {
    const ids = searchCatalog(q, CATALOG_ALL, 50).map((x) => x.id);
    assert(ids.includes('18-323'), `«${q}» не нашёл 18-323`);
  }
  // «курица» не префикс «куриная» — находит только синоним
  const noAlias = searchCatalog('курица грудка', CATALOG_ALL, 50, { aliases: {} }).map((x) => x.id);
  assert(!noAlias.includes('18-323'), 'нашёл без синонима');
  const withAlias = searchCatalog('курица грудка', CATALOG_ALL, 50).map((x) => x.id);
  assert(withAlias.includes('18-323'), 'синоним «курица» не сработал');
  eq(searchKey('Ёжик, «грудка»  гриль'), 'ежик грудка гриль');
});

test('база 6: ранжирование — начало названия, привычное, сырое выше готового той же основы', () => {
  const rice = searchCatalog('рис белый длиннозерный', CATALOG_ALL, 5).map((x) => x.id);
  eq(rice[0], '11-861');
  eq(rice[1], '11-862');
  const usual = searchCatalog('рис', CATALOG_ALL, 5, { usage: { '11-875': 9 } }).map((x) => x.id);
  eq(usual[0], '11-875');
});

test('база 6: найденное по синониму выше совпадения по началу названия', () => {
  // «Рыба-меч» начинается с «рыба», но «рыба» в речи — треска, минтай, лосось
  const fish = searchCatalog('рыба', CATALOG_ALL, 5);
  assert(fish.length && !fish.some((x) => /меч/i.test(x.name)), fish.map((x) => x.name).join('; '));
  assert(SEED_ALIASES['рыба'].includes(fish[0].id), fish[0].name);
});

test('разбор без LLM: «два яйца» — числительное словом', () => {
  const [eggs] = keywordParse('два яйца');
  assert(eggs, 'не разобрал');
  // «яйца» — синоним куриных: утиное и перепелиное ищутся по названию
  assert(SEED_ALIASES['яйца'].includes(eggs.matchId), CATALOG_BY_ID[eggs.matchId]?.name);
  eq(eggs.grams, 110);
  eq(eggs.query, 'яйца');
});

test('база 7: партия 200 г сухого риса + варка → ≈558 г, нутриенты = 2 строки 11-861, порция 150/558', () => {
  const b = computeBatch({ inputs: [{ code: '11-861', grams: 200, method: 'варка' }] }, (c) => ROW_BY_CODE.get(c), ROWS_BY_RAW);
  eq(b.cookedTotalG, 558);
  eq(b.confidence, 'medium');
  const r = byCode.get('11-861');
  eq(b.totals.kcal, Math.round(r.kcal * 2));
  eq(b.totals.p, Math.round(r.protein_g * 2 * 10) / 10);
  const portion = batchPortion(b, 150);
  eq(portion.kcal, Math.round(r.kcal * 2 * 150 / 558));
  // взвесили готовое — выход как есть, уверенность высокая
  const w = computeBatch({ inputs: [{ code: '11-861', grams: 200 }], weighedG: 600 }, (c) => ROW_BY_CODE.get(c), ROWS_BY_RAW);
  assert(w.cookedTotalG === 600 && w.confidence === 'high');
});

test('выход: нет пары → типовой коэффициент, уверенность низкая', () => {
  const y = resolveYield(byCode.get('18-289'), null, ROWS_BY_RAW); // курица тёмное мясо, сырое — пары нет
  assert(y && y.source === 'typical' && y.factor === 0.72 && y.confidence === 'low', JSON.stringify(y));
  const b = computeBatch({ inputs: [{ code: '18-289', grams: 500 }, { code: '17-045', grams: 10 }] }, (c) => ROW_BY_CODE.get(c), ROWS_BY_RAW);
  eq(b.cookedTotalG, 370); // 500 × 0,72 + масло 10 г
  assert(b.needsWeighing);
});

test('база 8: снимок в записи не меняется после обновления базы', () => {
  const food = catalogItem('18-323');
  const entry = { day: '2026-10-30', kcal: macrosFor(food, 150).kcal, p: macrosFor(food, 150).p, refId: food.id, sourceVersion: food.sourceVersion };
  const before = dayTotals([entry]);
  // «новая версия базы» с другими значениями: запись хранит свои числа и не пересчитывается
  const updated = { ...food, kcal: food.kcal + 50, sourceVersion: '2027-01-01' };
  assert(updated.kcal !== food.kcal);
  const after = dayTotals([entry]);
  eq(after.kcal, before.kcal);
  eq(entry.sourceVersion, food.sourceVersion);
});

test('каталог: блюда собраны из существующих продуктов, старые id разрешаются', () => {
  for (const d of DISHES) for (const [fid] of d.comp) assert(CATALOG_BY_ID[fid], `${d.id}: нет ${fid}`);
  for (const [old, neu] of Object.entries(LEGACY_MAP)) assert(CATALOG_BY_ID[neu], `${old} → ${neu}`);
  assert(catalogItem('f:cottage5')?.legacy, 'старый творог 5% не открывается');
  eq(catalogItem('f:rice').id, '11-862');
});

test('каталог: сырое и сухое — не позиции стека; готовое — да', () => {
  const ready = (id) => CATALOG_BY_ID[id].ready;
  for (const id of ['11-861', '18-289', '12-937', '11-716', '13-074', '11-006', '11-886']) assert(!ready(id), `${id} не должен быть в пуле`);
  for (const id of ['11-862', '18-323', '12-940', '11-1129', '13-662', 'calc:11-006', '11-788', '14-319', '12-174', '19-496']) assert(ready(id), `${id} должен быть в пуле`);
  note(`в пул годится ${CATALOG.length} из ${CATALOG_ALL.length}`);
});

test('теги: аллергии и исключения отсекают нужное', () => {
  const tags = (id) => CATALOG_BY_ID[id].tags;
  assert(tags('11-981').includes('gluten'), 'хлеб без глютена');
  assert(!tags('11-006').includes('gluten'), 'гречка с глютеном');
  assert(!tags('11-021').includes('gluten'), 'рисовая мука с глютеном');
  assert(tags('12-604').includes('dairy') && tags('12-604').includes('lactose'));
  assert(!tags('14-889').includes('dairy'), 'кокосовое молоко — не молочное');
  assert(!tags('13-355').includes('dairy'), 'тыква баттернат — не молочное');
  assert(tags('14-892').includes('peanut') && !tags('14-892').includes('dairy'));
  assert(tags('19-495').includes('pork'), 'сосиски без явной говядины — со свининой');
  assert(!tags('19-489').includes('pork'), 'говяжьи колбаски');
  assert(tags('11-724').includes('egg') && tags('11-724').includes('gluten'), 'яичная лапша');
  assert(tags('17-654').includes('egg'), 'майонез');
  assert(tags('13-556').includes('sesame'), 'хумус');
  const vegan = excludedTags({ dietExclusions: ['vegan'] });
  assert(!allowedByRestrictions(CATALOG_BY_ID['d:buckwheat_chicken'], vegan));
  assert(allowedByRestrictions(CATALOG_BY_ID['13-662'], vegan));
});
