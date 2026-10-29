// Цели и фазы: проверка реалистичности, фаза по цели.
import { SAFETY } from './constants.js';
import { addDays, daysBetween } from './util.js';
import { bmi } from './safety.js';

export const GOAL_TYPES = {
  lose: 'Снизить вес',
  gain: 'Набрать вес',
  strength: 'Стать сильнее на текущем весе',
  maintain: 'Удерживать вес',
};

export const PHASES = {
  deficit: 'Дефицит',
  maintenance: 'Поддержание',
  surplus: 'Профицит',
  strength: 'Сила на весе',
};

export const DEFAULT_RATE = { lose: 0.5, gain: 0.25 };

export function phaseForGoal(type) {
  return { lose: 'deficit', gain: 'surplus', strength: 'strength', maintain: 'maintenance' }[type] || 'maintenance';
}

const fmtDate = (key) => {
  const [y, m, d] = key.split('-');
  return `${d}.${m}.${y}`;
};

// goal: {type, targetKg?, deadline?, ratePct?}. Возвращает {ok, goal (уточнённая), reason}
export function checkGoal(goal, { weightKg, heightCm, today, restr }) {
  const g = { ...goal };
  if (restr.blocked) return { ok: false, reason: 'Приложение доступно с 18 лет.' };

  if (g.type === 'maintain' || g.type === 'strength') {
    g.ratePct = 0;
    return { ok: true, goal: g, phase: phaseForGoal(g.type) };
  }

  const losing = g.type === 'lose';
  if (losing && !restr.deficitAllowed) {
    const why = restr.pregnancy
      ? 'во время беременности и кормления приложение ведёт только поддержание'
      : restr.edHistory
        ? 'при РПП в анамнезе дефицит недоступен'
        : 'при ИМТ ниже 18.5 дефицит недоступен';
    return { ok: false, reason: `Снижение веса недоступно: ${why}. Можно выбрать поддержание или силу.` };
  }
  if (!losing && !restr.surplusAllowed) {
    return { ok: false, reason: 'Во время беременности и кормления приложение ведёт только поддержание.' };
  }
  if (!(g.targetKg > 0)) return { ok: false, reason: 'Укажи целевой вес.' };

  const diff = losing ? weightKg - g.targetKg : g.targetKg - weightKg;
  if (diff <= 0) {
    return { ok: false, reason: losing ? 'Целевой вес не ниже текущего — это цель на поддержание.' : 'Целевой вес не выше текущего.' };
  }
  if (losing) {
    const targetBmi = bmi(g.targetKg, heightCm);
    if (targetBmi != null && targetBmi < SAFETY.minBmi) {
      return { ok: false, reason: `Целевой вес даёт ИМТ ${targetBmi.toFixed(1)} — ниже 18.5. Такую цель приложение не ведёт.` };
    }
  }

  const maxRate = losing ? restr.maxDeficitRate : restr.maxSurplusRate;
  const fastestWeeks = diff / (weightKg * maxRate / 100);
  const earliest = addDays(today, Math.ceil(fastestWeeks * 7));

  if (g.deadline) {
    const weeks = daysBetween(today, g.deadline) / 7;
    if (weeks <= 0) return { ok: false, reason: 'Срок уже прошёл.' };
    const required = (diff / weightKg / weeks) * 100;
    if (required > maxRate) {
      return {
        ok: false,
        reason: `К ${fmtDate(g.deadline)} нужно менять вес на ${required.toFixed(2)}% в неделю, безопасный максимум — ${maxRate}%. Реалистичный срок — ${fmtDate(earliest)}.`,
        suggestedDeadline: earliest,
        requiredRate: required,
        maxRate,
      };
    }
    g.ratePct = Math.max(Math.round(required * 100) / 100, losing ? 0.25 : 0.1);
    g.ratePct = Math.min(g.ratePct, maxRate);
  } else {
    g.ratePct = Math.min(g.ratePct || DEFAULT_RATE[g.type], maxRate);
    const weeks = diff / (weightKg * g.ratePct / 100);
    g.deadline = addDays(today, Math.ceil(weeks * 7));
  }
  return { ok: true, goal: g, phase: phaseForGoal(g.type), maxRate, earliest };
}
