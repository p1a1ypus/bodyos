// Коуч-цикл на синтетических 12-недельных сценариях (раздел 9, этап 2).
import { test, assert, eq, note } from './harness.js';
import { simulate, share, makeProfile } from './sim.js';

const SEEDS = Array.from({ length: 50 }, (_, i) => i + 1);
const err = (row) => Math.abs(row.tdeeEst - row.logT);

function convergence(label, opts) {
  const runs = SEEDS.map((seed) => simulate({ seed, offset: ((seed * 37) % 600) - 300, ...opts }).log);
  const at = (w) => runs.map((l) => l[w - 1]);
  const w4 = share(at(4), (r) => err(r) <= 100);
  const w6 = share(at(6), (r) => err(r) <= 100);
  const w12 = share(at(12), (r) => err(r) <= 100);
  note(`${label}: ±100 ккал на 4-й неделе — ${(w4 * 100).toFixed(0)}% прогонов, на 6-й — ${(w6 * 100).toFixed(0)}%, на 12-й — ${(w12 * 100).toFixed(0)}% (50 прогонов, стартовая ошибка формулы −300…+300)`);
  return { w4, w6, w12 };
}

test('калибровка: стабильный вес', () => {
  const r = convergence('стабильный вес', { intake: (w, T) => T });
  assert(r.w4 >= 0.8, 'на 4-й неделе меньше 80% прогонов в ±100');
  assert(r.w12 >= 0.95, 'к 12-й неделе меньше 95% прогонов в ±100');
});

test('калибровка: честный дефицит 500 ккал', () => {
  const r = convergence('честный дефицит', { phaseType: 'deficit', goal: { type: 'lose', ratePct: 0.5 }, intake: (w, T) => T - 500 });
  assert(r.w4 >= 0.8, 'на 4-й неделе меньше 80% прогонов в ±100');
  assert(r.w12 >= 0.95);
});

test('калибровка: занижение лога на 20% → сходится к расходу «в единицах лога»', () => {
  const r = convergence('занижение лога 20%', { phaseType: 'deficit', goal: { type: 'lose', ratePct: 0.5 }, intake: (w, T) => T - 500, under: 0.2 });
  assert(r.w4 >= 0.8, 'на 4-й неделе меньше 80% прогонов в ±100');
  assert(r.w12 >= 0.95);
});

test('замкнутый цикл: человек ест бюджет и недологирует 20% — фактическая скорость близка к цели', () => {
  const rates = SEEDS.slice(0, 20).map((seed) => {
    const { log } = simulate({ seed, closedLoop: true, under: 0.2, phaseType: 'deficit', goal: { type: 'lose', ratePct: 0.5 } });
    return log.slice(6).reduce((s, r) => s + r.actualRatePct, 0) / 6;
  });
  const avg = rates.reduce((s, x) => s + x, 0) / rates.length;
  note(`недели 7–12: средняя фактическая скорость ${avg.toFixed(2)}%/нед при цели −0.5%`);
  assert(avg < -0.3 && avg > -0.75, `средняя скорость ${avg.toFixed(2)} вне −0.3…−0.75`);
});

test('пропуски: неделя с < 4 полными днями не калибрует и снижает уверенность', () => {
  const { log } = simulate({ seed: 3, fullDays: (w) => (w === 5 ? 2 : 7) });
  const before = log[4];
  const gap = log[5];
  eq(gap.tdeeEst, before.tdeeEst, 'TDEE в неделю пропуска');
  assert(Math.abs(gap.confidence - Math.max(0, before.confidence - 0.2)) < 1e-9, 'уверенность −0.2');
  assert(gap.changes.some((c) => c.rule === 3 && c.what.includes('без изменений')));
});

test('пропуски: < 3 взвешиваний за неделю — тренд не обновляется', () => {
  const { log } = simulate({ seed: 4, weighIns: (w) => (w === 6 ? 2 : 7) });
  assert(log[6].res.aggregates.trendChangeKg === null, 'изменение тренда должно быть пустым');
  assert(!log[6].res.changes.some((c) => c.rule === 3 && c.what.includes('→')), 'калибровки быть не должно');
});

