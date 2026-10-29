// Экран дня: чекин, стек дня с закрытием в один тап, замены, остаток, вопрос дня, завтра.
import { h, toast } from '../dom.js';
import { SLOT_LABELS } from '../../core/stack.js';
import { PHASES } from '../../core/goals.js';
import { addDays, dayKey } from '../../core/util.js';

let openSwap = null;
let showWhy = false;

const fmtDay = (d) => d.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });

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

  const act = (fn) => async () => {
    try {
      await fn();
    } catch (e) {
      toast(e.message);
    }
    ctx.refresh();
  };

  const out = h('div', {});
  out.appendChild(h('div', { class: 'row between' },
    h('h1', {}, fmtDay(new Date())),
    h('span', { class: 'muted' }, PHASES[phase?.type] || '')));

  if (S.restr().consultDoctor) out.appendChild(h('p', { class: 'hint' }, 'План согласуй с врачом.'));

  if (!S.checkin(day)) {
    out.appendChild(h('div', { class: 'card accent' },
      h('div', { class: 'row between' }, h('div', {}, h('h2', {}, 'Утренний чекин'), h('span', { class: 'muted' }, 'вес, сон, готовность — 15 секунд')),
        h('button', { class: 'btn primary', onclick: () => ctx.go('checkin') }, 'Начать'))));
  }

  if (fresh) {
    out.appendChild(h('div', { class: 'card' }, h('div', { class: 'row between' },
      h('span', {}, 'Готова сводка недели'), h('button', { class: 'btn small', onclick: () => ctx.go('week') }, 'Открыть'))));
  }

  // Стек дня
  const stack = h('div', { class: 'card' });
  stack.appendChild(h('div', { class: 'row between' }, h('h2', {}, 'Стек дня'),
    plan?.status === 'closed' ? h('span', { class: 'muted' }, 'закрыт') : null));
  if (!plan) {
    stack.appendChild(h('p', { class: 'muted' }, 'Пул пуст — добавь позиции в разделе «Ещё».'));
  } else {
    const rank = { breakfast: 0, lunch: 1, snack: 2, dinner: 3 };
    const visible = plan.items.filter((i) => ['plan', 'eaten', 'replaced'].includes(i.status)).sort((a, b) => rank[a.slot] - rank[b.slot]);
    if (!visible.length) stack.appendChild(h('p', { class: 'muted' }, 'На сегодня позиций нет — остаток закрыт.'));
    for (const it of visible) {
      const done = it.status !== 'plan';
      const row = h('div', { class: 'item' + (done ? ' done' : '') },
        h('div', { class: 'grow' },
          h('div', { class: 'tag' }, SLOT_LABELS[it.slot]),
          h('div', { class: 'title' }, it.status === 'replaced' ? h('s', {}, it.name) : it.name),
          h('div', { class: 'muted' }, `${it.grams} г` + (noNum ? '' : ` · ${it.kcal} ккал · Б ${Math.round(it.p)} г`),
            it.status === 'replaced' ? ' · заменено фактом' : '')),
        it.status === 'plan'
          ? h('button', { class: 'btn primary small', onclick: act(() => S.closeItem(day, it.id)) }, '✓ По плану')
          : it.status === 'eaten' ? h('button', { class: 'btn ghost small', onclick: act(() => S.undoItem(day, it.id)) }, 'Отменить') : null);
      stack.appendChild(row);
      if (it.status === 'plan') {
        stack.appendChild(h('div', { class: 'row', style: { marginBottom: '6px' } },
          h('button', { class: 'btn ghost small', onclick: () => ctx.go(`food?plan=${it.id}`) }, 'Было другое'),
          h('button', { class: 'btn ghost small', onclick: () => { openSwap = openSwap === it.id ? null : it.id; ctx.refresh(); } }, 'Не хочу это'),
          h('button', { class: 'btn ghost small', onclick: act(() => S.skipItem(day, it.id)) }, 'Пропущу')));
        if (openSwap === it.id) {
          const opts = S.swapOptions(day, it.id);
          stack.appendChild(h('div', { class: 'chips', style: { marginBottom: '8px' } },
            opts.length ? opts.map((o) => h('button', { class: 'chip', onclick: act(async () => { openSwap = null; await S.swapItem(day, it.id, o.poolItemId); }) }, o.name))
              : h('span', { class: 'muted' }, 'В пуле нет подходящих замен.')));
        }
      }
    }
  }

  // Остаток — без оценочных слов и без красного
  if (plan) {
    const left = plan.budget - totals.kcal;
    const pLeft = plan.macros.p - totals.p;
    let line;
    if (noNum) {
      line = `Белок — ${S.closeness(totals.p, plan.macros.p)}, бюджет — ${S.closeness(totals.kcal, plan.budget)}.`;
    } else if (left >= 0) {
      line = `Осталось ${left} ккал, белок ${Math.max(0, Math.round(pLeft))} г (цель ${plan.macros.pMin}–${plan.macros.pMax} г).`;
    } else {
      line = `Сверх плана ${-left} ккал. Недельный бюджет это учтёт.`;
    }
    stack.appendChild(h('p', { class: 'muted', style: { marginTop: '8px' } }, line));
    stack.appendChild(h('div', { class: 'row' },
      h('button', { class: 'btn', onclick: () => ctx.go('food') }, '+ Добавить еду'),
      h('button', { class: 'btn ghost small', onclick: () => { showWhy = !showWhy; ctx.refresh(); } }, 'Почему так?')));
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
      stack.appendChild(box);
    }
  }
  out.appendChild(stack);

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
