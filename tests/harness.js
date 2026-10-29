// Мини-раннер тестов в браузере: test(), assert-хелперы, отчёт в window.__results.
const tests = [];

export function test(name, fn) {
  tests.push({ name, fn });
}

export class AssertionError extends Error {}

export function assert(cond, msg = 'условие не выполнено') {
  if (!cond) throw new AssertionError(msg);
}

export function eq(a, b, msg = '') {
  if (a !== b) throw new AssertionError(`${msg} ожидалось ${JSON.stringify(b)}, получено ${JSON.stringify(a)}`);
}

export function near(a, b, tol, msg = '') {
  if (!(Math.abs(a - b) <= tol)) throw new AssertionError(`${msg} |${a} − ${b}| > ${tol}`);
}

// Метрики, которые тест хочет показать в отчёте (например, доля успешных дней)
let currentNotes = null;
export function note(text) {
  currentNotes?.push(text);
}

export async function runAll(container) {
  const results = [];
  for (const t of tests) {
    currentNotes = [];
    const t0 = performance.now();
    let ok = true;
    let error = null;
    try {
      await t.fn();
    } catch (e) {
      ok = false;
      error = e instanceof AssertionError ? e.message : `${e.name}: ${e.message}\n${e.stack}`;
    }
    const r = { name: t.name, ok, error, notes: currentNotes, ms: Math.round(performance.now() - t0) };
    results.push(r);
    if (container) {
      const div = document.createElement('div');
      div.className = ok ? 'ok' : 'fail';
      div.textContent = `${ok ? '✓' : '✗'} ${t.name} (${r.ms} мс)`;
      for (const n of r.notes) {
        const p = document.createElement('div');
        p.className = 'note';
        p.textContent = n;
        div.appendChild(p);
      }
      if (error) {
        const pre = document.createElement('pre');
        pre.textContent = error;
        div.appendChild(pre);
      }
      container.appendChild(div);
    }
  }
  const failed = results.filter((r) => !r.ok).length;
  window.__results = { total: results.length, failed, results };
  return window.__results;
}
