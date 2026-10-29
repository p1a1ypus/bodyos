// Нет оценочных слов в интерфейсе и промптах (раздел 8). Сканирует исходники через листинг каталогов сервера.
import { test, assert, note } from './harness.js';
import { FORBIDDEN_WORDS } from '../js/core/constants.js';

async function listFiles(dir) {
  const res = await fetch(dir);
  if (!res.ok) return [];
  const html = await res.text();
  const links = [...html.matchAll(/href="([^"?#]+)"/g)].map((m) => decodeURIComponent(m[1]));
  const out = [];
  for (const l of links) {
    if (l.startsWith('/') || l.startsWith('..')) continue;
    if (l.endsWith('/')) out.push(...(await listFiles(dir + l)));
    else if (/\.(js|html|json|webmanifest)$/.test(l)) out.push(dir + l);
  }
  return out;
}

test('лексикон: ни одного запрещённого слова в js/ и index.html', async () => {
  const listed = await listFiles('../js/');
  if (!listed.length) {
    // статический хостинг (GitHub Pages) не отдаёт листинг каталогов — тест работает только с server.py
    note('пропущен: хостинг не отдаёт листинг каталогов, запусти тесты через server.py');
    return;
  }
  const files = [...listed, '../index.html'];
  const hits = [];
  for (const f of files) {
    if (f.endsWith('core/constants.js')) continue; // здесь сам список
    const text = (await (await fetch(f)).text()).toLowerCase();
    for (const w of FORBIDDEN_WORDS) if (text.includes(w)) hits.push(`${f}: «${w}»`);
  }
  note(`просмотрено файлов: ${files.length}`);
  assert(files.length > 5, 'листинг каталогов не получен');
  assert(!hits.length, hits.join('; '));
});
