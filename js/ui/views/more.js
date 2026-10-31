// «Ещё»: цель и фаза, режим «без цифр», пул, LLM, здоровье вручную, данные (экспорт/импорт), профиль.
import { h, num, toast, select, download, chips, fmtDateFull } from '../dom.js';
import { GOAL_TYPES, PHASES, DEFAULT_RATE } from '../../core/goals.js';
import { EQUIPMENT_PROFILES, INJURIES } from '../../core/exercises.js';
import { resolveProgram } from '../../core/training.js';
import { CSV_EXPORTS } from '../../data/db.js';
import { dayKey } from '../../core/util.js';

let goalDraft = null;
let poolQuery = '';

export async function moreView(ctx) {
  const { S, store } = ctx;
  const re = () => ctx.refresh();
  const st = S.modelState();
  const restr = S.restr();
  const settings = S.settings();
  const profile = S.profile();
  const out = h('div', {}, h('h1', {}, 'Ещё'));

  // Цель и фаза
  const goal = S.goal();
  const phase = S.phase();
  if (!goalDraft) goalDraft = { type: goal.type, targetKg: goal.targetKg, deadline: goal.deadline || '', ratePct: goal.ratePct || DEFAULT_RATE[goal.type] || 0 };
  const g = goalDraft;
  const needsTarget = g.type === 'lose' || g.type === 'gain';
  out.appendChild(h('div', { class: 'card' }, h('h2', {}, 'Цель и фаза'),
    h('p', {}, `${GOAL_TYPES[goal.type]}${goal.targetKg ? ` до ${goal.targetKg} кг` : ''}${goal.deadline ? ` к ${fmtDateFull(goal.deadline)}` : ''}${goal.ratePct ? `, ${goal.ratePct}%/нед` : ''}.`),
    h('p', { class: 'muted' }, `Фаза: ${PHASES[phase.type]} с ${fmtDateFull(phase.start)}${phase.reason && phase.reason !== 'старт' ? ` (${phase.reason})` : ''}.`),
    h('details', {}, h('summary', {}, 'Изменить цель'),
      select(GOAL_TYPES, g.type, (v) => { g.type = v; g.ratePct = DEFAULT_RATE[v] || 0; re(); }),
      needsTarget ? h('div', {}, h('p', { class: 'muted' }, 'Целевой вес, кг'), num({ value: g.targetKg ?? '', oninput: (e) => { g.targetKg = Number(e.target.value); } }),
        h('p', { class: 'muted' }, 'Срок (необязательно)'), h('input', { type: 'date', value: g.deadline, oninput: (e) => { g.deadline = e.target.value; } }),
        h('p', { class: 'muted' }, 'Скорость без срока, %/нед'), num({ value: g.ratePct, oninput: (e) => { g.ratePct = Number(e.target.value); } })) : null,
      h('button', { class: 'btn', style: { marginTop: '8px' }, onclick: async () => {
        const r = await S.changeGoal({ type: g.type, targetKg: g.targetKg, deadline: g.deadline || null, ratePct: g.deadline ? null : g.ratePct });
        if (!r.ok) return toast(r.reason, 5000);
        goalDraft = null;
        toast('Цель обновлена');
        re();
      } }, 'Проверить и сохранить')),
    h('details', {}, h('summary', {}, 'Сменить фазу вручную'),
      h('div', { class: 'chips' }, Object.entries(PHASES).map(([k, label]) => h('button', {
        class: 'chip' + (phase.type === k ? ' on' : ''),
        onclick: async () => {
          const chk = S.canSwitchPhase(k);
          if (!chk.ok) return toast(chk.reason, 4000);
          await S.changePhase(k, 'вручную');
          re();
        },
      }, label))))));

  // Режим «без цифр»
  out.appendChild(h('div', { class: 'card' }, h('label', { class: 'row between' },
    h('span', {}, h('b', {}, 'Режим «без цифр»'), h('br'), h('span', { class: 'muted' }, 'Стек остаётся, калории и макросы скрыты.')),
    h('input', { type: 'checkbox', checked: S.noNumbers(), disabled: restr.forceNoNumbers ? true : null, onchange: async (e) => { await S.saveSettings({ noNumbers: e.target.checked }); re(); } })),
    restr.forceNoNumbers ? h('p', { class: 'hint' }, 'Включён принудительно из-за ответов в онбординге.') : null));

  // Пул
  const pool = S.pool({ all: true });
  const warnings = S.poolWarnings();
  const search = h('input', { placeholder: 'Добавить в пул', value: poolQuery });
  const found = h('div', { class: 'chips' });
  const drawFound = () => {
    poolQuery = search.value;
    const inPool = new Set(pool.filter((p) => p.active !== false).map((p) => p.refId));
    found.replaceChildren(...S.search(search.value, { pool: true, limit: 12 }).filter((x) => !inPool.has(x.id)).slice(0, 8)
      .map((x) => h('button', { class: 'chip', onclick: async () => { await S.addToPool(x.id, x.portion); re(); } }, '+ ' + x.name)));
  };
  search.oninput = drawFound;
  drawFound();
  out.appendChild(h('details', { class: 'card' }, h('summary', {}, `Пул еды (${pool.filter((p) => p.active !== false).length})`),
    warnings.length ? h('div', { class: 'card warn' }, warnings.map((w) => h('p', {}, '— ' + w))) : null,
    search, found,
    pool.sort((a, b) => (S.ref(a.refId)?.name || a.name || '').localeCompare(S.ref(b.refId)?.name || b.name || '', 'ru')).map((p) => {
      const it = S.ref(p.refId);
      return h('label', { class: 'item' },
        h('input', { type: 'checkbox', checked: p.active !== false, onchange: async (e) => { await S.setPoolActive(p.id, e.target.checked); re(); } }),
        h('div', { class: 'grow' }, h('div', { class: 'title' }, it?.name || p.name),
          h('div', { class: 'muted' }, `порция ${p.grams} г · съедено ${p.eatenCount || 0} · заменено ${p.replaceCount || 0}${p.priority ? ` · приоритет ${p.priority}` : ''}${it?.legacy ? ' · старая база, значения примерные' : ''}`)));
    })));

  // База продуктов
  out.appendChild(h('div', { class: 'card' }, h('div', { class: 'row between' },
    h('span', {}, h('b', {}, 'База продуктов'), h('br'), h('span', { class: 'muted' }, `CoFID 2021 · свои продукты: ${S.customFoods().filter((f) => f.source === 'user').length} · свои синонимы: ${Object.keys(S.userAliases()).length}`)),
    h('button', { class: 'btn small', onclick: () => ctx.go('data') }, 'О данных'))));

  // LLM
  const L = { ...settings.llm };
  const key = h('input', { type: 'password', value: L.apiKey, placeholder: 'sk-ant-…', autocomplete: 'off' });
  const base = h('input', { value: L.baseUrl });
  const pm = h('input', { value: L.parseModel });
  const sm = h('input', { value: L.summaryModel });
  const en = h('input', { type: 'checkbox', checked: L.enabled });
  out.appendChild(h('details', { class: 'card' }, h('summary', {}, `LLM: ${L.enabled ? 'включён' : 'выключен'}`),
    h('p', { class: 'muted' }, 'Разбор еды голосом/текстом, сводки недели, ответы «почему», распознавание анализов. Уходит только текст записи, не история. Без сети и без ключа всё работает через ручной ввод.'),
    h('label', { class: 'row' }, en, 'Включить'),
    h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Ключ Claude API (хранится только на этом устройстве)'), key),
    h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Адрес API (можно свой прокси)'), base),
    h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Модель для разбора'), pm),
    h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Модель для сводок и анализов'), sm),
    h('div', { class: 'row' },
      h('button', { class: 'btn primary', onclick: async () => {
        await S.saveSettings({ llm: { ...L, enabled: en.checked, apiKey: key.value.trim(), baseUrl: base.value.trim() || L.baseUrl, parseModel: pm.value.trim(), summaryModel: sm.value.trim() } });
        toast('Сохранено');
        re();
      } }, 'Сохранить'),
      h('button', { class: 'btn', onclick: async () => {
        try {
          const r = await ctx.llm.parseFood('два яйца и кофе');
          toast(`Работает: ${r.map((x) => x.name).join(', ')}`, 4000);
        } catch (e) {
          toast('Не работает: ' + e.message, 5000);
        }
      } }, 'Проверить')),
    h('details', {}, h('summary', { class: 'muted' }, 'Лог запросов'),
      S.llmLog().slice(0, 20).map((l) => h('pre', { class: 'log' }, `${new Date(l.ts).toLocaleString('ru-RU')} · ${l.purpose} · ${l.model} · ${l.ok ? 'ok' : 'ошибка: ' + l.error} · ${l.ms} мс\n${l.request}\n→ ${l.response || ''}`)))));

  // Здоровье вручную (HealthKit в веб-версии недоступен)
  const hDay = h('input', { type: 'date', value: dayKey() });
  const hSleep = num({ placeholder: 'часы' });
  const hSteps = num({ placeholder: 'шаги' });
  out.appendChild(h('details', { class: 'card' }, h('summary', {}, 'Сон и шаги вручную'),
    h('p', { class: 'muted' }, 'В веб-версии нет доступа к «Здоровью» iPhone. Часы сна нужны правилу сна; без них используется оценка из чекина.'),
    hDay, h('div', { class: 'row', style: { marginTop: '8px' } }, h('div', { class: 'grow' }, hSleep), h('div', { class: 'grow' }, hSteps)),
    h('button', { class: 'btn', style: { marginTop: '8px' }, onclick: async () => {
      if (Number(hSleep.value) > 0) await S.addHealth({ day: hDay.value, type: 'sleep', value: Number(hSleep.value) });
      if (Number(hSteps.value) > 0) await S.addHealth({ day: hDay.value, type: 'steps', value: Number(hSteps.value) });
      toast('Сохранено');
    } }, 'Сохранить')));

  // Профиль и тренировки
  const inj = new Set(profile.injuries || []);
  out.appendChild(h('details', { class: 'card' }, h('summary', {}, 'Профиль и программа'),
    h('p', { class: 'muted' }, `Рост ${profile.heightCm} см · ${profile.sex === 'f' ? 'женский' : 'мужской'} пол · дата рождения ${fmtDateFull(profile.birthDate)}`),
    h('p', {}, 'Оборудование'), select(Object.fromEntries(Object.entries(EQUIPMENT_PROFILES).map(([k, v]) => [k, v.label])), profile.equipment, async (v) => { await S.saveProfile({ equipment: v }); re(); }),
    h('p', {}, 'Дней в неделю'), select({ 2: '2', 3: '3', 4: '4' }, profile.daysPerWeek, async (v) => { await S.saveProfile({ daysPerWeek: Number(v) }); re(); }),
    h('p', {}, 'Травмы'), chips(INJURIES, [...inj], async (k) => { inj.has(k) ? inj.delete(k) : inj.add(k); await S.saveProfile({ injuries: [...inj] }); re(); }),
    h('button', { class: 'btn', style: { marginTop: '8px' }, onclick: async () => {
      if (!confirm('Пересобрать программу под текущие настройки? История подходов сохранится.')) return;
      const p = S.profile();
      await S.setProgram(resolveProgram({ daysPerWeek: p.daysPerWeek, equipment: p.equipment, injuries: p.injuries, sessionMin: p.sessionMin }));
      toast('Программа пересобрана');
    } }, 'Пересобрать программу'),
    h('h3', {}, 'Взвешивания'),
    store.all('weights').sort((a, b) => (a.day < b.day ? 1 : -1)).slice(0, 14).map((w) => h('div', { class: 'item' },
      h('span', { class: 'grow' }, `${fmtDateFull(w.day)} · ${S.noNumbers() ? 'записано' : w.kg + ' кг'}`),
      h('button', { class: 'btn ghost small', onclick: async () => { await store.remove('weights', w.id); re(); } }, 'Удалить')))));

  // Данные
  const imp = h('input', { type: 'file', accept: 'application/json' });
  out.appendChild(h('div', { class: 'card' }, h('h2', {}, 'Данные'),
    h('p', { class: 'muted' }, 'Всё хранится только на этом устройстве. Делай экспорт время от времени — браузер может очистить данные сайта.'),
    h('div', { class: 'row' },
      h('button', { class: 'btn primary', onclick: () => download(`bodyos-${dayKey()}.json`, JSON.stringify(S.exportJSON(), null, 1)) }, 'Экспорт JSON'),
      Object.keys(CSV_EXPORTS).map((k) => h('button', { class: 'btn small', onclick: () => download(`bodyos-${k}-${dayKey()}.csv`, S.exportCSV(k), 'text/csv') }, `CSV: ${k}`))),
    h('h3', {}, 'Восстановить из JSON'), imp,
    h('button', { class: 'btn', style: { marginTop: '8px' }, onclick: async () => {
      const f = imp.files[0];
      if (!f) return toast('Выбери файл');
      if (!confirm('Текущие данные будут заменены данными из файла. Продолжить?')) return;
      try {
        await S.importJSON(JSON.parse(await f.text()));
        toast('Восстановлено');
        ctx.go('');
      } catch (e) {
        toast(e.message);
      }
    } }, 'Восстановить'),
    h('h3', {}, 'Сброс'),
    h('button', { class: 'btn ghost', onclick: async () => {
      if (!confirm('Удалить все данные с этого устройства? Сначала сделай экспорт.')) return;
      if (!confirm('Точно удалить? Это необратимо.')) return;
      await store.wipe();
      location.reload();
    } }, 'Удалить все данные')));

  out.appendChild(h('p', { class: 'hint' }, `Body OS v1 · оценка расхода ${S.noNumbers() ? 'скрыта' : st.tdeeEst + ' ккал'} · уверенность модели ${Math.round(st.confidence * 100)}%`));
  return out;
}
