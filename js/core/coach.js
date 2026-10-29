// Коуч-цикл: раз в 7 дней. Чистая функция: события + состояние модели + цель → новое состояние, изменения, причины.
// Порядок правил = приоритет (раздел 5). LLM здесь не участвует.
import { SAFETY, COACH, MODEL } from './constants.js';
import { addDays, ageOn, daysBetween, mean, weekDays, groupBy } from './util.js';
import { dailyWeights, emaTrend, trendOn, weighInsBetween, weeklyRatePct } from './trend.js';
import { dayTotals, isFullDay, macroTargets, ultraProcessedShare } from './nutrition.js';
import { calibrateWeek, initialTdee } from './calibration.js';
import { restrictions, safeBudget, rateToKcal } from './safety.js';
import { PHASES } from './goals.js';
import { weeklyVolume, volumeAdjustments, volumeWarnings, tonnage } from './training.js';
import { EXERCISES_BY_ID, MUSCLES } from './exercises.js';

const DEFAULT_COUNTERS = {
  rapidWeeks: 0, slowWeeks: 0, fastWeeks: 0, flatWeeks: 0, gainNoStrengthWeeks: 0,
  dietBreakProposed: false, nextPhaseAnnounced: false,
};

const inWeek = (day, start, end) => day >= start && day <= end;

// Бюджет на день (правило 4) — общий для старта и для цикла
export function budgetFor({ tdee, phaseType, goal, weightKg, profile, restr, adjust = 0, sleepPause = false }) {
  let requested = tdee;
  const rate = goal?.ratePct || 0;
  if (phaseType === 'deficit') requested = sleepPause ? tdee : tdee - rateToKcal(weightKg, rate) + adjust;
  else if (phaseType === 'surplus') requested = tdee + rateToKcal(weightKg, rate) + adjust;
  const sb = safeBudget({ tdee, phase: phaseType, requested, weightKg, sex: profile.sex, restr });
  return { ...sb, macros: macroTargets(sb.budget, weightKg) };
}

export function initialModelState({ profile, goal, phaseType, weightKg, today }) {
  const restr = restrictions(profile, { weightKg, today });
  const tdee = initialTdee({
    sex: profile.sex, weightKg, heightCm: profile.heightCm,
    age: ageOn(profile.birthDate, today), trainingDays: profile.daysPerWeek || 0,
  });
  const b = budgetFor({ tdee, phaseType, goal, weightKg, profile, restr });
  return {
    weekStart: null,
    tdeeEst: tdee,
    confidence: MODEL.confidenceStart,
    calibratedWeeks: 0,
    budget: b.budget,
    macros: b.macros,
    phase: b.phase,
    phaseAdjustKcal: 0,
    trendKg: weightKg,
    ratePct: null,
    deloadNext: false,
    counters: { ...DEFAULT_COUNTERS },
    tonnage: 0,
    tonnagePrev: 0,
    strengthByEx: {},
    appliedRules: [],
    noBudget: restr.noBudget,
    forceNoNumbers: restr.forceNoNumbers,
  };
}

function sleepStatus(sleepSamples, checkins) {
  const hours = sleepSamples.map((s) => s.value).filter((h) => h > 0);
  if (hours.length >= 3) {
    const avg = mean(hours);
    return { known: true, avgHours: avg, poor: avg < COACH.sleepMinHours, source: 'hours' };
  }
  // Часов нет — грубая замена по оценке сна 1–5 из чекина
  const scores = checkins.map((c) => c.sleep).filter((x) => x > 0);
  if (scores.length >= 3) {
    const avg = mean(scores);
    return { known: true, avgScore: avg, poor: avg <= 2, source: 'score' };
  }
  return { known: false, poor: false };
}

function strengthMap(sets) {
  const m = {};
  for (const x of sets) {
    if (x.deleted || !(x.kg > 0)) continue;
    m[x.exerciseId] = Math.max(m[x.exerciseId] || 0, x.kg);
  }
  return m;
}

/**
 * input: {
 *   weekStart, profile, goal, phase: {type, start, after?, plannedWeeks?}, prevState,
 *   weights, foodEntries, checkins, sets, sessions, program, planItems, pool, sleepSamples
 * }
 */
