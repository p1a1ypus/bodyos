// Штрих-коды: Open Food Facts (нужна сеть) + сканер камеры, где есть BarcodeDetector.
import { h } from './dom.js';

export async function lookupBarcode(code) {
  const c = String(code).replace(/\D/g, '');
  if (c.length < 8) throw new Error('слишком короткий код');
  const url = `https://world.openfoodfacts.org/api/v2/product/${c}.json?fields=product_name,product_name_ru,brands,nutriments,nova_group,serving_quantity`;
  const r = await fetch(url);
  if (!r.ok) throw new Error('сервис ответил ' + r.status);
  const d = await r.json();
  if (d.status !== 1 || !d.product) return null;
  const p = d.product;
  const n = p.nutriments || {};
  const kcal = n['energy-kcal_100g'] ?? (n.energy_100g ? n.energy_100g / 4.184 : null);
  if (kcal == null) return null;
  return {
    id: 'c:' + c, kind: 'food', barcode: c,
    name: [p.product_name_ru || p.product_name || 'Продукт', p.brands ? `(${p.brands.split(',')[0]})` : ''].join(' ').trim(),
    kcal: Math.round(kcal), p: n.proteins_100g || 0, f: n.fat_100g || 0, c: n.carbohydrates_100g || 0, fiber: n.fiber_100g || 0,
    nova: p.nova_group || null, tags: [], meals: ['any'], portion: Math.round(p.serving_quantity || 100), unit: null,
    prepMin: 0, cost: 2, aliases: [], source: 'Open Food Facts',
  };
}

export async function scanBarcode(container) {
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
  const video = h('video', { playsinline: true, muted: true, style: { width: '100%', borderRadius: '10px' } });
  video.srcObject = stream;
  container.replaceChildren(video);
  await video.play();
  const det = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
  try {
    for (let i = 0; i < 200; i++) {
      const codes = await det.detect(video);
      if (codes.length) return codes[0].rawValue;
      await new Promise((r) => setTimeout(r, 150));
    }
    return null;
  } finally {
    stream.getTracks().forEach((t) => t.stop());
    video.remove();
  }
}
