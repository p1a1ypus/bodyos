// Каталог еды: база CoFID 2021 (data/foods_seed.json), расчётные строки (готовая крупа из сухой) и блюда из её продуктов.
// CATALOG_ALL — всё, что можно записать; CATALOG — то, что готово к еде и годится в пул и стек.
// Старые id (до CoFID) разрешаются через legacy_foods.js.
import { SEED_ROWS, SEED_ALIASES, SEED_VERSION } from '../data/foodseed.js';
import { fromRow, deriveRow, DERIVED, buildIndex, searchFoods } from './fooddb.js';
import { LEGACY_FOODS, LEGACY_DISHES, LEGACY_MAP, canonicalId } from './legacy_foods.js';

export { SEED_VERSION, SEED_ALIASES, LEGACY_MAP, canonicalId };

const seedByCode = new Map(SEED_ROWS.map((r) => [r.cofid_code, r]));
export const DERIVED_ROWS = DERIVED.map((d) => deriveRow(seedByCode.get(d.from), d));
export const ROWS = [...SEED_ROWS, ...DERIVED_ROWS];
export const ROW_BY_CODE = new Map(ROWS.map((r) => [r.cofid_code, r]));
// код сырого → готовые строки с этим yield_raw_code
export const ROWS_BY_RAW = new Map();
for (const r of ROWS) {
  if (!r.yield_raw_code) continue;
  if (!ROWS_BY_RAW.has(r.yield_raw_code)) ROWS_BY_RAW.set(r.yield_raw_code, []);
  ROWS_BY_RAW.get(r.yield_raw_code).push(r);
}

export const WATER = {
  id: 'x:water', kind: 'food', name: 'Вода', kcal: 0, p: 0, f: 0, c: 0, fiber: 0, nova: 1, tags: [], meals: ['any'],
  portion: 250, unit: null, prepMin: 0, cost: 0, aliases: [], ready: false, source: 'вода',
};

export const FOODS = ROWS.map(fromRow);
const FOODS_BY_ID = Object.fromEntries([...FOODS, WATER].map((f) => [f.id, f]));

// Блюдо → КБЖУ на 100 г из состава: Σ(нутриент × г / 100) / масса. КБЖУ блюда без состава не храним.
export function resolveDish(d, foodsById = FOODS_BY_ID) {
  const idOf = (fid) => {
    const id = foodsById[fid] ? fid : foodsById['f:' + fid] ? 'f:' + fid : fid;
    return foodsById[id] ? id : canonicalId(id);
  };
  const comp = d.comp.map(([fid, g]) => [idOf(fid), g]);
  let g = 0;
  const t = { kcal: 0, p: 0, f: 0, c: 0, fiber: 0 };
  const tags = new Set();
  let nova = 1;
  let lowPrecision = false;
  for (const [fid, grams] of comp) {
    const food = foodsById[fid];
    if (!food) continue;
    g += grams;
    for (const k of Object.keys(t)) t[k] += (food[k] ?? 0) * grams / 100;
    (food.tags || []).forEach((x) => tags.add(x));
    nova = Math.max(nova, food.nova || 1);
    if (food.kcal == null) lowPrecision = true;
  }
  const per = (x) => (g ? Math.round((x / g) * 1000) / 10 : 0);
  return {
    ...d, comp,
    kcal: g ? Math.round((t.kcal / g) * 100) : 0, p: per(t.p), f: per(t.f), c: per(t.c), fiber: per(t.fiber),
    tags: [...tags], nova, portion: d.portion || Math.round(g), unit: null, ready: true, lowPrecision,
  };
}

// Блюда: состав — коды CoFID в том виде, в каком продукт лежит в тарелке (варёный рис, запечённая рыба)
const D = (id, name, comp, o = {}) => ({
  id: 'd:' + id, kind: 'dish', name, comp, meals: o.meals || ['lunch', 'dinner'], portion: o.portion, prepMin: o.prep ?? 20,
  cost: o.cost ?? 2, aliases: o.aliases || [], source: 'блюдо из продуктов CoFID 2021',
});