export function runWeeklyCycle(input) {
  const { weekStart, profile, goal, phase } = input;
  const prev = input.prevState;
  const days = weekDays(weekStart);
  const weekEnd = days[6];
  const counters = { ...DEFAULT_COUNTERS, ...(prev.counters || {}) };
  const changes = [];
  const proposals = [];
  const add = (rule, what, reason) => changes.push({ rule, what, reason });

  // ── Подготовка данных
  const daily = dailyWeights((input.weights || []).filter((w) => w.day <= weekEnd));
  const series = emaTrend(daily);
  const weighIns = weighInsBetween(daily, weekStart, weekEnd);
  const trendUpdated = weighIns >= MODEL.minWeighInsPerWeek;
  const trendKg = trendUpdated ? trendOn(series, weekEnd) : prev.trendKg;
  const ratePct = trendUpdated ? weeklyRatePct(daily, weekEnd, 14) : null;

  const foodByDay = groupBy((input.foodEntries || []).filter((e) => !e.deleted && e.day <= weekEnd), (e) => e.day);
  const foodDays = new Map([...foodByDay.entries()].map(([d, es]) => [d, dayTotals(es)]));
  const weekTotals = days.map((d) => foodDays.get(d)).filter(Boolean);
  const fullDayTotals = weekTotals.filter(isFullDay);

  const checkins = (input.checkins || []).filter((c) => !c.deleted && inWeek(c.day, weekStart, weekEnd));
  const sleepSamples = (input.sleepSamples || []).filter((s) => inWeek(s.day, weekStart, weekEnd));
  const weekSets = (input.sets || []).filter((x) => !x.deleted && inWeek(x.day, weekStart, weekEnd));
  const weekSessions = (input.sessions || []).filter((s) => !s.deleted && inWeek(s.day, weekStart, weekEnd));

  const restr = restrictions(profile, { weightKg: trendKg, today: weekEnd });
  let phaseType = phase.type;
  let phaseChange = null;
  const weeksInPhase = Math.floor((daysBetween(phase.start, weekEnd) + 1) / 7);

  // ── 1. Безопасность
  const rapid = ratePct != null && ratePct < -SAFETY.rapidLossRate;
  counters.rapidWeeks = rapid ? counters.rapidWeeks + 1 : 0;
  const lowReadyDays = checkins.filter((c) => c.readiness > 0 && c.readiness <= SAFETY.lowReadiness).length;
  const safety = [];
  if (counters.rapidWeeks >= 2) safety.push('вес две недели подряд меняется быстрее безопасного');
  if (restr.lowBmi) safety.push('ИМТ ниже 18.5');
  if (lowReadyDays >= SAFETY.lowReadinessDays) safety.push(`готовность была низкой ${lowReadyDays} дней из 7`);
  const safetyFired = safety.length > 0;
  if (safetyFired) {
    if (phaseType !== 'maintenance') phaseChange = { to: 'maintenance', reason: `безопасность: ${safety.join('; ')}` };
    phaseType = 'maintenance';
    counters.rapidWeeks = 0;
    add(1, 'Фаза — поддержание', `Приоритет — восстановление: ${safety.join('; ')}.`);
  }

  // ── 2. Сон
  const sleep = sleepStatus(sleepSamples, checkins);
  const sleepPause = !safetyFired && phaseType === 'deficit' && sleep.poor;
  if (sleepPause) {
    const src = sleep.source === 'hours' ? `в среднем ${sleep.avgHours.toFixed(1)} ч сна` : 'оценка сна в среднем ≤ 2';
    add(2, 'Дефицит на следующую неделю — 0', `При таком сне теряется мышечная масса (${src}).`);
  }

  // ── 3. Калибровка TDEE
  const cal = calibrateWeek({ tdeeEst: prev.tdeeEst, confidence: prev.confidence, daily, foodDays, weekStart, calibratedWeeks: prev.calibratedWeeks || 0 });
  if (cal.calibrated && cal.initial) {
    add(3, `Оценка расхода ${prev.tdeeEst} → ${cal.tdeeEst} ккал/день`,
      `Две недели наблюдения: по логу еды и тренду веса расход ≈ ${cal.observed} ккал/день вместо оценки по формуле.`);
  } else if (cal.calibrated) {
    add(3, `Оценка расхода ${prev.tdeeEst} → ${cal.tdeeEst} ккал/день`,
      `По логу еды и тренду веса фактический расход ≈ ${cal.observed} ккал/день; уверенность ${Math.round(cal.confidence * 100)}%.`);
  } else {
    const conf = Math.round(cal.confidence * 100);
    add(3, 'Оценка расхода без изменений', cal.confidence < prev.confidence
      ? `Неделя не калибрует: ${cal.reason}. Уверенность модели снижена до ${conf}%.`
      : `Неделя не калибрует: ${cal.reason}.`);
  }
  const fullLog = cal.calibrated;

  // ── 5. Прогресс к цели (поправка к бюджету, применяется в правиле 4)
  let adjust = prev.phaseAdjustKcal || 0;
  const strengthByEx = strengthMap(weekSets);
  // скорость судим только по неделям, когда бюджет уже стоял на откалиброванном расходе, а не на формуле
  const budgetCalibrated = (prev.calibratedWeeks || 0) >= 1;
  if (!safetyFired && !sleepPause && phaseType === 'deficit') {
    if (fullLog && budgetCalibrated && ratePct != null && goal?.ratePct) {
      const loss = -ratePct;
      counters.slowWeeks = loss < goal.ratePct ? counters.slowWeeks + 1 : 0;
      counters.fastWeeks = loss > goal.ratePct * COACH.fastFactor ? counters.fastWeeks + 1 : 0;
      if (counters.slowWeeks >= COACH.slowWeeksToAdjust) {
        adjust -= COACH.progressStepKcal;
        counters.slowWeeks = 0;
        add(5, `Бюджет −${COACH.progressStepKcal} ккал/день`, 'Две недели подряд вес снижается медленнее цели при полном логе.');
      } else if (counters.fastWeeks >= COACH.slowWeeksToAdjust) {
        adjust += COACH.progressStepKcal;
        counters.fastWeeks = 0;
        add(5, `Бюджет +${COACH.progressStepKcal} ккал/день`, 'Две недели подряд вес снижается заметно быстрее цели.');
      }
    } else {
      counters.slowWeeks = 0;
      counters.fastWeeks = 0;
    }
  }
  if (!safetyFired && phaseType === 'surplus') {
    const prevMap = prev.strengthByEx || {};
    const common = Object.keys(strengthByEx).filter((id) => prevMap[id]);
    const sumNow = common.reduce((s, id) => s + strengthByEx[id], 0);
    const sumPrev = common.reduce((s, id) => s + prevMap[id], 0);
    const growingWeight = ratePct != null && ratePct > 0;
    if (growingWeight && common.length && sumNow <= sumPrev) counters.gainNoStrengthWeeks++;
    else if (common.length) counters.gainNoStrengthWeeks = 0;
    if (counters.gainNoStrengthWeeks >= COACH.gainNoStrengthWeeks) {
      adjust -= COACH.progressStepKcal;
      counters.gainNoStrengthWeeks = 0;
      add(5, `Бюджет −${COACH.progressStepKcal} ккал/день`, 'Профицит идёт в жир: вес растёт, а рабочие веса не растут три недели.');
    }
  }

  // ── 6. Тренировки: объём по мышцам и изменения весов за неделю
  const volume = weeklyVolume(weekSets);
  let programChanges = [];
  const planned = profile.daysPerWeek || 0;
  if (input.program && !prev.deloadNext && planned && weekSessions.length >= planned) {
    programChanges = volumeAdjustments(input.program, volume);
    for (const c of programChanges) {
      const exId = input.program.days[c.dayIndex].exercises[c.slotIndex].exerciseId;
      add(6, `${EXERCISES_BY_ID[exId]?.name}: ${c.delta > 0 ? '+1 подход' : '−1 подход'}`,
        `${MUSCLES[c.muscle]}: ${c.volume.toFixed(1)} дробных сетов за неделю — ${c.delta > 0 ? 'меньше 6' : 'больше 25'}.`);
    }
  }
  const prevStrength = prev.strengthByEx || {};
  for (const [id, kg] of Object.entries(strengthByEx)) {
    const before = prevStrength[id];
    if (before && kg !== before) {
      add(6, `${EXERCISES_BY_ID[id]?.name}: ${before} → ${kg} кг`, kg > before ? 'Повторы в верхней границе — вес вырос.' : 'Повторы ниже диапазона — вес снижен.');
    }
  }

  // ── 7. Разгрузка
  const ton = tonnage(weekSets, trendKg || 0);
  const soreness = mean(checkins.map((c) => c.soreness).filter((x) => x > 0));
  const dropping = ton > 0 && prev.tonnage > 0 && prev.tonnagePrev > 0 && ton < prev.tonnage && prev.tonnage < prev.tonnagePrev;
  const deloadNext = !prev.deloadNext && dropping && soreness >= COACH.deloadSoreness;
  if (deloadNext) add(7, 'Следующая неделя — разгрузка, объём ×0.5', 'Тоннаж снижается две недели подряд при высокой болезненности.');

  // ── 8. Плато (только в дефиците, без правил 1–2)
  if (!safetyFired && !sleepPause && phaseType === 'deficit' && fullLog && ratePct != null && Math.abs(ratePct) < COACH.plateauRate) {
    counters.flatWeeks++;
  } else {
    counters.flatWeeks = 0;
  }
  if (counters.flatWeeks >= COACH.plateauWeeks) {
    counters.flatWeeks = 0;
    let p;
    if (weeksInPhase >= 8) p = { type: 'phase', to: 'maintenance', weeks: COACH.dietBreakWeeks, text: 'Две недели поддержания, потом вернуться к дефициту' };
    else if (cal.confidence < MODEL.confidenceThreshold) p = { type: 'recalcTdee', value: cal.observed || cal.tdeeEst, text: 'Пересчитать активность: взять расход по последним трём неделям' };
    else p = { type: 'budgetAdjust', kcal: -COACH.plateauBudgetStep, text: `Бюджет −${COACH.plateauBudgetStep} ккал/день` };
    proposals.push({ id: `plateau-${weekStart}`, rule: 8, text: p.text, action: p, reason: 'Три недели вес стоит при полном логе.' });
    add(8, `Предложение: ${p.text.toLowerCase()}`, 'Три недели вес стоит при полном логе.');
  }

  // ── 9. Фаза
  if (phaseType === 'deficit' && weeksInPhase >= COACH.dietBreakAfterWeeks && !counters.dietBreakProposed) {
    counters.dietBreakProposed = true;
    proposals.push({
      id: `diet-break-${weekStart}`, rule: 9, text: 'Две недели поддержания (diet break)',
      action: { type: 'phase', to: 'maintenance', weeks: COACH.dietBreakWeeks },
      reason: `Дефицит идёт ${weeksInPhase} недель.`,
    });
    add(9, 'Предложение: две недели поддержания', `Дефицит идёт ${weeksInPhase} недель.`);
  }
  let nextPhaseAllowed = prev.nextPhaseAllowed || false;
  if (phaseType === 'maintenance' && phase.after === 'deficit' && weeksInPhase >= COACH.maintenanceBeforeNextPhase) {
    nextPhaseAllowed = true;
    if (!counters.nextPhaseAnnounced) {
      counters.nextPhaseAnnounced = true;
      add(9, 'Следующая фаза доступна', `${weeksInPhase} недели поддержания после дефицита позади.`);
      if (phase.plannedWeeks && !safetyFired) {
        proposals.push({ id: `resume-${weekStart}`, rule: 9, text: 'Вернуться к дефициту', action: { type: 'phase', to: 'deficit' }, reason: 'Плановое поддержание закончилось.' });
      }
    }
  }

  // ── 10. Пул еды
  const poolFrom = addDays(weekEnd, -(COACH.poolWindowDays - 1));
  const replaced = (input.planItems || []).filter((pi) => (pi.status === 'replaced' || pi.status === 'swapped') && pi.day >= poolFrom && pi.day <= weekEnd);
  const replCount = groupBy(replaced, (pi) => pi.poolItemId);
  const demote = [];
  for (const [id, list] of replCount) {
    if (list.length >= COACH.poolReplaceDemote) {
      demote.push(id);
      const item = (input.pool || []).find((p) => p.id === id);
      add(10, `«${item?.name || 'позиция'}» реже в стеке`, `Заменялась ${list.length} раз за две недели.`);
    }
  }
  const poolFoodIds = new Set((input.pool || []).filter((p) => !p.deleted).map((p) => p.refId));
  const outside = (input.foodEntries || []).filter((e) => !e.deleted && e.refId && !poolFoodIds.has(e.refId) && e.day >= poolFrom && e.day <= weekEnd);
  const suggestAdd = [];
  for (const [refId, list] of groupBy(outside, (e) => e.refId)) {
    if (list.length >= COACH.poolOutsideSuggest) {
      suggestAdd.push({ refId, refType: list[0].refType, name: list[0].name, count: list.length, grams: Math.round(mean(list.map((e) => e.grams || 0))) });
      proposals.push({ id: `pool-${refId}-${weekStart}`, rule: 10, text: `Добавить «${list[0].name}» в пул`, action: { type: 'addToPool', refId, refType: list[0].refType, grams: Math.round(mean(list.map((e) => e.grams || 100))) }, reason: `Съедено ${list.length} раза за две недели вне пула.` });
    }
  }

  // ── 4. Бюджет и макросы на следующую неделю
  if (phaseChange) adjust = 0;
  const b = budgetFor({ tdee: cal.tdeeEst, phaseType, goal, weightKg: trendKg, profile, restr, adjust, sleepPause });
  if (b.phase !== phaseType) {
    phaseChange = { to: b.phase, reason: `фаза «${PHASES[phaseType]}» недоступна при текущих ограничениях` };
    add(4, `Фаза — ${PHASES[b.phase].toLowerCase()}`, 'Текущая фаза недоступна при ограничениях здоровья.');
  }
  const floorNote = b.floorApplied ? ' Бюджет упёрся в нижний порог безопасности.' : '';
  if (!restr.noBudget) {
    add(4, `Бюджет ${b.budget} ккал/день, белок ${b.macros.pMin}–${b.macros.pMax} г`,
      `Фаза «${PHASES[b.phase]}»${b.phase === 'deficit' && goal?.ratePct ? `, цель ${goal.ratePct}% в неделю` : ''}.${floorNote}`);
  }

  changes.sort((x, y) => x.rule - y.rule);

  const state = {
    weekStart,
    tdeeEst: cal.tdeeEst,
    confidence: cal.confidence,
    calibratedWeeks: cal.calibratedWeeks,
    budget: b.budget,
    macros: b.macros,
    phase: b.phase,
    phaseAdjustKcal: adjust,
    trendKg,
    ratePct,
    deloadNext,
    counters,
    tonnage: ton,
    tonnagePrev: prev.tonnage || 0,
    strengthByEx: Object.keys(strengthByEx).length ? { ...prevStrength, ...strengthByEx } : prevStrength,
    nextPhaseAllowed,
    sleepPause,
    safetyFired,
    appliedRules: [...new Set(changes.map((c) => c.rule))],
    noBudget: restr.noBudget,
    forceNoNumbers: restr.forceNoNumbers,
  };

  const aggregates = {
    weekStart, weekEnd,
    weighIns,
    trendKg: trendKg != null ? Math.round(trendKg * 10) / 10 : null,
    trendChangeKg: trendUpdated && prev.trendKg ? Math.round((trendKg - prev.trendKg) * 10) / 10 : null,
    ratePct: ratePct != null ? Math.round(ratePct * 100) / 100 : null,
    hideLossNumbers: safetyFired || restr.forceNoNumbers,
    fullDays: fullDayTotals.length,
    avgKcal: fullDayTotals.length ? Math.round(mean(fullDayTotals.map((t) => t.kcal))) : null,
    avgProtein: fullDayTotals.length ? Math.round(mean(fullDayTotals.map((t) => t.p))) : null,
    weekKcal: Math.round(weekTotals.reduce((s, t) => s + t.kcal, 0)),
    weekBudget: prev.budget ? prev.budget * 7 : null,
    ultraProcessed: ultraProcessedShare((input.foodEntries || []).filter((e) => inWeek(e.day, weekStart, weekEnd))),
    sleep,
    sessions: weekSessions.length,
    sessionsPlanned: planned,
    volume,
    volumeWarnings: input.program ? volumeWarnings(volume, input.program) : [],
    tonnage: ton,
    phase: b.phase,
  };

  return { state, changes, proposals, phaseChange, programChanges, pool: { demote, suggestAdd }, aggregates };
}
