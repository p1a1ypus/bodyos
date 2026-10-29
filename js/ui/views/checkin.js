// Утренний чекин: вес + три оценки 1–5 одной рукой, ≤ 15 секунд.
import { h, num, scale, toast } from '../dom.js';
import { dayKey } from '../../core/util.js';

let draft = null;

export async function checkinView(ctx) {
  const { S } = ctx;
  const day = dayKey();
  const prev = S.checkin(day);
  const last = S.trend().at(-1);
  if (!draft || draft.day !== day) {
    const todayW = ctx.store.byDay('weights', day)[0];
    draft = {
      day,
      kg: todayW?.kg ?? (last ? Math.round(last.kg * 10) / 10 : ''),
      sleep: prev?.sleep ?? null, readiness: prev?.readiness ?? null, soreness: prev?.soreness ?? null,
      note: prev?.note || '', sleepHours: '',
    };
  }
  const d = draft;
  const kg = num({ value: d.kg, style: { fontSize: '24px', textAlign: 'center' }, oninput: (e) => { d.kg = e.target.value; } });
  const step = (delta) => () => {
    d.kg = Math.round(((Number(d.kg) || 0) + delta) * 10) / 10;
    kg.value = d.kg;
  };
  const pick = (k) => (v) => {
    d[k] = v;
    ctx.refresh();
  };
  const ready = d.sleep && d.readiness && d.soreness;
  return h('div', {},
    h('h1', {}, 'Чекин'),
    h('div', { class: 'card' },
      h('h2', {}, 'Вес утром, кг'),
      h('div', { class: 'row' },
        h('button', { class: 'btn', onclick: step(-0.1) }, '−0.1'),
        h('div', { class: 'grow' }, kg),
        h('button', { class: 'btn', onclick: step(0.1) }, '+0.1')),
      h('p', { class: 'hint' }, 'Можно пропустить — тогда день без взвешивания.')),
    h('div', { class: 'card' }, h('h2', {}, 'Сон'), scale(d.sleep, pick('sleep'), { labels: { 1: 'почти не спалось', 5: 'отлично' } })),
    h('div', { class: 'card' }, h('h2', {}, 'Готовность'), scale(d.readiness, pick('readiness'), { labels: { 1: 'нет сил', 5: 'много сил' } })),
    h('div', { class: 'card' }, h('h2', {}, 'Болезненность мышц'), scale(d.soreness, pick('soreness'), { labels: { 1: 'нет', 5: 'сильная' } })),
    h('details', { class: 'card' }, h('summary', {}, 'Ещё: часы сна, заметка'),
      h('div', { class: 'row', style: { marginTop: '8px' } }, h('span', { class: 'grow' }, 'Часов сна'), num({ value: d.sleepHours, style: { width: '100px' }, oninput: (e) => { d.sleepHours = e.target.value; } })),
      h('input', { placeholder: 'Заметка', value: d.note, style: { marginTop: '8px' }, oninput: (e) => { d.note = e.target.value; } })),
    h('button', { class: 'btn primary block', disabled: !ready, onclick: async () => {
      await S.saveCheckin({ day, kg: Number(d.kg) || null, sleep: d.sleep, readiness: d.readiness, soreness: d.soreness, note: d.note, sleepHours: Number(d.sleepHours) || null });
      draft = null;
      toast('Записано');
      ctx.go('');
    } }, 'Сохранить'));
}