const DISHES_RAW = [
  D('buckwheat_chicken', 'Гречка с курицей', [['calc:11-006', 200], ['18-323', 120], ['17-038', 5]], { prep: 25, cost: 1 }),
  D('rice_salmon', 'Рис с лососем и брокколи', [['11-862', 150], ['16-359', 120], ['13-503', 100]], { prep: 30, cost: 3 }),
  D('pasta_chicken', 'Паста с курицей и сыром', [['11-1129', 200], ['18-323', 120], ['12-604', 15], ['17-038', 10]], { prep: 25 }),
  D('plov', 'Плов с курицей', [['11-862', 180], ['18-334', 120], ['13-497', 50], ['17-045', 12]], { prep: 50 }),
  D('borsch', 'Борщ с говядиной', [['18-080', 50], ['13-489', 80], ['13-584', 70], ['13-633', 60], ['13-497', 20], ['17-045', 5], ['x:water', 215]], { prep: 60, portion: 400 }),
  D('oat_banana', 'Овсянка с бананом на молоке', [['11-788', 60], ['12-313', 150], ['14-318', 100]], { meals: ['breakfast'], prep: 10, cost: 1 }),
  D('omelet_veg', 'Омлет с помидором', [['12-937', 165], ['12-313', 50], ['13-517', 80], ['17-045', 5]], { meals: ['breakfast', 'dinner'], prep: 15, cost: 1 }),
  D('cottage_berries', 'Мягкий творог со смородиной и мёдом', [['12-174', 180], ['14-053', 80], ['17-050', 10]], { meals: ['breakfast', 'snack'], prep: 2 }),
  D('tuna_salad', 'Салат с тунцом и яйцом', [['16-416', 120], ['13-523', 100], ['13-517', 100], ['12-940', 55], ['17-038', 10]], { prep: 15 }),
  D('chicken_soup', 'Куриный суп с лапшой', [['18-331', 70], ['11-724', 60], ['13-489', 60], ['13-497', 20], ['x:water', 190]], { prep: 45, portion: 400, cost: 1 }),
  D('lentil_soup', 'Чечевичный суп', [['13-658', 130], ['13-489', 50], ['13-497', 30], ['17-038', 5], ['x:water', 185]], { prep: 35, portion: 400, cost: 1 }),
  D('turkey_bulgur', 'Индейка с булгуром и кабачком', [['18-356', 130], ['calc:11-904', 180], ['13-629', 100]], { prep: 35, cost: 3 }),
  D('beef_potato', 'Говядина с картофелем', [['18-080', 120], ['13-620', 220], ['17-045', 5]], { prep: 60 }),
  D('tofu_rice', 'Тофу с рисом и кабачком', [['13-570', 150], ['11-862', 150], ['13-629', 100], ['17-043', 8]], { prep: 25 }),
  D('chickpea_veg', 'Нут с кабачком', [['13-662', 180], ['13-629', 150], ['17-038', 8]], { prep: 20, cost: 1 }),
  D('cheese_sandwich', 'Бутерброды с сыром', [['11-981', 60], ['12-604', 30]], { meals: ['breakfast', 'snack'], prep: 3, cost: 1 }),
  D('egg_sandwich', 'Бутерброды с яйцом и огурцом', [['11-981', 60], ['12-940', 110], ['13-523', 50]], { meals: ['breakfast'], prep: 12, cost: 1 }),
  D('cod_potato', 'Треска с картофелем и салатом', [['16-373', 160], ['13-620', 200], ['13-523', 75], ['13-517', 75], ['17-038', 8]], { prep: 35 }),
  D('greek_granola', 'Йогурт с гранолой', [['12-555', 170], ['11-939', 40]], { meals: ['breakfast', 'snack'], prep: 2 }),
];

export const DISHES = DISHES_RAW.map((d) => resolveDish(d));

// Старые позиции без пары в CoFID: только чтобы открывались прежние записи и пул
const legacyFoodsById = { ...FOODS_BY_ID, ...Object.fromEntries(LEGACY_FOODS.map((f) => [f.id, f])) };
export const LEGACY_ITEMS = [...LEGACY_FOODS, ...LEGACY_DISHES.map((d) => resolveDish(d, legacyFoodsById))].filter((x) => !LEGACY_MAP[x.id]);

export const CATALOG_ALL = [...FOODS, ...DISHES];
export const CATALOG = CATALOG_ALL.filter((x) => x.ready);
export const CATALOG_BY_ID = Object.fromEntries([...CATALOG_ALL, WATER, ...LEGACY_ITEMS].map((x) => [x.id, x]));

export const catalogItem = (id, byId = CATALOG_BY_ID) => byId[id] || byId[canonicalId(id)] || null;

export const DIET_EXCLUSIONS = {
  vegetarian: { label: 'Вегетарианство', tags: ['meat', 'poultry', 'fish', 'seafood', 'pork', 'beef'] },
  vegan: { label: 'Веганство', tags: ['meat', 'poultry', 'fish', 'seafood', 'pork', 'beef', 'dairy', 'lactose', 'egg', 'honey'] },
  pescatarian: { label: 'Без мяса, рыба можно', tags: ['meat', 'poultry', 'pork', 'beef'] },
  halal: { label: 'Халяль (без свинины)', tags: ['pork'] },
  no_fish: { label: 'Не ем рыбу и морепродукты', tags: ['fish', 'seafood'] },
  no_pork: { label: 'Без свинины', tags: ['pork'] },
  no_beef: { label: 'Без говядины', tags: ['beef'] },
};

