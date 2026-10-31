// Прикладной слой: связывает ядро (чистые функции) с хранилищем. Экраны вызывают только его.
import { addDays, dayKey, daysBetween, isWeekend, weekStart, weekDays, mean, groupBy, uid } from '../core/util.js';
import { CONFIDENCE, COACH, STACK } from '../core/constants.js';
import {
  CATALOG_BY_ID, ROW_BY_CODE, ROWS_BY_RAW, SEED_ALIASES, SEED_VERSION, LEGACY_MAP, resolveDish, excludedTags, allowedByRestrictions,
  catalogItem, canonicalId,
} from '../core/foods.js';
import { buildIndex, searchFoods, computeBatch, batchPortion, energyMismatch, fromRow, BATCH_SHELF_DAYS } from '../core/fooddb.js';
import { macrosFor, dayTotals, closenessWord } from '../core/nutrition.js';
import { dailyWeights, emaTrend } from '../core/trend.js';
import { restrictions } from '../core/safety.js';
import { checkGoal, PHASES } from '../core/goals.js';
import { initialModelState, runWeeklyCycle, budgetFor } from '../core/coach.js';
import { buildStack, builderItem, swapOptions, withinTolerance } from '../core/stack.js';
import { resolveProgram, planSession, nextDayIndex, weeklyVolume, volumeWarnings, relativeStrength, alternativesFor } from '../core/training.js';
import { shoppingList } from '../core/shopping.js';
import { poolWarnings } from '../core/pool.js';
import { CSV_EXPORTS, toCSV } from '../data/db.js';
import { DEFAULT_LLM, summaryFacts, templateSummary, validateSummary } from '../llm/llm.js';

export const QUESTIONS = [
  { id: 'steps', text: 'Сколько ты обычно проходишь за день?', options: ['меньше 5 тыс. шагов', '5–8 тыс.', '8–12 тыс.', 'больше 12 тыс.'] },
  { id: 'work', text: 'Работа в основном какая?', options: ['сидячая', 'смешанная', 'на ногах', 'физическая'] },
  { id: 'experience', text: 'Сколько ты тренируешься с отягощениями?', options: ['не тренируюсь', 'меньше года', '1–3 года', 'больше 3 лет'] },
  { id: 'meals', text: 'Сколько раз в день тебе удобно есть?', options: ['2', '3', '4', '5 и больше'] },
  { id: 'late', text: 'Бывает, что ешь поздно вечером?', options: ['почти никогда', 'иногда', 'часто'] },
  { id: 'sleepTime', text: 'Во сколько обычно ложишься?', options: ['до 23:00', '23–24', 'после полуночи', 'по-разному'] },
  { id: 'cooking', text: 'Как ты относишься к готовке?', options: ['готовлю с удовольствием', 'по необходимости', 'стараюсь не готовить'] },
];

