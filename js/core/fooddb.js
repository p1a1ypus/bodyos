// База продуктов CoFID (data/foods_seed.json): строка базы → позиция каталога, поиск по русским названиям с синонимами,
// коэффициенты выхода, заготовки, снимок нутриентов. Чистые функции; правила — data/source/FOOD_DB_INTEGRATION.md.

export const ATTRIBUTION = 'Contains public sector information licensed under the Open Government Licence v3.0.';

const NUTRIENTS = [
  'kcal', 'kj', 'protein_g', 'fat_g', 'sat_fat_g', 'mufa_g', 'pufa_g', 'trans_fat_g', 'carbs_g', 'sugars_g', 'starch_g',
  'fibre_g', 'alcohol_g', 'water_g', 'cholesterol_mg', 'sodium_mg', 'salt_g', 'potassium_mg', 'calcium_mg', 'magnesium_mg',
  'iron_mg', 'zinc_mg', 'selenium_ug', 'iodine_ug', 'vit_d_ug', 'vit_b12_ug', 'folate_ug', 'vit_c_mg', 'vit_a_re_ug',
];

// ── Категории: приёмы пищи, типовая порция (г готового), время готовки, цена 1–3
const LD = ['lunch', 'dinner'];
const CAT = {
  'Курица': { meals: LD, portion: 150, prep: 25, cost: 2 },
  'Индейка': { meals: LD, portion: 150, prep: 25, cost: 3 },
  'Утка': { meals: LD, portion: 150, prep: 40, cost: 3 },
  'Говядина': { meals: LD, portion: 150, prep: 40, cost: 3 },
  'Телятина': { meals: LD, portion: 150, prep: 30, cost: 3 },
  'Свинина': { meals: LD, portion: 150, prep: 30, cost: 2 },
  'Баранина': { meals: LD, portion: 150, prep: 40, cost: 3 },
  'Дичь и кролик': { meals: LD, portion: 150, prep: 45, cost: 3 },
  'Субпродукты': { meals: LD, portion: 120, prep: 30, cost: 1 },
  'Бекон и ветчина': { meals: ['breakfast', 'lunch', 'dinner'], portion: 60, prep: 10, cost: 2 },
  'Колбасы и мясные изделия': { meals: ['any'], portion: 80, prep: 5, cost: 2 },
  'Рыба белая': { meals: LD, portion: 150, prep: 25, cost: 2 },
  'Рыба жирная': { meals: LD, portion: 130, prep: 25, cost: 3 },
  'Рыба и икра': { meals: ['breakfast', 'snack'], portion: 30, cost: 3 },
  'Морепродукты': { meals: LD, portion: 150, prep: 15, cost: 3 },
  'Яйца': { meals: ['breakfast', 'snack'], portion: 110, unit: { name: 'шт', g: 55 }, prep: 10, cost: 1 },
  'Рис': { meals: LD, portion: 180, prep: 20, cost: 1 },
  'Паста и лапша': { meals: LD, portion: 200, prep: 15, cost: 1 },
  'Крупы и мука': { meals: LD, portion: 200, prep: 20, cost: 1 },
  'Бобовые': { meals: LD, portion: 180, prep: 15, cost: 1 },
  'Картофель': { meals: LD, portion: 250, prep: 25, cost: 1 },
  'Овощи и зелень': { meals: ['any'], portion: 150, prep: 5, cost: 1 },
  'Овощные блюда': { meals: LD, portion: 150, cost: 1 },
  'Фрукты и ягоды': { meals: ['breakfast', 'snack'], portion: 150, cost: 1 },
  'Орехи и семена': { meals: ['snack'], portion: 30, cost: 2 },
  'Молоко': { meals: ['any'], portion: 200, cost: 1 },
  'Йогурт и кисломолочное': { meals: ['breakfast', 'snack'], portion: 170, cost: 2 },
  'Сыры': { meals: ['breakfast', 'snack'], portion: 30, cost: 2 },
  'Сливки': { meals: ['any'], portion: 30, cost: 2 },
  'Масло и спреды': { meals: ['any'], portion: 10, cost: 2 },
  'Растительные масла': { meals: ['any'], portion: 10, cost: 2 },
  'Животные жиры': { meals: ['any'], portion: 10, cost: 1 },
  'Хлеб и выпечка': { meals: ['any'], portion: 60, unit: { name: 'ломтик', g: 30 }, cost: 1 },
  'Сухие завтраки': { meals: ['breakfast'], portion: 50, cost: 2 },
  'Крекеры и хлебцы': { meals: ['breakfast', 'snack'], portion: 30, cost: 2 },
  'Шоколад': { meals: ['snack'], portion: 20, cost: 2 },
  'Снеки': { meals: ['snack'], portion: 30, cost: 2 },
  'Сахар, мёд, джемы': { meals: ['any'], portion: 15, cost: 1 },
  'Соусы': { meals: ['any'], portion: 20, cost: 1 },
  'Соки': { meals: ['breakfast', 'snack'], portion: 200, cost: 1 },
};
const CAT_DEFAULT = { meals: ['any'], portion: 100, cost: 2 };

