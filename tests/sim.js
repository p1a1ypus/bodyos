// Синтетический человек для сценариев коуч-цикла: истинный TDEE, шум веса, недологирование, пропуски.
import { runWeeklyCycle, initialModelState } from '../js/core/coach.js';
import { addDays, rng, mean } from '../js/core/util.js';

export const START = '2026-01-05'; // понедельник

export function makeProfile(o = {}) {
  return { sex: 'm', birthDate: '1990-03-01', heightCm: 180, daysPerWeek: 3, stopFlags: [], ...o };
}

/**
 * opts: seed, weeks, offset (истинный TDEE − стартовая оценка), startKg, under (доля недологирования),
 * sigma (шум взвешиваний, кг), intakeNoise (ккал), phaseType, goal, profile,
 * intake(w, T0) — фактическое потребление в открытом цикле; closedLoop — человек ест ровно бюджет (по логу);
 * fullDays(w), weighIns(w), sleepHours(w), readiness(w), soreness(w)
 */
export function simulate(opts = {}) {
  const o = {
    seed: 1, weeks: 12, offset: 300, startKg: 85, under: 0, sigma: 0.3, intakeNoise: 200,
    phaseType: 'maintenance', goal: { type: 'maintain', ratePct: 0 }, profile: makeProfile(), ...opts,
  };
  const r = rng(o.seed);
  let state = initialModelState({ profile: o.profile, goal: o.goal, phaseType: o.phaseType, weightKg: o.startKg, today: START });
  const T0 = state.tdeeEst + o.offset;
  let kg = o.startKg;
  const weights = [];
  const foodEntries = [];
  const checkins = [];
  const sleepSamples = [];
  let phase = { type: o.phaseType, start: START };
  const actualHistory = [];
  const log = [];

  for (let w = 0; w < o.weeks; w++) {
    const ws = addDays(START, 7 * w);
    const fullDays = o.fullDays ? o.fullDays(w) : 7;
    const nWeigh = o.weighIns ? o.weighIns(w) : 7;
    const weighDays = new Set(Array.from({ length: nWeigh }, (_, i) => Math.floor((i * 7) / nWeigh)));
    const kgStartWeek = kg;
    for (let d = 0; d < 7; d++) {
      const day = addDays(ws, d);
      const Tcur = T0 + 25 * (kg - o.startKg); // расход падает вместе с массой
      let actual;
      let logged;
      if (o.closedLoop) {
        logged = state.budget + r.gauss(0, o.intakeNoise);
        actual = logged / (1 - o.under);
      } else {
        actual = (o.intake ? o.intake(w, T0) : T0) + r.gauss(0, o.intakeNoise);
        logged = actual * (1 - o.under);
      }
      actualHistory.push(actual);
      kg += (actual - Tcur) / 7700;
      if (weighDays.has(d)) weights.push({ day, kg: kg + r.gauss(0, o.sigma) });
      if (d < fullDays) {
        for (let i = 0; i < 4; i++) {
          const k = logged / 4;
          foodEntries.push({ day, kcal: k, p: (k * 0.25) / 4, f: (k * 0.3) / 9, c: (k * 0.45) / 4, confidence: 0.85 });
        }
      } else {
        foodEntries.push({ day, kcal: 400, p: 20, f: 15, c: 45, confidence: 0.5 });
      }
      checkins.push({
        day,
        sleep: 4,
        readiness: o.readiness ? o.readiness(w, d) : 4,
        soreness: o.soreness ? o.soreness(w) : 2,
      });
      sleepSamples.push({ day, value: (o.sleepHours ? o.sleepHours(w) : 7.5) + r.gauss(0, 0.3) });
    }
    const prev = state;
    const res = runWeeklyCycle({
      weekStart: ws, profile: o.profile, goal: o.goal, phase, prevState: prev,
      weights, foodEntries, checkins, sets: [], sessions: [], program: null, planItems: [], pool: [], sleepSamples,
    });
    state = res.state;
    if (res.phaseChange) phase = { type: res.phaseChange.to, start: addDays(ws, 7), after: phase.type };
    const Tend = T0 + 25 * (kg - o.startKg);
    const meanActual21 = mean(actualHistory.slice(-21));
    log.push({
      week: w + 1,
      tdeeEst: state.tdeeEst,
      trueT: Math.round(Tend),
      // что видит модель при недологировании: расход в «единицах лога»
      logT: Math.round(Tend - o.under * meanActual21),
      budget: state.budget,
      confidence: state.confidence,
      phase: state.phase,
      kg,
      actualRatePct: ((kg - kgStartWeek) / kgStartWeek) * 100,
      changes: res.changes,
      proposals: res.proposals,
      res,
    });
  }
  return { log, T0 };
}

export function share(arr, pred) {
  return arr.filter(pred).length / arr.length;
}
