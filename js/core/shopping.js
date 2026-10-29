// Список покупок из стеков недели: блюда раскладываются на продукты, готовый вес → сырой.
import { CATALOG_BY_ID } from './foods.js';

// Сколько сырого продукта даёт 1 г готового (крупы развариваются, мясо ужаривается)
const RAW_FACTOR = {
  'f:buckwheat': 0.37, 'f:rice': 0.36, 'f:rice_brown': 0.37, 'f:pasta': 0.45, 'f:bulgur': 0.4,
  'f:quinoa': 0.4, 'f:pearl_barley': 0.3, 'f:millet': 0.33, 'f:chickpea': 0.45, 'f:lentil': 0.4,
  'f:chicken_breast': 1.3, 'f:chicken_thigh': 1.3, 'f:turkey': 1.3, 'f:beef_stew': 1.4,
  'f:beef_mince': 1.25, 'f:pork_loin': 1.3, 'f:salmon': 1.2, 'f:cod': 1.2, 'f:chicken_cutlet': 1.1,
};

const SKIP = new Set(['f:water']);

function expand(refId, grams, out, catalog, depth = 0) {
  const ref = catalog[refId];
  if (!ref || depth > 3) return;
  if (ref.kind === 'dish' && ref.comp?.length) {
    const total = ref.comp.reduce((s, [, g]) => s + g, 0);
    for (const [fid, g] of ref.comp) expand(fid, (grams * g) / total, out, catalog, depth + 1);
    return;
  }
  if (SKIP.has(refId)) return;
  out.set(refId, (out.get(refId) || 0) + grams);
}

// plans: [{items: [{refId, grams}]}]
export function shoppingList(plans, catalog = CATALOG_BY_ID) {
  const cooked = new Map();
  for (const p of plans) for (const it of p.items || []) expand(it.refId, it.grams, cooked, catalog);
  return [...cooked.entries()]
    .map(([refId, g]) => {
      const f = RAW_FACTOR[refId] ?? 1;
      const ref = catalog[refId];
      return {
        refId,
        name: ref?.name.replace(/ (варёная|варёный|варёные|готовая|готовое|тушёная|тушёное|запечённая|запечённый|отварной|жареный)/g, '') || refId,
        grams: Math.ceil((g * f) / 10) * 10,
        note: f !== 1 ? 'сырой вес' : '',
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}