export const MEAT_CATS = new Set(['Курица', 'Индейка', 'Утка', 'Говядина', 'Телятина', 'Свинина', 'Баранина', 'Дичь и кролик', 'Субпродукты', 'Бекон и ветчина', 'Колбасы и мясные изделия']);
export const FISH_CATS = new Set(['Рыба белая', 'Рыба жирная', 'Рыба и икра']);
const VEG_CATS = new Set(['Овощи и зелень', 'Картофель']);
// Это едят только приготовленным: сырая/сухая строка — ингредиент заготовки, не позиция стека
const NEEDS_COOKING = new Set([...MEAT_CATS, ...FISH_CATS, 'Морепродукты', 'Яйца', 'Рис', 'Паста и лапша', 'Крупы и мука', 'Бобовые', 'Картофель']);
// Не позиции стека: записать можно, в пул и стек не попадают
const NOT_FOR_POOL = new Set(['Специи и травы', 'Прочее', 'Алкоголь', 'Газировка', 'Кофе и чай', 'Какао и напитки', 'Соусы', 'Животные жиры', 'Сахар, мёд, джемы', 'Соки']);
const COOKED_STATES = new Set(['варёный', 'гриль', 'запечённый', 'на пару', 'тушёный', 'жареный', 'жареный без масла', 'консервированный', 'готовый', 'копчёный', 'маринованный', 'припущенный', 'квашеный', 'напиток']);
const COOKED_NAME = /варён|отварн|готов|гриль|запеч|жарен|туш[её]н|на пару|пашот|скрэмбл|копч|консерв|припущ/i;
const RAW_NAME = /(^|[\s,(])(сыр(ой|ая|ое|ые)|сух(ой|ая|ое|ие))([\s,)]|$)/i;
// Сырыми не едят, хотя категория «овощи»
const RAW_INEDIBLE = /баклажан|батат|бамия|артишок|пастернак|тыкв|брюссельск|спарж|шампиньон|вёшенк|топинамбур/i;

// ── Теги ограничений — эвристика по исходному английскому названию и категории.
// Ошибаемся в сторону исключения: лишний тег уберёт продукт из стека, недостающий — опаснее.
const GLUTEN = /\b(wheat|rye|barley|oat|oats|oatcakes|spelt|bulgur|couscous|semolina|bread|breads|pasta|spaghetti|noodles|fusilli|tagliatelle|baguette|bagels?|naan|pitta|tortilla|ciabatta|rolls|muesli|bran|weetabix|cereal|crackers|crispbread|porridge|yeast extract|soy sauce|worcestershire|stock cubes)\b/i;
const NUTS = /\b(almonds?|walnuts?|hazelnuts?|cashews?|pistachios?|pecans?|brazil|macadamia|pine nuts?|chestnuts?|coconut|mixed nuts|nuts|pesto)\b/i;
const DAIRY = /\b(milk|cheese|cheddar|brie|camembert|gouda|edam|emmental|gruyere|mozzarella|parmesan|ricotta|mascarpone|halloumi|paneer|stilton|roquefort|feta|quark|yogurt|yoghurt|tzatziki|fromage|cream|creme|butter|ghee|whey|porridge oats, unfortified, cooked)\b/i;
const NOT_DAIRY = /\b(coconut milk|peanut butter|butternut|cream crackers|cocoa butter)\b/i;

