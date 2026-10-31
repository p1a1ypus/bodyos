// Загрузка базы продуктов: data/foods_seed.json (собирается tools/convert_foods.py из CSV) и синонимы поиска.
// Файлы статические и лежат в офлайн-кэше; модули, импортирующие этот, ждут загрузки (top-level await).

const url = (p) => new URL(`../../data/${p}`, import.meta.url);

async function load(name) {
  const r = await fetch(url(name));
  if (!r.ok) throw new Error(`не загрузилась база продуктов (${name}: ${r.status})`);
  return r.json();
}

const loadAll = () => Promise.all([load('foods_seed.json'), load('aliases.json')]);
// index.html начинает качать базу до модулей (window.__bodyosSeed); если там не вышло — качаем сами
const early = globalThis.__bodyosSeed;
delete globalThis.__bodyosSeed;

export const [SEED_ROWS, SEED_ALIASES] = await (early ? early.catch(loadAll) : loadAll());
export const SEED_VERSION = SEED_ROWS[0]?.source_version || null;
