// Адаптивный TDEE (раздел 5, правило 3).
// ΔTDEE = (ккал_залогировано − Δвес × 7700) / 7 − TDEE_est;  TDEE_est += k × ΔTDEE.
// ккал и Δвес берутся по одному окну (до 28 дней), чтобы колебания питания не попадали в оценку.
// Первые 2 недели — наблюдение (раздел 4: активность не спрашиваем, а наблюдаем): по их итогу
// формульная оценка заменяется фактической (k = 1), дальше — k = 0.3 / 0.5 по уверенности.
import { MODEL, KCAL_PER_KG } from './constants.js';
import { addDays, clamp, mean, weekDays } from './util.js';
import { isFullDay } from './nutrition.js';
import { slopeKgPerDay, weighInsBetween } from './trend.js';

// Стартовая оценка: Mifflin–St Jeor × коэффициент активности. Активность не спрашиваем — её уточнит калибровка.
export function initialTdee({ sex, weightKg, heightCm, age, trainingDays = 0 }) {
  const bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === 'm' ? 5 : -161);
  const factor = 1.35 + 0.03 * trainingDays;
  return Math.round((bmr * factor) / 10) * 10;
}

// foodDays: Map(day → итоги дня из dayTotals); calibratedWeeks — сколько недель уже откалибровано
export function calibrateWeek({ tdeeEst, confidence, daily, foodDays, weekStart, calibratedWeeks = 0 }) {
  const days = weekDays(weekStart);
  const weekEnd = days[6];
  const fullDays = days.filter((d) => foodDays.has(d) && isFullDay(foodDays.get(d))).length;
  const weighIns = weighInsBetween(daily, weekStart, weekEnd);
  const base = { fullDays, weighIns, calibratedWeeks };
  const observing = calibratedWeeks === 0;

  const skip = (reason, penalty = true) => ({
    ...base,
    calibrated: false,
    tdeeEst,
    confidence: penalty ? clamp(confidence - MODEL.confidenceDown, 0, 1) : confidence,
    reason,
  });

  if (fullDays < MODEL.minFullDaysPerWeek) return skip(`полных дней еды ${fullDays} из 7 — нужно минимум ${MODEL.minFullDaysPerWeek}`);
  if (weighIns < MODEL.minWeighInsPerWeek) return skip(`взвешиваний ${weighIns} — нужно минимум ${MODEL.minWeighInsPerWeek}`);

  const win = MODEL.calibrationWindowDays;
  const from = addDays(weekEnd, -(win - 1));
  const firstWeigh = daily.find((p) => p.day >= from);
  const slope = slopeKgPerDay(daily, weekEnd, win, MODEL.calibrationMinSpanDays);
  const windowDays = [...foodDays.entries()].filter(([d, t]) => d >= from && d <= weekEnd && isFullDay(t));
  if (slope == null || windowDays.length < 8) {
    // в первые две недели это не пропуск, а наблюдение
    return observing && firstWeigh
      ? skip('идёт наблюдение — первые 2 недели', false)
      : skip('мало данных в окне для оценки тренда');
  }

  const kcalMean = mean(windowDays.map(([, t]) => t.kcal));
  const dayConf = mean(windowDays.map(([, t]) => t.confidence));
  const observed = clamp(kcalMean - slope * KCAL_PER_KG, 800, 6000);
  const delta = observed - tdeeEst;
  let k;
  let newConf;
  if (observing) {
    k = 1;
    newConf = Math.max(confidence + MODEL.confidenceUp, MODEL.confidenceThreshold);
  } else {
    k = confidence < MODEL.confidenceThreshold ? MODEL.kLowConfidence : MODEL.kHighConfidence;
    // доверие записей: записи «примерно» замедляют калибровку
    k *= clamp(dayConf / 0.7, 0.5, 1);
    newConf = clamp(confidence + MODEL.confidenceUp, 0, 1);
  }
  return {
    ...base,
    calibrated: true,
    initial: observing,
    calibratedWeeks: calibratedWeeks + 1,
    tdeeEst: Math.round(tdeeEst + k * delta),
    confidence: newConf,
    observed: Math.round(observed),
    delta: Math.round(delta),
    k,
    slopeKgPerWeek: slope * 7,
    kcalMean: Math.round(kcalMean),
  };
}
