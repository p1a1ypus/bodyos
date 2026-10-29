// Анализы: фото/PDF → распознавание → проверка таблицы → тренды и флаги «вне референса». Без рекомендаций.
import { h, num, toast, fmtDateFull } from '../dom.js';
import { dayKey } from '../../core/util.js';

const SUGGESTED = ['Гемоглобин', 'Ферритин', 'Витамин D (25-OH)', 'Креатинин', 'АЛТ', 'АСТ', 'ТТГ', 'Холестерин общий', 'ЛПНП', 'ЛПВП', 'Триглицериды', 'Глюкоза', 'HbA1c'];
let draft = null;

export async function labsView(ctx) {
  const { S } = ctx;
  const re = () => ctx.refresh();
  const out = h('div', {}, h('h1', {}, 'Анализы'),
    h('p', { class: 'muted' }, 'Здесь только значения, тренды и отметки «вне референса». Толкование — с врачом.'));

  const file = h('input', { type: 'file', accept: 'image/*,application/pdf' });
  const status = h('span', { class: 'muted' });
  out.appendChild(h('div', { class: 'card' }, h('h2', {}, 'Добавить бланк'),
    file,
    h('div', { class: 'row', style: { marginTop: '8px' } },
      h('button', { class: 'btn', onclick: async () => {
        const f = file.files[0];
        if (!f) return toast('Выбери фото или PDF');
        if (!ctx.llm.available()) return toast('Распознавание работает через LLM — включи его в «Ещё». Можно ввести вручную.');
        status.textContent = 'Распознаю…';
        try {
          const r = await ctx.llm.parseLabs(f);
          draft = { date: r.date || dayKey(), fileName: f.name, rows: r.results.map((x) => ({ ...x })) };
          status.textContent = '';
          re();
        } catch (e) {
          status.textContent = 'Не удалось: ' + e.message;
        }
      } }, 'Распознать'),
      h('button', { class: 'btn ghost', onclick: () => { draft = { date: dayKey(), fileName: null, rows: [{ name: '', value: '', unit: '', refMin: '', refMax: '' }] }; re(); } }, 'Ввести вручную'),
      status)));

  if (draft) {
    const tbl = h('table', {}, h('tr', {}, ['Показатель', 'Значение', 'Ед.', 'Мин', 'Макс', ''].map((t) => h('th', {}, t))),
      draft.rows.map((r, i) => h('tr', {},
        h('td', {}, h('input', { value: r.name, list: 'lab-names', oninput: (e) => { r.name = e.target.value; } })),
        h('td', {}, num({ value: r.value, oninput: (e) => { r.value = e.target.value; } })),
        h('td', {}, h('input', { value: r.unit, oninput: (e) => { r.unit = e.target.value; } })),
        h('td', {}, num({ value: r.refMin, oninput: (e) => { r.refMin = e.target.value; } })),
        h('td', {}, num({ value: r.refMax, oninput: (e) => { r.refMax = e.target.value; } })),
        h('td', {}, h('button', { class: 'btn ghost small', onclick: () => { draft.rows.splice(i, 1); re(); } }, '×')))));
    out.appendChild(h('div', { class: 'card accent' }, h('h2', {}, 'Проверь значения'),
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Дата анализа'), h('input', { type: 'date', value: draft.date, onchange: (e) => { draft.date = e.target.value; } })),
      h('div', { style: { overflowX: 'auto' } }, tbl),
      h('datalist', { id: 'lab-names' }, SUGGESTED.map((n) => h('option', { value: n }))),
      h('div', { class: 'row', style: { marginTop: '8px' } },
        h('button', { class: 'btn ghost small', onclick: () => { draft.rows.push({ name: '', value: '', unit: '', refMin: '', refMax: '' }); re(); } }, '+ строка'),
        h('button', { class: 'btn primary', onclick: async () => {
          const rows = draft.rows.filter((r) => r.name.trim() && r.value !== '' && !Number.isNaN(Number(r.value)))
            .map((r) => ({ day: draft.date, name: r.name.trim(), value: Number(r.value), unit: r.unit, refMin: r.refMin, refMax: r.refMax, fileName: draft.fileName }));
          await S.saveLabs(rows);
          draft = null;
          toast(`Сохранено показателей: ${rows.length}`);
          re();
        } }, 'Сохранить'))));
  }

  const series = S.labSeries();
  if (!series.length) out.appendChild(h('p', { class: 'muted' }, 'Пока нет анализов.'));
  for (const s of series) {
    const last = s.rows.at(-1);
    out.appendChild(h('div', { class: 'card' },
      h('div', { class: 'row between' }, h('h2', {}, s.name), last.flag ? h('span', { class: 'tag' }, last.flag) : null),
      h('div', { class: 'kv' }, s.rows.slice(-6).reverse().flatMap((r) => [
        h('span', { class: 'muted' }, fmtDateFull(r.day)),
        h('span', {}, `${r.value} ${r.unit || ''}${r.flag ? ' · ' + r.flag : ''}`),
      ])),
      last.refMin !== '' || last.refMax !== '' ? h('p', { class: 'hint' }, `Референс: ${last.refMin || '—'}…${last.refMax || '—'} ${last.unit || ''}`) : null));
  }
  return out;
}
