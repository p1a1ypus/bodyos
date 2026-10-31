// Хранилище: IndexedDB — источник истины на устройстве. Всё — записи с меткой времени, удаление мягкое.
// Данных одного человека мало (год ≈ несколько тысяч записей), поэтому всё держим в памяти, пишем сквозь кэш.

export const SCHEMA_VERSION = 2; // 2: заготовки (batches)

export const STORES = [
  'profile', 'goals', 'phases', 'weights', 'checkins', 'foods', 'dishes', 'pool', 'dayPlans', 'foodEntries',
  'shopping', 'programs', 'sessionPlans', 'sessions', 'sets', 'labs', 'modelStates', 'coachMessages',
  'health', 'measurements', 'settings', 'llmLog', 'questions', 'meta', 'batches',
];

const BY_DAY = ['weights', 'checkins', 'dayPlans', 'foodEntries', 'sessions', 'sets', 'labs', 'health', 'measurements'];

// Миграции данных: {to: версия, run(store)} — выполняются по порядку после открытия
const MIGRATIONS = [];

function req(r) {
  return new Promise((res, rej) => {
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

function newId() {
  return globalThis.crypto?.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export class Store {
  constructor(name = 'bodyos') {
    this.name = name;
    this.cache = {};
    this.listeners = new Set();
  }

  async open() {
    this.db = await new Promise((res, rej) => {
      const r = indexedDB.open(this.name, SCHEMA_VERSION);
      r.onupgradeneeded = () => {
        const db = r.result;
        for (const s of STORES) {
          if (db.objectStoreNames.contains(s)) continue;
          const os = db.createObjectStore(s, { keyPath: 'id' });
          if (BY_DAY.includes(s)) os.createIndex('day', 'day');
          os.createIndex('updatedAt', 'updatedAt');
        }
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
      r.onblocked = () => rej(new Error('База открыта в другой вкладке'));
    });
    for (const s of STORES) {
      const rows = await req(this.db.transaction(s).objectStore(s).getAll());
      this.cache[s] = new Map(rows.map((x) => [x.id, x]));
    }
    await this.migrate();
    return this;
  }

  async migrate() {
    const saved = this.get('meta', 'schema');
    const meta = saved ? { ...saved } : { id: 'schema', version: SCHEMA_VERSION };
    for (const m of MIGRATIONS) {
      if (m.to > meta.version) {
        await m.run(this);
        meta.version = m.to;
      }
    }
    // новые хранилища создаёт onupgradeneeded, данных они не меняют — достаточно поднять номер
    meta.version = Math.max(meta.version, SCHEMA_VERSION);
    if (!saved || saved.version !== meta.version) await this.put('meta', meta);
  }

  all(store, { withDeleted = false } = {}) {
    const rows = [...(this.cache[store]?.values() || [])];
    return withDeleted ? rows : rows.filter((x) => !x.deleted);
  }

  get(store, id) {
    const x = this.cache[store]?.get(id);
    return x && !x.deleted ? x : null;
  }

  byDay(store, day) {
    return this.all(store).filter((x) => x.day === day);
  }

  async putMany(store, objs) {
    const now = Date.now();
    const rows = objs.map((o) => {
      const prev = o.id ? this.cache[store].get(o.id) : null;
      return { ...o, id: o.id || newId(), createdAt: prev?.createdAt || o.createdAt || now, updatedAt: now };
    });
    const tx = this.db.transaction(store, 'readwrite');
    const os = tx.objectStore(store);
    for (const r of rows) {
      os.put(r);
      this.cache[store].set(r.id, r);
    }
    await new Promise((res, rej) => {
      tx.oncomplete = res;
      tx.onerror = () => rej(tx.error);
    });
    this.emit(store);
    return rows;
  }

  async put(store, obj) {
    return (await this.putMany(store, [obj]))[0];
  }

  // Мягкое удаление: запись остаётся, чтобы правила безопасности видели правки задним числом
  async remove(store, id) {
    const x = this.cache[store].get(id);
    if (!x) return;
    await this.put(store, { ...x, deleted: true, deletedAt: Date.now() });
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(store) {
    for (const fn of this.listeners) fn(store);
  }

  exportJSON() {
    const data = {};
    for (const s of STORES) data[s] = this.all(s, { withDeleted: true });
    return { app: 'bodyos', schema: SCHEMA_VERSION, exportedAt: new Date().toISOString(), data };
  }

  async importJSON(obj) {
    if (obj?.app !== 'bodyos' || !obj.data) throw new Error('Это не файл экспорта Body OS');
    for (const s of STORES) {
      const tx = this.db.transaction(s, 'readwrite');
      tx.objectStore(s).clear();
      for (const r of obj.data[s] || []) tx.objectStore(s).put(r);
      await new Promise((res, rej) => {
        tx.oncomplete = res;
        tx.onerror = () => rej(tx.error);
      });
      this.cache[s] = new Map((obj.data[s] || []).map((x) => [x.id, x]));
    }
    this.emit('*');
  }

  async wipe() {
    this.db?.close();
    await req(indexedDB.deleteDatabase(this.name));
  }
}

// CSV: разделитель «;» и BOM — так файл сразу открывается в русском Excel
export function toCSV(rows, columns) {
  const esc = (v) => {
    if (v == null) return '';
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const cols = columns || [...new Set(rows.flatMap((r) => Object.keys(r)))];
  return '﻿' + [cols.join(';'), ...rows.map((r) => cols.map((c) => esc(r[c])).join(';'))].join('\r\n');
}

export const CSV_EXPORTS = {
  weights: ['day', 'kg', 'source', 'deleted'],
  foodEntries: ['day', 'name', 'grams', 'kcal', 'p', 'f', 'c', 'confidence', 'method', 'deleted'],
  checkins: ['day', 'sleep', 'readiness', 'soreness', 'note'],
  sets: ['day', 'exerciseId', 'kg', 'reps', 'rir', 'order', 'deleted'],
  measurements: ['day', 'waist', 'hips', 'chest', 'thigh', 'arm', 'bpSys', 'bpDia', 'restingHr'],
  labs: ['day', 'name', 'value', 'unit', 'refMin', 'refMax', 'deleted'],
  health: ['day', 'type', 'value', 'source'],
};
