// Сборщик стека дня: детерминированный. Жадный подбор 3–5 позиций из пула под остаток КБЖУ,
// затем подбор граммовки (координатный спуск) и локальные замены. Приоритет ошибки: белок > ккал > жиры.
// Если белок или ккал всё равно вне допуска, вес этой ошибки поднимается и подбор повторяется.
import { STACK } from './constants.js';
import { addDays } from './util.js';

const BASE_W = { p: 3, kcal: 2, f: 1 };
const LAMBDA = 0.03; // тяга к привычной порции
const MAIN_SLOTS = ['breakfast', 'lunch', 'dinner'];
const SHARE = { breakfast: 0.27, lunch: 0.35, dinner: 0.3, snack: 0.1 };
const MAX_PORTION_FACTOR = 2.5;
const MAX_PORTION_G = 700;
export const SLOT_LABELS = { breakfast: 'Завтрак', lunch: 'Обед', dinner: 'Ужин', snack: 'Перекус' };

// poolItem + запись каталога → элемент сборщика
export function builderItem(poolItem, ref) {
  const unitG = ref.unit?.g || null;
  const portion = poolItem.grams || ref.portion || 100;
  const step = unitG || (portion <= 60 ? 5 : 10);
  const lo = unitG ? unitG : Math.max(step, Math.round((portion * 0.5) / step) * step);
  const hiRaw = Math.min(portion * MAX_PORTION_FACTOR, Math.max(MAX_PORTION_G, portion));
  const hi = Math.max(lo, Math.floor(hiRaw / step) * step);
  return {
    id: poolItem.id,
    refId: ref.id,
    name: ref.name,
    per: { kcal: ref.kcal / 100, p: ref.p / 100, f: ref.f / 100, c: ref.c / 100 },
    portion, step, lo, hi,
    meals: ref.meals || ['any'],
    priority: poolItem.priority || 0,
    prepMin: ref.prepMin || 0,
    nova: ref.nova,
  };
}

export function eligible(item, slot) {
  if (slot === 'snack') return item.meals.includes('snack') || item.meals.includes('any');
  return item.meals.includes(slot);
}

function totalsOf(sel) {
  const t = { kcal: 0, p: 0, f: 0, c: 0 };
  for (const s of sel) {
    t.kcal += s.item.per.kcal * s.g;
    t.p += s.item.per.p * s.g;
    t.f += s.item.per.f * s.g;
    t.c += s.item.per.c * s.g;
  }
  return t;
}

function errorOf(t, R, w) {
  return w.p * ((t.p - R.p) / R.p) ** 2 + w.kcal * ((t.kcal - R.kcal) / R.kcal) ** 2 + w.f * ((t.f - R.f) / R.f) ** 2;
}

function objective(sel, R, w) {
  let reg = 0;
  let pr = 0;
  for (const s of sel) {
    reg += ((s.g - s.item.portion) / s.item.portion) ** 2;
    pr -= 0.002 * s.item.priority;
  }
  return errorOf(totalsOf(sel), R, w) + LAMBDA * reg + pr;
}

// Граммовка: координатный спуск с ограничениями [lo, hi]
function optimizeGrams(sel, R, w, iters = 25) {
  for (let it = 0; it < iters; it++) {
    let moved = 0;
    for (const s of sel) {
      const t = totalsOf(sel);
      const a = s.item.per;
      const S = { p: t.p - a.p * s.g, kcal: t.kcal - a.kcal * s.g, f: t.f - a.f * s.g };
      const d = s.item.portion;
      let num = LAMBDA / d;
      let den = LAMBDA / (d * d);
      for (const m of ['p', 'kcal', 'f']) {
        num += (w[m] * a[m] * (R[m] - S[m])) / (R[m] * R[m]);
        den += (w[m] * a[m] * a[m]) / (R[m] * R[m]);
      }
      const g = Math.min(s.item.hi, Math.max(s.item.lo, num / den));
      moved += Math.abs(g - s.g);
      s.g = g;
    }
    if (moved < 0.5) break;
  }
  return sel;
}

// Округление до шага и добивка ±шаг
function roundGrams(sel, R, w) {
  for (const s of sel) s.g = Math.min(s.item.hi, Math.max(s.item.lo, Math.round(s.g / s.item.step) * s.item.step));
  for (let pass = 0; pass < 3; pass++) {
    let improved = false;
    for (const s of sel) {
      const base = objective(sel, R, w);
      for (const dir of [1, -1]) {
        const g0 = s.g;
        const g1 = g0 + dir * s.item.step;
        if (g1 < s.item.lo || g1 > s.item.hi) continue;
        s.g = g1;
        if (objective(sel, R, w) < base - 1e-9) {
          improved = true;
          break;
        }
        s.g = g0;
      }
    }
    if (!improved) break;
  }
  return sel;
}

function evalWith(sel, R, w) {
  const copy = sel.map((s) => ({ ...s }));
  optimizeGrams(copy, R, w);
  return { sel: copy, score: objective(copy, R, w) };
}

