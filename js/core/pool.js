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

// Сытный гарнир: крахмал без лишнего белка и с калориями на порцию (рис, гречка, макароны, картофель, хлеб).
// Бобовые и зелёный горошек — тоже углеводы, но с ними одними стек упирается в белок и не добирает калории.
export function isStaple(x) {
  const e = Math.max(1, x.kcal);
  return poolRole(x) === 'carb' && (x.p * 4) / e < 0.2 && (x.kcal * x.portion) / 100 >= 140;
}

// Чего не хватает пулу, чтобы стек сходился: замечания для онбординга и настроек
export function poolWarnings(refs) {
  const w = [];
  const roles = refs.map(poolRole);
  const count = (r) => roles.filter((x) => x === r).length;
  const meals = (m) => refs.filter((x) => x.meals.includes(m)).length;
  if (refs.length < 10) w.push(`в пуле ${refs.length} позиций — нужно минимум 10`);
  if (count('protein') < 2) w.push('мало белковых позиций (мясо, рыба, творог, яйца, бобовые)');
  if (count('carb') + count('mixed') < 2) w.push('мало источников углеводов (крупы, хлеб, картофель, фрукты)');
  else if (refs.filter((x) => isStaple(x) || (poolRole(x) === 'mixed' && (x.kcal * x.portion) / 100 >= 350)).length < 2) {
    w.push('мало сытных гарниров (рис, гречка, макароны, картофель, хлеб) — без них стек не доберёт калории');
  }
  if (count('fat') + refs.filter((x) => x.kcal >= 250).length < 1) w.push('нет калорийной добавки (орехи, сыр, масло, хлеб)');
  if (!meals('breakfast')) w.push('нет позиций на завтрак');
  if (meals('lunch') + meals('dinner') < 2) w.push('мало позиций на обед и ужин');
  return w;
}

// Типовые кандидаты (коды CoFID и блюда из них)
const TYPICAL = [
  '11-788', 'd:oat_banana', '12-940', 'd:omelet_veg', '12-174', 'd:cottage_berries', '12-555', 'd:cheese_sandwich',
  'd:buckwheat_chicken', '18-323', 'calc:11-006', '11-862', '13-620', 'd:pasta_chicken', 'd:plov', 'd:borsch',
  '16-373', '16-359', 'd:tuna_salad', 'd:chicken_soup', '18-356', 'd:beef_potato', 'd:lentil_soup', '13-523',
  '14-319', '14-318', '12-184', '14-879', '11-981', '12-604', 'd:tofu_rice', 'd:chickpea_veg', '13-570',
  '13-661', '14-892', 'd:greek_granola', '12-539', 'd:cod_potato', 'd:turkey_bulgur', '13-503',
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
