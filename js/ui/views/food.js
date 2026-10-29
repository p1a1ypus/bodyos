// Ввод еды: голос/текст → разбор → подтверждение; поиск по базе; «примерно N ккал»; штрих-код.
// С параметром plan=<id> записанное заменяет позицию стека, и остаток дня пересобирается.
import { h, num, toast, voiceButton } from '../dom.js';
import { keywordParse } from '../../core/foods.js';
import { CONFIDENCE } from '../../core/constants.js';
import { dayKey, uid } from '../../core/util.js';
import { lookupBarcode, scanBarcode } from '../barcode.js';

let mode = 'text';
let cart = [];
let cartFor = null;
let textDraft = '';
let searchDraft = '';
let parsed = null;

export async function foodView(ctx) {
  const { S, params } = ctx;
  const day = dayKey();
  const planItem = params.plan ? S.dayPlan(day)?.items.find((i) => i.id === params.plan) : null;
  if (cartFor !== (params.plan || '')) {
    cart = [];
    parsed = null;
    cartFor = params.plan || '';
  }
  const cat = S.catalogById();
  const noNum = S.noNumbers();
  const re = () => ctx.refresh();

  const addToCart = (refId, grams, method, confidence) => {
    cart.push({ key: uid(), refId, grams: Math.round(grams), method, confidence });
    re();
  };

  const tabsEl = h('div', { class: 'seg' }, [['text', 'Голос/текст'], ['search', 'Поиск'], ['approx', 'Примерно'], ['barcode', 'Штрих-код']]
    .map(([k, l]) => h('button', { class: mode === k ? 'on' : '', onclick: () => { mode = k; re(); } }, l)));

  let body;
  if (mode === 'text') {
    const ta = h('textarea', { placeholder: 'Например: гречка 200 грамм, две котлеты и салат', value: textDraft, oninput: (e) => { textDraft = e.target.value; } });
    const run = async () => {
      const catalog = S.catalog().filter(S.allowed);
      let items;
      let via = 'llm';
      try {
        if (!ctx.llm.available()) throw new Error('off');
        items = await ctx.llm.parseFood(textDraft, catalog);
      } catch (e) {
        items = keywordParse(textDraft, catalog);
        via = 'keyword';
        if (e.message !== 'off') toast('LLM недоступен — разобрал по словам, проверь');
      }
      parsed = items.map((x) => ({ ...x, key: uid(), via, grams: Math.round(x.grams || cat[x.matchId]?.portion || 100) }));
      re();
    };
    body = h('div', {},
      h('div', { class: 'row' }, h('div', { class: 'grow' }, ta), voiceButton((t) => { textDraft = (textDraft + ' ' + t).trim(); re(); })),
      h('button', { class: 'btn', style: { marginTop: '8px' }, onclick: run }, 'Разобрать'),
      parsed ? h('div', { class: 'card' },
        h('h2', {}, 'Проверь'),
        parsed.length ? null : h('p', { class: 'muted' }, 'Ничего не нашлось. Попробуй поиск.'),
        parsed.map((p) => {
          const options = S.search(p.name).slice(0, 6);
          if (p.matchId && !options.some((o) => o.id === p.matchId) && cat[p.matchId]) options.unshift(cat[p.matchId]);
          return h('div', { class: 'item' },
            h('div', { class: 'grow' },
              h('div', { class: 'muted' }, `«${p.name}»`),
              options.length ? h('select', { onchange: (e) => { p.matchId = e.target.value; } },
                options.map((o) => h('option', { value: o.id, selected: o.id === p.matchId ? true : null }, o.name))) : h('span', {}, 'нет в базе')),
            num({ value: p.grams, style: { width: '80px' }, oninput: (e) => { p.grams = Number(e.target.value); } }), h('span', { class: 'muted' }, 'г'),
            h('button', { class: 'btn ghost small', onclick: () => { parsed = parsed.filter((x) => x !== p); re(); } }, '×'));
        }),
        parsed.length ? h('button', { class: 'btn primary', onclick: () => {
          for (const p of parsed) if (p.matchId && cat[p.matchId]) addToCart(p.matchId, p.grams, p.via === 'llm' ? 'llm' : 'search', p.via === 'llm' ? Math.min(CONFIDENCE.llm, p.confidence || 0.7) : 0.6);
          parsed = null;
          textDraft = '';
          re();
        } }, 'Подтвердить') : null) : null);
  } else if (mode === 'search') {
    const q = h('input', { placeholder: 'Название продукта или блюда', value: searchDraft });
    const list = h('div', {});
    const draw = () => {
      searchDraft = q.value;
      const found = S.search(q.value);
      list.replaceChildren(...found.map((x) => {
        const g = num({ value: x.portion, style: { width: '80px' } });
        return h('div', { class: 'item' },
          h('div', { class: 'grow' }, h('div', { class: 'title' }, x.name), noNum ? null : h('div', { class: 'muted' }, `${x.kcal} ккал / 100 г · Б ${x.p}`)),
          x.unit ? h('button', { class: 'btn ghost small', onclick: () => { g.value = Number(g.value || 0) + x.unit.g; } }, `+1 ${x.unit.name}`) : null,
          g, h('button', { class: 'btn small', onclick: () => addToCart(x.id, Number(g.value) || x.portion, 'search', CONFIDENCE.search) }, '+'));
      }));
    };
    q.oninput = draw;
    draw();
    body = h('div', {}, q, list);
  } else if (mode === 'approx') {
    const k = num({ placeholder: 'ккал' });
    const n = h('input', { placeholder: 'Что это было (необязательно)' });
    body = h('div', {},
      h('p', { class: 'muted' }, 'Когда состав неизвестен. Такая запись учитывается с низким доверием.'),
      h('div', { class: 'row' }, h('div', { class: 'grow' }, k), h('span', {}, 'ккал')), n,
      h('button', { class: 'btn', style: { marginTop: '8px' }, onclick: () => {
        if (!(Number(k.value) > 0)) return toast('Укажи калории');
        cart.push({ key: uid(), approx: true, kcal: Number(k.value), name: n.value || 'Примерно' });
        re();
      } }, 'Добавить'));
  } else {
    const code = num({ placeholder: 'Цифры под штрих-кодом', inputmode: 'numeric' });
    const res = h('div', {});
    const find = async (value) => {
      res.textContent = 'Ищу в Open Food Facts…';
      try {
        const food = await lookupBarcode(value);
        if (!food) return (res.textContent = 'Продукт не найден. Можно записать «примерно».');
        const saved = await ctx.store.put('foods', food);
        const g = num({ value: food.portion, style: { width: '80px' } });
        res.replaceChildren(h('div', { class: 'item' },
          h('div', { class: 'grow' }, h('div', { class: 'title' }, saved.name), noNum ? null : h('div', { class: 'muted' }, `${saved.kcal} ккал / 100 г`)),
          g, h('button', { class: 'btn small', onclick: () => addToCart(saved.id, Number(g.value) || 100, 'barcode', CONFIDENCE.barcode) }, '+')));
      } catch (e) {
        res.textContent = 'Нет связи с базой штрих-кодов: ' + e.message;
      }
    };
    const camera = 'BarcodeDetector' in window
      ? h('button', { class: 'btn', onclick: async () => {
        try {
          const v = await scanBarcode(res);
          if (v) {
            code.value = v;
            find(v);
          }
        } catch (e) {
          toast('Камера недоступна: ' + e.message);
        }
      } }, 'Сканировать камерой') : null;
    body = h('div', {}, h('div', { class: 'row' }, h('div', { class: 'grow' }, code), h('button', { class: 'btn', onclick: () => find(code.value) }, 'Найти')), camera, res);
  }

  const cartEl = cart.length ? h('div', { class: 'card accent' },
    h('h2', {}, planItem ? `Вместо «${planItem.name}»` : 'Записать'),
    cart.map((c) => h('div', { class: 'item' },
      h('div', { class: 'grow' }, c.approx ? `${c.name}: ~${c.kcal} ккал` : `${cat[c.refId]?.name}, ${c.grams} г`),
      h('button', { class: 'btn ghost small', onclick: () => { cart = cart.filter((x) => x !== c); re(); } }, '×'))),
    h('button', { class: 'btn primary block', onclick: async () => {
      const entries = cart.map((c) => (c.approx ? S.makeApprox({ kcal: c.kcal, name: c.name, day })
        : S.makeEntry({ refId: c.refId, grams: c.grams, method: c.method, confidence: c.confidence, day })));
      if (planItem) await S.replaceWithFact(day, planItem.id, entries);
      else await S.addEntries(entries);
      const poolRefs = new Set(S.pool().map((p) => p.refId));
      const outside = cart.filter((c) => c.refId && !poolRefs.has(c.refId));
      cart = [];
      toast(planItem ? 'Записано, остаток дня пересобран' : 'Записано');
      if (outside.length === 1) toast(`«${cat[outside[0].refId]?.name}» нет в пуле — добавить можно в «Ещё → Пул»`, 3500);
      ctx.go('');
    } }, `Сохранить (${cart.length})`)) : null;

  return h('div', {},
    h('div', { class: 'row between' }, h('h1', {}, planItem ? 'Что было вместо' : 'Еда'), h('button', { class: 'btn ghost small', onclick: () => ctx.go('') }, 'Назад')),
    planItem ? h('p', { class: 'muted' }, `Позиция стека: ${planItem.name}, ${planItem.grams} г. После сохранения остаток дня пересоберётся.`) : null,
    tabsEl, body, cartEl);
}
