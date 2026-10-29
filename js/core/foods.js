// Своя стартовая база продуктов и блюд (значения на 100 г, примерные — источник «своя»).
// meals: в какие приёмы пищи позиция подходит; tags — для фильтра аллергий и исключений.

const F = (id, name, kcal, p, f, c, fiber, o = {}) => ({
  id: 'f:' + id, kind: 'food', name, kcal, p, f, c, fiber,
  nova: o.nova ?? 1, tags: o.tags || [], meals: o.meals || ['any'], portion: o.portion || 100,
  unit: o.unit || null, prepMin: o.prep ?? 0, cost: o.cost ?? 2, aliases: o.aliases || [], source: 'своя',
});

export const FOODS = [
  // Крупы и гарниры (готовые)
  F('buckwheat', 'Гречка варёная', 110, 4.2, 1.1, 21.3, 2.7, { meals: ['lunch', 'dinner'], portion: 200, prep: 20, cost: 1, aliases: ['гречневая каша'] }),
  F('rice', 'Рис варёный', 130, 2.7, 0.3, 28, 0.4, { meals: ['lunch', 'dinner'], portion: 180, prep: 20, cost: 1 }),
  F('rice_brown', 'Рис бурый варёный', 112, 2.6, 0.9, 23, 1.8, { meals: ['lunch', 'dinner'], portion: 180, prep: 35, cost: 2 }),
  F('pasta', 'Макароны варёные', 158, 5.8, 0.9, 31, 1.8, { meals: ['lunch', 'dinner'], portion: 200, prep: 15, cost: 1, tags: ['gluten'], aliases: ['паста', 'спагетти'] }),
  F('bulgur', 'Булгур варёный', 83, 3.1, 0.2, 18.6, 4.5, { meals: ['lunch', 'dinner'], portion: 200, prep: 20, tags: ['gluten'] }),
  F('quinoa', 'Киноа варёная', 120, 4.4, 1.9, 21.3, 2.8, { meals: ['lunch', 'dinner'], portion: 180, prep: 20, cost: 3 }),
  F('potato', 'Картофель отварной', 82, 2, 0.4, 16.7, 1.4, { meals: ['lunch', 'dinner'], portion: 250, prep: 25, cost: 1, aliases: ['картошка'] }),
  F('mash', 'Картофельное пюре', 106, 2.2, 4, 15, 1.2, { meals: ['lunch', 'dinner'], portion: 220, prep: 30, cost: 1, tags: ['dairy', 'lactose'], nova: 3, aliases: ['пюре'] }),
  F('pearl_barley', 'Перловка варёная', 109, 3.1, 0.4, 22.2, 3.8, { meals: ['lunch', 'dinner'], portion: 200, prep: 40, cost: 1, tags: ['gluten'] }),
  F('millet', 'Пшено варёное', 119, 3.5, 1, 23, 1.3, { meals: ['breakfast', 'lunch', 'dinner'], portion: 200, prep: 25, cost: 1 }),
  F('oats', 'Овсяные хлопья (сухие)', 366, 12, 6.2, 61, 10, { meals: ['breakfast'], portion: 60, prep: 5, cost: 1, tags: ['gluten'], aliases: ['овсянка', 'геркулес'] }),
  F('bread_whole', 'Хлеб цельнозерновой', 245, 9, 3.3, 41, 7, { meals: ['any'], portion: 60, unit: { name: 'ломтик', g: 30 }, nova: 3, cost: 1, tags: ['gluten'] }),
  F('bread_white', 'Хлеб белый', 265, 8, 3.2, 49, 2.7, { meals: ['any'], portion: 60, unit: { name: 'ломтик', g: 30 }, nova: 4, cost: 1, tags: ['gluten'], aliases: ['батон'] }),
  F('lavash', 'Лаваш', 275, 9, 1.2, 56, 2, { meals: ['any'], portion: 60, nova: 3, cost: 1, tags: ['gluten'] }),

  // Мясо, птица, рыба, яйца
  F('chicken_breast', 'Куриная грудка готовая', 165, 31, 3.6, 0, 0, { meals: ['lunch', 'dinner'], portion: 150, prep: 25, cost: 2, tags: ['meat', 'poultry'], aliases: ['курица', 'филе курицы'] }),
  F('chicken_thigh', 'Куриное бедро без кожи, тушёное', 180, 24, 9, 0, 0, { meals: ['lunch', 'dinner'], portion: 150, prep: 35, cost: 2, tags: ['meat', 'poultry'] }),
  F('turkey', 'Филе индейки готовое', 150, 29, 3, 0, 0, { meals: ['lunch', 'dinner'], portion: 150, prep: 25, cost: 3, tags: ['meat', 'poultry'] }),
  F('beef_stew', 'Говядина тушёная', 200, 28, 10, 0, 0, { meals: ['lunch', 'dinner'], portion: 130, prep: 60, cost: 3, tags: ['meat', 'beef'] }),
  F('beef_mince', 'Фарш говяжий 15% жареный', 250, 26, 16, 0, 0, { meals: ['lunch', 'dinner'], portion: 120, prep: 15, cost: 2, tags: ['meat', 'beef'] }),
  F('pork_loin', 'Свиная вырезка запечённая', 175, 27, 7, 0, 0, { meals: ['lunch', 'dinner'], portion: 140, prep: 40, cost: 2, tags: ['meat', 'pork'] }),
  F('chicken_cutlet', 'Котлеты куриные домашние', 190, 18, 10, 7, 0.3, { meals: ['lunch', 'dinner'], portion: 150, unit: { name: 'шт', g: 75 }, prep: 30, cost: 2, nova: 3, tags: ['meat', 'poultry', 'gluten', 'egg'] }),
  F('pelmeni', 'Пельмени магазинные, варёные', 250, 11, 12, 25, 1, { meals: ['lunch', 'dinner'], portion: 250, prep: 10, cost: 2, nova: 4, tags: ['meat', 'pork', 'beef', 'gluten'] }),
  F('sausages', 'Сосиски', 260, 11, 23, 2, 0, { meals: ['any'], portion: 100, unit: { name: 'шт', g: 50 }, prep: 5, cost: 2, nova: 4, tags: ['meat', 'pork'] }),
  F('ham_chicken', 'Ветчина куриная', 120, 16, 5, 2, 0, { meals: ['breakfast', 'snack'], portion: 60, cost: 2, nova: 4, tags: ['meat', 'poultry'] }),
  F('salmon', 'Лосось запечённый', 206, 22, 13, 0, 0, { meals: ['lunch', 'dinner'], portion: 140, prep: 25, cost: 3, tags: ['fish'], aliases: ['сёмга', 'красная рыба'] }),
  F('cod', 'Треска запечённая', 90, 20, 1, 0, 0, { meals: ['lunch', 'dinner'], portion: 180, prep: 25, cost: 2, tags: ['fish'], aliases: ['минтай', 'белая рыба'] }),
  F('tuna_can', 'Тунец в собственном соку', 110, 24, 1, 0, 0, { meals: ['lunch', 'dinner', 'snack'], portion: 120, cost: 2, nova: 3, tags: ['fish'] }),
  F('shrimp', 'Креветки варёные', 99, 24, 0.3, 0.2, 0, { meals: ['lunch', 'dinner'], portion: 150, prep: 5, cost: 3, tags: ['seafood'] }),
  F('egg', 'Яйцо куриное', 155, 12.6, 10.6, 1.1, 0, { meals: ['breakfast', 'snack'], portion: 110, unit: { name: 'шт', g: 55 }, prep: 10, cost: 1, tags: ['egg'], aliases: ['яйца', 'варёное яйцо'] }),

  // Молочное
  F('cottage5', 'Творог 5%', 121, 17, 5, 1.8, 0, { meals: ['breakfast', 'snack'], portion: 180, cost: 2, tags: ['dairy', 'lactose'] }),
  F('cottage2', 'Творог 1.8%', 101, 18, 1.8, 3.3, 0, { meals: ['breakfast', 'snack'], portion: 180, cost: 2, tags: ['dairy', 'lactose'] }),
  F('cottage9', 'Творог 9%', 159, 16.7, 9, 2, 0, { meals: ['breakfast', 'snack'], portion: 180, cost: 2, tags: ['dairy', 'lactose'] }),
  F('greek_yog', 'Греческий йогурт 2%', 73, 10, 2, 4, 0, { meals: ['breakfast', 'snack'], portion: 170, cost: 2, tags: ['dairy', 'lactose'] }),
  F('yogurt', 'Йогурт натуральный 2.5%', 66, 4.5, 2.5, 6, 0, { meals: ['breakfast', 'snack'], portion: 200, cost: 1, tags: ['dairy', 'lactose'] }),
  F('kefir1', 'Кефир 1%', 40, 3, 1, 4, 0, { meals: ['snack', 'breakfast'], portion: 250, cost: 1, tags: ['dairy', 'lactose'] }),
  F('kefir25', 'Кефир 2.5%', 53, 2.9, 2.5, 4, 0, { meals: ['snack', 'breakfast'], portion: 250, cost: 1, tags: ['dairy', 'lactose'] }),
  F('milk', 'Молоко 2.5%', 52, 2.8, 2.5, 4.7, 0, { meals: ['any'], portion: 200, cost: 1, tags: ['dairy', 'lactose'] }),
  F('cheese', 'Сыр твёрдый', 360, 23, 29, 0, 0, { meals: ['breakfast', 'snack'], portion: 30, cost: 2, nova: 3, tags: ['dairy'] }),
  F('feta', 'Брынза', 260, 17, 21, 0.4, 0, { meals: ['any'], portion: 50, cost: 2, nova: 3, tags: ['dairy'] }),
  F('sour_cream', 'Сметана 15%', 160, 2.6, 15, 3.6, 0, { meals: ['any'], portion: 30, cost: 1, nova: 1, tags: ['dairy', 'lactose'] }),
  F('syrniki', 'Сырники', 220, 15, 9, 20, 0.5, { meals: ['breakfast'], portion: 180, unit: { name: 'шт', g: 60 }, prep: 25, cost: 2, nova: 3, tags: ['dairy', 'lactose', 'egg', 'gluten'] }),
  F('whey', 'Сывороточный протеин (порошок)', 380, 75, 6, 8, 0, { meals: ['snack'], portion: 30, cost: 3, nova: 4, tags: ['dairy'], aliases: ['протеин', 'протеиновый коктейль'] }),

  // Растительный белок
  F('tofu', 'Тофу', 76, 8, 4.8, 1.9, 0.3, { meals: ['lunch', 'dinner'], portion: 150, prep: 10, cost: 2, nova: 3, tags: ['soy'] }),
  F('chickpea', 'Нут варёный', 164, 8.9, 2.6, 27.4, 7.6, { meals: ['lunch', 'dinner'], portion: 180, prep: 15, cost: 1 }),
  F('lentil', 'Чечевица варёная', 116, 9, 0.4, 20, 7.9, { meals: ['lunch', 'dinner'], portion: 200, prep: 25, cost: 1 }),
  F('beans_can', 'Фасоль красная консервированная', 100, 7, 0.5, 17, 6, { meals: ['lunch', 'dinner'], portion: 180, cost: 1, nova: 3 }),

  // Овощи и фрукты
  F('veg_salad', 'Салат из огурцов и помидоров', 18, 0.9, 0.2, 3.5, 1.2, { meals: ['lunch', 'dinner'], portion: 200, prep: 5, cost: 1, aliases: ['овощной салат'] }),
  F('veg_salad_oil', 'Салат овощной с маслом', 70, 1, 5, 4, 1.2, { meals: ['lunch', 'dinner'], portion: 200, prep: 5, cost: 1 }),
  F('broccoli', 'Брокколи варёная', 35, 2.4, 0.4, 7.2, 3.3, { meals: ['lunch', 'dinner'], portion: 150, prep: 10, cost: 2 }),
  F('veg_baked', 'Овощи запечённые', 50, 1.5, 2, 6, 2.5, { meals: ['lunch', 'dinner'], portion: 200, prep: 30, cost: 1 }),
  F('cucumber', 'Огурец', 15, 0.7, 0.1, 3.6, 0.5, { meals: ['any'], portion: 120, cost: 1 }),
  F('tomato', 'Помидор', 18, 0.9, 0.2, 3.9, 1.2, { meals: ['any'], portion: 120, cost: 1 }),
  F('carrot', 'Морковь', 35, 0.8, 0.2, 8, 2.8, { meals: ['any'], portion: 100, cost: 1 }),
  F('cabbage', 'Капуста белокочанная', 27, 1.8, 0.1, 4.7, 2, { meals: ['any'], portion: 100, cost: 1 }),
  F('beet', 'Свёкла', 43, 1.6, 0.2, 9.6, 2.8, { meals: ['any'], portion: 100, cost: 1 }),
  F('apple', 'Яблоко', 52, 0.3, 0.2, 14, 2.4, { meals: ['snack', 'breakfast'], portion: 180, unit: { name: 'шт', g: 180 }, cost: 1 }),
  F('banana', 'Банан', 89, 1.1, 0.3, 23, 2.6, { meals: ['snack', 'breakfast'], portion: 120, unit: { name: 'шт', g: 120 }, cost: 1 }),
  F('orange', 'Апельсин', 47, 0.9, 0.1, 12, 2.4, { meals: ['snack'], portion: 180, unit: { name: 'шт', g: 180 }, cost: 1 }),
  F('pear', 'Груша', 57, 0.4, 0.1, 15, 3.1, { meals: ['snack'], portion: 170, unit: { name: 'шт', g: 170 }, cost: 1 }),
  F('tangerine', 'Мандарин', 53, 0.8, 0.3, 13.3, 1.8, { meals: ['snack'], portion: 160, unit: { name: 'шт', g: 80 }, cost: 1 }),
  F('berries', 'Ягоды замороженные', 45, 0.8, 0.4, 10, 3, { meals: ['breakfast', 'snack'], portion: 100, cost: 2 }),

  // Жиры, перекусы
  F('olive_oil', 'Масло оливковое', 884, 0, 100, 0, 0, { meals: ['any'], portion: 10, cost: 2, nova: 2 }),
  F('butter', 'Масло сливочное', 748, 0.5, 82.5, 0.8, 0, { meals: ['any'], portion: 10, cost: 2, nova: 2, tags: ['dairy'] }),
  F('walnut', 'Грецкие орехи', 654, 15, 65, 14, 6.7, { meals: ['snack'], portion: 30, cost: 2, tags: ['nuts'] }),
  F('almond', 'Миндаль', 579, 21, 50, 22, 12.5, { meals: ['snack'], portion: 30, cost: 3, tags: ['nuts'] }),
  F('peanut', 'Арахис', 567, 26, 49, 16, 8.5, { meals: ['snack'], portion: 30, cost: 1, tags: ['peanut'] }),
  F('peanut_butter', 'Арахисовая паста', 588, 25, 50, 20, 6, { meals: ['breakfast', 'snack'], portion: 20, cost: 2, nova: 3, tags: ['peanut'] }),
  F('seeds', 'Семечки подсолнечника', 584, 21, 51, 20, 8.6, { meals: ['snack'], portion: 30, cost: 1 }),
  F('avocado', 'Авокадо', 160, 2, 15, 9, 6.7, { meals: ['any'], portion: 100, unit: { name: 'шт', g: 140 }, cost: 3 }),
  F('dark_choc', 'Шоколад горький 70%', 598, 7.8, 43, 46, 11, { meals: ['snack'], portion: 20, cost: 2, nova: 4 }),
  F('protein_bar', 'Протеиновый батончик', 350, 30, 10, 35, 5, { meals: ['snack'], portion: 50, unit: { name: 'шт', g: 50 }, cost: 3, nova: 4, tags: ['dairy', 'soy'] }),
  F('granola', 'Гранола', 450, 10, 18, 62, 6, { meals: ['breakfast'], portion: 50, cost: 2, nova: 4, tags: ['gluten', 'nuts'], aliases: ['мюсли'] }),
  F('hummus', 'Хумус', 166, 7.9, 9.6, 14.3, 6, { meals: ['any'], portion: 60, cost: 2, nova: 3, tags: ['sesame'] }),
  F('dried_apricot', 'Курага', 241, 3.4, 0.5, 62.6, 7.3, { meals: ['snack'], portion: 30, cost: 2 }),
  F('honey', 'Мёд', 304, 0.3, 0, 82, 0, { meals: ['any'], portion: 15, cost: 2, tags: ['honey'] }),
  F('water', 'Вода', 0, 0, 0, 0, 0, { meals: ['any'], portion: 250, cost: 0 }),
];

