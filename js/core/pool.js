// Пул еды: роли позиций, проверка баланса, кандидаты для онбординга.
import { CATALOG, excludedTags, allowedByRestrictions } from './foods.js';

// Основная роль позиции по доле энергии из макронутриента
export function poolRole(x) {
  const e = Math.max(1, x.kcal);
  const pShare = (x.p * 4) / e;
  const fShare = (x.f * 9) / e;
  const cShare = (x.c * 4) / e;
  if (pShare >= 0.4) return 'protein';
  if (x.kcal >= 250 && fShare >= 0.45) return 'fat';
  if (cShare >= 0.5) return 'carb';
  return 'mixed';
}

export const ROLE_LABELS = { protein: 'белок', carb: 'углеводы', fat: 'жиры', mixed: 'смешанные' };

// Чего не хватает пулу, чтобы стек сходился: замечания для онбординга и настроек
export function poolWarnings(refs) {
  const w = [];
  const roles = refs.map(poolRole);
  const count = (r) => roles.filter((x) => x === r).length;
  const meals = (m) => refs.filter((x) => x.meals.includes(m)).length;
  if (refs.length < 10) w.push(`в пуле ${refs.length} позиций — нужно минимум 10`);
  if (count('protein') < 2) w.push('мало белковых позиций (мясо, рыба, творог, яйца, бобовые)');
  if (count('carb') + count('mixed') < 2) w.push('мало источников углеводов (крупы, хлеб, картофель, фрукты)');
  if (count('fat') + refs.filter((x) => x.kcal >= 250).length < 1) w.push('нет калорийной добавки (орехи, сыр, масло, хлеб)');
  if (!meals('breakfast')) w.push('нет позиций на завтрак');
  if (meals('lunch') + meals('dinner') < 2) w.push('мало позиций на обед и ужин');
  return w;
}

const TYPICAL = [
  'f:oats', 'd:oat_banana', 'f:egg', 'd:omelet_veg', 'f:cottage5', 'd:cottage_berries', 'f:greek_yog', 'd:cheese_sandwich',
  'd:buckwheat_chicken', 'f:chicken_breast', 'f:buckwheat', 'f:rice', 'f:potato', 'd:pasta_chicken', 'd:plov', 'd:borsch',
  'f:cod', 'f:salmon', 'd:tuna_salad', 'd:chicken_soup', 'f:turkey', 'd:beef_potato', 'd:lentil_soup', 'f:veg_salad_oil',
  'f:apple', 'f:banana', 'f:kefir1', 'f:walnut', 'f:bread_whole', 'f:cheese', 'd:tofu_rice', 'd:chickpea_veg', 'f:tofu',
  'f:lentil', 'f:peanut_butter', 'd:greek_granola', 'd:syrniki_sc', 'd:cod_potato', 'd:turkey_bulgur',
];

// 20–30 кандидатов: сначала то, что человек назвал, затем типовые под ограничения
export function poolCandidates(profile, mentionedIds = [], max = 28) {
  const ex = excludedTags(profile);
  const byId = new Map(CATALOG.map((x) => [x.id, x]));
  const out = [];
  const add = (id) => {
    const x = byId.get(id);
    if (x && allowedByRestrictions(x, ex) && !out.includes(x)) out.push(x);
  };
  mentionedIds.forEach(add);
  TYPICAL.forEach((id) => out.length < max && add(id));
  for (const x of CATALOG) if (out.length < Math.min(max, 20)) add(x.id);
  return out.slice(0, Math.max(max, mentionedIds.length));
}
