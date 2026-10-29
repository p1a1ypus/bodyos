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
  const btn = h('button', { type: 'button', class: 'btn ghost', title: 'Голосом' }, '🎤');
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
