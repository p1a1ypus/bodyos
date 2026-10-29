// Тренировки: программа под оборудование, план сессии с double progression, дробный объём, тоннаж.
import { EXERCISES, EXERCISES_BY_ID, EQUIPMENT_PROFILES, PROGRAM_TEMPLATES, MUSCLES } from './exercises.js';
import { COACH } from './constants.js';

export function availableExercises(equipment, injuries = []) {
  const has = new Set(EQUIPMENT_PROFILES[equipment]?.has || ['bodyweight']);
  const inj = new Set(injuries);
  return EXERCISES.filter((e) => e.equip.every((q) => has.has(q)) && !e.contra.some((c) => inj.has(c)));
}

// Предпочтение внутри паттерна: нагружаемые упражнения раньше (лучше прогрессируют)
function pickFor(pattern, avail, used) {
  const list = avail.filter((e) => e.pattern === pattern && !used.has(e.id));
  list.sort((a, b) => (b.loaded - a.loaded) || (EXERCISES.indexOf(a) - EXERCISES.indexOf(b)));
  return list[0] || null;
}

export function resolveProgram({ daysPerWeek, equipment, injuries = [], sessionMin = 60 }) {
  const n = daysPerWeek >= 4 ? 4 : daysPerWeek <= 2 ? 2 : 3;
  const tpl = PROGRAM_TEMPLATES[n];
  const avail = availableExercises(equipment, injuries);
  const maxEx = sessionMin < 45 ? 4 : sessionMin <= 60 ? 5 : 6;
  return {
    templateDays: n,
    name: tpl.name,
    days: tpl.days.map((d) => {
      const used = new Set();
      const exercises = [];
      for (const slot of d.slots) {
        if (exercises.length >= maxEx) break;
        const e = pickFor(slot.pattern, avail, used);
        if (!e) continue;
        used.add(e.id);
        exercises.push({ exerciseId: e.id, sets: slot.sets, repMin: slot.repMin, repMax: slot.repMax });
      }
      return { name: d.name, exercises };
    }),
  };
}

// Замены того же паттерна под оборудование и травмы
export function alternativesFor(exerciseId, { equipment, injuries = [] }) {
  const e = EXERCISES_BY_ID[exerciseId];
  if (!e) return [];
  return availableExercises(equipment, injuries).filter((x) => x.pattern === e.pattern && x.id !== e.id);
}

// sessions: [{id, ts, dayIndex}] — следующий день ротации
export function nextDayIndex(program, sessions) {
  const done = sessions.filter((s) => !s.deleted && s.dayIndex != null).sort((a, b) => a.ts - b.ts);
  if (!done.length) return 0;
  return (done[done.length - 1].dayIndex + 1) % program.days.length;
}

export const e1rm = (kg, reps) => (kg > 0 && reps > 0 ? kg * (1 + reps / 30) : 0);

function roundTo(kg, inc) {
  if (!inc) return kg;
  return Math.max(inc, Math.round(kg / inc) * inc);
}

// history: сессии с этим упражнением, новые первыми: [{sets: [{kg, reps, rir}]}]
export function progression(exercise, slot, history, startKg = null) {
  const inc = exercise.increment;
  const last = history[0];
  if (!last || !last.sets.length) {
    return { kg: startKg ?? (exercise.loaded ? null : 0), reps: slot.repMin, change: 'start', reason: 'первая сессия — подбери рабочий вес' };
  }
  const kg = Math.max(...last.sets.map((x) => x.kg || 0));
  const working = last.sets.filter((x) => (x.kg || 0) === kg);
  const allTop = working.length >= slot.sets && working.every((x) => x.reps >= slot.repMax && (x.rir == null || x.rir >= 2));
  const failed = (sess) => sess && sess.sets.length && sess.sets.some((x) => x.reps < slot.repMin);

  if (allTop) {
    if (exercise.loaded) {
      return { kg: roundTo(kg + inc, inc), reps: slot.repMin, change: 'up', reason: `все подходы на ${slot.repMax} повторов с запасом — вес +${inc} кг` };
    }
    return { kg, reps: slot.repMax, change: 'hold', reason: 'верх диапазона с весом тела — добавь отягощение или усложни вариант' };
  }
  if (failed(history[0]) && failed(history[1])) {
    if (exercise.loaded) {
      return { kg: roundTo(kg * 0.9, inc), reps: slot.repMin, change: 'down', reason: `дважды подряд ниже ${slot.repMin} повторов — вес −10%` };
    }
    return { kg, reps: slot.repMin, change: 'down', reason: `дважды подряд ниже ${slot.repMin} повторов — цель по повторам снижена` };
  }
  const best = Math.max(...working.map((x) => x.reps));
  return { kg, reps: Math.min(slot.repMax, Math.max(slot.repMin, best + 1)), change: 'hold', reason: 'тот же вес, +1 повтор' };
}

