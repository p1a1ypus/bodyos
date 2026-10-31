// Онбординг (раздел 4): цель своими словами → данные → ограничения → еда и пул → готовка → тренировки.
import { h, field, num, chips, select, toast, voiceButton, fmtDateFull } from '../dom.js';
import { GOAL_TYPES, PHASES, DEFAULT_RATE } from '../../core/goals.js';
import { STOP_FLAG_LABELS } from '../../core/safety.js';
import { EQUIPMENT_PROFILES, INJURIES, EXERCISES_BY_ID } from '../../core/exercises.js';
import { ALLERGENS, DIET_EXCLUSIONS, CATALOG, CATALOG_ALL, CATALOG_BY_ID, searchCatalog, excludedTags, allowedByRestrictions, keywordParse as kwParse } from '../../core/foods.js';
import { poolCandidates, poolWarnings } from '../../core/pool.js';
import { resolveProgram } from '../../core/training.js';
import { initialModelState } from '../../core/coach.js';
import { CONFIDENCE } from '../../core/constants.js';
import { dayKey } from '../../core/util.js';

const KEY = 'bodyos-onboarding';
const STEPS = ['goalText', 'body', 'equipment', 'health', 'goal', 'foodLimits', 'foodText', 'pool', 'cooking', 'training', 'finish'];

let D = null;
let step = 0;

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s) return s;
  } catch {}
  return {
    step: 0, goalText: '', sex: 'm', birthDate: '', heightCm: null, weightKg: null,
    equipment: 'gym', daysPerWeek: 3, sessionMin: 60,
    injuries: [], stopFlags: [], meds: '', healthNotes: '',
    goal: { type: 'lose', targetKg: null, deadline: '', ratePct: 0.5 },
    allergies: [], dietExclusions: [], foodNotes: '',
    foodYesterday: '', foodUsual: '', mentioned: [], yesterday: [], keepYesterday: true,
    candidates: [], struck: [], extraPool: [],
    cookWeekdayMin: 30, cookWeekendMin: 60, foodBudget: 'medium',
    trainingNow: '', startWeights: {},
  };
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...D, step }));
  } catch {}
}

const restrFor = (S) => S.restrictionsFor({ sex: D.sex, birthDate: D.birthDate, heightCm: D.heightCm, stopFlags: D.stopFlags }, D.weightKg);
const profileLike = () => ({ allergies: D.allergies, dietExclusions: D.dietExclusions });