// Блюда: состав [id продукта, г]; КБЖУ на 100 г считается из состава
const D = (id, name, comp, o = {}) => ({ id: 'd:' + id, kind: 'dish', name, comp, meals: o.meals || ['lunch', 'dinner'], portion: o.portion, prepMin: o.prep ?? 20, cost: o.cost ?? 2, aliases: o.aliases || [], source: 'своя' });

const DISHES_RAW = [
  D('buckwheat_chicken', 'Гречка с курицей', [['buckwheat', 200], ['chicken_breast', 120], ['olive_oil', 5]], { prep: 25, cost: 1 }),
  D('rice_salmon', 'Рис с лососем и брокколи', [['rice', 150], ['salmon', 120], ['broccoli', 100]], { prep: 30, cost: 3 }),
  D('pasta_chicken', 'Паста с курицей и сыром', [['pasta', 200], ['chicken_breast', 120], ['cheese', 15], ['olive_oil', 10]], { prep: 25 }),
  D('plov', 'Плов с курицей', [['rice', 180], ['chicken_thigh', 120], ['carrot', 50], ['olive_oil', 12]], { prep: 50 }),
  D('borsch', 'Борщ с говядиной', [['beef_stew', 50], ['potato', 80], ['cabbage', 70], ['beet', 60], ['carrot', 20], ['olive_oil', 5], ['water', 215]], { prep: 60, portion: 400 }),
  D('oat_banana', 'Овсянка с бананом на молоке', [['oats', 60], ['milk', 150], ['banana', 100]], { meals: ['breakfast'], prep: 10, cost: 1 }),
  D('omelet_veg', 'Омлет с помидором', [['egg', 165], ['milk', 50], ['tomato', 80], ['olive_oil', 5]], { meals: ['breakfast', 'dinner'], prep: 15, cost: 1 }),
  D('cottage_berries', 'Творог с ягодами и мёдом', [['cottage5', 180], ['berries', 80], ['honey', 10]], { meals: ['breakfast', 'snack'], prep: 2 }),
  D('tuna_salad', 'Салат с тунцом и яйцом', [['tuna_can', 120], ['cucumber', 100], ['tomato', 100], ['egg', 55], ['olive_oil', 10]], { prep: 15 }),
  D('chicken_soup', 'Куриный суп с лапшой', [['chicken_breast', 70], ['pasta', 60], ['potato', 60], ['carrot', 20], ['water', 190]], { prep: 45, portion: 400, cost: 1 }),
  D('lentil_soup', 'Чечевичный суп', [['lentil', 130], ['potato', 50], ['carrot', 30], ['olive_oil', 5], ['water', 185]], { prep: 35, portion: 400, cost: 1 }),
  D('turkey_bulgur', 'Индейка с булгуром и овощами', [['turkey', 130], ['bulgur', 180], ['veg_baked', 100]], { prep: 35, cost: 3 }),
  D('beef_potato', 'Говядина с картофелем', [['beef_stew', 120], ['potato', 220], ['olive_oil', 5]], { prep: 60 }),
  D('tofu_rice', 'Тофу с рисом и овощами', [['tofu', 150], ['rice', 150], ['veg_baked', 100], ['olive_oil', 8]], { prep: 25 }),
  D('chickpea_veg', 'Нут с овощами', [['chickpea', 180], ['veg_baked', 150], ['olive_oil', 8]], { prep: 20, cost: 1 }),
  D('cheese_sandwich', 'Бутерброды с сыром', [['bread_whole', 60], ['cheese', 30]], { meals: ['breakfast', 'snack'], prep: 3, cost: 1 }),
  D('egg_sandwich', 'Бутерброды с яйцом и огурцом', [['bread_whole', 60], ['egg', 110], ['cucumber', 50]], { meals: ['breakfast'], prep: 12, cost: 1 }),
  D('syrniki_sc', 'Сырники со сметаной', [['syrniki', 180], ['sour_cream', 30]], { meals: ['breakfast'], prep: 25 }),
  D('cod_potato', 'Треска с картофелем и салатом', [['cod', 160], ['potato', 200], ['veg_salad_oil', 150]], { prep: 35 }),
  D('greek_granola', 'Йогурт с гранолой', [['greek_yog', 170], ['granola', 40]], { meals: ['breakfast', 'snack'], prep: 2 }),
  D('pelmeni_sc', 'Пельмени со сметаной', [['pelmeni', 250], ['sour_cream', 30]], { prep: 12, cost: 2 }),
  D('cutlet_mash', 'Котлеты с пюре', [['chicken_cutlet', 150], ['mash', 200]], { prep: 35 }),
];

