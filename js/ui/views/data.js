// «О данных»: источники базы продуктов, обязательная атрибуция OGL v3.0, как используются значения, свои синонимы поиска.
import { h, toast } from '../dom.js';
import { ATTRIBUTION, DERIVED } from '../../core/fooddb.js';
import { SEED_VERSION, DISHES } from '../../core/foods.js';
import { SEED_ROWS } from '../../data/foodseed.js';

// 1 продукт, 2 продукта, 5 продуктов
const plural = (n, one, few, many) => {
  const m10 = n % 10;
  const m100 = n % 100;
  return `${n} ${m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many}`;
};
const products = (n) => plural(n, 'продукт', 'продукта', 'продуктов');

let aliasDraft = '';
let aliasQuery = '';

export async function dataView(ctx) {
  const { S } = ctx;
  const re = () => ctx.refresh();
  const custom = S.customFoods();
  const legacyInPool = S.pool().filter((p) => S.ref(p.refId)?.legacy);
  const fmtV = (v) => (v ? v.split('-').reverse().join('.') : '—');

  const aliases = Object.entries(S.userAliases());
  const phrase = h('input', { value: aliasDraft, placeholder: 'Слово, как ты его пишешь: «кефирчик»', oninput: (e) => { aliasDraft = e.target.value; } });
  const q = h('input', { value: aliasQuery, placeholder: 'Какой продукт им называть' });
  const found = h('div', { class: 'chips', style: { marginTop: '6px' } });
  const drawFound = () => {
    aliasQuery = q.value;
    found.replaceChildren(...(q.value.trim() ? S.search(q.value, { limit: 6 }) : []).map((x) => h('button', { class: 'chip', onclick: async () => {
      if (!aliasDraft.trim()) return toast('Сначала впиши слово');
      await S.addAlias(aliasDraft, x.id);
      toast(`«${aliasDraft.trim()}» → ${x.name}`);
      aliasDraft = '';
      aliasQuery = '';
      re();
    } }, x.name)));
  };
  q.oninput = drawFound;
  drawFound();

  return h('div', {},
    h('div', { class: 'row between' }, h('h1', {}, 'О данных'), h('button', { class: 'btn ghost small', onclick: () => ctx.go('more') }, 'Назад')),

    h('div', { class: 'card' },
      h('h2', {}, 'База продуктов'),
      h('p', {}, `McCance and Widdowson's Composition of Foods Integrated Dataset (CoFID) 2021, Великобритания: ${plural(SEED_ROWS.length, 'базовый продукт', 'базовых продукта', 'базовых продуктов')} — сырые и простые приготовленные формы. Выгрузка от ${fmtV(SEED_VERSION)}.`),
      h('p', { lang: 'en' }, ATTRIBUTION),
      h('p', { class: 'muted' }, h('a', { href: 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/', target: '_blank', rel: 'noopener' }, 'Open Government Licence v3.0'))),

    h('div', { class: 'card' },
      h('h2', {}, 'Источники'),
      h('div', { class: 'item' }, h('div', { class: 'grow' }, h('div', { class: 'title' }, 'CoFID 2021'), h('div', { class: 'muted' }, `${products(SEED_ROWS.length)} · лицензия OGL v3.0`))),
      h('div', { class: 'item' }, h('div', { class: 'grow' }, h('div', { class: 'title' }, 'Расчёт из CoFID'),
        h('div', { class: 'muted' }, `${plural(DERIVED.length, 'готовая крупа', 'готовые крупы', 'готовых круп')}, которых нет в базе: ${DERIVED.map((d) => d.name.toLowerCase()).join(', ')} — из сухих по коэффициенту выхода`))),
      h('div', { class: 'item' }, h('div', { class: 'grow' }, h('div', { class: 'title' }, 'Блюда'), h('div', { class: 'muted' }, `${plural(DISHES.length, 'блюдо', 'блюда', 'блюд')}; КБЖУ каждого считается из состава — продуктов CoFID`))),
      h('div', { class: 'item' }, h('div', { class: 'grow' }, h('div', { class: 'title' }, 'Open Food Facts'), h('div', { class: 'muted' }, `только при поиске по штрих-коду, лицензия ODbL; в базу не копируется · найдено ${custom.filter((f) => f.source === 'OFF' || f.source === 'Open Food Facts').length}`))),
      h('div', { class: 'item' }, h('div', { class: 'grow' }, h('div', { class: 'title' }, 'Свои продукты'), h('div', { class: 'muted' }, `с этикеток, добавлено ${custom.filter((f) => f.source === 'user').length}`))),
      legacyInPool.length ? h('div', { class: 'item' }, h('div', { class: 'grow' }, h('div', { class: 'title' }, 'Старая база Body OS'),
        h('div', { class: 'muted' }, `в пуле ещё ${legacyInPool.length}: ${legacyInPool.map((p) => S.ref(p.refId).name).join(', ')} — значения примерные; лучше заменить продуктом из базы или своим с этикетки`))) : null),

    h('div', { class: 'card' },
      h('h2', {}, 'Как считаются значения'),
      h('p', {}, 'Калории берутся из базы как есть и не пересчитываются из белков, жиров и углеводов: в CoFID углеводы записаны в моносахаридных эквивалентах, и пересчёт дал бы ошибку.'),
      h('p', {}, 'Пустое значение — «не определено», а не ноль. Если у продукта нет калорий (так у специй и бульонных кубиков), в приложении стоит «—», в сумме дня — 0, а запись помечается как неточная.'),
      h('p', {}, 'Каждая запись еды хранит свои цифры на момент записи — обновление базы прошлые дни не меняет.'),
      h('p', {}, 'Готовое и сырое — разные строки: 100 г варёного риса и 100 г сухого отличаются втрое. Для заготовок вес готового считается по коэффициенту выхода из базы; если пары «сырой → готовый» нет — по типовому коэффициенту, и тогда партию лучше взвесить.'),
      h('p', {}, 'Клетчатка в базе измерена двумя методами (AOAC и более строгий NSP), поэтому сравнивать её можно только внутри одного метода.'),
      h('p', {}, 'Степень переработки (NOVA) — оценка приложения по названию, а не данные источника. Она идёт только в недельную долю ультрапереработанного.'),
      h('p', {}, 'Аллергены и исключения (глютен, лактоза, орехи, свинина…) приложение размечает по названию продукта. При серьёзной аллергии сверяйся с составом на упаковке.')),

    h('div', { class: 'card' },
      h('h2', {}, 'Свои синонимы поиска'),
      h('p', { class: 'muted' }, 'Синоним не меняет название продукта — только помогает его найти. Базовые синонимы уже есть: «курица», «творог», «гречка», «картошка»…'),
      aliases.length ? aliases.map(([k, ids]) => h('div', { class: 'item' },
        h('div', { class: 'grow' }, h('div', { class: 'title' }, k), h('div', { class: 'muted' }, ids.map((id) => S.ref(id)?.name || id).join(', '))),
        h('button', { class: 'btn ghost small', onclick: async () => { await S.removeAlias(k); re(); } }, 'Удалить'))) : null,
      phrase, q, found));
}