export function deriveTags(row) {
  const en = (row.name_en || '').toLowerCase();
  const cat = row.category_ru;
  const t = new Set();
  if (MEAT_CATS.has(cat) || /\b(lard|gelatine|stock cubes, (beef|chicken)|pate)\b/.test(en)) t.add('meat');
  if (['Курица', 'Индейка', 'Утка'].includes(cat) || /\b(chicken|turkey|duck)\b/.test(en)) t.add('poultry');
  if (['Говядина', 'Телятина'].includes(cat) || /\b(beef|ox|veal|calf)\b/.test(en)) t.add('beef');
  if (['Свинина', 'Бекон и ветчина'].includes(cat) || /\b(pork|pig|bacon|ham|gammon|lard|gelatine)\b/.test(en)) t.add('pork');
  // колбасы без явного «beef» считаем со свининой
  if (cat === 'Колбасы и мясные изделия' && !/\bbeef\b/.test(en)) t.add('pork').add('beef');
  if (FISH_CATS.has(cat) || /\b(anchov|fish|worcestershire)/.test(en)) t.add('fish');
  if (cat === 'Морепродукты') t.add('seafood');
  if ((['Молоко', 'Сыры', 'Йогурт и кисломолочное', 'Сливки'].includes(cat) || DAIRY.test(en)) && !NOT_DAIRY.test(en)) {
    t.add('dairy');
    if (!/\b(butter|ghee)\b/.test(en) || /\bmilk\b/.test(en)) t.add('lactose');
  }
  if (/\b(white|milk) chocolate|chocolate, (white|milk)/.test(en)) t.add('dairy').add('lactose');
  if (cat === 'Яйца' || (/\begg\b|\beggs\b|mayonnaise|coleslaw/.test(en))) t.add('egg');
  if (GLUTEN.test(en) && !/\b(rice|corn|gram|buckwheat)\b.*flour|flour, (rice|corn|gram)/.test(en)) t.add('gluten');
  if (/peanut/.test(en)) t.add('peanut');
  if (/mixed nuts/.test(en)) t.add('peanut');
  if (NUTS.test(en) || (cat === 'Орехи и семена' && !/peanut|seed|sesame|tahini|quinoa|poppy/.test(en))) t.add('nuts');
  if (/\b(soya|soy|tofu|edamame)\b/.test(en)) t.add('soy');
  if (/\b(sesame|tahini|houmous|hummus)\b/.test(en)) t.add('sesame');
  if (/\bhoney\b/.test(en)) t.add('honey');
  if (/\bfalafel\b/.test(en)) t.add('sesame');
  return [...t];
}

// Готово к еде как есть (позиция пула и стека), а не ингредиент
export function isReady(row) {
  if (row.kcal == null) return false;
  const cat = row.category_ru;
  const name = row.name_ru || '';
  const state = row.state_ru || '';
  if (NOT_FOR_POOL.has(cat)) return false;
  if (row.cofid_code === '11-788') return true; // овсяные хлопья едят и без варки (с молоком, йогуртом)
  if (COOKED_NAME.test(name) || COOKED_STATES.has(state)) return true;
  if (NEEDS_COOKING.has(cat)) return cat !== 'Крупы и мука' && state === '' && !RAW_NAME.test(name);
  if (state === 'сушёный' && VEG_CATS.has(cat)) return false;
  if (RAW_NAME.test(name) && (VEG_CATS.has(cat) || cat === 'Орехи и семена') && (RAW_INEDIBLE.test(name) || /каштан|киноа/i.test(name))) return false;
  return true;
}