test('недосып в дефиците: дефицит 0 на неделю, причина про мышечную массу', () => {
  const { log } = simulate({ seed: 5, phaseType: 'deficit', goal: { type: 'lose', ratePct: 0.5 }, intake: (w, T) => T - 450, sleepHours: (w) => (w === 5 ? 5.5 : 7.5) });
  const wk = log[5];
  const ch = wk.changes.find((c) => c.rule === 2);
  assert(ch && ch.reason.includes('мышечная масса'), 'нет правила 2');
  assert(Math.abs(wk.budget - wk.tdeeEst) <= 10, `бюджет ${wk.budget} ≠ TDEE ${wk.tdeeEst}`);
  assert(log[6].budget < log[6].tdeeEst - 200, 'после недели сна дефицит должен вернуться');
});

test('правило 5: медленнее цели две недели при полном логе → −100 ккал', () => {
  // человек съедает больше бюджета, но логирует ровно бюджет → вес почти стоит
  const { log } = simulate({ seed: 6, offset: 0, phaseType: 'deficit', goal: { type: 'lose', ratePct: 0.75 }, intake: (w, T) => T - 150, intakeNoise: 50, weeks: 8 });
  const hit = log.find((r) => r.changes.some((c) => c.rule === 5 && c.what.includes('−100')));
  assert(hit, 'правило 5 не сработало за 8 недель');
});

test('правило 1: быстрая потеря две недели подряд → поддержание без цифр потерь', () => {
  const { log } = simulate({ seed: 7, startKg: 70, profile: makeProfile({ heightCm: 175 }), phaseType: 'deficit', goal: { type: 'lose', ratePct: 1 }, intake: (w, T) => T - 1900, intakeNoise: 50, sigma: 0.15 });
  const hit = log.find((r) => r.changes.some((c) => c.rule === 1));
  assert(hit, 'правило 1 не сработало');
  eq(hit.phase, 'maintenance');
  const msg = hit.changes.find((c) => c.rule === 1);
  assert(!/\d+(\.\d+)?\s*(%|кг)/.test(msg.reason), `в сообщении есть цифры потерь: ${msg.reason}`);
  assert(hit.res.aggregates.hideLossNumbers, 'сводка должна скрывать цифры потерь');
});

test('правило 1: готовность ≤ 2 пять дней → поддержание', () => {
  const { log } = simulate({ seed: 8, phaseType: 'deficit', goal: { type: 'lose', ratePct: 0.5 }, intake: (w, T) => T - 450, readiness: (w, d) => (w === 3 && d < 5 ? 2 : 4) });
  eq(log[3].phase, 'maintenance');
  assert(log[3].changes.some((c) => c.rule === 1));
});

test('правило 8: плато три недели → одно предложение', () => {
  const { log } = simulate({ seed: 9, offset: 0, phaseType: 'deficit', goal: { type: 'lose', ratePct: 0.5 }, intake: (w, T) => T, intakeNoise: 30, sigma: 0.1, weeks: 10 });
  const props = log.flatMap((r) => r.proposals).filter((p) => p.rule === 8);
  assert(props.length >= 1, 'нет предложения по плато');
  assert(log.every((r) => r.proposals.filter((p) => p.rule === 8).length <= 1), 'больше одного предложения за неделю');
});

test('правило 9: дефицит ≥ 10 недель → предложение diet break', () => {
  const { log } = simulate({ seed: 10, phaseType: 'deficit', goal: { type: 'lose', ratePct: 0.5 }, intake: (w, T) => T - 450 });
  const p = log.flatMap((r) => r.proposals).find((x) => x.rule === 9);
  assert(p && p.action.type === 'phase' && p.action.to === 'maintenance', 'нет предложения поддержания');
});
