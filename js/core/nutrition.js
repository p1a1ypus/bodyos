// КБЖУ: суммы дня, полный день, цели по макросам, доля ультрапереработки.
import { MODEL } from './constants.js';
import { mean } from './util.js';

const r1 = (x) => Math.round(x * 10) / 10;

// food: {kcal, p, f, c, fiber} на 100 г
export function macrosFor(food, grams) {
  const k = grams / 100;
  return {
    kcal: Math.round(food.kcal * k),
    p: r1(food.p * k),
    f: r1(food.f * k),
    c: r1(food.c * k),
    fiber: r1((food.fiber || 0) * k),
  };
}

export function addMacros(a, b) {
  return { kcal: a.kcal + b.kcal, p: a.p + b.p, f: a.f + b.f, c: a.c + b.c };
}

export const ZERO = Object.freeze({ kcal: 0, p: 0, f: 0, c: 0 });

export function dayTotals(entries) {
  const t = { kcal: 0, p: 0, f: 0, c: 0, count: 0, confidence: 0 };
  const conf = [];
  for (const e of entries) {
    if (e.deleted) continue;
    t.kcal += e.kcal || 0;
    t.p += e.p || 0;
    t.f += e.f || 0;
    t.c += e.c || 0;
    t.count++;
    conf.push(e.confidence ?? 0.5);
  }
  t.confidence = conf.length ? mean(conf) : 0;
  return t;
}

// Полный день еды: ≥ 3 записи и ≥ 800 ккал (раздел 5)
export function isFullDay(t) {
  return t.count >= MODEL.fullDayMinEntries && t.kcal >= MODEL.fullDayMinKcal;
}

// Белок 1.6–2.2 г/кг как диапазон, жиры ≥ 0.6 г/кг, углеводы — остаток
export function macroTargets(budget, weightKg) {
  const w = weightKg;
  const proteinMin = MODEL.proteinMin * w;
  const proteinMax = MODEL.proteinMax * w;
  const fatMin = MODEL.fatMin * w;
  let p = MODEL.proteinTarget * w;
  let f = MODEL.fatTarget * w;
  let c = (budget - 4 * p - 9 * f) / 4;
  if (c < 0) {
    f = fatMin;
    c = (budget - 4 * p - 9 * f) / 4;
  }
  if (c < 0) {
    p = proteinMin;
    c = (budget - 4 * p - 9 * f) / 4;
  }
  return {
    kcal: budget,
    p: Math.round(p),
    pMin: Math.round(proteinMin),
    pMax: Math.round(proteinMax),
    f: Math.round(f),
    fMin: Math.round(fatMin),
    c: Math.max(0, Math.round(c)),
  };
}

// Доля ккал из NOVA 4 за набор записей
export function ultraProcessedShare(entries) {
  let total = 0;
  let upf = 0;
  for (const e of entries) {
    if (e.deleted || !e.kcal) continue;
    total += e.kcal;
    if (e.nova === 4) upf += e.kcal;
  }
  return total ? upf / total : null;
}

// Слова вместо чисел для режима «без цифр»
export function closenessWord(actual, target, tol = 0.1) {
  if (!target) return '—';
  const d = (actual - target) / target;
  if (Math.abs(d) <= tol) return 'ок';
  if (d < 0 && d > -0.25) return 'близко';
  if (d < 0) return 'есть запас';
  return 'выше плана';
}