// Требует готовки (ингредиент заготовки): к нему применяется коэффициент выхода
export function isCookable(row) {
  if (isReady(row)) return false;
  return NEEDS_COOKING.has(row.category_ru) || VEG_CATS.has(row.category_ru) || RAW_NAME.test(row.name_ru || '') || ['сырой', 'сушёный'].includes(row.state_ru);
}

// Строка базы → позиция каталога (интерфейс сборщика стека: kcal/p/f/c/fiber на 100 г, meals, portion…)
export function fromRow(row) {
  const cat = row.category_ru;
  const c = CAT[cat] || CAT_DEFAULT;
  const name = row.name_ru;
  let meals = c.meals;
  let portion = c.portion;
  if (cat === 'Сыры' && /кварк|творог|рикотт|коттедж/i.test(name)) portion = 180;
  if (row.cofid_code === '11-788') {
    meals = ['breakfast'];
    portion = 60;
  }
  if (/каша|овсянк/i.test(name) && (row.state_ru === 'готовый' || row.state_ru === 'варёный')) {
    meals = ['breakfast'];
    portion = 250;
  }
  const ready = isReady(row);
  const cookedNow = COOKED_NAME.test(name) || COOKED_STATES.has(row.state_ru);
  const prepMin = ready && !cookedNow ? 0 : row.state_ru === 'консервированный' ? 0 : c.prep ?? 0;
  return {
    id: row.cofid_code, kind: 'food', name, nameEn: row.name_en,
    category: cat, state: row.state_ru || null, cookingMethod: row.cooking_method_ru || null,
    kcal: row.kcal, p: row.protein_g ?? 0, f: row.fat_g ?? 0, c: row.carbs_g ?? 0, fiber: row.fibre_g ?? 0, fibreMethod: row.fibre_method || null,
    nova: row.nova_guess ?? null, tags: deriveTags(row), meals, portion, unit: c.unit || null, prepMin, cost: c.cost ?? 2,
    aliases: [], ready, lowPrecision: row.kcal == null,
    source: row.source, sourceVersion: row.source_version, row,
  };
}

// ── Расчётные строки: готовая крупа из сухой по коэффициенту, вода добавляется до 100 г (раздел 7)
export const DERIVED = [
  { code: 'calc:11-006', from: '11-006', factor: 3.0, name: 'Гречка варёная на воде', category: 'Крупы и мука', note: 'расчёт из сухой гречки, коэффициент 3,0 (раздел 7)' },
  { code: 'calc:11-788', from: '11-788', factor: 2.75, name: 'Овсянка на воде, готовая', category: 'Крупы и мука', note: 'расчёт из сухих хлопьев, коэффициент 2,75 — середина диапазона 2,5–3,0 (раздел 7)' },
  { code: 'calc:11-904', from: '11-904', factor: 2.9, name: 'Булгур варёный', category: 'Крупы и мука', note: 'расчёт из сухого, типовой коэффициент круп 2,9 (раздел 5)' },
  { code: 'calc:14-843', from: '14-843', factor: 2.9, name: 'Киноа варёная', category: 'Крупы и мука', note: 'расчёт из сухой, типовой коэффициент круп 2,9 (раздел 5)' },
];

export function deriveRow(raw, d) {
  const f = d.factor;
  const out = { ...raw };
  for (const k of NUTRIENTS) if (raw[k] != null) out[k] = Math.round((raw[k] / f) * 1000) / 1000;
  out.water_g = Math.round(((raw.water_g ?? 0) / f + 100 * (1 - 1 / f)) * 10) / 10;
  return {
    ...out, id: null, cofid_code: d.code, name_ru: d.name, name_en: `${raw.name_en}, boiled in water (calculated)`,
    category_ru: d.category || raw.category_ru, state_ru: 'варёный', cooking_method_ru: 'варка',
    yield_factor: f, yield_basis: null, yield_raw_code: raw.cofid_code, yield_by_protein: null, yield_by_dry_matter: null,
    yield_note: d.note, source: `расчёт из ${raw.source}`, source_ref: d.note, edible_proportion: 1,
  };
}