export async function onboardingView(ctx) {
  const { S } = ctx;
  if (!D) {
    D = load();
    step = D.step || 0;
  }
  const rerender = () => {
    save();
    ctx.refresh();
  };
  const next = () => {
    step = Math.min(step + 1, STEPS.length - 1);
    rerender();
    window.scrollTo(0, 0);
  };
  const back = () => {
    step = Math.max(0, step - 1);
    rerender();
  };
  const nav = (canNext = true, label = 'Дальше', onNext = next) =>
    h('div', { class: 'row between', style: { marginTop: '16px' } },
      step > 0 ? h('button', { class: 'btn ghost', onclick: back }, 'Назад') : h('span'),
      h('button', { class: 'btn primary', disabled: !canNext, onclick: onNext }, label));
  const bind = (key, conv = (v) => v) => (e) => {
    D[key] = conv(e.target.value);
    save();
  };

  const wrap = (title, ...body) => h('div', {},
    h('div', { class: 'topline' }, h('span', {}, `Шаг ${step + 1} из ${STEPS.length}`)),
    h('div', { class: 'bar', style: { margin: '8px 0 4px' } }, h('i', { style: { width: `${((step + 1) / STEPS.length) * 100}%` } })),
    h('h1', {}, title), ...body);
  const name = STEPS[step];

  if (name === 'goalText') {
    const ta = h('textarea', { placeholder: 'Например: хочу сбросить 8 кг к лету и не потерять силу', value: D.goalText, oninput: bind('goalText') });
    const mic = voiceButton((t) => {
      D.goalText = (D.goalText + ' ' + t).trim();
      rerender();
    });
    return wrap('Чего ты хочешь добиться?',
      h('p', {}, 'Расскажи своими словами. Дальше я переведу это в цель со сроком и проверю, реалистична ли она.'),
      ta, mic ? h('div', { class: 'row' }, mic, h('span', { class: 'muted' }, 'или диктовка с клавиатуры')) : h('p', { class: 'hint' }, 'Можно надиктовать с клавиатуры телефона.'),
      nav(true, 'Дальше', async () => {
        if (D.goalText.trim() && S.settings().llm.enabled) {
          try {
            const g = await ctx.llm.parseGoal(D.goalText, dayKey());
            D.goal = { ...D.goal, type: g.type, targetKg: g.targetKg || null, deadline: g.deadline || '', summary: g.summary };
            toast('Цель разобрана — проверишь на шаге «Цель»');
          } catch (e) {
            toast('Разбор не удался — заполнишь цель вручную');
          }
        }
        next();
      }));
  }

  if (name === 'body') {
    const ok = D.birthDate && D.heightCm > 100 && D.weightKg > 30;
    return wrap('О тебе',
      field('Пол', select({ m: 'Мужской', f: 'Женский' }, D.sex, (v) => { D.sex = v; rerender(); })),
      field('Дата рождения', h('input', { type: 'date', value: D.birthDate, onchange: (e) => { D.birthDate = e.target.value; rerender(); } })),
      field('Рост, см', num({ value: D.heightCm ?? '', onchange: (e) => { D.heightCm = Number(e.target.value); rerender(); } })),
      field('Текущий вес, кг', num({ value: D.weightKg ?? '', onchange: (e) => { D.weightKg = Number(e.target.value); rerender(); } })),
      nav(ok));
  }

  if (name === 'equipment') {
    return wrap('Тренировки',
      field('Где тренируешься', select(Object.fromEntries(Object.entries(EQUIPMENT_PROFILES).map(([k, v]) => [k, v.label])), D.equipment, (v) => { D.equipment = v; rerender(); })),
      field('Дней в неделю', select({ 2: '2', 3: '3', 4: '4' }, D.daysPerWeek, (v) => { D.daysPerWeek = Number(v); rerender(); })),
      field('Длительность тренировки', select({ 40: 'до 45 минут', 60: '45–60 минут', 75: 'больше часа' }, D.sessionMin, (v) => { D.sessionMin = Number(v); rerender(); })),
      nav(true));
  }

  if (name === 'health') {
    const toggle = (arr) => (k) => {
      const s = new Set(D[arr]);
      s.has(k) ? s.delete(k) : s.add(k);
      D[arr] = [...s];
      rerender();
    };
    const restr = restrFor(S);
    const notes = [];
    if (restr.blocked) notes.push('Приложение доступно с 18 лет.');
    if (restr.pregnancy) notes.push('Беременность или кормление: только поддержание, без дефицита и без бюджета калорий.');
    if (restr.edHistory) notes.push('РПП в анамнезе: включится режим «без цифр», дефицит недоступен.');
    if (restr.medical) notes.push('Согласуй план с врачом. Скорость изменения веса будет ограничена 0.5% в неделю, флаги по анализам — строже.');
    if (restr.lowBmi) notes.push('ИМТ ниже 18.5: дефицит недоступен.');
    return wrap('Здоровье',
      h('p', { class: 'muted' }, 'Эти ответы ограничивают функции — так безопаснее. Их видишь только ты.'),
      h('h3', {}, 'Травмы и боли'), chips(INJURIES, D.injuries, toggle('injuries')),
      h('h3', {}, 'Диагнозы и состояния'), chips(STOP_FLAG_LABELS, D.stopFlags, toggle('stopFlags')),
      field('Лекарства (если есть)', h('input', { value: D.meds, oninput: bind('meds') })),
      field('Что ещё важно знать', h('input', { value: D.healthNotes, oninput: bind('healthNotes') })),
      notes.length ? h('div', { class: 'card warn' }, notes.map((n) => h('p', {}, n))) : null,
      nav(!restr.blocked));
  }

  if (name === 'goal') {
    const restr = restrFor(S);
    const g = D.goal;
    const types = Object.fromEntries(Object.entries(GOAL_TYPES).filter(([k]) => (k === 'lose' ? restr.deficitAllowed : k === 'gain' ? restr.surplusAllowed : true)));
    if (!types[g.type]) g.type = 'maintain';
    const needsTarget = g.type === 'lose' || g.type === 'gain';
    const profile = { sex: D.sex, birthDate: D.birthDate, heightCm: D.heightCm, stopFlags: D.stopFlags };
    const chk = S.checkGoal({ ...g, deadline: g.deadline || null, ratePct: g.deadline ? null : g.ratePct }, profile, D.weightKg);
    const maxRate = needsTarget ? (g.type === 'lose' ? restr.maxDeficitRate : restr.maxSurplusRate) : 0;
    const rates = [0.25, 0.5, 0.75, 1].filter((r) => r <= maxRate);
    return wrap('Цель',
      g.summary ? h('p', { class: 'muted' }, `Как я понял: ${g.summary}`) : null,
      field('Тип цели', select(types, g.type, (v) => { g.type = v; g.ratePct = DEFAULT_RATE[v] || 0; rerender(); })),
      needsTarget ? field('Целевой вес, кг', num({ value: g.targetKg ?? '', onchange: (e) => { g.targetKg = Number(e.target.value); rerender(); } })) : null,
      needsTarget ? field('Срок (необязательно)', h('input', { type: 'date', value: g.deadline || '', onchange: (e) => { g.deadline = e.target.value; rerender(); } }), 'Без срока — выбери скорость ниже.') : null,
      needsTarget && !g.deadline ? field('Скорость, % веса в неделю', select(Object.fromEntries(rates.map((r) => [r, `${r}%`])), g.ratePct, (v) => { g.ratePct = Number(v); rerender(); })) : null,
      chk.ok
        ? h('div', { class: 'card accent' },
          h('p', {}, `Фаза: ${PHASES[chk.phase]}.`),
          needsTarget ? h('p', {}, `Скорость ${chk.goal.ratePct}% в неделю, срок — ${fmtDateFull(chk.goal.deadline)}.`) : null)
        : h('div', { class: 'card warn' }, h('p', {}, chk.reason),
          chk.suggestedDeadline ? h('button', { class: 'btn small', onclick: () => { g.deadline = chk.suggestedDeadline; rerender(); } }, `Взять срок ${fmtDateFull(chk.suggestedDeadline)}`) : null),
      nav(chk.ok, 'Дальше', () => {
        D.checkedGoal = chk.goal;
        D.phase = chk.phase;
        next();
      }));
  }

  if (name === 'foodLimits') {
    const toggle = (arr) => (k) => {
      const s = new Set(D[arr]);
      s.has(k) ? s.delete(k) : s.add(k);
      D[arr] = [...s];
      rerender();
    };
    return wrap('Ограничения в еде',
      h('h3', {}, 'Аллергии и непереносимости'), chips(ALLERGENS, D.allergies, toggle('allergies')),
      h('h3', {}, 'Исключения'), chips(Object.fromEntries(Object.entries(DIET_EXCLUSIONS).map(([k, v]) => [k, v.label])), D.dietExclusions, toggle('dietExclusions')),
      field('Что ещё не ешь', h('input', { value: D.foodNotes, placeholder: 'например: не люблю печень', oninput: bind('foodNotes') })),
      nav(true));
  }

  if (name === 'foodText') {
    const ex = excludedTags(profileLike());
    const allowed = (x) => allowedByRestrictions(x, ex);
    // вчерашняя еда — уже готовая, поэтому готовое выше сырого; в пул — только то, что едят как есть
    const findAll = (q) => {
      const r = searchCatalog(q, CATALOG_ALL, 6, { filter: allowed });
      return [...r.filter((x) => x.ready), ...r.filter((x) => !x.ready)].slice(0, 3);
    };
    const findPool = (q) => searchCatalog(q, CATALOG, 1, { filter: allowed })[0] || null;
    const parse = async () => {
      let y = [];
      let u = [];
      try {
        if (!S.settings().llm.enabled) throw new Error('off');
        const found = (list) => list.map((x) => ({ ...x, candidates: findAll(x.query) })).filter((x) => x.candidates.length);
        if (D.foodYesterday.trim()) y = found(await ctx.llm.parseFood(D.foodYesterday));
        if (D.foodUsual.trim()) u = found(await ctx.llm.parseFood(D.foodUsual));
      } catch {
        y = kwParse(D.foodYesterday, findAll).filter((x) => x.candidates.length);
        u = kwParse(D.foodUsual, findAll).filter((x) => x.candidates.length);
      }
      D.mentioned = [...new Set([...y, ...u].map((x) => (x.candidates[0].ready ? x.candidates[0] : findPool(x.query))?.id).filter(Boolean))];
      D.yesterday = y.map((x) => {
        const hit = x.candidates[0];
        return { refId: hit.id, grams: Math.round(x.grams || hit.portion || 100), name: x.name, confidence: Math.min(CONFIDENCE.llm, x.confidence || 0.6) };
      });
      D.candidates = [];
      rerender();
    };
    const ta1 = h('textarea', { placeholder: 'Утром овсянка с бананом, днём гречка с курицей, вечером творог…', value: D.foodYesterday, oninput: bind('foodYesterday') });
    const ta2 = h('textarea', { placeholder: 'Завтрак — яйца или каша, обед — суп и второе, ужин — рыба с овощами', value: D.foodUsual, oninput: bind('foodUsual') });
    const cat = CATALOG_BY_ID;
    return wrap('Что ты ешь',
      field('Что было в еде вчера', h('div', {}, ta1, voiceButton((t) => { D.foodYesterday = (D.foodYesterday + ' ' + t).trim(); rerender(); }))),
      field('Что обычно ешь на завтрак, обед, ужин', h('div', {}, ta2, voiceButton((t) => { D.foodUsual = (D.foodUsual + ' ' + t).trim(); rerender(); }))),
      h('button', { class: 'btn', onclick: parse }, 'Разобрать'),
      D.yesterday.length ? h('div', { class: 'card' },
        h('h2', {}, 'Вчерашний день'),
        D.yesterday.map((e) => h('div', { class: 'item' }, h('div', { class: 'grow' }, cat[e.refId]?.name || e.name), h('span', { class: 'muted' }, `${e.grams} г`))),
        h('label', { class: 'row' }, h('input', { type: 'checkbox', checked: D.keepYesterday, onchange: (e) => { D.keepYesterday = e.target.checked; save(); } }), 'Записать как вчерашний день')) : null,
      D.mentioned.length ? h('p', { class: 'muted' }, `Найдено в базе: ${D.mentioned.length} позиций — они попадут в пул.`) : null,
      nav(true));
  }

  if (name === 'pool') {
    const p = profileLike();
    if (!D.candidates.length) {
      let list = poolCandidates(p, D.mentioned, 28);
      if (D.foodBudget === 'low') list = list.filter((x) => (x.cost || 2) < 3);
      D.candidates = list.map((x) => x.id);
    }
    const cat = CATALOG_BY_ID;
    const struck = new Set(D.struck);
    const ids = [...D.candidates, ...D.extraPool];
    const chosen = ids.filter((id) => !struck.has(id));
    const warnings = poolWarnings(chosen.map((id) => cat[id]).filter(Boolean));
    const search = h('input', { placeholder: 'Добавить: начни вводить название' });
    const results = h('div', {});
    const ex = excludedTags(p);
    search.oninput = () => {
      const found = searchCatalog(search.value, CATALOG, 12, { filter: (x) => allowedByRestrictions(x, ex) }).filter((x) => !ids.includes(x.id)).slice(0, 6);
      results.replaceChildren(...found.map((x) => h('button', { class: 'chip', onclick: () => { D.extraPool.push(x.id); rerender(); } }, '+ ' + x.name)));
    };
    return wrap('Пул еды',
      h('p', {}, 'Из этого я собираю стек дня. Вычеркни то, что не ешь или не хочешь. Нужно минимум 10 позиций.'),
      h('div', { class: 'chips' }, ids.map((id) => h('button', { class: 'chip' + (struck.has(id) ? ' off' : ''), onclick: () => { struck.has(id) ? struck.delete(id) : struck.add(id); D.struck = [...struck]; rerender(); } }, cat[id]?.name || id))),
      h('h3', {}, 'Добавить своё'), search, h('div', { class: 'chips', style: { marginTop: '6px' } }, results),
      h('p', { class: chosen.length >= 10 ? 'muted' : '' }, `В пуле: ${chosen.length}`),
      warnings.length ? h('div', { class: 'card warn' }, h('p', {}, 'Чтобы стек сходился по белку и калориям:'), warnings.map((w) => h('p', {}, '— ' + w))) : null,
      nav(chosen.length >= 10, 'Дальше', () => {
        D.pool = chosen.map((id) => ({ refId: id, grams: cat[id].portion }));
        next();
      }));
  }

  if (name === 'cooking') {
    const mins = { 10: 'до 10 минут', 20: 'до 20 минут', 30: 'до 30 минут', 45: 'до 45 минут', 90: 'сколько нужно' };
    return wrap('Готовка и бюджет',
      field('Время на готовку в будни', select(mins, D.cookWeekdayMin, (v) => { D.cookWeekdayMin = Number(v); rerender(); })),
      field('В выходные', select(mins, D.cookWeekendMin, (v) => { D.cookWeekendMin = Number(v); rerender(); })),
      field('Бюджет на еду', select({ low: 'экономный', medium: 'средний', high: 'не ограничен' }, D.foodBudget, (v) => { D.foodBudget = v; rerender(); }), 'Экономный бюджет убирает из кандидатов дорогие позиции.'),
      nav(true));
  }

  if (name === 'training') {
    const prog = resolveProgram({ daysPerWeek: D.daysPerWeek, equipment: D.equipment, injuries: D.injuries, sessionMin: D.sessionMin });
    const loaded = [...new Set(prog.days.flatMap((d) => d.exercises.map((e) => e.exerciseId)))].filter((id) => EXERCISES_BY_ID[id].loaded);
    return wrap('Как ты тренируешься сейчас',
      h('textarea', { placeholder: 'Свободно: что делаешь, как часто, сколько лет', value: D.trainingNow, oninput: bind('trainingNow') }),
      h('h3', {}, `Программа: ${prog.name}`),
      loaded.length ? h('p', { class: 'muted' }, 'Если знаешь рабочие веса — впиши, это стартовые. Можно пропустить: подберёшь на первой тренировке.') : null,
      loaded.map((id) => field(EXERCISES_BY_ID[id].name + ', кг', num({ value: D.startWeights[id] ?? '', onchange: (e) => { D.startWeights[id] = Number(e.target.value) || undefined; save(); } }))),
      nav(true));
  }

  // finish
  const restr = restrFor(S);
  const profile = { sex: D.sex, birthDate: D.birthDate, heightCm: D.heightCm, daysPerWeek: D.daysPerWeek, stopFlags: D.stopFlags };
  const st = initialModelState({ profile, goal: D.checkedGoal, phaseType: D.phase, weightKg: D.weightKg, today: dayKey() });
  const noNumbers = restr.forceNoNumbers;
  return wrap('Готово',
    h('div', { class: 'card' },
      h('p', {}, `Фаза: ${PHASES[st.phase]}.`),
      noNumbers || restr.noBudget
        ? h('p', {}, 'Цифры калорий скрыты — стек дня подскажет, что и сколько есть.')
        : h('p', {}, `Стартовый бюджет — около ${st.budget} ккал в день, белок ${st.macros.pMin}–${st.macros.pMax} г. Это оценка по формуле: за первые две недели я посмотрю на твой вес и еду и уточню её.`),
      h('p', {}, `В пуле ${D.pool?.length || 0} позиций, тренировки — ${D.daysPerWeek} раза в неделю.`)),
    h('p', { class: 'muted' }, 'Каждое утро — короткий чекин: вес, сон, готовность. Раз в неделю — сводка и адаптация плана.'),
    nav(true, 'Начать', async () => {
      const ex = excludedTags(profileLike());
      const cat = CATALOG_BY_ID;
      const yesterday = D.keepYesterday
        ? D.yesterday.filter((e) => cat[e.refId] && allowedByRestrictions(cat[e.refId], ex))
          .map((e) => ({ ...S.makeEntry({ refId: e.refId, grams: e.grams, method: 'llm', confidence: e.confidence }), ts: Date.now() - 86400000 }))
        : [];
      await S.completeOnboarding({
        ...D, goal: D.checkedGoal, phase: D.phase, pool: D.pool, yesterday, noNumbers,
      });
      try {
        localStorage.removeItem(KEY);
      } catch {}
      D = null;
      step = 0;
      ctx.go('');
    }));
}
