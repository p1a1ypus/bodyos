// LLM-модуль без сети: формат запроса, фолбэк, валидатор сводки.
import { test, assert, eq } from './harness.js';
import { createLLM, LLMUnavailable, validateSummary, summaryFacts, templateSummary } from '../js/llm/llm.js';
import { keywordParse } from '../js/core/foods.js';

const facts = {
  changes: [
    { id: 'r1', rule: 3, what: 'Оценка расхода 2400 → 2480 ккал/день', reason: 'По логу и тренду расход ≈ 2560 ккал/день.' },
    { id: 'r2', rule: 4, what: 'Бюджет 2040 ккал/день, белок 141–194 г', reason: 'Фаза «Дефицит».' },
  ],
  aggregates: { 'agg:fullDays': 6, 'agg:sessions': '3 из 3' },
};

test('сводка: предложения без опоры, с чужими числами и оценочными словами отбрасываются', () => {
  const kept = validateSummary([
    { text: 'Расход уточнён до 2480 ккал в день.', refs: ['r1'] },
    { text: 'Бюджет на неделю — 2040 ккал.', refs: ['r2'] },
    { text: 'Попробуй добавить кардио 30 минут.', refs: [] },
    { text: 'Бюджет снижен до 1900 ккал.', refs: ['r2'] },
    { text: 'Ты плохо логировал выходные.', refs: ['agg:fullDays'] },
    { text: 'Полных дней еды было 6.', refs: ['agg:fullDays'] },
    { text: 'Это из несуществующего правила.', refs: ['r9'] },
  ], facts);
  eq(kept.length, 3);
  assert(kept.includes('Расход уточнён до 2480 ккал в день.') && kept.includes('Полных дней еды было 6.'));
});

test('запрос: версия API, структурированный вывод, без temperature; сонет — с fallbacks', async () => {
  const calls = [];
  const fetchFn = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    return { ok: true, json: async () => ({ model: 'claude-sonnet-5-5', stop_reason: 'end_turn', content: [{ type: 'text', text: '{"sentences":[]}' }] }) };
  };
  const llm = createLLM({ getConfig: () => ({ enabled: true, apiKey: 'test-key', baseUrl: 'https://proxy.example/' }), fetchFn });
  await llm.weeklySummary(facts);
  const c = calls[0];
  eq(c.url, 'https://proxy.example/v1/messages');
  eq(c.init.headers['anthropic-version'], '2026-10-21');
  eq(c.body.output_config.format.type, 'json_schema');
  assert(!('temperature' in c.body), 'temperature запрещён');
  eq(c.body.fallbacks, 'default');
  eq(c.init.headers['anthropic-beta'], 'server-side-fallback-2026-07-01');
  eq(c.body.model, 'claude-sonnet-5-5');
});

test('фолбэк: выключенный LLM и ошибка сети → LLMUnavailable (экран переходит на ручной ввод)', async () => {
  const off = createLLM({ getConfig: () => ({ enabled: false }) });
  let e1 = null;
  try { await off.parseFood('яйцо', []); } catch (e) { e1 = e; }
  assert(e1 instanceof LLMUnavailable);
  const broken = createLLM({ getConfig: () => ({ enabled: true, apiKey: 'k' }), fetchFn: async () => { throw new TypeError('Failed to fetch'); } });
  let e2 = null;
  try { await broken.parseFood('яйцо', []); } catch (e) { e2 = e; }
  assert(e2 instanceof LLMUnavailable);
});

test('без LLM: разбор по словам → запрос к поиску и до 3 кандидатов, граммовка', () => {
  const all = keywordParse('утром овсянка, днём гречка с курицей, творог 5% 200 г и 2 яйца, кефир');
  // кефира в CoFID нет — позиция остаётся без кандидатов, чтобы человек добавил свой продукт
  const kefir = all.find((x) => x.name === 'кефир');
  assert(kefir && !kefir.candidates.length && kefir.matchId === null, 'ненайденное потерялось');
  const r = all.filter((x) => x !== kefir);
  const ids = r.map((x) => x.matchId);
  assert(ids.includes('d:buckwheat_chicken'), JSON.stringify(ids));
  assert(r.every((x) => x.candidates.length >= 1 && x.candidates.length <= 3));
  const tv = r.find((x) => x.candidates.some((c) => c.id === '12-174' || c.id === '12-539'));
  assert(tv, 'творог не найден');
  eq(tv.grams, 200);
  const eggs = r.find((x) => x.candidates[0].category === 'Яйца');
  assert(eggs, 'яйца не найдены');
  eq(eggs.grams, 110);
});

test('шаблонная сводка: без цифр потерь, если сработала защита', () => {
  const cycle = {
    changes: [{ rule: 1, what: 'Фаза — поддержание', reason: 'Приоритет — восстановление.' }],
    aggregates: { hideLossNumbers: true, trendChangeKg: -2.1, fullDays: 7, sessions: 2, sessionsPlanned: 3, weighIns: 7, avgProtein: 150 },
  };
  const t = templateSummary(cycle);
  assert(!t.includes('2.1'), t);
  assert(!('agg:trendChangeKg' in summaryFacts(cycle).aggregates));
});