export function deviation(t, R) {
  return {
    p: R.p ? (t.p - R.p) / R.p : 0,
    kcal: R.kcal ? (t.kcal - R.kcal) / R.kcal : 0,
    f: R.f ? (t.f - R.f) / R.f : 0,
  };
}

export function withinTolerance(dev, tol = STACK.tolerance) {
  return Math.abs(dev.p) <= tol && Math.abs(dev.kcal) <= tol;
}

function remainderOf(targets, eaten) {
  return { kcal: targets.kcal - eaten.kcal, p: Math.max(targets.p - eaten.p, 5), f: Math.max(targets.f - eaten.f, 3) };
}

/**
 * targets: {kcal, p, f} на день; eaten: уже съеденное/закрытое сегодня;
 * items: элементы сборщика (builderItem) — пул после фильтра ограничений;
 * history: {day: [poolItemId]} — что было в стеке в прошлые дни;
 * slots: какие позиции собирать (по умолчанию завтрак/обед/ужин + до 2 перекусов);
 * seed: {slot: poolItemId} — текущие позиции при пересборке; exclude: id, которые не предлагать.
 */
export function buildStack(args) {
  let s = buildOnce(args);
  const size = args.poolSize ?? args.items.length;
  const yesterday = new Set(args.history?.[addDays(args.day, -1)] || []);
  if (s.closed || args.slots || size < STACK.repeatRuleMinPool || !yesterday.size || !withinTolerance(s.deviation)) return s;
  // Позиция два дня подряд будет заблокирована на третий. Если сегодня можно уложиться без неё — не повторяем,
  // тогда завтра она снова доступна. Приоритет — допуск сегодняшнего дня.
  const extra = [];
  for (const it of s.items) {
    if (!yesterday.has(it.poolItemId)) continue;
    const trial = buildOnce({ ...args, exclude: [...(args.exclude || []), ...extra, it.poolItemId] });
    if (!trial.closed && withinTolerance(trial.deviation) && trial.items.length >= STACK.minItems) {
      extra.push(it.poolItemId);
      s = trial;
    }
  }
  return s;
}

