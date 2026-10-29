// Единственный модуль работы с LLM (раздел 6): один системный промпт, лог запросов, фолбэк на ручной ввод.
// LLM только разбирает текст и пересказывает выводы коуч-цикла. Решений не принимает, калории не считает.
// Вызовы — напрямую в Claude API из браузера (ключ хранится только на устройстве).
import { FORBIDDEN_WORDS } from '../core/constants.js';

export class LLMUnavailable extends Error {}

export const DEFAULT_LLM = {
  enabled: false,
  provider: 'anthropic',
  apiKey: '',
  baseUrl: 'https://api.anthropic.com',
  parseModel: 'claude-haiku-5-5',
  summaryModel: 'claude-sonnet-5-5',
  fallbacks: true,
};

const SYSTEM = `Ты — модуль разбора текста и формулировок в персональном приложении-коуче Body OS.
Все решения (бюджет, калории, расход, объём и прогрессия тренировок, фазы) принимает детерминированная логика приложения; ты только разбираешь то, что написал человек, и пересказываешь готовые выводы.
Правила:
- Не считай калории, расход энергии, тренировочный объём и прогрессию; не меняй план и не предлагай своих изменений.
- Не давай медицинских рекомендаций, не толкуй анализы как советы, не называй дозировки добавок и лекарств.
- Пиши нейтрально и коротко, на «ты», без оценок веса, еды и поступков человека; не стыди и не хвали.
- Отвечай строго в формате схемы.`;

const obj = (properties) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });

export function createLLM({ getConfig, log = () => {}, fetchFn = (...a) => fetch(...a) }) {
  async function call({ purpose, model, content, schema, maxTokens = 4000, effort = 'low', useFallback = false }) {
    const cfg = { ...DEFAULT_LLM, ...getConfig() };
    if (!cfg.enabled || !cfg.apiKey) throw new LLMUnavailable('LLM выключен в настройках');
    if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new LLMUnavailable('нет сети');
    const body = {
      model,
      max_tokens: maxTokens,
      system: SYSTEM,
      messages: [{ role: 'user', content }],
      output_config: { effort, format: { type: 'json_schema', schema } },
    };
    const headers = {
      'content-type': 'application/json',
      'x-api-key': cfg.apiKey,
      'anthropic-version': '2026-10-21',
      'anthropic-dangerous-direct-browser-access': 'true',
    };
    if (useFallback && cfg.fallbacks && model.startsWith('claude-sonnet-5-5')) {
      body.fallbacks = 'default';
      headers['anthropic-beta'] = 'server-side-fallback-2026-07-01';
    }
    const preview = typeof content === 'string' ? content : content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
    const t0 = Date.now();
    const entry = { purpose, model, request: preview.slice(0, 1500), ts: t0 };
    let res;
    let data;
    try {
      res = await fetchFn(cfg.baseUrl.replace(/\/+$/, '') + '/v1/messages', { method: 'POST', headers, body: JSON.stringify(body) });
      data = await res.json();
    } catch (e) {
      log({ ...entry, ok: false, error: e.message, ms: Date.now() - t0 });
      throw new LLMUnavailable('сеть или API недоступны');
    }
    if (!res.ok) {
      log({ ...entry, ok: false, error: `${res.status} ${data?.error?.message || ''}`, ms: Date.now() - t0 });
      throw new LLMUnavailable(`API ответил ${res.status}`);
    }
    if (data.stop_reason === 'refusal') {
      log({ ...entry, ok: false, error: 'refusal', ms: Date.now() - t0 });
      throw new LLMUnavailable('модель отказалась отвечать');
    }
    const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
    log({ ...entry, ok: true, model: data.model, response: text.slice(0, 3000), usage: data.usage, ms: Date.now() - t0 });
    try {
      return JSON.parse(text);
    } catch {
      throw new LLMUnavailable(data.stop_reason === 'max_tokens' ? 'ответ обрезан' : 'ответ не в формате JSON');
    }
  }

  const cfg = () => ({ ...DEFAULT_LLM, ...getConfig() });

  return {
    available: () => {
      const c = cfg();
      return c.enabled && !!c.apiKey && (typeof navigator === 'undefined' || navigator.onLine !== false);
    },

    // Еда голосом/текстом → позиции с сопоставлением базе; граммы — из слов человека, ккал считает приложение
    async parseFood(text, catalog) {
      const list = catalog.map((x) => `${x.id}\t${x.name}`).join('\n');
      const schema = obj({
        items: {
          type: 'array',
          items: obj({
            name: { type: 'string', description: 'как назвал человек' },
            matchId: { type: 'string', description: 'id из списка или пустая строка' },
            grams: { type: 'number' },
            confidence: { type: 'number', description: '0–1' },
          }),
        },
      });
      const content = `База продуктов и блюд (id и название):\n${list}\n\nЗапись человека: «${text}»\n\n` +
        'Разбери запись на отдельные позиции. Для каждой: name — как назвал человек; matchId — id самой близкой позиции базы (пустая строка, если подходящей нет); ' +
        'grams — вес в граммах (штуки, ложки, тарелки переведи в граммы по типичным порциям); confidence — уверенность 0–1 в сопоставлении и весе.';
      const r = await call({ purpose: 'food', model: cfg().parseModel, content, schema });
      return r.items || [];
    },

    // Цель своими словами → структура; человек подтверждает
    async parseGoal(text, today) {
      const schema = obj({
        type: { type: 'string', enum: ['lose', 'gain', 'strength', 'maintain'] },
        targetKg: { type: 'number', description: '0, если не указан' },
        deadline: { type: 'string', description: 'YYYY-MM-DD или пустая строка' },
        summary: { type: 'string', description: 'цель одной фразой' },
      });
      const content = `Сегодня ${today}. Цель человека своими словами: «${text}». Переведи в структуру: тип цели, целевой вес в кг (если назван), срок (если назван, как дату).`;
      return call({ purpose: 'goal', model: cfg().parseModel, content, schema });
    },

    // Еженедельная сводка: только из выхода коуч-цикла; предложения без опоры отбрасываются валидатором
    async weeklySummary(facts) {
      const schema = obj({
        sentences: { type: 'array', items: obj({ text: { type: 'string' }, refs: { type: 'array', items: { type: 'string' } } }) },
      });
      const content = 'Ниже — итог недели от логики приложения: изменения плана с причинами (id r1, r2…) и агрегаты недели (id вида agg:ключ).\n' +
        `${JSON.stringify(facts, null, 1)}\n\n` +
        'Напиши сводку из 3–7 коротких предложений. В refs каждого предложения укажи id фактов, на которые оно опирается. ' +
        'Используй только эти факты и их числа; не добавляй советов и выводов, которых нет во входе.';
      const r = await call({ purpose: 'summary', model: cfg().summaryModel, content, schema, effort: 'medium', useFallback: true });
      return r.sentences || [];
    },

    // «Почему» и «а можно вместо»: ответ только по состоянию модели и правилам
    async ask(question, context) {
      const schema = obj({ answer: { type: 'string' }, inScope: { type: 'boolean' } });
      const content = `Состояние модели и правила приложения:\n${JSON.stringify(context, null, 1)}\n\nВопрос человека: «${question}»\n\n` +
        'Ответь, опираясь только на это состояние и правила. Если ответ из них не следует, ответь «Не могу это решить. Вот что знаю: …» с фактами из состояния и поставь inScope = false.';
      return call({ purpose: 'ask', model: cfg().summaryModel, content, schema, effort: 'medium', useFallback: true });
    },

    // Анализы из фото/PDF → таблица; человек проверяет значения
    async parseLabs(file) {
      const data = await fileToBase64(file);
      const isPdf = file.type === 'application/pdf';
      const block = isPdf
        ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }
        : { type: 'image', source: { type: 'base64', media_type: file.type || 'image/jpeg', data } };
      const schema = obj({
        date: { type: 'string', description: 'дата анализа YYYY-MM-DD или пустая строка' },
        results: {
          type: 'array',
          items: obj({
            name: { type: 'string' }, value: { type: 'number' }, unit: { type: 'string' },
            refMin: { type: 'string', description: 'нижняя граница референса или пустая строка' },
            refMax: { type: 'string', description: 'верхняя граница референса или пустая строка' },
          }),
        },
      });
      const text = 'Извлеки из бланка анализов все показатели: название, значение, единицу, границы референса. Ничего не толкуй и не комментируй.';
      return call({ purpose: 'labs', model: cfg().summaryModel, content: [block, { type: 'text', text }], schema, maxTokens: 8000, useFallback: true });
    },
  };
}

function fileToBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1]);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(file);
  });
}

// Факты для сводки: id изменений и агрегатов; цифры потерь и калорий убираются, если их нельзя показывать
export function summaryFacts(cycle, { noNumbers = false } = {}) {
  const changes = cycle.changes.map((c, i) => ({ id: `r${i + 1}`, rule: c.rule, what: c.what, reason: c.reason }));
  const a = cycle.aggregates;
  const agg = {
    'agg:fullDays': a.fullDays,
    'agg:weighIns': a.weighIns,
    'agg:sessions': `${a.sessions} из ${a.sessionsPlanned}`,
  };
  if (!a.hideLossNumbers && !noNumbers && a.trendChangeKg != null) agg['agg:trendChangeKg'] = a.trendChangeKg;
  if (!noNumbers && a.avgProtein != null) agg['agg:avgProtein'] = a.avgProtein;
  if (a.sleep?.avgHours) agg['agg:sleepHours'] = Math.round(a.sleep.avgHours * 10) / 10;
  if (noNumbers) for (const c of changes) {
    c.what = c.what.replace(/\d+/g, '…');
    c.reason = c.reason.replace(/\d+/g, '…');
  }
  return { changes, aggregates: agg };
}

const numbersIn = (s) => (String(s).match(/\d+(?:[.,]\d+)?/g) || []).map((x) => x.replace(',', '.'));

// Валидатор сводки: предложение остаётся, только если опирается на известные факты, не вводит новых чисел
// и не содержит оценочных слов. Так сводка не может добавить рекомендаций, которых нет в выходе цикла.
export function validateSummary(sentences, facts) {
  const byId = new Map(facts.changes.map((c) => [c.id, `${c.what} ${c.reason}`]));
  for (const [k, v] of Object.entries(facts.aggregates)) byId.set(k, `${k} ${v}`);
  const kept = [];
  for (const s of sentences) {
    const refs = (s.refs || []).filter((r) => byId.has(r));
    if (!refs.length || refs.length !== (s.refs || []).length) continue;
    const allowed = new Set(refs.flatMap((r) => numbersIn(byId.get(r))));
    if (numbersIn(s.text).some((n) => !allowed.has(n))) continue;
    const low = s.text.toLowerCase();
    if (FORBIDDEN_WORDS.some((w) => low.includes(w))) continue;
    kept.push(s.text.trim());
  }
  return kept;
}

// Сводка без LLM: те же факты, шаблоном
export function templateSummary(cycle, { noNumbers = false } = {}) {
  const facts = summaryFacts(cycle, { noNumbers });
  const a = cycle.aggregates;
  const lines = [];
  const head = [];
  if (facts.aggregates['agg:trendChangeKg'] != null) head.push(`тренд веса ${a.trendChangeKg > 0 ? '+' : ''}${a.trendChangeKg} кг`);
  head.push(`полных дней еды ${a.fullDays} из 7`);
  head.push(`тренировок ${a.sessions} из ${a.sessionsPlanned}`);
  lines.push(`За неделю: ${head.join(', ')}.`);
  for (const c of facts.changes) lines.push(`${c.what}. ${c.reason}`);
  return lines.join('\n');
}
