// Общие утилиты ядра: даты как ключи 'YYYY-MM-DD' (локальное время), арифметика, ГПСЧ для тестов.

export const DAY_MS = 86400000;

export function dayKey(d = new Date()) {
  const x = d instanceof Date ? d : new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

export function parseDay(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key, n) {
  const d = parseDay(key);
  d.setDate(d.getDate() + n);
  return dayKey(d);
}

export function daysBetween(a, b) {
  return Math.round((parseDay(b) - parseDay(a)) / DAY_MS);
}

// Понедельник недели, в которую попадает день
export function weekStart(key) {
  const d = parseDay(key);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return dayKey(d);
}

export function weekDays(start) {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function weekdayIndex(key) {
  return (parseDay(key).getDay() + 6) % 7; // 0 = пн
}

export function isWeekend(key) {
  return weekdayIndex(key) >= 5;
}

export function ageOn(birthDate, onKey) {
  if (!birthDate) return null;
  const b = parseDay(birthDate);
  const t = parseDay(onKey);
  let age = t.getFullYear() - b.getFullYear();
  if (t.getMonth() < b.getMonth() || (t.getMonth() === b.getMonth() && t.getDate() < b.getDate())) age--;
  return age;
}

export const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
export const sum = (a) => a.reduce((s, x) => s + x, 0);
export const mean = (a) => (a.length ? sum(a) / a.length : NaN);
export const round = (x, step = 1) => Math.round(x / step) * step;

export function median(a) {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Наклон и свободный член МНК
export function linreg(xs, ys) {
  const n = xs.length;
  if (n < 2) return null;
  const mx = mean(xs);
  const my = mean(ys);
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i] - mx) ** 2;
    sxy += (xs[i] - mx) * (ys[i] - my);
  }
  if (sxx === 0) return null;
  const b = sxy / sxx;
  return { a: my - b * mx, b };
}

export function uid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

// Детерминированный ГПСЧ (mulberry32) — для синтетических сценариев
export function rng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.gauss = (mu = 0, sigma = 1) => {
    const u = 1 - next();
    const v = next();
    return mu + sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  next.pick = (arr) => arr[Math.floor(next() * arr.length)];
  next.shuffle = (arr) => {
    const a2 = [...arr];
    for (let i = a2.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [a2[i], a2[j]] = [a2[j], a2[i]];
    }
    return a2;
  };
  return next;
}

export function groupBy(arr, keyFn) {
  const m = new Map();
  for (const x of arr) {
    const k = keyFn(x);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(x);
  }
  return m;
}
