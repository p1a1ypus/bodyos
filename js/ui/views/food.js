// Ввод еды: голос/текст → разбор → 3 кандидата из базы на каждую позицию → подтверждение; поиск по базе; заготовки;
// «примерно N ккал»; штрих-код. С параметром plan=<id> записанное заменяет позицию стека, и остаток дня пересобирается.
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
let customOpen = false;

const per100 = (x) => (x.kcal == null ? '— ккал' : `${x.kcal} ккал`) + ` / 100 г · Б ${x.p}`;
// Подпись к найденному: состояние и категория (у сырого и готового риса разная граммовка)
export const foodMeta = (x) => [x.state, x.kind === 'dish' ? 'блюдо' : x.kind === 'batch' ? 'заготовка' : x.category, x.source === 'user' ? 'свой' : null]
  .filter(Boolean).join(' · ');

export async function foodView(ctx) {
  const { S, params } = ctx;
  const day = dayKey();
  const planItem = params.plan ? S.dayPlan(day)?.items.find((i) => i.id === params.plan) : null;
  if (cartFor !== (params.plan || '')) {
    cart = [];
    parsed = null;
    cartFor = params.plan || '';
  }
  if (params.mode) mode = params.mode;
  const noNum = S.noNumbers();
  const re = () => ctx.refresh();

  const addToCart = (refId, grams, method, confidence) => {
    cart.push({ key: uid(), refId, grams: Math.round(grams), method, confidence });
    re();
  };

  const tabsEl = h('div', { class: 'seg' }, [['text', 'Текст'], ['search', 'Поиск'], ['batch', 'Заготовка'], ['approx', 'Примерно'], ['barcode', 'Код']]
    .map(([k, l]) => h('button', { class: mode === k ? 'on' : '', onclick: () => {
      mode = k;
      // вкладку из адреса (food?mode=…) применяем один раз, дальше переключает человек
      if (params.mode) ctx.go(params.plan ? `food?plan=${params.plan}` : 'food');
      else re();
    } }, l)));

  let body;
  if (mode === 'text') {
    const ta = h('textarea', { placeholder: 'Например: гречка 200 грамм, две котлеты и салат', value: textDraft, oninput: (e) => { textDraft = e.target.value; } });
    const run = async () => {
      let items;
      let via = 'llm';
      try {
        if (!ctx.llm.available()) throw new Error('off');
        items = await ctx.llm.parseFood(textDraft);
      } catch (e) {
        items = keywordParse(textDraft, (q) => S.search(q, { limit: 3 }));
        via = 'keyword';
        if (e.message !== 'off') toast('LLM недоступен — разобрал по словам, проверь');
      }
      parsed = items.map((x) => {
        const candidates = x.candidates || (S.search(x.query, { limit: 3 }).length ? S.search(x.query, { limit: 3 }) : S.search(x.name, { limit: 3 }));
        const pick = candidates[0];
        return { ...x, key: uid(), via, candidates, matchId: pick?.id || null, grams: Math.round(x.grams || pick?.portion || 100) };
      });
      re();
    };
    body = h('div', {},
      h('div', { class: 'row' }, h('div', { class: 'grow' }, ta), voiceButton((t) => { textDraft = (textDraft + ' ' + t).trim(); re(); })),
      h('button', { class: 'btn', style: { marginTop: '8px' }, onclick: run }, 'Разобрать'),
      parsed ? h('div', { class: 'card' },
        h('h2', {}, 'Проверь'),
        parsed.length ? h('p', { class: 'hint' }, 'Для каждой позиции — три ближайших продукта из базы. Выбери нужный и поправь вес.') : h('p', { class: 'muted' }, 'Ничего не нашлось. Попробуй поиск.'),
        parsed.map((p) => h('div', { class: 'item', style: { display: 'block' } },
          h('div', { class: 'row between' }, h('span', { class: 'muted' }, `«${p.name}»`),
            h('div', { class: 'row' }, num({ value: p.grams, style: { width: '80px' }, oninput: (e) => { p.grams = Number(e.target.value); } }), h('span', { class: 'muted' }, 'г'),
              h('button', { class: 'btn ghost small', onclick: () => { parsed = parsed.filter((x) => x !== p); re(); } }, '×'))),
          p.candidates.length ? h('div', { class: 'chips', style: { marginTop: '6px' } },
            p.candidates.map((o) => h('button', { class: 'chip' + (o.id === p.matchId ? ' on' : ''), onclick: () => { p.matchId = o.id; re(); } },
              o.name, h('span', { class: 'muted' }, foodMeta(o) ? ` · ${foodMeta(o)}` : ''))),
            h('button', { class: 'chip', onclick: () => { searchDraft = p.query || p.name; mode = 'search'; re(); } }, 'Другое…'))
            : h('div', { class: 'row' }, h('span', {}, 'нет в базе'), h('button', { class: 'btn ghost small', onclick: () => { searchDraft = p.query || p.name; mode = 'search'; customOpen = true; re(); } }, 'Добавить свой продукт')))),
        parsed.some((p) => p.matchId) ? h('button', { class: 'btn primary', onclick: () => {
          for (const p of parsed) if (p.matchId && S.ref(p.matchId)) addToCart(p.matchId, p.grams, p.via === 'llm' ? 'llm' : 'search', p.via === 'llm' ? Math.min(CONFIDENCE.llm, p.confidence || 0.7) : 0.6);
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
        const g = num({ value: x.portion, style: { width: '76px' } });
        return h('div', { class: 'item' },
          h('div', { class: 'grow' }, h('div', { class: 'title' }, x.name),
            h('div', { class: 'muted' }, [foodMeta(x), noNum ? '' : per100(x)].filter(Boolean).join(' · '))),
          x.unit ? h('button', { class: 'btn ghost small', onclick: () => { g.value = Number(g.value || 0) + x.unit.g; } }, `+1 ${x.unit.name}`) : null,
          g, h('button', { class: 'btn small', onclick: () => addToCart(x.id, Number(g.value) || x.portion, 'search', CONFIDENCE.search) }, '+'));
      }));
      if (q.value.trim() && !found.length) list.appendChild(h('p', { class: 'muted' }, 'В базе нет. Можно добавить свой продукт с этикетки.'));
    };
    q.oninput = draw;
    draw();
    body = h('div', {}, q, list, customFoodForm(S, searchDraft, async (food) => {
      customOpen = false;
      searchDraft = food.name;
      addToCart(food.id, food.portion, 'search', CONFIDENCE.search);
    }));
  } else if (mode === 'batch') {
    const active = S.batches({ active: true });
    body = h('div', {},
      h('p', { class: 'muted' }, 'Заготовка — блюдо, приготовленное на несколько дней. Порция считается долей от всей кастрюли, поэтому вес готового важнее всего.'),
      active.length ? active.map((b) => {
        const left = S.batchRemaining(b);
        const g = num({ value: Math.min(b.portionG || 250, left), style: { width: '76px' } });
        const eye = h('input', { type: 'checkbox' });
        return h('div', { class: 'item', style: { display: 'block' } },
          h('div', { class: 'row between' },
            h('div', { class: 'grow' }, h('div', { class: 'title' }, b.name),
              h('div', { class: 'muted' }, `осталось ${left} г · до ${b.expiresAt.slice(8, 10)}.${b.expiresAt.slice(5, 7)}${noNum ? '' : ` · ${b.per100.kcal} ккал / 100 г`}${b.weighed || b.weighedG ? '' : ' · не взвешена'}`)),
            g, h('button', { class: 'btn small', onclick: () => {
              const grams = Math.min(Number(g.value) || 0, left);
              if (!(grams > 0)) return toast('Укажи вес порции');
              addToCart('batch:' + b.id, grams, eye.checked ? 'approx' : 'batch', eye.checked ? CONFIDENCE.approx : CONFIDENCE.plan);
            } }, '+')),
          h('label', { class: 'row muted' }, eye, 'на глаз, не взвешивал'));
      }) : h('p', {}, 'Активных заготовок нет.'),
      h('div', { class: 'row', style: { marginTop: '8px' } }, h('button', { class: 'btn', onclick: () => ctx.go('batch') }, '+ Новая заготовка'),
        S.batches().length ? h('button', { class: 'btn ghost small', onclick: () => ctx.go('batch?list=1') }, 'Все заготовки') : null));
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
        if (!food) return (res.textContent = 'Продукт не найден. Можно записать «примерно» или добавить свой продукт в «Поиске».');
        const saved = await ctx.store.put('foods', food);
        const g = num({ value: food.portion, style: { width: '80px' } });
        res.replaceChildren(h('div', { class: 'item' },
          h('div', { class: 'grow' }, h('div', { class: 'title' }, saved.name), noNum ? null : h('div', { class: 'muted' }, `${saved.kcal} ккал / 100 г · Open Food Facts`)),
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
      h('div', { class: 'grow' }, c.approx ? `${c.name}: ~${c.kcal} ккал` : `${S.ref(c.refId)?.name}, ${c.grams} г`),
      h('button', { class: 'btn ghost small', onclick: () => { cart = cart.filter((x) => x !== c); re(); } }, '×'))),
    h('button', { class: 'btn primary block', onclick: async () => {
      const entries = cart.map((c) => (c.approx ? S.makeApprox({ kcal: c.kcal, name: c.name, day })
        : S.makeEntry({ refId: c.refId, grams: c.grams, method: c.method, confidence: c.confidence, day })));
      if (planItem) await S.replaceWithFact(day, planItem.id, entries);
      else await S.addEntries(entries);
      const poolRefs = new Set(S.pool().map((p) => p.refId));
      const outside = cart.filter((c) => c.refId && !c.refId.startsWith('batch:') && !poolRefs.has(S.ref(c.refId)?.id) && S.ref(c.refId)?.ready);
      const firstName = outside.length === 1 ? S.ref(outside[0].refId)?.name : null;
      cart = [];
      toast(planItem ? 'Записано, остаток дня пересобран' : 'Записано');
      if (firstName) toast(`«${firstName}» нет в пуле — добавить можно в «Ещё → Пул»`, 3500);
      ctx.go('');
    } }, `Сохранить (${cart.length})`)) : null;

  return h('div', {},
    h('div', { class: 'row between' }, h('h1', {}, planItem ? 'Что было вместо' : 'Еда'), h('button', { class: 'btn ghost small', onclick: () => ctx.go('') }, 'Назад')),
    planItem ? h('p', { class: 'muted' }, `Позиция стека: ${planItem.name}, ${planItem.grams} г. После сохранения остаток дня пересоберётся.`) : null,
    tabsEl, body, cartEl);
}

// Свой продукт с этикетки: название и КБЖУ на 100 г обязательны; калории сверяются с макросами (допуск 10%)
export function customFoodForm(S, nameDraft, onSaved) {
  const box = h('details', { class: 'card', open: customOpen ? true : null });
  box.addEventListener('toggle', () => { customOpen = box.open; });
  const name = h('input', { value: nameDraft || '', placeholder: 'Например: Творог 5%, «Простоквашино»' });
  const k = num({ placeholder: 'ккал' });
  const p = num({ placeholder: 'белки' });
  const f = num({ placeholder: 'жиры' });
  const c = num({ placeholder: 'углеводы' });
  const portion = num({ value: 100, placeholder: 'порция, г' });
  const warn = h('p', { class: 'hint' });
  let confirmed = false;
  const save = h('button', { class: 'btn', onclick: async () => {
    const food = { name: name.value, kcal: Number(k.value), p: Number(p.value), f: Number(f.value), c: Number(c.value), portion: Number(portion.value) || 100 };
    if (!food.name.trim() || [k, p, f, c].some((x) => x.value === '')) return toast('Нужны название, ккал, белки, жиры и углеводы на 100 г');
    const mis = S.checkCustomFood(food);
    if (mis != null && mis > 0.1 && !confirmed) {
      confirmed = true;
      warn.textContent = `Калории расходятся с белками, жирами и углеводами на ${Math.round(mis * 100)}%. Проверь этикетку — или нажми ещё раз, чтобы сохранить как есть.`;
      save.textContent = 'Сохранить как есть';
      return;
    }
    try {
      const saved = await S.addCustomFood(food);
      toast('Продукт добавлен');
      onSaved(saved);
    } catch (e) {
      toast(e.message);
    }
  } }, 'Сохранить продукт');
  box.append(h('summary', {}, 'Добавить свой продукт'),
    h('p', { class: 'muted' }, 'Значения на 100 г — с упаковки. Продукт попадёт в поиск и в пул.'),
    name, h('div', { class: 'row', style: { marginTop: '6px' } }, h('div', { class: 'grow' }, k), h('div', { class: 'grow' }, p), h('div', { class: 'grow' }, f), h('div', { class: 'grow' }, c)),
    h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Обычная порция, г'), portion), warn, save);
  return box;
}