export function createServices(store, llm) {
  const S = {};
  const today = () => dayKey();

  // ── Настройки, профиль
  S.settings = () => ({ id: 'main', noNumbers: false, llm: { ...DEFAULT_LLM }, ...store.get('settings', 'main') });
  S.saveSettings = (patch) => store.put('settings', { ...S.settings(), ...patch });
  S.profile = () => store.get('profile', 'me');
  S.onboarded = () => !!S.profile()?.onboardedAt;
  S.saveProfile = (patch) => store.put('profile', { ...S.profile(), ...patch, id: 'me' });

  // ── Каталог: CoFID + свои продукты (вручную, штрих-код) + свои блюда + заготовки. Пересобирается, когда что-то из них меняется.
  S.customFoods = () => store.all('foods');
  let catCache = null;
  const catSig = () => [store.all('foods').length, store.all('dishes').length, ...store.all('batches', { withDeleted: true }).map((b) => b.updatedAt || 0),
    store.all('foodEntries').filter((e) => e.refType === 'batch').length, JSON.stringify(S.settings().foodAliases || {})].join('|');
  S.catalogById = () => {
    const sig = catSig();
    if (catCache?.sig === sig) return catCache.byId;
    const m = { ...CATALOG_BY_ID };
    for (const f of S.customFoods()) m[f.id] = { ready: true, ...f };
    for (const d of store.all('dishes')) m[d.id] = resolveDish(d, m);
    for (const b of S.batches({ active: true })) m['batch:' + b.id] = batchItem(b);
    const list = Object.values(m).filter((x) => x.id !== 'x:water' && !x.legacy);
    catCache = { sig, byId: m, list, index: buildIndex(list, { ...SEED_ALIASES, ...(S.settings().foodAliases || {}) }) };
    return m;
  };
  S.ref = (id) => (id ? catalogItem(id, S.catalogById()) : null);
  S.catalog = () => (S.catalogById(), catCache.list);
  S.excluded = () => excludedTags(S.profile());
  S.allowed = (ref) => allowedByRestrictions(ref, S.excluded());
  // Поиск: префиксы, синонимы (базовые и свои), сначала привычное. pool — только то, что годится в стек.
  S.usage = () => {
    const u = {};
    for (const e of store.all('foodEntries')) if (e.refId) u[canonicalId(e.refId)] = (u[canonicalId(e.refId)] || 0) + 1;
    return u;
  };
  S.search = (q, { pool = false, limit = 20 } = {}) => {
    S.catalogById();
    const ex = S.excluded();
    return searchFoods(q, catCache.index, { limit, usage: S.usage(), filter: (x) => allowedByRestrictions(x, ex) && (!pool || x.ready) && x.kind !== 'batch' });
  };
  S.foodRow = (code) => ROW_BY_CODE.get(code) || null;

  // Свой продукт: обязательны название и КБЖУ на 100 г; баланс энергии проверяется (допуск 10%)
  S.checkCustomFood = (f) => energyMismatch(f);
  S.addCustomFood = async ({ name, kcal, p, f, c, fiber = 0, portion = 100, meals = ['any'] }) => {
    if (!name?.trim() || !(kcal >= 0) || [p, f, c].some((x) => !(x >= 0))) throw new Error('нужны название, ккал, белки, жиры и углеводы');
    return store.put('foods', {
      id: 'user:' + uid(), kind: 'food', name: name.trim(), kcal, p, f, c, fiber, nova: null, tags: [], meals, portion,
      unit: null, prepMin: 0, cost: 2, aliases: [], ready: true, source: 'user', sourceVersion: null,
    });
  };

  // Свои синонимы поиска: {фраза: [id]}
  S.userAliases = () => S.settings().foodAliases || {};
  S.addAlias = async (phrase, id) => {
    const k = phrase.trim().toLowerCase();
    if (!k) return;
    const a = { ...S.userAliases() };
    a[k] = [...new Set([...(a[k] || []), id])];
    await S.saveSettings({ foodAliases: a });
  };
  S.removeAlias = async (phrase) => {
    const a = { ...S.userAliases() };
    delete a[phrase];
    await S.saveSettings({ foodAliases: a });
  };

  // Старые id продуктов (до CoFID) → коды базы: пул, свои блюда, планы с сегодняшнего дня. Записи еды — снимки, их не трогаем.
  S.migrateFoods = async () => {
    const meta = { id: 'foods', ...store.get('meta', 'foods') };
    if ((meta.refsVersion || 0) < 2) {
      for (const p of store.all('pool')) {
        const to = LEGACY_MAP[p.refId];
        if (!to) continue;
        const dup = store.all('pool').some((q) => q.id !== p.id && q.refId === to && q.active !== false);
        await store.put('pool', { ...p, refId: to, name: CATALOG_BY_ID[to]?.name || p.name, legacyId: p.refId, active: dup ? false : p.active });
      }
      for (const d of store.all('dishes')) await store.put('dishes', { ...d, comp: d.comp.map(([fid, g]) => [canonicalId(fid.includes(':') ? fid : 'f:' + fid), g]) });
      for (const plan of store.all('dayPlans').filter((x) => x.day >= today())) {
        await store.put('dayPlans', { ...plan, items: plan.items.map((i) => ({ ...i, refId: canonicalId(i.refId) })) });
      }
      meta.refsVersion = 2;
    }
    if (meta.seedVersion !== SEED_VERSION) {
      meta.prevSeedVersion = meta.seedVersion || null;
      meta.seedVersion = SEED_VERSION;
      meta.seedSeenAt = Date.now();
    }
    await store.put('meta', meta);
  };
  S.foodsMeta = () => store.get('meta', 'foods') || {};

  // ── Заготовки: партия из сырых ингредиентов; остаток = выход − записанные порции
  S.batches = ({ active = false, day = today() } = {}) => store.all('batches')
    .filter((b) => !active || (!b.finishedAt && b.expiresAt >= day && S.batchRemaining(b) >= 30))
    .sort((a, b) => (a.expiresAt < b.expiresAt ? -1 : 1));
  S.batchRemaining = (b) => {
    const eaten = store.all('foodEntries').filter((e) => e.refId === 'batch:' + b.id).reduce((s, e) => s + (e.grams || 0), 0);
    return Math.max(0, Math.round(b.cookedTotalG - eaten));
  };
  S.previewBatch = ({ inputs, weighedG }) => computeBatch({ inputs, weighedG }, (c) => S.foodRow(c), ROWS_BY_RAW);
  S.saveBatch = async ({ id, name, inputs, weighedG, storage = 'fridge', meals = ['lunch', 'dinner'], portionG = 250, cookedAt = today() }) => {
    const r = S.previewBatch({ inputs, weighedG });
    if (!r.cookedTotalG) throw new Error('добавь ингредиенты');
    const rows = inputs.map((i) => S.foodRow(i.code)).filter(Boolean);
    const tags = [...new Set(rows.flatMap((row) => fromRow(row).tags))];
    const nova = Math.max(1, ...rows.map((row) => row.nova_guess || 1));
    const prev = id ? store.get('batches', id) : null;
    return store.put('batches', {
      ...(prev || {}), name: name?.trim() || 'Заготовка', cookedAt, inputs, weighedG: weighedG || null, storage, meals, portionG,
      expiresAt: prev?.expiresAt && prev.storage === storage ? prev.expiresAt : addDays(cookedAt, BATCH_SHELF_DAYS[storage] || 4),
      cookedTotalG: r.cookedTotalG, confidence: r.confidence, needsWeighing: r.needsWeighing, totals: r.totals, per100: r.per100, tags, nova,
    });
  };
  S.finishBatch = (id) => store.put('batches', { ...store.get('batches', id), finishedAt: Date.now() });
  const batchItem = (b) => {
    const left = S.batchRemaining(b);
    return {
      id: 'batch:' + b.id, kind: 'batch', batchId: b.id, name: `${b.name} (заготовка)`, ...b.per100, nova: b.nova ?? null, tags: b.tags || [],
      meals: b.meals || ['lunch', 'dinner'], portion: Math.max(10, Math.min(b.portionG || 250, left)), unit: null, prepMin: 0, cost: 1,
      aliases: [], ready: true, source: 'заготовка', expiresAt: b.expiresAt, remainingG: left, batchConfidence: b.confidence,
    };
  };

  // ── Цель, фаза, состояние модели
  S.goal = () => store.all('goals').sort((a, b) => b.createdAt - a.createdAt)[0] || null;
  S.phase = () => store.all('phases').sort((a, b) => (a.start < b.start ? 1 : -1))[0] || null;
  S.modelState = () => {
    const all = store.all('modelStates');
    return all.sort((a, b) => (a.weekStart || '') < (b.weekStart || '') ? 1 : -1)[0] || null;
  };
  S.trend = () => emaTrend(dailyWeights(store.all('weights')));
  S.currentWeight = () => {
    const t = S.trend();
    return t.length ? t[t.length - 1].trend : S.profile()?.startWeightKg;
  };
  S.restr = (day = today()) => restrictions(S.profile(), { weightKg: S.currentWeight(), today: day });
  S.noNumbers = () => S.settings().noNumbers || S.restr().forceNoNumbers || false;

  // ── Вес, чекин, здоровье, обхваты
  S.addWeight = async (kg, day = today(), source = 'manual') => {
    const old = store.byDay('weights', day).filter((w) => w.source === source);
    for (const w of old) await store.remove('weights', w.id);
    return store.put('weights', { day, kg, ts: Date.now(), source });
  };
  S.checkin = (day = today()) => store.byDay('checkins', day)[0] || null;
  S.saveCheckin = async ({ day = today(), kg, sleep, readiness, soreness, note, sleepHours }) => {
    const prev = S.checkin(day);
    await store.put('checkins', { ...(prev || {}), day, sleep, readiness, soreness, note: note || '', ts: Date.now() });
    if (kg > 0) await S.addWeight(kg, day);
    if (sleepHours > 0) await S.addHealth({ day, type: 'sleep', value: sleepHours });
  };
  S.addHealth = async ({ day = today(), type, value, source = 'manual' }) => {
    for (const h of store.byDay('health', day).filter((x) => x.type === type && x.source === source)) await store.remove('health', h.id);
    return store.put('health', { day, type, value, source, ts: Date.now() });
  };
  S.saveMeasurements = async (day, fields) => {
    const prev = store.byDay('measurements', day)[0];
    return store.put('measurements', { ...(prev || {}), day, ...fields });
  };

  // ── Пул
  S.pool = ({ all = false } = {}) => store.all('pool').filter((p) => all || p.active !== false);
  S.poolRefs = () => S.pool().map((p) => S.ref(p.refId)).filter(Boolean);
  S.poolWarnings = () => poolWarnings(S.poolRefs().filter(S.allowed));
  S.addToPool = async (refId, grams, from = 'manual') => {
    refId = canonicalId(refId);
    const ex = store.all('pool').find((p) => p.refId === refId);
    const ref = S.ref(refId);
    if (ex) return store.put('pool', { ...ex, active: true, deleted: false });
    return store.put('pool', { refId, name: ref?.name || refId, grams: grams || ref?.portion || 100, priority: 0, replaceCount: 0, eatenCount: 0, active: true, from });
  };
  S.setPoolActive = (id, active) => store.put('pool', { ...store.get('pool', id), active });
  // Пул + активные заготовки; заготовки — в приоритете, и тем выше, чем ближе срок
  S.builderItems = (day = today()) => {
    const items = S.pool().map((p) => ({ p, ref: S.ref(p.refId) })).filter((x) => x.ref && S.allowed(x.ref)).map((x) => builderItem(x.p, x.ref));
    for (const b of S.batches({ active: true, day })) {
      const ref = batchItem(b);
      if (!S.allowed(ref)) continue;
      const daysLeft = Math.max(0, daysBetween(day, b.expiresAt));
      const it = builderItem({ id: ref.id, grams: ref.portion, priority: 10 + 2 * Math.max(0, 5 - daysLeft) }, ref);
      it.hi = Math.max(it.step, Math.min(it.hi, Math.floor(ref.remainingG / it.step) * it.step));
      it.lo = Math.min(it.lo, it.hi);
      it.batch = true;
      items.push(it);
    }
    return items;
  };

  // ── Еда
  S.entries = (day = today()) => store.byDay('foodEntries', day).sort((a, b) => a.ts - b.ts);
  S.totals = (day = today()) => dayTotals(S.entries(day));
  // Запись — снимок нутриентов на момент записи: обновление базы историю не переписывает
  S.makeEntry = ({ refId, grams, method, confidence, planItemId = null, day = today(), name }) => {
    const ref = S.ref(refId);
    if (!ref) throw new Error('нет такого продукта: ' + refId);
    const batch = ref.kind === 'batch' ? store.get('batches', ref.batchId) : null;
    const lowPrecision = ref.kcal == null || !!ref.lowPrecision;
    let conf = confidence ?? CONFIDENCE.search;
    if (lowPrecision) conf = Math.min(conf, CONFIDENCE.approx);
    if (batch?.confidence === 'low') conf = Math.min(conf, CONFIDENCE.llm);
    return {
      day, ts: Date.now(), refType: ref.kind || 'food', refId: ref.id, name: name || ref.name, grams,
      ...(batch ? batchPortion(batch, grams) : macrosFor(ref, grams)), nova: ref.nova ?? null, confidence: conf, method, planItemId,
      foodCode: ref.kind === 'food' ? ref.id : null, source: ref.source || null, sourceVersion: ref.sourceVersion || null,
      ...(lowPrecision ? { lowPrecision: true } : {}),
    };
  };
  S.makeApprox = ({ kcal, day = today(), name = 'Примерно', planItemId = null }) => ({
    day, ts: Date.now(), refType: 'approx', refId: null, name, grams: null, kcal: Math.round(kcal), p: 0, f: 0, c: 0,
    nova: null, confidence: CONFIDENCE.approx, method: 'approx', planItemId,
  });
  S.addEntries = async (entries, { rebuild = true } = {}) => {
    const saved = await store.putMany('foodEntries', entries);
    const day = entries[0]?.day;
    if (rebuild && day && store.get('dayPlans', 'dp-' + day)) await S.rebuild(day);
    return saved;
  };
  S.removeEntry = async (id) => {
    const e = store.get('foodEntries', id);
    await store.remove('foodEntries', id);
    if (e && store.get('dayPlans', 'dp-' + e.day)) await S.rebuild(e.day);
  };
  S.recentFoods = (limit = 8) => {
    const from = addDays(today(), -30);
    const es = store.all('foodEntries').filter((e) => e.day >= from && e.refId && e.refType !== 'batch' && S.ref(e.refId));
    const g = groupBy(es, (e) => S.ref(e.refId).id);
    return [...g.entries()]
      .map(([refId, list]) => ({ refId, name: S.ref(refId).name, grams: list.sort((a, b) => b.ts - a.ts)[0].grams, count: list.length }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  };

  // ── Стек дня
  const cookMin = (day) => {
    const p = S.profile();
    return (isWeekend(day) ? p?.cookWeekendMin : p?.cookWeekdayMin) || Infinity;
  };
  const historyMap = (day) => {
    const h = {};
    for (let k = 1; k <= 2; k++) {
      const d = addDays(day, -k);
      const plan = store.get('dayPlans', 'dp-' + d);
      if (plan) h[d] = plan.items.filter((i) => i.status !== 'swapped' && i.status !== 'dropped').map((i) => i.poolItemId);
    }
    return h;
  };
  const targetsOf = (st) => ({ kcal: st.budget, p: st.macros.p, f: st.macros.f });

  S.dayPlan = (day = today()) => store.get('dayPlans', 'dp-' + day);
  S.ensureDayPlan = async (day = today()) => {
    const st = S.modelState();
    const plan = S.dayPlan(day);
    // план, собранный заранее под старое состояние модели и ещё не тронутый, пересобираем
    const untouched = plan && plan.items.every((i) => i.status === 'plan') && !S.entries(day).length;
    if (plan && !(untouched && plan.stateId !== st?.id)) return plan;
    return S.buildDayPlan(day);
  };
  S.buildDayPlan = async (day, { save = true } = {}) => {
    const st = S.modelState();
    const items = S.builderItems(day);
    if (!st || !items.length) return null;
    const t = S.totals(day);
    const s = buildStack({ targets: targetsOf(st), eaten: t, items, history: historyMap(day), day, cookMin: cookMin(day), poolSize: items.length });
    const plan = {
      id: 'dp-' + day, day, stateId: st.id, budget: st.budget, macros: st.macros,
      status: s.closed ? 'closed' : 'open',
      items: s.items.map((it) => ({ id: uid(), ...it, status: 'plan', foodEntryIds: [] })),
    };
    return save ? store.put('dayPlans', plan) : plan;
  };

  // Пересборка только незакрытых позиций под остаток дня
  S.rebuild = async (day = today()) => {
    const plan = S.dayPlan(day);
    if (!plan) return null;
    const st = S.modelState();
    const open = plan.items.filter((i) => i.status === 'plan');
    const keep = plan.items.filter((i) => i.status !== 'plan');
    const eaten = S.totals(day);
    // бюджет плана — всегда текущий бюджет модели (мог измениться после цикла или принятого предложения)
    plan.budget = st.budget;
    plan.macros = st.macros;
    plan.stateId = st.id;
    if (!open.length) return store.put('dayPlans', { ...plan, status: 'closed' });
    const s = buildStack({
      targets: targetsOf(st), eaten, items: S.builderItems(day), history: historyMap(day), day, cookMin: cookMin(day),
      slots: open.map((i) => i.slot), seed: open.map((i) => i.poolItemId), lock: open.filter((i) => i.chosen).map((i) => i.poolItemId),
      // от чего сегодня отказались («не хочу это»), обратно не предлагаем
      exclude: plan.items.filter((i) => i.status === 'swapped').map((i) => i.poolItemId),
      // при отклонении можно добавить позицию, пока в дне не больше 5
      maxItems: Math.max(open.length, STACK.maxItems - keep.filter((i) => i.status === 'eaten' || i.status === 'replaced').length),
    });
    if (s.closed) {
      return store.put('dayPlans', { ...plan, status: 'closed', items: [...keep, ...open.map((i) => ({ ...i, status: 'dropped' }))] });
    }
    const fresh = s.items.map((it) => {
      const same = open.find((o) => o.poolItemId === it.poolItemId);
      return { ...(same || { id: uid(), foodEntryIds: [] }), ...it, status: 'plan', chosen: same?.chosen || false };
    });
    const dropped = open.filter((o) => !fresh.some((f) => f.id === o.id)).map((o) => ({ ...o, status: 'dropped' }));
    return store.put('dayPlans', { ...plan, status: 'open', items: [...keep, ...dropped, ...fresh] });
  };

  const bumpPool = async (poolItemId, field) => {
    const p = store.get('pool', poolItemId);
    if (p) await store.put('pool', { ...p, [field]: (p[field] || 0) + 1 });
  };
  const updateItem = async (day, itemId, patch) => {
    const plan = S.dayPlan(day);
    await store.put('dayPlans', { ...plan, items: plan.items.map((i) => (i.id === itemId ? { ...i, ...patch } : i)) });
  };

  // Один тап: «съел как в плане»
  S.closeItem = async (day, itemId) => {
    const it = S.dayPlan(day).items.find((i) => i.id === itemId);
    const [e] = await store.putMany('foodEntries', [S.makeEntry({ refId: it.refId, grams: it.grams, method: 'plan', confidence: CONFIDENCE.plan, planItemId: it.id, day })]);
    await updateItem(day, itemId, { status: 'eaten', foodEntryIds: [e.id] });
    await bumpPool(it.poolItemId, 'eatenCount');
    const plan = S.dayPlan(day);
    if (!plan.items.some((i) => i.status === 'plan')) await store.put('dayPlans', { ...plan, status: 'closed' });
  };
  S.undoItem = async (day, itemId) => {
    const it = S.dayPlan(day).items.find((i) => i.id === itemId);
    for (const id of it.foodEntryIds || []) await store.remove('foodEntries', id);
    await updateItem(day, itemId, { status: 'plan', foodEntryIds: [] });
    await S.rebuild(day);
  };
  S.skipItem = async (day, itemId) => {
    await updateItem(day, itemId, { status: 'dropped' });
    await S.rebuild(day);
  };
  // Замена позиции фактом (съел другое) → пересборка остатка
  S.replaceWithFact = async (day, itemId, entries) => {
    const it = S.dayPlan(day).items.find((i) => i.id === itemId);
    const saved = await store.putMany('foodEntries', entries.map((e) => ({ ...e, planItemId: itemId })));
    await updateItem(day, itemId, { status: 'replaced', foodEntryIds: saved.map((e) => e.id) });
    await bumpPool(it.poolItemId, 'replaceCount');
    await S.rebuild(day);
  };
  // «Не хочу это»: варианты и замена из пула
  S.swapOptions = (day, itemId) => {
    const plan = S.dayPlan(day);
    const open = plan.items.filter((i) => i.status === 'plan');
    const idx = open.findIndex((i) => i.id === itemId);
    return swapOptions({ targets: targetsOf(S.modelState()), eaten: S.totals(day), items: S.builderItems(day), openPlan: open, index: idx });
  };
  S.swapItem = async (day, itemId, poolItemId) => {
    const plan = S.dayPlan(day);
    const old = plan.items.find((i) => i.id === itemId);
    const pi = store.get('pool', poolItemId);
    const ref = S.ref(pi ? pi.refId : poolItemId);
    const neu = { id: uid(), poolItemId, refId: ref.id, name: ref.name, slot: old.slot, grams: pi?.grams || ref.portion, status: 'plan', chosen: true, foodEntryIds: [] };
    await store.put('dayPlans', { ...plan, items: [...plan.items.map((i) => (i.id === itemId ? { ...i, status: 'swapped' } : i)), neu] });
    await bumpPool(old.poolItemId, 'replaceCount');
    await S.rebuild(day);
  };

  // Завтра и неделя вперёд — черновики, пересобираются, если модель успела обновиться
  S.planAhead = async (fromDay, days) => {
    const res = [];
    for (let k = 0; k < days; k++) {
      const d = addDays(fromDay, k);
      res.push(await S.ensureDayPlan(d));
    }
    return res.filter(Boolean);
  };
  S.shopping = (week) => store.get('shopping', 'sl-' + week);
  S.makeShopping = async (fromDay) => {
    const plans = await S.planAhead(fromDay, 7);
    const items = shoppingList(plans.map((p) => ({ items: p.items.filter((i) => i.status === 'plan') })), S.catalogById());
    return store.put('shopping', { id: 'sl-' + fromDay, week: fromDay, items, checked: [] });
  };

  // ── Коуч-цикл
  const cycleInput = (ws) => {
    const plans = store.all('dayPlans');
    return {
      weekStart: ws,
      profile: S.profile(),
      goal: S.goal(),
      phase: S.phase(),
      weights: store.all('weights'),
      // заготовки — не кандидаты в пул; старые id — к кодам базы
      foodEntries: store.all('foodEntries').map((e) => ({ ...e, refId: e.refType === 'batch' ? null : canonicalId(e.refId) })),
      checkins: store.all('checkins'),
      sets: store.all('sets'),
      sessions: store.all('sessions').filter((s) => s.finishedAt),
      program: S.program(),
      planItems: plans.flatMap((p) => p.items.map((i) => ({ ...i, day: p.day }))),
      pool: S.pool({ all: true }).map((p) => ({ ...p, name: p.name })),
      sleepSamples: store.all('health').filter((h) => h.type === 'sleep'),
    };
  };

  // Прогоняет все завершённые недели, которые ещё не обработаны
  S.catchUp = async () => {
    const p = S.profile();
    if (!p?.onboardedAt) return [];
    const lastDone = addDays(weekStart(today()), -7);
    const made = [];
    for (let ws = weekStart(p.onboardedDay); ws <= lastDone; ws = addDays(ws, 7)) {
      if (store.get('modelStates', 'ms-' + ws)) continue;
      const prev = S.modelState();
      const res = runWeeklyCycle({ ...cycleInput(ws), prevState: prev });
      await applyCycle(ws, res);
      made.push(ws);
    }
    if (made.length) {
      const d = today();
      const plan = S.dayPlan(d);
      if (plan && plan.items.every((i) => i.status === 'plan') && !S.entries(d).length) await S.buildDayPlan(d);
      else if (plan) await S.rebuild(d);
    }
    return made;
  };

  async function applyCycle(ws, res) {
    const nextWeek = addDays(ws, 7);
    await store.put('modelStates', { id: 'ms-' + ws, ...res.state });
    if (res.phaseChange) await S.changePhase(res.phaseChange.to, res.phaseChange.reason, { start: nextWeek, keepState: true });
    if (res.programChanges.length) {
      const prog = S.program();
      for (const c of res.programChanges) prog.days[c.dayIndex].exercises[c.slotIndex].sets += c.delta;
      await store.put('programs', prog);
    }
    for (const id of res.pool.demote) {
      const pi = store.get('pool', id);
      if (pi) await store.put('pool', { ...pi, priority: (pi.priority || 0) - 1 });
    }
    const noNumbers = S.noNumbers();
    // одно и то же предложение не повторяем, пока прошлое не принято/не отклонено больше 4 недель назад
    const sig = (p) => `${p.rule}:${p.action.type}:${p.action.refId || p.action.to || ''}`;
    const recent = new Set(S.messages().filter((m) => m.week >= addDays(ws, -28)).flatMap((m) => m.proposals.filter((p) => p.status !== 'accepted').map(sig)));
    const msg = {
      id: 'cm-' + ws, week: ws, text: templateSummary(res, { noNumbers }), llm: false,
      reasons: res.changes, proposals: res.proposals.filter((p) => !recent.has(sig(p))).map((x) => ({ ...x, status: 'new' })), aggregates: res.aggregates,
    };
    await store.put('coachMessages', msg);
    S.summarizeWithLLM(msg.id, res).catch(() => {});
  }

  // Сводка через LLM: только проверенные предложения; иначе остаётся шаблонная
  S.summarizeWithLLM = async (msgId, res) => {
    if (!llm.available()) return;
    const facts = summaryFacts(res, { noNumbers: S.noNumbers() });
    const sentences = await llm.weeklySummary(facts);
    const kept = validateSummary(sentences, facts);
    if (kept.length >= 2) {
      const m = store.get('coachMessages', msgId);
      await store.put('coachMessages', { ...m, text: kept.join(' '), llm: true, droppedSentences: sentences.length - kept.length });
    }
  };

  S.messages = () => store.all('coachMessages').sort((a, b) => (a.week < b.week ? 1 : -1));

  S.changePhase = async (to, reason, { start = today(), plannedWeeks = null, keepState = false } = {}) => {
    const cur = S.phase();
    if (cur) await store.put('phases', { ...cur, end: addDays(start, -1) });
    await store.put('phases', { type: to, start, after: cur?.type || null, reason, plannedWeeks });
    if (!keepState) await recomputeBudget({ phase: to, phaseAdjustKcal: 0 });
  };

  // Пересчёт бюджета текущего состояния (смена фазы, принятое предложение)
  async function recomputeBudget(patch = {}) {
    const st = { ...S.modelState(), ...patch };
    const restr = S.restr();
    const b = budgetFor({ tdee: st.tdeeEst, phaseType: st.phase, goal: S.goal(), weightKg: S.currentWeight(), profile: S.profile(), restr, adjust: st.phaseAdjustKcal || 0 });
    await store.put('modelStates', { ...st, budget: b.budget, macros: b.macros, phase: b.phase, updatedReason: patch.reason || null });
    const d = today();
    if (S.dayPlan(d)) await S.rebuild(d);
  }

  S.canSwitchPhase = (to) => {
    const restr = S.restr();
    if (!restr.allowedPhases.includes(to)) return { ok: false, reason: 'Эта фаза недоступна при твоих ограничениях здоровья.' };
    const cur = S.phase();
    if (cur?.type === 'maintenance' && (cur.reason || '').startsWith('безопасность') && (to === 'deficit' || to === 'surplus')) {
      const weeks = Math.floor(daysBetween(cur.start, today()) / 7);
      if (weeks < COACH.maintenanceBeforeNextPhase) return { ok: false, reason: 'После срабатывания защиты — минимум 2 недели поддержания.' };
    }
    return { ok: true };
  };

  S.decideProposal = async (msgId, propId, accept) => {
    const m = store.get('coachMessages', msgId);
    const p = m.proposals.find((x) => x.id === propId);
    await store.put('coachMessages', { ...m, proposals: m.proposals.map((x) => (x.id === propId ? { ...x, status: accept ? 'accepted' : 'declined' } : x)) });
    if (!accept) return;
    const a = p.action;
    if (a.type === 'phase') {
      const chk = S.canSwitchPhase(a.to);
      if (!chk.ok) throw new Error(chk.reason);
      await S.changePhase(a.to, `принято предложение: ${p.text}`, { plannedWeeks: a.weeks || null });
    } else if (a.type === 'budgetAdjust') {
      const st = S.modelState();
      await recomputeBudget({ phaseAdjustKcal: (st.phaseAdjustKcal || 0) + a.kcal, reason: p.text });
    } else if (a.type === 'recalcTdee') {
      await recomputeBudget({ tdeeEst: a.value, reason: p.text });
    } else if (a.type === 'addToPool') {
      await S.addToPool(a.refId, a.grams, 'log');
    }
  };

  S.changeGoal = async (goal) => {
    const chk = checkGoal(goal, { weightKg: S.currentWeight(), heightCm: S.profile().heightCm, today: today(), restr: S.restr() });
    if (!chk.ok) return chk;
    await store.put('goals', { ...chk.goal });
    if (S.phase()?.type !== chk.phase && S.canSwitchPhase(chk.phase).ok) await S.changePhase(chk.phase, 'новая цель');
    else await recomputeBudget({});
    return chk;
  };

  // «Почему такой бюджет»: детерминированное объяснение из состояния модели
  S.explainBudget = () => {
    const st = S.modelState();
    const m = S.messages()[0];
    const lines = [];
    lines.push(`Фаза: ${PHASES[st.phase]}.`);
    if (!S.noNumbers()) {
      lines.push(`Оценка расхода: ${st.tdeeEst} ккал/день (уверенность ${Math.round(st.confidence * 100)}%).`);
      if (st.phaseAdjustKcal) lines.push(`Поправка по прогрессу: ${st.phaseAdjustKcal > 0 ? '+' : ''}${st.phaseAdjustKcal} ккал/день.`);
      lines.push(`Бюджет: ${st.budget} ккал, белок ${st.macros.pMin}–${st.macros.pMax} г, жиры от ${st.macros.fMin} г.`);
    }
    if (m) for (const c of m.reasons.filter((r) => [1, 2, 3, 4, 5].includes(r.rule))) lines.push(`${c.what} — ${c.reason}`);
    return lines;
  };
  S.askCoach = async (question) => {
    const st = S.modelState();
    const ctx = {
      phase: st.phase, budget: S.noNumbers() ? 'скрыто' : st.budget, macros: S.noNumbers() ? 'скрыто' : st.macros,
      tdeeEst: S.noNumbers() ? 'скрыто' : st.tdeeEst, confidence: st.confidence, lastWeek: S.messages()[0]?.reasons || [],
      rules: 'Раздел 5: безопасность → сон → калибровка → бюджет → прогресс → тренировки → разгрузка → плато → фаза → пул. Пол бюджета 1200/1500 ккал, дефицит ≤ 1%/нед.',
      pool: S.poolRefs().map((r) => r.name),
    };
    return llm.ask(question, ctx);
  };

  // ── Тренировки
  S.program = () => store.get('programs', 'current');
  S.setProgram = (prog) => store.put('programs', { ...prog, id: 'current' });
  S.sessionsDone = () => store.all('sessions').filter((s) => s.finishedAt);
  S.activeSession = () => store.all('sessions').find((s) => !s.finishedAt) || null;
  S.isDeloadWeek = () => {
    const st = S.modelState();
    return !!(st?.deloadNext && st.weekStart && addDays(st.weekStart, 7) === weekStart(today()));
  };
  S.nextSessionPlan = () => {
    const prog = S.program();
    if (!prog) return null;
    return planSession({ program: prog, dayIndex: nextDayIndex(prog, S.sessionsDone()), sets: store.all('sets'), startWeights: S.profile()?.startWeights || {}, deload: S.isDeloadWeek() });
  };
  S.startSession = async () => {
    const plan = S.nextSessionPlan();
    const sp = await store.put('sessionPlans', { day: today(), ...plan });
    return store.put('sessions', { day: today(), ts: Date.now(), dayIndex: plan.dayIndex, sessionPlanId: sp.id, startedAt: Date.now() });
  };
  S.sessionPlan = (session) => store.get('sessionPlans', session.sessionPlanId);
  S.sessionSets = (sessionId) => store.all('sets').filter((x) => x.sessionId === sessionId).sort((a, b) => a.order - b.order);
  S.logSet = (session, { exerciseId, kg, reps, rir, order }) =>
    store.put('sets', { sessionId: session.id, day: session.day, ts: Date.now(), exerciseId, kg: Number(kg) || 0, reps: Number(reps) || 0, rir: rir === '' || rir == null ? null : Number(rir), order });
  S.removeSet = (id) => store.remove('sets', id);
  S.finishSession = async (session) => {
    const durationMin = Math.round((Date.now() - session.startedAt) / 60000);
    return store.put('sessions', { ...session, finishedAt: Date.now(), durationMin });
  };
  S.cancelSession = async (session) => {
    for (const x of S.sessionSets(session.id)) await store.remove('sets', x.id);
    await store.remove('sessions', session.id);
  };
  S.weekVolume = (ws = weekStart(today())) => {
    const days = new Set(weekDays(ws));
    const v = weeklyVolume(store.all('sets').filter((x) => days.has(x.day)));
    return { volume: v, warnings: S.program() ? volumeWarnings(v, S.program()) : [] };
  };
  S.relativeStrength = () => relativeStrength(store.all('sets'), S.currentWeight());
  S.alternatives = (exerciseId) => alternativesFor(exerciseId, { equipment: S.profile().equipment, injuries: S.profile().injuries || [] });
  S.substitute = async (dayIndex, slotIndex, exerciseId) => {
    const prog = S.program();
    prog.days[dayIndex].exercises[slotIndex].exerciseId = exerciseId;
    await S.setProgram(prog);
  };

  // ── Анализы: только таблица, тренды и флаги «вне референса», без рекомендаций
  S.saveLabs = (rows) => store.putMany('labs', rows);
  S.labSeries = () => {
    const strict = S.restr().strictLabFlags;
    const g = groupBy(store.all('labs'), (x) => x.name.trim().toLowerCase());
    return [...g.values()].map((list) => {
      const rows = list.sort((a, b) => (a.day < b.day ? -1 : 1)).map((x) => {
        const lo = x.refMin === '' || x.refMin == null ? null : Number(x.refMin);
        const hi = x.refMax === '' || x.refMax == null ? null : Number(x.refMax);
        let flag = null;
        if (lo != null && x.value < lo) flag = 'ниже референса';
        else if (hi != null && x.value > hi) flag = 'выше референса';
        else if (strict && ((lo != null && x.value < lo * 1.05) || (hi != null && x.value > hi * 0.95))) flag = 'у границы референса';
        return { ...x, flag };
      });
      return { name: list[0].name, unit: list[list.length - 1].unit, rows };
    }).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  };

  // ── Вопрос дня
  S.todayQuestion = () => {
    const answered = new Set(store.all('questions').map((q) => q.qid));
    const askedToday = store.all('questions').some((q) => q.day === today());
    if (askedToday) return null;
    return QUESTIONS.find((q) => !answered.has(q.id)) || null;
  };
  S.answerQuestion = async (qid, value) => {
    await store.put('questions', { qid, value, day: today() });
    const p = S.profile();
    await S.saveProfile({ extra: { ...(p.extra || {}), [qid]: value } });
  };

  // ── Онбординг
  S.checkGoal = (goal, profile, weightKg) =>
    checkGoal(goal, { weightKg, heightCm: profile.heightCm, today: today(), restr: restrictions(profile, { weightKg, today: today() }) });
  S.restrictionsFor = (profile, weightKg) => restrictions(profile, { weightKg, today: today() });

  S.completeOnboarding = async (d) => {
    const day = today();
    const profile = {
      id: 'me', sex: d.sex, birthDate: d.birthDate, heightCm: d.heightCm, startWeightKg: d.weightKg,
      equipment: d.equipment, daysPerWeek: d.daysPerWeek, sessionMin: d.sessionMin,
      injuries: d.injuries, stopFlags: d.stopFlags, meds: d.meds || '', healthNotes: d.healthNotes || '',
      allergies: d.allergies, dietExclusions: d.dietExclusions, foodNotes: d.foodNotes || '',
      cookWeekdayMin: d.cookWeekdayMin, cookWeekendMin: d.cookWeekendMin, foodBudget: d.foodBudget,
      trainingNow: d.trainingNow || '', startWeights: d.startWeights || {},
      onboardedAt: Date.now(), onboardedDay: day, extra: {},
    };
    await store.put('profile', profile);
    await S.addWeight(d.weightKg, day);
    const goal = await store.put('goals', { ...d.goal });
    await store.put('phases', { type: d.phase, start: day, after: null, reason: 'старт' });
    const st = initialModelState({ profile, goal, phaseType: d.phase, weightKg: d.weightKg, today: day });
    await store.put('modelStates', { id: 'ms-init', ...st });
    await S.setProgram(resolveProgram({ daysPerWeek: d.daysPerWeek, equipment: d.equipment, injuries: d.injuries, sessionMin: d.sessionMin }));
    for (const it of d.pool) await S.addToPool(it.refId, it.grams, 'onboarding');
    if (d.yesterday?.length) await store.putMany('foodEntries', d.yesterday.map((e) => ({ ...e, day: addDays(day, -1) })));
    if (d.noNumbers) await S.saveSettings({ noNumbers: true });
    await S.buildDayPlan(day);
  };

  // ── Экспорт / импорт
  S.exportJSON = () => store.exportJSON();
  S.exportCSV = (name) => toCSV(store.all(name, { withDeleted: true }), CSV_EXPORTS[name]);
  S.importJSON = (obj) => store.importJSON(obj);
  S.llmLog = () => store.all('llmLog').sort((a, b) => b.ts - a.ts);

  // Режим «без цифр»: слова вместо чисел
  S.closeness = (actual, target) => closenessWord(actual, target);
  S.withinTolerance = withinTolerance;
  S.mean = mean;
  return S;
}
