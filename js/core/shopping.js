// Список покупок из стеков недели: блюда раскладываются на продукты, готовый вес → сырой по коэффициенту выхода
// (пара «готовый → сырой» из базы; нет пары — типовой коэффициент категории и способа, помечается «примерно»).
import { CATALOG_BY_ID, ROW_BY_CODE, catalogItem } from './foods.js';
import { TYPICAL_YIELD } from './fooddb.js';

// старые позиции (до CoFID) без пары в базе: сколько сырого даёт 1 г готового
const LEGACY_RAW_FACTOR = { 'f:millet': 0.33, 'f:chicken_cutlet': 1.1 };
const SKIP = new Set(['x:water', 'f:water']);
const STATE_METHOD = { 'варёный': 'варка', 'гриль': 'гриль', 'запечённый': 'запекание', 'на пару': 'пар', 'тушёный': 'тушение', 'жареный': 'жарка в масле', 'припущенный': 'припускание' };

function expand(refId, grams, out, catalog, depth = 0) {
  const ref = catalogItem(refId, catalog);
  if (!ref || depth > 3 || ref.kind === 'batch') return; // заготовка уже приготовлена
  if (ref.kind === 'dish' && ref.comp?.length) {
    const total = ref.comp.reduce((s, [, g]) => s + g, 0);
    for (const [fid, g] of ref.comp) expand(fid, (grams * g) / total, out, catalog, depth + 1);
    return;
  }
  if (SKIP.has(ref.id)) return;
  out.set(ref.id, (out.get(ref.id) || 0) + grams);
}

// Готовая позиция → что купить: сырой продукт и множитель «г сырого на 1 г готового»
export function rawFor(ref) {
  const row = ref.row || ROW_BY_CODE.get(ref.id);
  if (row?.yield_raw_code && row.yield_factor) {
    const raw = ROW_BY_CODE.get(row.yield_raw_code);
    return { id: row.yield_raw_code, name: raw?.name_ru || ref.name, factor: 1 / row.yield_factor, note: 'сырой вес' };
  }
  const method = STATE_METHOD[ref.state];
  const t = row && method ? TYPICAL_YIELD.find((x) => x.methods.includes(method) && x.match(row)) : null;
  if (t && t.factor !== 1) return { id: ref.id, name: ref.name.split(',')[0], factor: 1 / t.factor, note: 'сырой вес, примерно' };
  if (LEGACY_RAW_FACTOR[ref.id]) return { id: ref.id, name: ref.name.replace(/ (варёное|варёные|домашние)/g, ''), factor: LEGACY_RAW_FACTOR[ref.id], note: 'сырой вес' };
  return { id: ref.id, name: ref.name, factor: 1, note: '' };
}

// plans: [{items: [{refId, grams}]}]
export function shoppingList(plans, catalog = CATALOG_BY_ID) {
  const cooked = new Map();
  for (const p of plans) for (const it of p.items || []) expand(it.refId, it.grams, cooked, catalog);
  const raw = new Map();
  for (const [refId, g] of cooked) {
    const r = rawFor(catalogItem(refId, catalog));
    const prev = raw.get(r.id);
    raw.set(r.id, { refId: r.id, name: r.name, g: (prev?.g || 0) + g * r.factor, note: prev?.note || r.note });
  }
  return [...raw.values()]
    .map((x) => ({ refId: x.refId, name: x.name, grams: Math.ceil(x.g / 10) * 10, note: x.note }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}
