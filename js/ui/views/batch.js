// Заготовка: сырые ингредиенты → выход готового (взвешено или по коэффициентам) → нутриенты всей партии.
// Порция из партии — доля от всей кастрюли. Сборщик стека предлагает заготовки первыми, ближе к сроку — раньше.
import { h, num, toast, fmtDate } from '../dom.js';
import { COOKING_METHODS, isCookable } from '../../core/fooddb.js';
import { SLOT_LABELS } from '../../core/stack.js';
import { foodMeta } from './food.js';

let draft = null;
let query = '';

const CONF_TEXT = {
  high: 'взвешено',
  medium: 'по коэффициентам выхода из базы',
  low: 'примерно — лучше взвесить готовое',
};
const fresh = () => ({ name: '', inputs: [], weighedG: '', storage: 'fridge', meals: ['lunch', 'dinner'], portionG: 250 });

export async function batchView(ctx) {
  const { S, params } = ctx;
  const re = () => ctx.refresh();
  const noNum = S.noNumbers();
  const back = h('button', { class: 'btn ghost small', onclick: () => ctx.go('food?mode=batch') }, 'Назад');

  if (params.list) {
    const all = S.batches();
    return h('div', {},
      h('div', { class: 'row between' }, h('h1', {}, 'Заготовки'), back),
      all.length ? null : h('p', { class: 'muted' }, 'Заготовок пока нет.'),
      all.map((b) => {
        const left = S.batchRemaining(b);
        const w = num({ value: b.weighedG || '', placeholder: 'вес готового, г', style: { width: '130px' } });
        const done = b.finishedAt || left < 30;
        return h('div', { class: 'card' },
          h('div', { class: 'row between' }, h('h2', {}, b.name), h('span', { class: 'muted' }, done ? 'закончилась' : `до ${fmtDate(b.expiresAt)}`)),
          h('p', { class: 'muted' }, `Приготовлено ${fmtDate(b.cookedAt)} · выход ${b.cookedTotalG} г (${CONF_TEXT[b.confidence]}) · осталось ${left} г`),
          noNum ? null : h('p', { class: 'muted' }, `На 100 г: ${b.per100.kcal} ккал, Б ${b.per100.p}, Ж ${b.per100.f}, У ${b.per100.c}`),
          done ? null : h('div', { class: 'row' }, w,
            h('button', { class: 'btn small', onclick: async () => {
              if (!(Number(w.value) > 0)) return toast('Укажи вес готового');
              await S.saveBatch({ ...b, weighedG: Number(w.value) });
              toast('Выход обновлён');
              re();
            } }, 'Взвесил'),
            h('button', { class: 'btn ghost small', onclick: async () => { await S.finishBatch(b.id); re(); } }, 'Закончилась')));
      }));
  }

  if (!draft) draft = fresh();
  const D = draft;
  const preview = D.inputs.length ? S.previewBatch({ inputs: D.inputs, weighedG: Number(D.weighedG) || null }) : null;

  const nameEl = h('input', { value: D.name, placeholder: 'Например: плов, гречка на 3 дня', oninput: (e) => { D.name = e.target.value; } });

  const rows = D.inputs.map((inp, i) => {
    const row = S.foodRow(inp.code);
    const part = preview?.parts.find((p) => p.code === inp.code);
    const cookable = row && isCookable(row);
    const method = cookable ? h('select', { onchange: (e) => { inp.method = e.target.value; re(); } },
      h('option', { value: '' }, 'способ: обычный'),
      COOKING_METHODS.map((m) => h('option', { value: m, selected: inp.method === m ? true : null }, m))) : null;
    const y = part?.yield;
    return h('div', { class: 'item', style: { display: 'block' } },
      h('div', { class: 'row between' },
        h('div', { class: 'grow' }, h('div', { class: 'title' }, row?.name_ru || inp.code), h('div', { class: 'muted' }, foodMeta({ state: row?.state_ru, category: row?.category_ru }))),
        num({ value: inp.grams, style: { width: '76px' }, onchange: (e) => { inp.grams = Number(e.target.value) || 0; re(); } }), h('span', { class: 'muted' }, 'г'),
        h('button', { class: 'btn ghost small', onclick: () => { D.inputs.splice(i, 1); re(); } }, '×')),
      cookable ? h('div', { class: 'row', style: { marginTop: '4px' } }, method,
        h('span', { class: 'hint' }, y ? `×${y.factor} → ${part.cookedG} г${y.source === 'typical' ? ' (типовой коэффициент)' : ''}` : 'коэффициента нет — масса как есть')) : null);
  });

  const search = h('input', { placeholder: 'Добавить ингредиент: рис, курица, масло…', value: query });
  const found = h('div', { class: 'chips', style: { marginTop: '6px' } });
  const rawHint = h('p', { class: 'hint' });
  const drawFound = () => {
    query = search.value;
    const list = query.trim() ? S.search(query, { limit: 8 }).filter((x) => x.kind === 'food' && S.foodRow(x.id)) : [];
    // в CoFID не у всего есть сырая строка (куриная грудка — только гриль)
    rawHint.textContent = list[0]?.state && !list.some((x) => isCookable(S.foodRow(x.id)))
      ? 'Сырого варианта в базе нет — возьми готовый и впиши его вес после готовки.' : '';
    found.replaceChildren(...list.map((x) => h('button', { class: 'chip', onclick: () => {
      D.inputs.push({ code: x.id, grams: x.category === 'Растительные масла' ? 15 : 200, method: '' });
      query = '';
      re();
    } }, `+ ${x.name}`, h('span', { class: 'muted' }, x.state ? ` · ${x.state}` : ''))));
  };
  search.oninput = drawFound;
  drawFound();

  const weighed = num({ value: D.weighedG, placeholder: 'г', style: { width: '110px' }, onchange: (e) => { D.weighedG = e.target.value; re(); } });
  const storage = h('select', { onchange: (e) => { D.storage = e.target.value; } },
    h('option', { value: 'fridge', selected: D.storage === 'fridge' ? true : null }, 'холодильник — 4 дня'),
    h('option', { value: 'freezer', selected: D.storage === 'freezer' ? true : null }, 'морозилка — 3 месяца'));
  const meals = h('div', { class: 'chips' }, Object.entries(SLOT_LABELS).map(([k, l]) => h('button', { class: 'chip' + (D.meals.includes(k) ? ' on' : ''), onclick: () => {
    D.meals = D.meals.includes(k) ? D.meals.filter((x) => x !== k) : [...D.meals, k];
    re();
  } }, l)));
  const portion = num({ value: D.portionG, style: { width: '90px' }, onchange: (e) => { D.portionG = Number(e.target.value) || 250; } });

  return h('div', {},
    h('div', { class: 'row between' }, h('h1', {}, 'Новая заготовка'), back),
    h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Название'), nameEl),
    h('h3', {}, 'Сырые ингредиенты'),
    h('p', { class: 'hint' }, 'Вес — до готовки: сухая крупа, сырое мясо. Масло и соль — тоже ингредиенты.'),
    rows, search, found, rawHint,
    h('h3', {}, 'Вес готового'),
    h('div', { class: 'row' }, weighed, h('span', { class: 'hint grow' }, 'Взвесь кастрюлю с едой и вычти вес пустой кастрюли — так точнее всего. Можно и позже.')),
    preview ? h('div', { class: 'card accent' },
      h('p', {}, `Выход: ${preview.cookedTotalG} г — ${CONF_TEXT[preview.confidence]}.`),
      noNum ? null : h('p', { class: 'muted' }, `Вся партия: ${preview.totals.kcal} ккал, Б ${preview.totals.p} г · на 100 г: ${preview.per100.kcal} ккал, Б ${preview.per100.p}, Ж ${preview.per100.f}, У ${preview.per100.c}`),
      preview.needsWeighing ? h('p', { class: 'hint' }, 'Для части ингредиентов нет пары «сырой → готовый» в базе — взвешенный выход сделает порции точными.') : null) : null,
    h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Где хранится'), storage),
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Когда есть'), meals),
    h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Обычная порция, г'), portion),
    h('button', { class: 'btn primary block', onclick: async () => {
      if (!D.inputs.length) return toast('Добавь ингредиенты');
      if (!D.meals.length) return toast('Выбери, когда есть');
      try {
        await S.saveBatch({ ...D, weighedG: Number(D.weighedG) || null });
        draft = null;
        toast('Заготовка сохранена — стек предложит её первой');
        ctx.go('food?mode=batch');
      } catch (e) {
        toast(e.message);
      }
    } }, 'Сохранить заготовку'));
}