// setsByExercise: Map(exerciseId → [{sessionId, ts, kg, reps, rir}]) по всем сессиям
export function historyFor(exerciseId, sets) {
  const byS = new Map();
  for (const x of sets) {
    if (x.deleted || x.exerciseId !== exerciseId) continue;
    if (!byS.has(x.sessionId)) byS.set(x.sessionId, { ts: x.ts, sets: [] });
    byS.get(x.sessionId).sets.push(x);
  }
  return [...byS.values()].sort((a, b) => b.ts - a.ts);
}

export function planSession({ program, dayIndex, sets, startWeights = {}, deload = false }) {
  const day = program.days[dayIndex];
  return {
    dayIndex,
    name: day.name,
    deload,
    exercises: day.exercises.map((slot) => {
      const exr = EXERCISES_BY_ID[slot.exerciseId];
      const p = progression(exr, slot, historyFor(slot.exerciseId, sets), startWeights[slot.exerciseId] ?? null);
      const n = deload ? Math.max(1, Math.ceil(slot.sets * 0.5)) : slot.sets;
      return {
        exerciseId: slot.exerciseId,
        repMin: slot.repMin,
        repMax: slot.repMax,
        sets: Array.from({ length: n }, () => ({ kg: p.kg, reps: p.reps })),
        change: p.change,
        reason: deload ? 'разгрузочная неделя — объём ×0.5' : p.reason,
      };
    }),
  };
}

// Дробные сеты по мышцам: каждый рабочий подход × доля мышцы
export function weeklyVolume(sets) {
  const v = Object.fromEntries(Object.keys(MUSCLES).map((m) => [m, 0]));
  for (const x of sets) {
    if (x.deleted) continue;
    const e = EXERCISES_BY_ID[x.exerciseId];
    if (!e) continue;
    for (const [m, share] of Object.entries(e.muscles)) v[m] += share;
  }
  return v;
}

// Мышцы, которые программа реально тренирует (доля ≥ 0.5 хотя бы в одном упражнении)
export function trainedMuscles(program) {
  const res = new Set();
  for (const d of program.days) for (const s of d.exercises) {
    const e = EXERCISES_BY_ID[s.exerciseId];
    for (const [m, share] of Object.entries(e?.muscles || {})) if (share >= 0.5) res.add(m);
  }
  return res;
}

export function volumeWarnings(volume, program) {
  const trained = program ? trainedMuscles(program) : new Set(Object.keys(volume));
  const out = [];
  for (const [m, v] of Object.entries(volume)) {
    if (!trained.has(m)) continue;
    if (v < COACH.volumeMin) out.push({ muscle: m, sets: v, kind: 'low' });
    else if (v > COACH.volumeMax) out.push({ muscle: m, sets: v, kind: 'high' });
  }
  return out;
}

export function tonnage(sets, bodyweight = 0) {
  let t = 0;
  for (const x of sets) {
    if (x.deleted) continue;
    const e = EXERCISES_BY_ID[x.exerciseId];
    const kg = e && !e.loaded ? (x.kg || 0) + bodyweight * 0.6 : x.kg || 0;
    t += kg * (x.reps || 0);
  }
  return Math.round(t);
}

// Сумма максимальных рабочих весов по упражнениям (для «качества набора»)
export function sumWorkingWeights(sets, onlyIds = null) {
  const best = new Map();
  for (const x of sets) {
    if (x.deleted || !(x.kg > 0)) continue;
    if (onlyIds && !onlyIds.has(x.exerciseId)) continue;
    best.set(x.exerciseId, Math.max(best.get(x.exerciseId) || 0, x.kg));
  }
  let s = 0;
  for (const v of best.values()) s += v;
  return s;
}

export function relativeStrength(sets, bodyweight) {
  const best = new Map();
  for (const x of sets) {
    if (x.deleted) continue;
    const e = EXERCISES_BY_ID[x.exerciseId];
    if (!e?.loaded) continue;
    const v = e1rm(x.kg, x.reps);
    if (v > (best.get(x.exerciseId) || 0)) best.set(x.exerciseId, v);
  }
  return [...best.entries()]
    .map(([id, v]) => ({ exerciseId: id, e1rm: Math.round(v * 10) / 10, ratio: bodyweight ? Math.round((v / bodyweight) * 100) / 100 : null }))
    .sort((a, b) => b.e1rm - a.e1rm);
}

// Правило 6: объём под границы 6–25 дробных сетов. Возвращает изменения программы.
export function volumeAdjustments(program, volume) {
  const changes = [];
  for (const w of volumeWarnings(volume, program)) {
    let best = null;
    program.days.forEach((d, di) => d.exercises.forEach((s, si) => {
      const share = EXERCISES_BY_ID[s.exerciseId]?.muscles[w.muscle] || 0;
      if (!best || share > best.share) best = { di, si, share, sets: s.sets };
    }));
    if (!best || best.share === 0) continue;
    if (w.kind === 'low' && best.sets < 6) changes.push({ dayIndex: best.di, slotIndex: best.si, delta: 1, muscle: w.muscle, volume: w.sets });
    if (w.kind === 'high' && best.sets > 1) changes.push({ dayIndex: best.di, slotIndex: best.si, delta: -1, muscle: w.muscle, volume: w.sets });
  }
  return changes;
}
