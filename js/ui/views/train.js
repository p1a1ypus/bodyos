// Тренировки: план сессии на сегодня, лог сетов с предзаполнением, дробный объём, программа, сила.
import { h, num, toast } from '../dom.js';
import { EXERCISES_BY_ID, MUSCLES } from '../../core/exercises.js';

let swapFor = null;

export async function trainView(ctx) {
  const { S } = ctx;
  const prog = S.program();
  const re = () => ctx.refresh();
  if (!prog) return h('div', {}, h('h1', {}, 'Тренировка'), h('p', { class: 'muted' }, 'Программа не создана.'));
  const noNum = S.noNumbers();
  const out = h('div', {}, h('h1', {}, 'Тренировка'));
  const session = S.activeSession();

  if (session) {
    const plan = S.sessionPlan(session);
    const logged = S.sessionSets(session.id);
    out.appendChild(h('p', { class: 'muted' }, `${plan.name}${plan.deload ? ' — разгрузочная неделя' : ''}`));
    plan.exercises.forEach((pe, ei) => {
      const ex = EXERCISES_BY_ID[pe.exerciseId];
      const mine = logged.filter((x) => x.exerciseId === pe.exerciseId);
      const card = h('div', { class: 'card' },
        h('div', { class: 'row between' }, h('h2', {}, ex.name),
          h('button', { class: 'btn ghost small', onclick: () => { swapFor = swapFor === ei ? null : ei; re(); } }, 'Заменить')),
        h('div', { class: 'muted' }, `${pe.sets.length} × ${pe.repMin}–${pe.repMax}` + (pe.sets[0]?.kg ? ` · ${pe.sets[0].kg} кг` : ex.loaded ? ' · вес подбери' : ' · вес тела') + ` — ${pe.reason}`));
      if (swapFor === ei) {
        const alts = S.alternatives(pe.exerciseId);
        card.appendChild(h('div', { class: 'chips' }, alts.length ? alts.map((a) => h('button', { class: 'chip', onclick: async () => {
          const slotIndex = prog.days[plan.dayIndex].exercises.findIndex((x) => x.exerciseId === pe.exerciseId);
          if (slotIndex >= 0) await S.substitute(plan.dayIndex, slotIndex, a.id);
          plan.exercises[ei] = { ...pe, exerciseId: a.id, sets: pe.sets.map((s) => ({ ...s, kg: a.loaded ? null : 0 })), reason: 'замена — подбери вес' };
          await ctx.store.put('sessionPlans', plan);
          swapFor = null;
          re();
        } }, a.name)) : h('span', { class: 'muted' }, 'Нет замен под оборудование и травмы.')));
      }
      card.appendChild(h('div', { class: 'set-row muted' }, h('span', {}, '#'), h('span', {}, 'кг'), h('span', {}, 'повторы'), h('span', {}, 'RIR'), h('span')));
      pe.sets.forEach((target, si) => {
        const done = mine[si];
        const prevDone = mine[si - 1];
        const kg = num({ value: done?.kg ?? prevDone?.kg ?? target.kg ?? '', disabled: !!done });
        const reps = num({ value: done?.reps ?? target.reps ?? '', disabled: !!done, inputmode: 'numeric' });
        const rir = num({ value: done?.rir ?? '', disabled: !!done, inputmode: 'numeric', placeholder: '—' });
        card.appendChild(h('div', { class: 'set-row' + (done ? ' done' : '') },
          h('span', {}, String(si + 1)), kg, reps, rir,
          done
            ? h('button', { class: 'btn ghost small', onclick: async () => { await S.removeSet(done.id); re(); } }, '↺')
            : h('button', { class: 'btn primary small', onclick: async () => {
              await S.logSet(session, { exerciseId: pe.exerciseId, kg: kg.value, reps: reps.value, rir: rir.value, order: ei * 100 + si });
              re();
            } }, '✓')));
      });
      out.appendChild(card);
    });
    out.appendChild(h('div', { class: 'row' },
      h('button', { class: 'btn primary', onclick: async () => {
        await S.finishSession(session);
        toast('Тренировка записана. Следующая собрана по факту.');
        re();
      } }, 'Закончить тренировку'),
      h('button', { class: 'btn ghost', onclick: async () => { if (confirm('Отменить тренировку и удалить её подходы?')) { await S.cancelSession(session); re(); } } }, 'Отменить')));
  } else {
    const next = S.nextSessionPlan();
    out.appendChild(h('div', { class: 'card' },
      h('h2', {}, `Следующая: ${next.name}${next.deload ? ' (разгрузка, объём ×0.5)' : ''}`),
      next.exercises.map((e) => h('div', { class: 'item' }, h('div', { class: 'grow' },
        h('div', { class: 'title' }, EXERCISES_BY_ID[e.exerciseId].name),
        h('div', { class: 'muted' }, `${e.sets.length} × ${e.repMin}–${e.repMax}` + (e.sets[0]?.kg ? ` · ${e.sets[0].kg} кг` : '') + ` — ${e.reason}`)))),
      h('button', { class: 'btn primary block', style: { marginTop: '8px' }, onclick: async () => { await S.startSession(); re(); } }, 'Начать тренировку')));
  }

  // Объём недели
  const { volume, warnings } = S.weekVolume();
  const warn = new Map(warnings.map((w) => [w.muscle, w.kind]));
  out.appendChild(h('div', { class: 'card' }, h('h2', {}, 'Объём недели, дробные сеты'),
    h('div', { class: 'kv' }, Object.entries(MUSCLES).flatMap(([m, label]) => [
      h('span', {}, label + (warn.get(m) === 'low' ? ' — меньше 6' : warn.get(m) === 'high' ? ' — больше 25' : '')),
      h('span', {}, (Math.round(volume[m] * 10) / 10).toString()),
    ])),
    h('p', { class: 'hint' }, 'Подход в жиме лёжа = 1 сет груди + 0.5 трицепса + 0.5 плеч. Ориентир — 6–25 в неделю.')));

  // Сила
  const rs = S.relativeStrength().slice(0, 6);
  if (rs.length && !noNum) {
    out.appendChild(h('div', { class: 'card' }, h('h2', {}, 'Сила (оценка 1ПМ)'),
      h('div', { class: 'kv' }, rs.flatMap((r) => [h('span', {}, EXERCISES_BY_ID[r.exerciseId].name), h('span', {}, `${r.e1rm} кг${r.ratio ? ` · ×${r.ratio} веса` : ''}`)]))));
  }

  // Программа
  out.appendChild(h('details', { class: 'card' }, h('summary', {}, `Программа: ${prog.name}`),
    prog.days.map((d, di) => h('div', {}, h('h3', {}, d.name), d.exercises.map((e, si) => h('div', { class: 'item' },
      h('div', { class: 'grow' }, `${EXERCISES_BY_ID[e.exerciseId].name}`, h('span', { class: 'muted' }, ` · ${e.sets} × ${e.repMin}–${e.repMax}`)),
      h('select', { style: { width: 'auto', minHeight: '36px' }, onchange: async (ev) => { if (ev.target.value) { await S.substitute(di, si, ev.target.value); re(); } } },
        h('option', { value: '' }, 'заменить…'), S.alternatives(e.exerciseId).map((a) => h('option', { value: a.id }, a.name)))))))));

  // История
  const hist = S.sessionsDone().sort((a, b) => b.ts - a.ts).slice(0, 5);
  if (hist.length) {
    out.appendChild(h('div', { class: 'card' }, h('h2', {}, 'Последние тренировки'),
      hist.map((s) => h('div', { class: 'muted' }, `${s.day} · ${prog.days[s.dayIndex]?.name || ''} · ${S.sessionSets(s.id).length} подходов · ${s.durationMin} мин`))));
  }
  return out;
}