export const ALLERGENS = {
  lactose: 'Лактоза', dairy: 'Молочный белок', gluten: 'Глютен', egg: 'Яйца', nuts: 'Орехи',
  peanut: 'Арахис', fish: 'Рыба', seafood: 'Морепродукты', soy: 'Соя', sesame: 'Кунжут',
};

export function excludedTags(profile) {
  const s = new Set(profile?.allergies || []);
  for (const ex of profile?.dietExclusions || []) (DIET_EXCLUSIONS[ex]?.tags || []).forEach((t) => s.add(t));
  return s;
}

export function allowedByRestrictions(item, excluded) {
  return !(item.tags || []).some((t) => excluded.has(t));
}

// Поиск: индекс строится один раз на список (кэш по ссылке на массив)
const indexCache = new WeakMap();
export function indexFor(items, aliases = SEED_ALIASES) {
  let idx = indexCache.get(items);
  if (!idx || idx.aliasesRef !== aliases) {
    idx = { ...buildIndex(items, aliases), aliasesRef: aliases };
    indexCache.set(items, idx);
  }
  return idx;
}

export function searchCatalog(query, items = CATALOG_ALL, limit = 20, opts = {}) {
  return searchFoods(query, indexFor(items, opts.aliases), { limit, usage: opts.usage, filter: opts.filter });
}

// Разбор без LLM: части текста через запятую/«и» → запрос к поиску; «200 г» и «2 шт» понимает.
// Возвращает запрос и до 3 кандидатов — человек выбирает (как и после LLM); ненайденное — с пустым списком.
// \b в JS не работает с кириллицей — границы слова через пробелы
const NUM_WORDS = { один: 1, одна: 1, одно: 1, одну: 1, два: 2, две: 2, пара: 2, пару: 2, три: 3, четыре: 4, пять: 5, шесть: 6 };
const NUM_RE = `(^|\\s)(${Object.keys(NUM_WORDS).join('|')})(?=\\s|$)`;
const NUM_WORD = new RegExp(NUM_RE, 'i');
const NUM_WORDS_ALL = new RegExp(NUM_RE, 'gi');
const FILLER = /(^|\s)(утром|днём|днем|вечером|ночью|на|завтрак|обед|ужин|перекус|съел[аи]?|ел[аи]?|было|была|был|обычно|потом|ещё|еще|немного|чуть|с|со)(?=\s|$)/gi;

export function keywordParse(text, search = (q) => searchCatalog(q, CATALOG_ALL, 3)) {
  const parts = text.split(/[,;\n.]|\sи\s|\sплюс\s|\sпотом\s/i).map((s) => s.trim()).filter((s) => s.length > 2);
  const out = [];
  for (const p of parts) {
    const grams = Number((p.match(/(\d+)\s*(г|гр|грамм)/i) || [])[1]) || null;
    const pieces = Number((p.match(/(\d+)\s*(шт|штук|яйц)/i) || [])[1]) || NUM_WORDS[(p.match(NUM_WORD) || [])[2]?.toLowerCase()] || null;
    const words = p.replace(/\d+\s*(г|гр|грамм|шт|штук)\.?/gi, ' ').replace(/\d+\s*%/g, ' ').replace(/\b\d+\b/g, ' ').replace(NUM_WORDS_ALL, ' ')
      .replace(FILLER, ' ').replace(FILLER, ' ').replace(/[—–-]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!words) continue;
    const long = words.split(' ').filter((w) => w.length > 2);
    let query = words;
    let candidates = search(query);
    // слишком подробно — пробуем по первым словам
    for (let n = long.length - 1; !candidates.length && n >= 1; n--) {
      query = long.slice(0, n).join(' ');
      candidates = search(query);
    }
    // не нашлось — позиция остаётся: человек выберет поиском или добавит свой продукт с этикетки
    if (!candidates.length) {
      out.push({ name: p, query: words, grams, candidates: [], matchId: null, confidence: 0.3 });
      continue;
    }
    const hit = candidates[0];
    const g = grams || (pieces && hit.unit ? pieces * hit.unit.g : null) || hit.portion;
    out.push({ name: p, query, grams: g, candidates: candidates.slice(0, 3), matchId: hit.id, confidence: grams ? 0.6 : 0.5 });
  }
  return out;
}
