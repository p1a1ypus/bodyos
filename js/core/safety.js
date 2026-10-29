// Защиты: стоп-флаги, пол калорий, потолок скорости. Чистые функции.
import { SAFETY, KCAL_PER_KG } from './constants.js';
import { ageOn } from './util.js';

export const MED_FLAGS = ['diabetes', 'cvd', 'kidney', 'thyroid'];

export const STOP_FLAG_LABELS = {
  pregnancy: 'Беременность или кормление',
  ed_history: 'РПП в анамнезе',
  diabetes: 'Диабет',
  cvd: 'Сердечно-сосудистые заболевания',
  kidney: 'Заболевания почек',
  thyroid: 'Заболевания щитовидной железы',
};

export function bmi(weightKg, heightCm) {
  if (!weightKg || !heightCm) return null;
  const h = heightCm / 100;
  return weightKg / (h * h);
}

export function kcalFloor(sex) {
  return sex === 'f' ? SAFETY.floorKcal.f : SAFETY.floorKcal.m;
}

// ккал/день, соответствующие скорости изменения массы ratePct %/нед
export function rateToKcal(weightKg, ratePct) {
  return (weightKg * ratePct / 100) * KCAL_PER_KG / 7;
}

// Что разрешено человеку с данным профилем
export function restrictions(profile, { weightKg, today }) {
  const flags = new Set(profile?.stopFlags || []);
  const age = ageOn(profile?.birthDate, today);
  const b = bmi(weightKg, profile?.heightCm);
  const medical = MED_FLAGS.some((f) => flags.has(f));
  const r = {
    age,
    bmi: b,
    blocked: age != null && age < SAFETY.minAge,
    pregnancy: flags.has('pregnancy'),
    edHistory: flags.has('ed_history'),
    medical,
    lowBmi: b != null && b < SAFETY.minBmi,
  };
  r.deficitAllowed = !r.pregnancy && !r.edHistory && !r.lowBmi;
  r.surplusAllowed = !r.pregnancy;
  r.noBudget = r.pregnancy; // без бюджета калорий
  r.forceNoNumbers = r.edHistory;
  r.maxDeficitRate = medical ? SAFETY.medMaxDeficitRate : SAFETY.maxDeficitRate;
  r.maxSurplusRate = medical ? SAFETY.medMaxSurplusRate : SAFETY.maxSurplusRate;
  r.consultDoctor = medical;
  r.strictLabFlags = medical;
  r.allowedPhases = ['maintenance', 'strength'];
  if (r.deficitAllowed) r.allowedPhases.push('deficit');
  if (r.surplusAllowed) r.allowedPhases.push('surplus');
  if (r.pregnancy) r.allowedPhases = ['maintenance'];
  return r;
}

// Бюджет после всех порогов. Порядок: фаза → потолок скорости → пол калорий (пол побеждает).
export function safeBudget({ tdee, phase, requested, weightKg, sex, restr }) {
  const floor = kcalFloor(sex);
  let b = requested;
  let effPhase = phase;
  if (!restr.allowedPhases.includes(phase)) effPhase = 'maintenance';
  if (effPhase === 'maintenance' || effPhase === 'strength') {
    b = tdee;
  } else if (effPhase === 'deficit') {
    const maxDef = rateToKcal(weightKg, restr.maxDeficitRate);
    b = Math.min(b, tdee);
    b = Math.max(b, tdee - maxDef);
  } else if (effPhase === 'surplus') {
    const maxSur = rateToKcal(weightKg, restr.maxSurplusRate);
    b = Math.max(b, tdee);
    b = Math.min(b, tdee + maxSur);
  }
  b = Math.max(b, floor);
  return { budget: Math.round(b / 10) * 10, phase: effPhase, floorApplied: b === floor };
}