export const FOODS_BY_ID = Object.fromEntries(FOODS.map((f) => [f.id, f]));

// Блюдо → КБЖУ на 100 г и объединённые теги
export function resolveDish(d, foodsById = FOODS_BY_ID) {
  const comp = d.comp.map(([fid, g]) => [fid.includes(':') ? fid : 'f:' + fid, g]);
  let g = 0;
  const t = { kcal: 0, p: 0, f: 0, c: 0, fiber: 0 };
  const tags = new Set();
  let nova = 1;
  for (const [fid, grams] of comp) {
    const food = foodsById[fid];
    if (!food) continue;
    g += grams;
    for (const k of Object.keys(t)) t[k] += (food[k] || 0) * grams / 100;
    food.tags.forEach((x) => tags.add(x));
    nova = Math.max(nova, food.nova || 1);
  }
  const per = (x) => Math.round((x / g) * 1000) / 10;
  return {
    ...d, comp,
    kcal: Math.round((t.kcal / g) * 100), p: per(t.p), f: per(t.f), c: per(t.c), fiber: per(t.fiber),
    tags: [...tags], nova, portion: d.portion || Math.round(g), unit: null,
  };
}

export const DISHES = DISHES_RAW.map((d) => resolveDish(d));
export const CATALOG = [...FOODS.filter((f) => f.id !== 'f:water'), ...DISHES];
export const CATALOG_BY_ID = Object.fromEntries([...FOODS, ...DISHES].map((x) => [x.id, x]));