// ── Поиск (раздел 4): нормализация, префиксы токенов, синонимы, ранжирование
export function searchKey(s) {
  return String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}\s]+/gu, ' ').replace(/\s+/g, ' ').trim();
}

// Окончание множественного числа/падежа: «бананы» → «банан», «яйца» → «яйц»
const ENDING = /[аяыиоеуюйь]$/;
function tokenHit(words, t) {
  if (words.some((w) => w.startsWith(t))) return true;
  if (t.length >= 4 && ENDING.test(t)) {
    const s = t.slice(0, -1);
    return words.some((w) => w.startsWith(s));
  }
  return false;
}

// aliases: {фраза: [код | 'cat:Категория']}
export function buildIndex(items, aliases = {}) {
  const entries = items.map((it) => {
    const key = searchKey(it.name);
    const base = searchKey((it.name || '').split(',')[0]);
    return { it, key, base, words: searchKey([it.name, ...(it.aliases || [])].join(' ')).split(' ') };
  });
  const map = new Map();
  let maxLen = 1;
  for (const [phrase, targets] of Object.entries(aliases)) {
    if (phrase.startsWith('_') || !Array.isArray(targets)) continue;
    const k = searchKey(phrase);
    if (!k) continue;
    const ids = map.get(k) || new Set();
    for (const t of targets) {
      if (t.startsWith('cat:')) items.filter((x) => x.category === t.slice(4)).forEach((x) => ids.add(x.id));
      else ids.add(t);
    }
    map.set(k, ids);
    maxLen = Math.max(maxLen, k.split(' ').length);
  }
  return { entries, aliases: map, maxLen };
}

function matchersOf(query, index) {
  const toks = searchKey(query).split(' ').filter(Boolean);
  const out = [];
  for (let i = 0; i < toks.length;) {
    let took = 0;
    for (let L = Math.min(index.maxLen, toks.length - i); L >= 1; L--) {
      const phrase = toks.slice(i, i + L).join(' ');
      if (index.aliases.has(phrase)) {
        out.push({ tokens: toks.slice(i, i + L), alias: index.aliases.get(phrase) });
        took = L;
        break;
      }
    }
    if (!took) {
      out.push({ tokens: [toks[i]], alias: null });
      took = 1;
    }
    i += took;
  }
  return out;
}

const RAW_RANK = (it) => (it.state === 'сырой' ? 0 : it.state ? 2 : 1);

// usage: {id: сколько раз записывал} — поднимает привычное
export function searchFoods(query, index, { limit = 20, usage = {}, filter = null } = {}) {
  const q = searchKey(query);
  if (!q) return [];
  const ms = matchersOf(q, index);
  const hits = [];
  const viaAlias = new Set();
  for (const e of index.entries) {
    if (filter && !filter(e.it)) continue;
    if (!ms.every((m) => m.alias?.has(e.it.id) || m.tokens.every((t) => tokenHit(e.words, t)))) continue;
    hits.push(e);
    if (ms.some((m) => m.alias?.has(e.it.id))) viaAlias.add(e);
  }
  // найденное по синониму — выше: «рыба» — это треска и лосось, а не рыба-меч, хоть та и начинается с «рыба»
  const rank = (e) => [viaAlias.has(e) ? 0 : 1, e.key.startsWith(q) ? 0 : 1, -(usage[e.it.id] || 0), e.base.length, e.base, RAW_RANK(e.it), e.key.length];
  const cmp = (a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    for (let i = 0; i < ra.length; i++) {
      if (ra[i] < rb[i]) return -1;
      if (ra[i] > rb[i]) return 1;
    }
    return 0;
  };
  return hits.sort(cmp).slice(0, limit).map((e) => e.it);
}

