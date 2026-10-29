// Неделя: сводка коуч-цикла с причинами, предложения, еженедельный чек, недельный бюджет, набросок недели, покупки.
import { h, num, toast, fmtDate } from '../dom.js';
import { SLOT_LABELS } from '../../core/stack.js';
import { addDays, dayKey, parseDay, weekStart, weekDays, weekdayIndex } from '../../core/util.js';
import { ultraProcessedShare } from '../../core/nutrition.js';

const RULE_NAMES = { 1: 'Безопасность', 2: 'Сон', 3: 'Калибровка', 4: 'Бюджет', 5: 'Прогресс', 6: 'Тренировки', 7: 'Разгрузка', 8: 'Плато', 9: 'Фаза', 10: 'Пул' };
let sketch = null;

function sparkline(points) {
  if (points.length < 2) return null;
  const W = 300;
  const H = 60;
  const ys = points.map((p) => p.trend);
  const min = Math.min(...ys);
  const max = Math.max(...ys);
  const sx = (i) => (i / (points.length - 1)) * (W - 8) + 4;
  const sy = (v) => H - 6 - ((v - min) / (max - min || 1)) * (H - 12);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${sx(i).toFixed(1)},${sy(p.trend).toFixed(1)}`).join(' ');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('class', 'spark');
  svg.innerHTML = `<path d="${d}"/>` + points.map((p, i) => `<circle cx="${sx(i).toFixed(1)}" cy="${sy(p.kg).toFixed(1)}" r="1.5"/>`).join('');
  return svg;
}

export async function weekView(ctx) {
  const { S, store } = ctx;
  const re = () => ctx.refresh();
  const noNum = S.noNumbers();
  const today = dayKey();
  const ws = weekStart(today);
  const out = h('div', {}, h('h1', {}, 'Неделя'));
  const [msg, ...older] = S.messages();

  if (msg) {
    if (!msg.seen) store.put('coachMessages', { ...msg, seen: true });
    const card = h('div', { class: 'card' },
      h('div', { class: 'tag' }, `Сводка ${fmtDate(msg.week)}–${fmtDate(addDays(msg.week, 6))}${msg.llm ? '' : ' · шаблон'}`),
      msg.text.split('\n').map((l) => h('p', {}, l)));
    const props = msg.proposals.filter((p) => p.status === 'new');
    for (const p of props) {
      card.appendChild(h('div', { class: 'card accent' },
        h('p', {}, h('b', {}, p.text)), h('p', { class: 'muted' }, p.reason),
        h('div', { class: 'row' },
          h('button', { class: 'btn primary small', onclick: async () => {
            try {
              await S.decideProposal(msg.id, p.id, true);
              toast('Принято');
            } catch (e) {
              toast(e.message);
            }
            re();
          } }, 'Принять'),
          h('button', { class: 'btn ghost small', onclick: async () => { await S.decideProposal(msg.id, p.id, false); re(); } }, 'Не сейчас'))));
    }
    card.appendChild(h('details', {}, h('summary', { class: 'muted' }, 'Что изменилось и почему'),
      msg.reasons.map((r) => h('div', { class: 'item' }, h('div', { class: 'grow' },
        h('div', { class: 'tag' }, RULE_NAMES[r.rule]), h('div', { class: 'title' }, r.what), h('div', { class: 'muted' }, r.reason))))));
    out.appendChild(card);
  } else {
    out.appendChild(h('div', { class: 'card' }, h('p', {}, 'Первая сводка появится после первой полной недели.'),
      h('p', { class: 'muted' }, 'Первые две недели — наблюдение: модель смотрит на вес и еду и уточняет расход.')));
  }

  // Недельный бюджет поверх дневного
  const st = S.modelState();
  const days = weekDays(ws);
  const weekEntries = days.flatMap((d) => S.entries(d));
  const eaten = weekEntries.reduce((s, e) => s + (e.kcal || 0), 0);
  const passed = days.filter((d) => d <= today).length;
  if (!st.noBudget) {
    const weekBudget = st.budget * 7;
    out.appendChild(h('div', { class: 'card' }, h('h2', {}, 'Неделя по еде'),
      noNum
        ? h('p', {}, `Бюджет недели — ${S.closeness(eaten, st.budget * passed)}.`)
        : h('div', {},
          h('div', { class: 'bar' }, h('i', { style: { width: `${Math.min(100, (eaten / weekBudget) * 100)}%` } })),
          h('p', { class: 'muted' }, `${Math.round(eaten)} из ${weekBudget} ккал за ${passed} дн. из 7. План на прошедшие дни — ${st.budget * passed}.`)),
      (() => {
        const upf = ultraProcessedShare(weekEntries);
        return upf != null ? h('p', { class: 'muted' }, `Ультрапереработанные продукты (NOVA 4): ${Math.round(upf * 100)}% калорий недели.`) : null;
      })()));
  }

  // Тренд веса
  const trend = S.trend().slice(-56);
  if (trend.length >= 2 && !noNum) {
    const last = trend.at(-1);
    out.appendChild(h('div', { class: 'card' }, h('h2', {}, 'Тренд веса'), sparkline(trend),
      h('p', { class: 'muted' }, `Сейчас по тренду ${last.trend.toFixed(1)} кг. Линия — сглаженный тренд, точки — взвешивания.`)));
  }

  // Еженедельный чек
  const m = store.byDay('measurements', today)[0] || {};
  const fields = { waist: 'Талия, см', hips: 'Бёдра, см', chest: 'Грудь, см', bpSys: 'Давление верхнее', bpDia: 'Давление нижнее', restingHr: 'Пульс покоя' };
  const inputs = {};
  out.appendChild(h('details', { class: 'card', open: weekdayIndex(today) === 6 ? true : null }, h('summary', {}, 'Еженедельный чек: обхваты, давление'),
    h('div', { class: 'kv', style: { marginTop: '8px' } }, Object.entries(fields).flatMap(([k, label]) => {
      inputs[k] = num({ value: m[k] ?? '', style: { width: '110px' } });
      return [h('span', {}, label), inputs[k]];
    })),
    h('button', { class: 'btn', style: { marginTop: '8px' }, onclick: async () => {
      const data = Object.fromEntries(Object.entries(inputs).map(([k, el]) => [k, el.value === '' ? null : Number(el.value)]));
      await S.saveMeasurements(today, data);
      if (data.restingHr) await S.addHealth({ type: 'restingHr', value: data.restingHr });
      toast('Сохранено');
      re();
    } }, 'Сохранить')));

  // Набросок недели и покупки
  const from = addDays(today, 1);
  out.appendChild(h('div', { class: 'card' }, h('h2', {}, 'Набросок недели'),
    h('p', { class: 'muted' }, 'Стеки на 7 дней вперёд — по ним список покупок. Каждый день стек уточняется по факту.'),
    h('div', { class: 'row' },
      h('button', { class: 'btn', onclick: async () => { sketch = await S.planAhead(from, 7); re(); } }, 'Собрать набросок'),
      h('button', { class: 'btn', onclick: async () => { await S.makeShopping(from); sketch = await S.planAhead(from, 7); re(); } }, 'Список покупок')),
    sketch ? sketch.map((p) => h('div', { class: 'item' }, h('div', { class: 'grow' },
      h('div', { class: 'tag' }, parseDay(p.day).toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'numeric' })),
      h('div', { class: 'muted' }, p.items.filter((i) => i.status === 'plan').map((i) => `${i.name} ${i.grams} г`).join(' · '))))) : null));

  const shop = S.shopping(from);
  if (shop) {
    const checked = new Set(shop.checked || []);
    out.appendChild(h('div', { class: 'card' }, h('h2', {}, 'Покупки'),
      shop.items.map((it) => h('label', { class: 'item' },
        h('input', { type: 'checkbox', checked: checked.has(it.refId), onchange: async (e) => {
          e.target.checked ? checked.add(it.refId) : checked.delete(it.refId);
          await store.put('shopping', { ...shop, checked: [...checked] });
        } }),
        h('span', { class: 'grow' }, it.name), h('span', { class: 'muted' }, `${it.grams} г${it.note ? ' · ' + it.note : ''}`)))));
  }

  if (older.length) {
    out.appendChild(h('details', { class: 'card' }, h('summary', {}, 'Прошлые недели'),
      older.map((o) => h('div', { class: 'item' }, h('div', {}, h('div', { class: 'tag' }, fmtDate(o.week)), o.text.split('\n').map((l) => h('div', { class: 'muted' }, l)))))));
  }
  return out;
}
