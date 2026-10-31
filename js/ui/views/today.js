// Экран дня: чекин, стек дня с закрытием в один тап, замены, остаток, вопрос дня, завтра.
import { h, toast, icon, ring } from '../dom.js';
import { SLOT_LABELS } from '../../core/stack.js';
import { PHASES } from '../../core/goals.js';
import { addDays, dayKey } from '../../core/util.js';

let openMenu = null;
let openSwap = null;
let showWhy = false;

const RANK = { breakfast: 0, lunch: 1, snack: 2, dinner: 3 };
const fmtTop = (d) => `${d.toLocaleDateString('ru-RU', { weekday: 'short' }).replace('.', '')} ${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
const fmtNum = (n) => Math.round(n).toLocaleString('ru-RU');

export async function todayView(ctx) {
  const { S } = ctx;
  const day = dayKey();
  const plan = await S.ensureDayPlan(day);
  const st = S.modelState();
  const noNum = S.noNumbers() || st.noBudget;
  const totals = S.totals(day);
  const phase = S.phase();
  const msgs = S.messages();
  const fresh = msgs[0] && !msgs[0].seen ? msgs[0] : null;
  const visible = plan ? plan.items.filter((i) => ['plan', 'eaten', 'replaced'].includes(i.status)).sort((a, b) => RANK[a.slot] - RANK[b.slot]) : [];

  const act = (fn) => async () => {
    try {
      await fn();
    } catch (e) {
      toast(e.message);
    }
    ctx.refresh();
  };

  const out = h('div', {});
  out.appendChild(h('div', { class: 'topline' }, h('span', {}, fmtTop(new Date())), h('span', {}, PHASES[phase?.type] || '')));
  if (S.restr().consultDoctor) out.appendChild(h('p', { class: 'hint' }, 'План согласуй с врачом.'));

  // Главное число дня: кольцо съеденного и остаток — без оценочных слов и без красного
  if (plan) {
    if (noNum) {
      const done = visible.filter((i) => i.status !== 'plan').length;
      out.appendChild(h('div', { class: 'hero' }, ring(visible.length ? done / visible.length : 0, `${done}/${visible.length}`),
        h('div', { class: 'grow' }, h('div', { class: 'big' }, `${done} из ${visible.length}`),
          h('div', { class: 'muted' }, `позиций стека · белок — ${S.closeness(totals.p, plan.macros.p)}, бюджет — ${S.closeness(totals.kcal, plan.budget)}`))));
    } else {
      const left = plan.budget - totals.kcal;
      const share = totals.kcal / plan.budget;
      const pLeft = Math.max(0, Math.round(plan.macros.p - totals.p));
      out.appendChild(h('div', { class: 'hero' }, ring(share, `${Math.round(share * 100)}%`),
        h('div', { class: 'grow' },
          h('div', { class: 'big' }, fmtNum(Math.abs(left))),
          h('div', { class: 'muted' }, left >= 0 ? `ккал осталось · белок ${pLeft} г` : 'ккал сверх плана — недельный бюджет это учтёт'),
          h('div', { class: 'hint' }, `цель по белку ${plan.macros.pMin}–${plan.macros.pMax} г`))));
    }
  }

  if (!S.checkin(day)) {
    out.appendChild(h('div', { class: 'card accent' },
      h('div', { class: 'row between' }, h('div', {}, h('h2', {}, 'Утренний чекин'), h('span', { class: 'muted' }, 'вес, сон, готовность — 15 секунд')),
        h('button', { class: 'btn primary', onclick: () => ctx.go('checkin') }, 'Начать'))));
  }

  if (fresh) {
    out.appendChild(h('div', { class: 'card' }, h('div', { class: 'row between' },
      h('span', {}, 'Готова сводка недели'), h('button', { class: 'btn small', onclick: () => ctx.go('week') }, 'Открыть'))));
  }

  // Стек дня: позиция закрывается одним тапом по галочке, остальное — под «⋯»
  out.appendChild(h('div', { class: 'section' }, h('span', { class: 'tag' }, 'Стек дня'),
    plan?.status === 'closed' ? h('span', { class: 'muted' }, 'закрыт') : null));
  if (!plan) out.appendChild(h('p', { class: 'muted' }, 'Пул пуст — добавь позиции в разделе «Ещё».'));
  else if (!visible.length) out.appendChild(h('p', { class: 'muted' }, 'На сегодня позиций нет — остаток закрыт.'));
  for (const it of visible) {
    const done = it.status !== 'plan';
    const menu = openMenu === it.id;
    const meta = `${it.grams} г` + (noNum ? '' : ` · ${it.kcal} ккал · Б ${Math.round(it.p)} г`) + (it.status === 'replaced' ? ' · заменено фактом' : '');
    out.appendChild(h('div', { class: 'slot' + (done ? ' done' : '') },
      h('div', { class: 'grow' },
        h('div', { class: 'tag' }, SLOT_LABELS[it.slot]),
        h('div', { class: 'name' }, it.status === 'replaced' ? h('s', {}, it.name) : it.name),
        h('div', { class: 'meta' }, meta)),
      it.status === 'plan' ? h('button', { class: 'more-btn' + (menu ? ' on' : ''), 'aria-label': 'Было другое, замена, пропуск', 'aria-expanded': String(menu), onclick: () => {
        openMenu = menu ? null : it.id;
        openSwap = null;
        ctx.refresh();
      } }, icon('dots')) : null,
      it.status === 'plan'
        ? h('button', { class: 'check', 'aria-label': `Съел по плану: ${it.name}`, onclick: act(() => S.closeItem(day, it.id)) }, icon('check'))
        : it.status === 'eaten' ? h('button', { class: 'check done', 'aria-label': `Отменить: ${it.name}`, onclick: act(() => S.undoItem(day, it.id)) }, icon('check')) : null));
    if (menu) {
      out.appendChild(h('div', { class: 'slot-actions' },
        h('button', { class: 'chip', onclick: () => ctx.go(`food?plan=${it.id}`) }, 'Было другое'),
        h('button', { class: 'chip' + (openSwap === it.id ? ' on' : ''), onclick: () => { openSwap = openSwap === it.id ? null : it.id; ctx.refresh(); } }, 'Не хочу это'),
        h('button', { class: 'chip', onclick: act(() => { openMenu = null; return S.skipItem(day, it.id); }) }, 'Пропущу')));
      if (openSwap === it.id) {
        const opts = S.swapOptions(day, it.id);
        out.appendChild(h('div', { class: 'slot-actions' },
          opts.length ? opts.map((o) => h('button', { class: 'chip', onclick: act(async () => { openMenu = null; openSwap = null; await S.swapItem(day, it.id, o.poolItemId); }) }, `→ ${o.name}`))
            : h('span', { class: 'muted' }, 'В пуле нет подходящих замен.')));
      }
    }
  }

  if (plan) {
    out.appendChild(h('div', { class: 'row', style: { marginTop: '10px' } },
      h('button', { class: 'btn grow', onclick: () => ctx.go('food') }, icon('plus'), 'Добавить еду'),
      h('button', { class: 'btn ghost', onclick: () => { showWhy = !showWhy; ctx.refresh(); } }, 'Почему так?')));
    if (showWhy) {
      const box = h('div', { class: 'card' }, S.explainBudget().map((l) => h('p', {}, l)));
      if (ctx.llm.available()) {
        const q = h('input', { placeholder: 'Спросить: почему…, а можно вместо…' });
        const ans = h('p', { class: 'muted' });
        box.appendChild(h('div', { class: 'row' }, h('div', { class: 'grow' }, q), h('button', { class: 'btn small', onclick: async () => {
          ans.textContent = '…';
          try {
            const r = await S.askCoach(q.value);
            ans.textContent = r.answer;
          } catch (e) {
            ans.textContent = 'Не получилось спросить: ' + e.message;
          }
        } }, 'Спросить')));
        box.appendChild(ans);
      }
      out.appendChild(box);
    }
  }

  // Записи вне стека
  // позиции «по плану» уже видны в стеке; здесь — всё остальное, включая факты-замены
  const loose = S.entries(day).filter((e) => !e.planItemId || plan?.items.find((i) => i.id === e.planItemId)?.status !== 'eaten');
  if (loose.length) {
    out.appendChild(h('div', { class: 'card' }, h('h2', {}, 'Ещё записано сегодня'),
      loose.map((e) => h('div', { class: 'item' },
        h('div', { class: 'grow' }, h('div', { class: 'title' }, e.name), h('div', { class: 'muted' }, [e.grams ? `${e.grams} г` : '', noNum ? '' : `${e.kcal} ккал`].filter(Boolean).join(' · '))),
        h('button', { class: 'btn ghost small', onclick: act(() => S.removeEntry(e.id)) }, 'Удалить')))));
  }

  // Повтор еды одним тапом
  const recent = S.recentFoods(6);
  if (recent.length) {
    out.appendChild(h('div', { class: 'card' }, h('h2', {}, 'Повторить'),
      h('div', { class: 'chips' }, recent.map((r) => h('button', { class: 'chip', onclick: act(async () => {
        await S.addEntries([S.makeEntry({ refId: r.refId, grams: r.grams, method: 'repeat', confidence: 0.85, day })]);
        toast(`${r.name}, ${r.grams} г — записано`);
      }) }, `${r.name} ${r.grams} г`)))));
  }

  // Тренировка
  const prog = S.program();
  if (prog) {
    const active = S.activeSession();
    const next = S.nextSessionPlan();
    const doneToday = S.sessionsDone().some((s) => s.day === day);
    out.appendChild(h('div', { class: 'card' }, h('div', { class: 'row between' },
      h('div', {}, h('h2', {}, 'Тренировка'), h('span', { class: 'muted' }, doneToday ? 'сегодня уже была' : active ? 'идёт' : `следующая: ${next.name}${next.deload ? ' (разгрузка)' : ''}`)),
      h('button', { class: 'btn small', onclick: () => ctx.go('train') }, active ? 'Продолжить' : 'Открыть'))));
  }

  // Вопрос дня
  const q = S.todayQuestion();
  if (q) {
    out.appendChild(h('div', { class: 'card' }, h('div', { class: 'tag' }, 'Вопрос дня'), h('p', {}, q.text),
      h('div', { class: 'chips' }, q.options.map((o) => h('button', { class: 'chip', onclick: act(() => S.answerQuestion(q.id, o)) }, o)))));
  }

  // Вечером — стек на завтра
  if (new Date().getHours() >= 18) {
    const tomorrow = addDays(day, 1);
    const tp = await S.ensureDayPlan(tomorrow);
    if (tp?.items.length) {
      out.appendChild(h('div', { class: 'card' }, h('h2', {}, 'Завтра'),
        tp.items.filter((i) => i.status === 'plan').map((i) => h('div', { class: 'muted' }, `${SLOT_LABELS[i.slot]}: ${i.name}, ${i.grams} г`))));
    }
  }
  return out;
}