// lock: id позиций, которые человек выбрал сам — при пересборке меняется только их граммовка
// maxItems: сколько позиций можно собрать (при пересборке — сколько ещё помещается в 5 позиций дня)
function buildOnce({ targets, eaten = { kcal: 0, p: 0, f: 0 }, items, history = {}, day, cookMin = Infinity, slots = null, seed = {}, lock = [], exclude = [], poolSize = null, maxItems: maxItemsArg = null, tuning = {} }) {
  const locked = new Set(lock);
  const tun = { repeat: 0.03, innerTol: STACK.tolerance * 0.85, ...tuning };
  const R = remainderOf(targets, eaten);
  if (R.kcal < STACK.closeBelowKcal) {
    return { closed: true, items: [], remaining: { kcal: Math.round(R.kcal), p: Math.round(targets.p - eaten.p), f: Math.round(targets.f - eaten.f) } };
  }

  const size = poolSize ?? items.length;
  const y1 = new Set(history[addDays(day, -1)] || []);
  const y2 = new Set(history[addDays(day, -2)] || []);
  const ex = new Set(exclude);
  let cand = items.filter((it) => !ex.has(it.id));
  if (size >= STACK.repeatRuleMinPool) cand = cand.filter((it) => !(y1.has(it.id) && y2.has(it.id)));
  const quick = cand.filter((it) => it.prepMin <= cookMin);
  const pool = (slot) => {
    const q = quick.filter((it) => eligible(it, slot));
    return q.length ? q : cand.filter((it) => eligible(it, slot));
  };

  const fromScratch = !slots;
  let slotList = slots ? [...slots] : MAIN_SLOTS.filter((s) => pool(s).length);
  if (!slotList.length) slotList = ['snack'];
  const shareSum = slotList.reduce((s, x) => s + SHARE[x], 0);
  const repeatPenalty = (it) => (y1.has(it.id) ? tun.repeat : 0);
  const w = { ...BASE_W };

  // 1. Жадно по слотам: сначала слоты с меньшим выбором
  const used = new Set();
  let sel = [];
  // seed: {slot: id} или массив id по порядку slots (когда в одном приёме две позиции)
  const seedFor = (i, s) => (Array.isArray(seed) ? seed[i] : seed[s]);
  const order = slotList.map((s, i) => ({ s, i })).sort((a, b) => pool(a.s).length - pool(b.s).length);
  for (const { s, i } of order) {
    const share = SHARE[s] / shareSum;
    const S = { kcal: R.kcal * share, p: R.p * share, f: R.f * share };
    const sid = seedFor(i, s);
    const seeded = sid && !ex.has(sid) && items.find((it) => it.id === sid && !used.has(it.id));
    const options = seeded ? [seeded] : pool(s).filter((it) => !used.has(it.id));
    let best = null;
    for (const it of options) {
      const r = evalWith([{ item: it, g: it.portion, slot: s }], S, w);
      const score = r.score + repeatPenalty(it);
      if (!best || score < best.score) best = { score, entry: r.sel[0] };
    }
    if (best) {
      used.add(best.entry.item.id);
      sel.push(best.entry);
    }
  }

  // 2. Совместная граммовка + локальные замены
  const localSearch = (passes = 2) => {
    let cur = evalWith(sel, R, w);
    for (let pass = 0; pass < passes; pass++) {
      let improved = false;
      for (let i = 0; i < cur.sel.length; i++) {
        if (locked.has(cur.sel[i].item.id)) continue;
        const slot = cur.sel[i].slot;
        const taken = new Set(cur.sel.map((x) => x.item.id));
        for (const it of pool(slot)) {
          if (taken.has(it.id)) continue;
          const trial = cur.sel.map((x, j) => (j === i ? { item: it, g: it.portion, slot } : { ...x }));
          const r = evalWith(trial, R, w);
          const pen = repeatPenalty(it) - repeatPenalty(cur.sel[i].item);
          if (r.score + pen < cur.score - 1e-4) {
            cur = r;
            improved = true;
          }
        }
      }
      if (!improved) break;
    }
    sel = cur.sel;
  };

  // 3. Не дотягиваем — добавляем позицию (до 5): перекус или вторую позицию к обеду/ужину (гарнир, белок)
  const maxItems = maxItemsArg ?? (fromScratch ? STACK.maxItems : slotList.length);
  // подпись добавленной позиции: перекус или ещё открытый приём пищи
  const extraOrder = ['snack', ...(fromScratch ? ['lunch', 'dinner', 'breakfast'] : slotList)];
  const extraSlot = (it) => extraOrder.find((s) => eligible(it, s)) || (it.meals.includes('dinner') ? 'dinner' : it.meals.includes('lunch') ? 'lunch' : 'breakfast');
  // порция больше 1.6× привычной — повод добавить позицию, а не раздувать одну
  const oversized = () => sel.some((s) => s.g > s.item.portion * 1.6);
  const fillUp = () => {
    while (sel.length < maxItems && (!withinTolerance(deviation(totalsOf(sel), R), tun.innerTol) || oversized())) {
      const taken = new Set(sel.map((x) => x.item.id));
      let best = null;
      for (const it of quick.length ? quick : cand) {
        if (taken.has(it.id)) continue;
        const r = evalWith([...sel, { item: it, g: it.portion, slot: extraSlot(it) }], R, w);
        if (!best || r.score < best.score) best = r;
      }
      if (!best || best.score >= evalWith(sel, R, w).score - 1e-4) break;
      sel = best.sel;
      localSearch(1);
    }
  };

  localSearch();
  fillUp();
  // 4. Вне допуска (с запасом на округление) — усиливаем вес нарушенной ошибки и повторяем
  for (let round = 0; round < 3; round++) {
    const dev = deviation(totalsOf(sel), R);
    if (withinTolerance(dev, tun.innerTol)) break;
    if (Math.abs(dev.p) > tun.innerTol) w.p *= 4;
    if (Math.abs(dev.kcal) > tun.innerTol) w.kcal *= 4;
    localSearch(1);
    fillUp();
  }

  roundGrams(sel, R, w);
  const rank = { breakfast: 0, lunch: 1, snack: 2, dinner: 3 };
  sel.sort((a, b) => rank[a.slot] - rank[b.slot]);
  const t = totalsOf(sel);
  return {
    closed: false,
    remainingBefore: R,
    items: sel.map((s) => {
      const g = Math.round(s.g);
      return {
        poolItemId: s.item.id,
        refId: s.item.refId,
        name: s.item.name,
        slot: s.slot,
        grams: g,
        kcal: Math.round(s.item.per.kcal * g),
        p: Math.round(s.item.per.p * g * 10) / 10,
        f: Math.round(s.item.per.f * g * 10) / 10,
        c: Math.round(s.item.per.c * g * 10) / 10,
      };
    }),
    totals: { kcal: Math.round(t.kcal), p: Math.round(t.p), f: Math.round(t.f), c: Math.round(t.c) },
    deviation: deviation(t, R),
  };
}

// «Не хочу это»: варианты на место позиции, по тому, как сходится стек после пересборки граммовки
export function swapOptions({ targets, eaten, items, openPlan, index, limit = 6 }) {
  const R = remainderOf(targets, eaten);
  const byId = new Map(items.map((it) => [it.id, it]));
  const base = openPlan.map((pi) => ({ item: byId.get(pi.poolItemId), g: pi.grams, slot: pi.slot })).filter((x) => x.item);
  const target = openPlan[index];
  const taken = new Set(openPlan.map((pi) => pi.poolItemId));
  const opts = [];
  for (const it of items) {
    if (taken.has(it.id) || !eligible(it, target.slot)) continue;
    const trial = base.map((x) => (x.item.id === target.poolItemId ? { item: it, g: it.portion, slot: target.slot } : { ...x }));
    const r = evalWith(trial, R, BASE_W);
    opts.push({ poolItemId: it.id, name: it.name, score: r.score });
  }
  return opts.sort((a, b) => a.score - b.score).slice(0, limit);
}
