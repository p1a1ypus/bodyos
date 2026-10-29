// Ни один сценарий не опускает бюджет ниже пола и не обходит красные флаги.
import { test, assert, eq, note } from './harness.js';
import { budgetFor } from '../js/core/coach.js';
import { restrictions, kcalFloor, rateToKcal } from '../js/core/safety.js';
import { checkGoal } from '../js/core/goals.js';
import { rng } from '../js/core/util.js';
import { simulate, makeProfile } from './sim.js';

const TODAY = '2026-10-29';
const FLAGS = ['pregnancy', 'ed_history', 'diabetes', 'cvd', 'kidney', 'thyroid'];

test('fuzz: 5000 случайных входов — бюджет ≥ пола, скорость ≤ потолка', () => {
  const r = rng(42);
  let checked = 0;
  for (let i = 0; i < 5000; i++) {
    const sex = r() < 0.5 ? 'm' : 'f';
    const weightKg = 40 + r() * 110;
    const profile = {
      sex, heightCm: 150 + r() * 45, birthDate: `${1950 + Math.floor(r() * 55)}-06-01`,
      stopFlags: FLAGS.filter(() => r() < 0.15),
    };
    const restr = restrictions(profile, { weightKg, today: TODAY });
    const phaseType = r.pick(['deficit', 'maintenance', 'surplus', 'strength']);
    const tdee = 800 + r() * 3500;
    const goal = { ratePct: r() * 5 };
    const adjust = (r() - 0.7) * 4000;
    const b = budgetFor({ tdee, phaseType, goal, weightKg, profile, restr, adjust, sleepPause: r() < 0.1 });
    const floor = kcalFloor(sex);
    assert(b.budget >= floor, `бюджет ${b.budget} < пола ${floor}`);
    if (b.budget > floor + 10) {
      if (b.phase === 'deficit') assert(tdee - b.budget <= rateToKcal(weightKg, restr.maxDeficitRate) + 10, 'дефицит выше потолка');
      if (b.phase === 'surplus') assert(b.budget - tdee <= rateToKcal(weightKg, restr.maxSurplusRate) + 10, 'профицит выше потолка');
    }
    if (!restr.deficitAllowed) assert(b.phase !== 'deficit', 'дефицит при запрете');
    if (restr.pregnancy) eq(b.phase, 'maintenance');
    checked++;
  }
  note(`проверено ${checked} комбинаций`);
});

test('замкнутый цикл: правило 5 давит бюджет вниз, но пол держится', () => {
  const profile = makeProfile({ sex: 'f', heightCm: 160, birthDate: '1985-01-01' });
  const { log } = simulate({ seed: 11, profile, startKg: 58, offset: -250, closedLoop: true, under: 0.35, phaseType: 'deficit', goal: { type: 'lose', ratePct: 1 }, weeks: 16 });
  const min = Math.min(...log.map((r) => r.budget));
  note(`минимальный бюджет за 16 недель: ${min} ккал`);
  assert(min >= 1200, `бюджет опустился до ${min}`);
});

test('стоп-флаги: реакции из раздела 4', () => {
  const base = { sex: 'f', heightCm: 165, birthDate: '1990-01-01' };
  const minor = restrictions({ ...base, birthDate: '2010-01-01' }, { weightKg: 60, today: TODAY });
  assert(minor.blocked, 'до 18 — недоступно');
  const preg = restrictions({ ...base, stopFlags: ['pregnancy'] }, { weightKg: 60, today: TODAY });
  assert(!preg.deficitAllowed && preg.noBudget && preg.allowedPhases.join() === 'maintenance');
  const ed = restrictions({ ...base, stopFlags: ['ed_history'] }, { weightKg: 60, today: TODAY });
  assert(ed.forceNoNumbers && !ed.deficitAllowed);
  const med = restrictions({ ...base, stopFlags: ['diabetes'] }, { weightKg: 80, today: TODAY });
  assert(med.consultDoctor && med.maxDeficitRate === 0.5 && med.maxSurplusRate === 0.25);
  const thin = restrictions(base, { weightKg: 48, today: TODAY });
  assert(thin.lowBmi && !thin.deficitAllowed, 'ИМТ < 18.5 — дефицит недоступен');
});

test('цель: нереалистичный срок → отказ с объяснением и реалистичной датой', () => {
  const restr = restrictions({ sex: 'm', heightCm: 180, birthDate: '1990-01-01' }, { weightKg: 90, today: TODAY });
  const r = checkGoal({ type: 'lose', targetKg: 80, deadline: '2026-11-29' }, { weightKg: 90, heightCm: 180, today: TODAY, restr });
  assert(!r.ok && r.suggestedDeadline && r.reason.includes('Реалистичный срок'), r.reason);
  const ok = checkGoal({ type: 'lose', targetKg: 80, deadline: r.suggestedDeadline }, { weightKg: 90, heightCm: 180, today: TODAY, restr });
  assert(ok.ok && ok.goal.ratePct <= 1, 'с предложенным сроком цель должна приниматься');
  const tooLow = checkGoal({ type: 'lose', targetKg: 55 }, { weightKg: 90, heightCm: 180, today: TODAY, restr });
  assert(!tooLow.ok && tooLow.reason.includes('18.5'));
});

test('цель: при диагнозе потолок 0.5%/нед', () => {
  const restr = restrictions({ sex: 'm', heightCm: 180, birthDate: '1990-01-01', stopFlags: ['cvd'] }, { weightKg: 100, today: TODAY });
  const r = checkGoal({ type: 'lose', targetKg: 90, deadline: '2027-02-01' }, { weightKg: 100, heightCm: 180, today: TODAY, restr });
  assert(!r.ok && r.maxRate === 0.5, r.reason);
});
