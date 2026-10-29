// Тренд веса. Отображаемый тренд — EMA α≈0.1; скорость изменения — МНК по окну.
// EMA с α=0.1 отстаёт на ~9 дней: для калибровки и правил скорости берём наклон регрессии,
// иначе первые 3–4 недели TDEE систематически занижается на 100–300 ккал (проверено симуляцией).
import { MODEL } from './constants.js';
import { addDays, daysBetween, linreg, mean } from './util.js';

export function dailyWeights(entries) {
  const byDay = new Map();
  for (const e of entries) {
    if (e.deleted || !(e.kg > 0)) continue;
    if (!byDay.has(e.day)) byDay.set(e.day, []);
    byDay.get(e.day).push(e.kg);
  }
  return [...byDay.entries()]
    .map(([day, a]) => ({ day, kg: mean(a) }))
    .sort((x, y) => (x.day < y.day ? -1 : 1));
}

// EMA с учётом пропусков: α_eff = 1 − (1 − α)^дней_с_прошлого_взвешивания
export function emaTrend(daily, alpha = MODEL.trendAlpha) {
  const out = [];
  let prev = null;
  for (const p of daily) {
    let trend = p.kg;
    if (prev) {
      const gap = Math.max(1, daysBetween(prev.day, p.day));
      const a = 1 - Math.pow(1 - alpha, gap);
      trend = prev.trend + a * (p.kg - prev.trend);
    }
    prev = { ...p, trend };
    out.push(prev);
  }
  return out;
}

export function trendOn(series, day) {
  let res = null;
  for (const p of series) {
    if (p.day <= day) res = p;
    else break;
  }
  return res ? res.trend : null;
}

export function weighInsBetween(daily, from, to) {
  return daily.filter((p) => p.day >= from && p.day <= to).length;
}

// кг/день по взвешиваниям окна [to − windowDays + 1, to]; null, если данных мало
export function slopeKgPerDay(daily, to, windowDays, minSpanDays = 6) {
  const from = addDays(to, -(windowDays - 1));
  const pts = daily.filter((p) => p.day >= from && p.day <= to);
  if (pts.length < 5) return null;
  if (daysBetween(pts[0].day, pts[pts.length - 1].day) < minSpanDays) return null;
  const r = linreg(pts.map((p) => daysBetween(from, p.day)), pts.map((p) => p.kg));
  return r ? r.b : null;
}

// %/нед, знак: минус — снижение
export function weeklyRatePct(daily, to, windowDays = 14) {
  const s = slopeKgPerDay(daily, to, windowDays);
  if (s == null) return null;
  const from = addDays(to, -(windowDays - 1));
  const ref = mean(daily.filter((p) => p.day >= from && p.day <= to).map((p) => p.kg));
  return (s * 7 / ref) * 100;
}