// ── Коэффициенты выхода (раздел 5): готовый = сырой × коэффициент
export const COOKING_METHODS = ['варка', 'пар', 'гриль', 'запекание', 'запекание в масле', 'жарка в масле', 'жарка без масла', 'тушение', 'припускание'];

const isRice = (r) => r.category_ru === 'Рис';
const isBrown = (r) => /бур|коричнев|brown/i.test(`${r.name_ru} ${r.name_en}`);
// Типовые значения, когда пары нет (по 156 парам таблицы)
export const TYPICAL_YIELD = [
  { label: 'Мясо, птица — запекание/гриль', match: (r) => MEAT_CATS.has(r.category_ru), methods: ['запекание', 'гриль', 'запекание в масле'], factor: 0.72 },
  { label: 'Мясо — тушение (фарш)', match: (r) => MEAT_CATS.has(r.category_ru), methods: ['тушение'], factor: 0.85 },
  { label: 'Рыба — запекание/гриль/пар', match: (r) => FISH_CATS.has(r.category_ru) || r.category_ru === 'Морепродукты', methods: ['запекание', 'гриль', 'пар'], factor: 0.78 },
  { label: 'Рис бурый — варка', match: (r) => isRice(r) && isBrown(r), methods: ['варка'], factor: 2.7 },
  { label: 'Рис белый — варка', match: isRice, methods: ['варка'], factor: 2.8 },
  { label: 'Паста сухая — варка', match: (r) => r.category_ru === 'Паста и лапша', methods: ['варка'], factor: 2.2 },
  { label: 'Крупы прочие — варка', match: (r) => r.category_ru === 'Крупы и мука' || /quinoa/i.test(r.name_en || ''), methods: ['варка'], factor: 2.9 },
  { label: 'Чечевица — варка', match: (r) => r.category_ru === 'Бобовые' && /чечевиц/i.test(r.name_ru), methods: ['варка'], factor: 3.1 },
  { label: 'Бобовые сухие — варка', match: (r) => r.category_ru === 'Бобовые' && r.state_ru === 'сушёный', methods: ['варка'], factor: 2.6 },
  { label: 'Овощи свежие — варка/пар', match: (r) => VEG_CATS.has(r.category_ru) || r.category_ru === 'Бобовые', methods: ['варка', 'пар'], factor: 1.0 },
  { label: 'Овощи — запекание без масла', match: (r) => VEG_CATS.has(r.category_ru), methods: ['запекание'], factor: 0.8 },
  { label: 'Овощи — жарка в масле (масло — отдельным ингредиентом)', match: (r) => VEG_CATS.has(r.category_ru), methods: ['жарка в масле'], factor: 0.6 },
  { label: 'Яйца — варка/пашот', match: (r) => r.category_ru === 'Яйца', methods: ['варка', 'припускание'], factor: 0.95 },
];

export function defaultMethod(raw) {
  if (MEAT_CATS.has(raw.category_ru) || FISH_CATS.has(raw.category_ru) || raw.category_ru === 'Морепродукты') return 'запекание';
  return 'варка';
}

// rowsByRaw: Map(код сырого → [готовые строки с yield_raw_code])
export function resolveYield(raw, method, rowsByRaw) {
  const pairs = (rowsByRaw.get(raw.cofid_code) || []).filter((r) => r.yield_factor != null);
  const m = method || defaultMethod(raw);
  let cands = pairs.filter((r) => r.cooking_method_ru === m);
  if (!cands.length && !method && pairs.length) cands = pairs;
  if (cands.length) {
    const best = cands.find((r) => !r.yield_note) || cands[0];
    return { factor: best.yield_factor, method: best.cooking_method_ru, source: 'pair', cookedCode: best.cofid_code, confidence: best.yield_note ? 'low' : 'medium', note: best.yield_note || null };
  }
  const t = TYPICAL_YIELD.find((x) => x.methods.includes(m) && x.match(raw));
  if (t) return { factor: t.factor, method: m, source: 'typical', cookedCode: null, confidence: 'low', note: t.label };
  return null;
}