export const DIET_EXCLUSIONS = {
  vegetarian: { label: 'Вегетарианство', tags: ['meat', 'poultry', 'fish', 'seafood', 'pork', 'beef'] },
  vegan: { label: 'Веганство', tags: ['meat', 'poultry', 'fish', 'seafood', 'pork', 'beef', 'dairy', 'lactose', 'egg', 'honey'] },
  pescatarian: { label: 'Без мяса, рыба можно', tags: ['meat', 'poultry', 'pork', 'beef'] },
  halal: { label: 'Халяль (без свинины)', tags: ['pork'] },
  no_fish: { label: 'Не ем рыбу и морепродукты', tags: ['fish', 'seafood'] },
  no_pork: { label: 'Без свинины', tags: ['pork'] },
  no_beef: { label: 'Без говядины', tags: ['beef'] },
};

export const ALLERGENS = {
  lactose: 'Лактоза', dairy: 'Молочный белок', gluten: 'Глютен', egg: 'Яйца', nuts: 'Орехи',
  peanut: 'Арахис', fish: 'Рыба', seafood: 'Морепродукты', soy: 'Соя', sesame: 'Кунжут',
};

export function excludedTags(profile) {
  const s = new Set(profile?.allergies || []);
  for (const ex of profile?.dietExclusions || []) (DIET_EXCLUSIONS[ex]?.tags || []).forEach((t) => s.add(t));
  return s;
}

