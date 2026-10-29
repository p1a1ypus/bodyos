// Точка входа: хранилище → LLM → сервисы → роутер по hash.
import { Store } from '../data/db.js';
import { createLLM } from '../llm/llm.js';
import { createServices } from '../app/services.js';
import { h, toast } from './dom.js';
import { onboardingView } from './views/onboarding.js';
import { todayView } from './views/today.js';
import { checkinView } from './views/checkin.js';
import { foodView } from './views/food.js';
import { trainView } from './views/train.js';
import { weekView } from './views/week.js';
import { labsView } from './views/labs.js';
import { moreView } from './views/more.js';

const ROUTES = {
  '': todayView,
  onboarding: onboardingView,
  checkin: checkinView,
  food: foodView,
  train: trainView,
  week: weekView,
  labs: labsView,
  more: moreView,
};

const root = document.getElementById('app');
const tabs = document.getElementById('tabs');

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, query = ''] = raw.split('?');
  return { route: path.split('/')[0], params: Object.fromEntries(new URLSearchParams(query)) };
}

async function boot() {
  const store = await new Store().open();
  navigator.storage?.persist?.().catch(() => {});
  let S;
  const llm = createLLM({
    getConfig: () => S.settings().llm,
    log: (entry) => store.put('llmLog', entry).catch(() => {}),
  });
  S = createServices(store, llm);
  window.__bodyos = { store, S, llm }; // для отладки в консоли

  const ctx = {
    S, llm, store,
    go: (route) => {
      if (location.hash === '#/' + route) render();
      else location.hash = '#/' + route;
    },
    refresh: () => render(),
  };

  let rendering = Promise.resolve();
  async function render() {
    rendering = rendering.then(async () => {
      let { route, params } = parseHash();
      if (!S.onboarded() && route !== 'onboarding') route = 'onboarding';
      if (S.onboarded() && route === 'onboarding') route = '';
      const view = ROUTES[route] || todayView;
      tabs.hidden = route === 'onboarding';
      for (const a of tabs.querySelectorAll('a')) a.classList.toggle('on', a.dataset.r === route);
      try {
        const node = await view({ ...ctx, params });
        root.replaceChildren(node);
      } catch (e) {
        console.error(e);
        root.replaceChildren(h('div', { class: 'card warn' }, h('h2', {}, 'Ошибка на экране'), h('pre', { class: 'log' }, String(e.stack || e))));
      }
    });
    return rendering;
  }
  ctx.render = render;

  window.addEventListener('hashchange', render);
  if (S.onboarded()) {
    try {
      const done = await S.catchUp();
      if (done.length) toast(`Готова сводка недели`);
    } catch (e) {
      console.error('коуч-цикл', e);
    }
  }
  await render();

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}

boot().catch((e) => {
  console.error(e);
  root.replaceChildren(h('div', { class: 'card warn' }, h('h2', {}, 'Не удалось запустить'), h('pre', { class: 'log' }, String(e.stack || e))));
});
