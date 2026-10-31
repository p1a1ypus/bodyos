import { test, assert, eq } from './harness.js';
import { progression, weeklyVolume, volumeAdjustments, resolveProgram, planSession, alternativesFor } from '../js/core/training.js';
import { EXERCISES_BY_ID } from '../js/core/exercises.js';
import { shoppingList } from '../js/core/shopping.js';

const slot = { sets: 3, repMin: 6, repMax: 10 };
const sess = (kg, reps, rir = 2) => ({ sets: reps.map((r) => ({ kg, reps: r, rir })) });

test('double progression: все подходы в верхней границе с RIR ≥ 2 → +вес', () => {
  const p = progression(EXERCISES_BY_ID.bench_press, slot, [sess(60, [10, 10, 10])]);
  eq(p.change, 'up');
  eq(p.kg, 62.5);
  eq(p.reps, 6);
});

test('double progression: RIR < 2 в верхней границе — вес держим', () => {
  const p = progression(EXERCISES_BY_ID.bench_press, slot, [sess(60, [10, 10, 10], 0)]);
  eq(p.change, 'hold');
  eq(p.kg, 60);
});

test('double progression: дважды ниже нижней границы → −10%', () => {
  const p = progression(EXERCISES_BY_ID.back_squat, slot, [sess(100, [6, 5, 4]), sess(100, [6, 5, 5])]);
  eq(p.change, 'down');
  eq(p.kg, 90);
});

test('double progression: иначе тот же вес и +1 повтор', () => {
  const p = progression(EXERCISES_BY_ID.back_squat, slot, [sess(100, [8, 7, 7])]);
  eq(p.kg, 100);
  eq(p.reps, 9);
});

test('дробный объём: жим лёжа = 1 грудь + 0.5 трицепс + 0.5 плечи на подход', () => {
  const v = weeklyVolume([{ exerciseId: 'bench_press' }, { exerciseId: 'bench_press' }]);
  eq(v.chest, 2);
  eq(v.triceps, 1);
  eq(v.shoulders, 1);
});

test('объём < 6 → +подход упражнению с наибольшей долей; > 25 → −подход', () => {
  const program = resolveProgram({ daysPerWeek: 3, equipment: 'gym', sessionMin: 60 });
  const lowChest = { chest: 3, back: 10, shoulders: 8, quads: 8, hamstrings: 8, glutes: 9, biceps: 7, triceps: 7, calves: 6, core: 6 };
  const ch = volumeAdjustments(program, lowChest);
  const c = ch.find((x) => x.muscle === 'chest');
  assert(c && c.delta === 1, 'нет +1 для груди');
  const highBack = { ...lowChest, chest: 10, back: 30 };
  assert(volumeAdjustments(program, highBack).some((x) => x.muscle === 'back' && x.delta === -1));
});

test('программа под оборудование и травмы: дома без штанги, с больным плечом без жимов над головой', () => {
  const p = resolveProgram({ daysPerWeek: 2, equipment: 'home', injuries: ['shoulder'], sessionMin: 45 });
  for (const d of p.days) for (const e of d.exercises) {
    const ex = EXERCISES_BY_ID[e.exerciseId];
    assert(!ex.equip.includes('barbell'), ex.name);
    assert(!ex.contra.includes('shoulder'), ex.name);
  }
  assert(alternativesFor('db_row', { equipment: 'home' }).every((x) => x.pattern === 'h_pull'));
});

test('разгрузка: план сессии с объёмом ×0.5', () => {
  const program = resolveProgram({ daysPerWeek: 3, equipment: 'gym' });
  const s = planSession({ program, dayIndex: 0, sets: [], deload: true });
  for (const [i, e] of s.exercises.entries()) eq(e.sets.length, Math.ceil(program.days[0].exercises[i].sets * 0.5));
});

test('список покупок: блюда раскладываются на продукты, готовое → сырой вес по коэффициенту выхода', () => {
  const list = shoppingList([{ items: [{ refId: 'd:buckwheat_chicken', grams: 325 }, { refId: '14-319', grams: 180 }, { refId: '11-862', grams: 279 }] }]);
  const buck = list.find((x) => x.refId === '11-006'); // 200 г варёной гречки / 3,0
  assert(buck && buck.grams === 70 && buck.note === 'сырой вес', JSON.stringify(buck));
  const rice = list.find((x) => x.refId === '11-861'); // пара из базы: 279 / 2,79
  assert(rice && rice.grams === 100, JSON.stringify(rice));
  const chicken = list.find((x) => x.refId === '18-323'); // пары нет: типовой 0,72
  assert(chicken && chicken.grams === 170 && chicken.note.includes('примерно'), JSON.stringify(chicken));
  assert(list.find((x) => x.refId === '14-319').grams === 180);
});