export function allowedByRestrictions(item, excluded) {
  return !(item.tags || []).some((t) => excluded.has(t));
}

const norm = (s) => s.toLowerCase().replace(/ё/g, 'е').trim();

// Разбор без LLM: части текста через запятую/«и»/«с» → поиск по базе; «200 г» и «2 шт» понимает
// \b в JS не работает с кириллицей — границы слова через пробелы
const FILLER = /(^|\s)(утром|днём|днем|вечером|ночью|на|завтрак|обед|ужин|перекус|съел[аи]?|ел[аи]?|было|была|был|обычно|потом|ещё|еще|немного|чуть)(?=\s|$)/gi;

export function keywordParse(text, items = CATALOG) {
  const parts = text.split(/[,;\n.]|\sи\s|\sплюс\s|\sпотом\s/i).map((s) => s.trim()).filter((s) => s.length > 2);
  const out = [];
  for (const p of parts) {
    const grams = Number((p.match(/(\d+)\s*(г|гр|грамм)/i) || [])[1]) || null;
    const pieces = Number((p.match(/(\d+)\s*(шт|штук|яйц)/i) || [])[1]) || null;
    const words = p.replace(FILLER, ' ').replace(/\d+\s*(г|гр|грамм|шт|штук)\.?/gi, ' ').replace(/[—–-]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!words) continue;
    const stem = (w) => w.slice(0, Math.max(4, w.length - 2));
    const long = words.split(' ').filter((w) => w.length > 3);
    const hit = searchCatalog(words, items, 1)[0]
      || searchCatalog(long.map(stem).join(' '), items, 1)[0]
      || searchCatalog(long.slice(0, 1).map(stem).join(' '), items, 1)[0];
    if (!hit) continue;
    const g = grams || (pieces && hit.unit ? pieces * hit.unit.g : null) || hit.portion;
    out.push({ name: p, matchId: hit.id, grams: g, confidence: grams ? 0.6 : 0.5 });
  }
  return out;
}

export function searchCatalog(query, items = CATALOG, limit = 20) {
  const q = norm(query);
  if (!q) return [];
  const words = q.split(/\s+/);
  const scored = [];
  for (const it of items) {
    const hay = norm([it.name, ...(it.aliases || [])].join(' | '));
    if (!words.every((w) => hay.includes(w))) continue;
    const score = (norm(it.name).startsWith(q) ? 0 : 1) + (hay.indexOf(words[0]) / 100);
    scored.push([score, it]);
  }
  return scored.sort((a, b) => a[0] - b[0]).slice(0, limit).map((x) => x[1]);
}