// ── Нутриенты: линейное масштабирование по граммам (ккал — из столбца kcal, не из макросов)
export function scaleNutrients(food, grams) {
  const k = grams / 100;
  const r1 = (x) => Math.round((x ?? 0) * k * 10) / 10;
  return {
    kcal: Math.round((food.kcal ?? 0) * k), p: r1(food.p), f: r1(food.f), c: r1(food.c), fiber: r1(food.fiber),
    lowPrecision: food.kcal == null || !!food.lowPrecision,
  };
}

// Проверка баланса энергии для своих продуктов: углеводы по массе (4 ккал/г), допуск 10%
export function energyMismatch({ kcal, p, f, c }, carbFactor = 4) {
  if (!(kcal > 0)) return null;
  return Math.abs(4 * (p || 0) + 9 * (f || 0) + carbFactor * (c || 0) - kcal) / kcal;
}

// ── Заготовки: партия из сырых ингредиентов
export const BATCH_SHELF_DAYS = { fridge: 4, freezer: 90 };
const CONF_RANK = { high: 3, medium: 2, low: 1 };

/**
 * inputs: [{code, grams, method?}] — сырые ингредиенты (масло, соль — тоже ингредиенты, их масса остаётся в блюде);
 * weighedG: сколько весит готовое (если взвесили — это и есть выход, уверенность high);
 * rowOf(code) → строка базы; rowsByRaw — для пар «сырой → готовый».
 */
export function computeBatch({ inputs, weighedG = null }, rowOf, rowsByRaw) {
  const totals = { kcal: 0, p: 0, f: 0, c: 0, fiber: 0 };
  let cooked = 0;
  let conf = 'medium';
  let lowPrecision = false;
  const parts = [];
  for (const inp of inputs) {
    const row = rowOf(inp.code);
    if (!row || !(inp.grams > 0)) continue;
    const k = inp.grams / 100;
    totals.kcal += (row.kcal ?? 0) * k;
    totals.p += (row.protein_g ?? 0) * k;
    totals.f += (row.fat_g ?? 0) * k;
    totals.c += (row.carbs_g ?? 0) * k;
    totals.fiber += (row.fibre_g ?? 0) * k;
    if (row.kcal == null) lowPrecision = true;
    let y = null;
    if (isCookable(row)) {
      y = resolveYield(row, inp.method || null, rowsByRaw);
      if (!y || CONF_RANK[y.confidence] < CONF_RANK[conf]) conf = 'low';
    }
    const out = inp.grams * (y ? y.factor : 1);
    cooked += out;
    parts.push({ code: inp.code, name: row.name_ru, grams: inp.grams, cookedG: Math.round(out), yield: y });
  }
  const weighed = weighedG > 0;
  if (weighed) {
    cooked = weighedG;
    conf = 'high';
  }
  const total = Math.round(cooked);
  const r1 = (x) => Math.round(x * 10) / 10;
  const t = { kcal: Math.round(totals.kcal), p: r1(totals.p), f: r1(totals.f), c: r1(totals.c), fiber: r1(totals.fiber) };
  const per100 = total > 0
    ? { kcal: Math.round((totals.kcal / total) * 100), p: r1((totals.p / total) * 100), f: r1((totals.f / total) * 100), c: r1((totals.c / total) * 100), fiber: r1((totals.fiber / total) * 100) }
    : { kcal: 0, p: 0, f: 0, c: 0, fiber: 0 };
  return { cookedTotalG: total, weighed, confidence: conf, needsWeighing: conf === 'low', totals: t, per100, parts, lowPrecision };
}

// Порция из партии: доля от суммарных нутриентов партии
export function batchPortion(batch, grams) {
  const share = batch.cookedTotalG > 0 ? grams / batch.cookedTotalG : 0;
  const r1 = (x) => Math.round(x * share * 10) / 10;
  const t = batch.totals;
  return { kcal: Math.round(t.kcal * share), p: r1(t.p), f: r1(t.f), c: r1(t.c), fiber: r1(t.fiber || 0) };
}
