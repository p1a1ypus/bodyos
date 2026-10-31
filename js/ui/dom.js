// Минимальный DOM-хелпер: h(tag, attrs, ...children). Без фреймворка — экраны перерисовываются целиком.

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked') el.checked = !!v;
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false || c === true) continue;
    el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

// Линейные иконки 24×24 (свои, без шрифтов и сети)
const ICONS = {
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  dots: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  today: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  train: '<path d="M2.5 12h2M19.5 12h2M7 12h10M4.5 9.5v5M19.5 9.5v5M7 7v10M17 7v10"/>',
  week: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4M7.5 14.5h1M11.5 14.5h1M15.5 14.5h1"/>',
  labs: '<path d="M9 3h6M10 3v6.5L4.8 18.6A1.6 1.6 0 0 0 6.2 21h11.6a1.6 1.6 0 0 0 1.4-2.4L14 9.5V3M7 15h10"/>',
  more: '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>',
};

export function icon(name, cls = 'icon') {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('class', cls);
  s.setAttribute('aria-hidden', 'true');
  s.setAttribute('fill', 'none');
  s.setAttribute('stroke', 'currentColor');
  s.setAttribute('stroke-width', '2');
  s.setAttribute('stroke-linecap', 'round');
  s.setAttribute('stroke-linejoin', 'round');
  s.innerHTML = ICONS[name] || '';
  if (name === 'dots' || name === 'more') s.setAttribute('fill', 'currentColor');
  return s;
}

// Кольцо прогресса: доля 0…1, подпись в центре
export function ring(fraction, label, size = 84) {
  const r = size / 2 - 7;
  const len = 2 * Math.PI * r;
  const f = Math.max(0, Math.min(1, fraction || 0));
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', `0 0 ${size} ${size}`);
  s.setAttribute('width', size);
  s.setAttribute('height', size);
  s.setAttribute('class', 'ring');
  s.setAttribute('role', 'img');
  s.setAttribute('aria-label', label);
  const c = size / 2;
  s.innerHTML = `<circle class="track" cx="${c}" cy="${c}" r="${r}" fill="none" stroke-width="9"/>`
    + (f > 0 ? `<circle class="value" cx="${c}" cy="${c}" r="${r}" fill="none" stroke-width="9" stroke-linecap="round" stroke-dasharray="${(f * len).toFixed(1)} ${len.toFixed(1)}" transform="rotate(-90 ${c} ${c})"/>` : '')
    + `<text x="${c}" y="${c + 6}" text-anchor="middle"></text>`;
  s.querySelector('text').textContent = label;
  return s;
}

export function toast(text, ms = 2500) {
  const t = h('div', { class: 'toast' }, text);
  document.body.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

export function field(label, input, hint) {
  return h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), input, hint ? h('span', { class: 'hint' }, hint) : null);
}

export function num(attrs = {}) {
  return h('input', { type: 'number', inputmode: 'decimal', step: 'any', ...attrs });
}

// Ряд кнопок 1–5 (чекин): один тап
export function scale(value, onPick, { min = 1, max = 5, labels = {} } = {}) {
  const row = h('div', { class: 'scale' });
  for (let i = min; i <= max; i++) {
    row.appendChild(h('button', { type: 'button', class: 'scale-btn' + (value === i ? ' on' : ''), onclick: () => onPick(i) }, String(i)));
  }
  const cap = labels[min] || labels[max] ? h('div', { class: 'scale-caps' }, h('span', {}, labels[min] || ''), h('span', {}, labels[max] || '')) : null;
  return h('div', {}, row, cap);
}

export function chips(options, selected, onToggle) {
  const sel = new Set(selected);
  return h('div', { class: 'chips' }, Object.entries(options).map(([k, label]) =>
    h('button', { type: 'button', class: 'chip' + (sel.has(k) ? ' on' : ''), onclick: () => onToggle(k) }, label)));
}

export function select(options, value, onChange) {
  return h('select', { onchange: (e) => onChange(e.target.value) },
    Object.entries(options).map(([k, label]) => h('option', { value: k, selected: k === String(value) ? true : null }, label)));
}

export function download(name, content, type = 'application/json') {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const a = h('a', { href: URL.createObjectURL(blob), download: name });
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 1000);
}

// Голосовой ввод: встроенное распознавание браузера, если есть; иначе — диктовка клавиатуры
export function voiceButton(onText) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return null;
  const btn = h('button', { type: 'button', class: 'btn ghost', title: 'Голосом', 'aria-label': 'Голосом' }, icon('mic'));
  btn.onclick = () => {
    const r = new SR();
    r.lang = 'ru-RU';
    r.interimResults = false;
    btn.classList.add('on');
    r.onresult = (e) => onText(e.results[0][0].transcript);
    r.onend = () => btn.classList.remove('on');
    r.onerror = () => btn.classList.remove('on');
    r.start();
  };
  return btn;
}

export const fmtDate = (key) => {
  const [y, m, d] = key.split('-');
  return `${d}.${m}`;
};
export const fmtDateFull = (key) => {
  const [y, m, d] = key.split('-');
  return `${d}.${m}.${y}`;
};
