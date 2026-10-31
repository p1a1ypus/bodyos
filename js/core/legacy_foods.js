// Старая встроенная база (до CoFID). Нужна только для данных, записанных раньше: пул, планы дней, избранное.
// LEGACY_MAP — старый id → код CoFID; позиции без пары остаются как «старая база», в поиск не попадают.

export const LEGACY_SOURCE = 'старая база Body OS (примерные значения)';

export const LEGACY_MAP = {
  'f:buckwheat': 'calc:11-006', 'f:rice': '11-862', 'f:rice_brown': '11-869', 'f:pasta': '11-1129', 'f:bulgur': 'calc:11-904',
  'f:quinoa': 'calc:14-843', 'f:potato': '13-620', 'f:mash': '13-553', 'f:pearl_barley': '11-003', 'f:oats': '11-788',
  'f:bread_whole': '11-981', 'f:bread_white': '11-1145', 'f:chicken_breast': '18-323', 'f:chicken_thigh': '18-334',
  'f:turkey': '18-356', 'f:beef_stew': '18-080', 'f:beef_mince': '18-470', 'f:pork_loin': '18-531', 'f:sausages': '19-495',
  'f:salmon': '16-359', 'f:cod': '16-373', 'f:tuna_can': '16-416', 'f:shrimp': '16-245', 'f:egg': '12-940',
  'f:yogurt': '12-184', 'f:milk': '12-313', 'f:cheese': '12-604', 'f:feta': '12-525', 'f:tofu': '13-570',
  'f:chickpea': '13-662', 'f:lentil': '13-661', 'f:beans_can': '13-660', 'f:broccoli': '13-503', 'f:cucumber': '13-523',
  'f:tomato': '13-517', 'f:carrot': '13-496', 'f:cabbage': '13-509', 'f:beet': '13-164', 'f:apple': '14-319',
  'f:banana': '14-318', 'f:orange': '14-327', 'f:pear': '14-321', 'f:tangerine': '14-326', 'f:olive_oil': '17-038',
  'f:butter': '17-661', 'f:walnut': '14-879', 'f:almond': '14-896', 'f:peanut': '14-877', 'f:peanut_butter': '14-892',
  'f:seeds': '14-845', 'f:avocado': '14-386', 'f:dark_choc': '17-491', 'f:granola': '11-939', 'f:hummus': '13-556',
  'f:dried_apricot': '14-031', 'f:honey': '17-050', 'f:water': 'x:water',
};

const F = (id, name, kcal, p, f, c, fiber, o = {}) => ({
  id: 'f:' + id, kind: 'food', name, kcal, p, f, c, fiber,
  nova: o.nova ?? 1, tags: o.tags || [], meals: o.meals || ['any'], portion: o.portion || 100,
  unit: o.unit || null, prepMin: o.prep ?? 0, cost: o.cost ?? 2, aliases: [], source: LEGACY_SOURCE, legacy: true, ready: true,
});

export const LEGACY_FOODS = [
  F('millet', 'Пшено варёное', 119, 3.5, 1, 23, 1.3, { meals: ['breakfast', 'lunch', 'dinner'], portion: 200, prep: 25, cost: 1 }),
  F('lavash', 'Лаваш', 275, 9, 1.2, 56, 2, { portion: 60, nova: 3, cost: 1, tags: ['gluten'] }),
  F('chicken_cutlet', 'Котлеты куриные домашние', 190, 18, 10, 7, 0.3, { meals: ['lunch', 'dinner'], portion: 150, unit: { name: 'шт', g: 75 }, prep: 30, nova: 3, tags: ['meat', 'poultry', 'gluten', 'egg'] }),
  F('pelmeni', 'Пельмени магазинные, варёные', 250, 11, 12, 25, 1, { meals: ['lunch', 'dinner'], portion: 250, prep: 10, nova: 4, tags: ['meat', 'pork', 'beef', 'gluten'] }),
  F('ham_chicken', 'Ветчина куриная', 120, 16, 5, 2, 0, { meals: ['breakfast', 'snack'], portion: 60, nova: 4, tags: ['meat', 'poultry'] }),
  F('cottage5', 'Творог 5%', 121, 17, 5, 1.8, 0, { meals: ['breakfast', 'snack'], portion: 180, tags: ['dairy', 'lactose'] }),
  F('cottage2', 'Творог 1.8%', 101, 18, 1.8, 3.3, 0, { meals: ['breakfast', 'snack'], portion: 180, tags: ['dairy', 'lactose'] }),
  F('cottage9', 'Творог 9%', 159, 16.7, 9, 2, 0, { meals: ['breakfast', 'snack'], portion: 180, tags: ['dairy', 'lactose'] }),
  F('greek_yog', 'Греческий йогурт 2%', 73, 10, 2, 4, 0, { meals: ['breakfast', 'snack'], portion: 170, tags: ['dairy', 'lactose'] }),
  F('kefir1', 'Кефир 1%', 40, 3, 1, 4, 0, { meals: ['snack', 'breakfast'], portion: 250, cost: 1, tags: ['dairy', 'lactose'] }),
  F('kefir25', 'Кефир 2.5%', 53, 2.9, 2.5, 4, 0, { meals: ['snack', 'breakfast'], portion: 250, cost: 1, tags: ['dairy', 'lactose'] }),
  F('sour_cream', 'Сметана 15%', 160, 2.6, 15, 3.6, 0, { portion: 30, cost: 1, tags: ['dairy', 'lactose'] }),
  F('syrniki', 'Сырники', 220, 15, 9, 20, 0.5, { meals: ['breakfast'], portion: 180, unit: { name: 'шт', g: 60 }, prep: 25, nova: 3, tags: ['dairy', 'lactose', 'egg', 'gluten'] }),
  F('whey', 'Сывороточный протеин (порошок)', 380, 75, 6, 8, 0, { meals: ['snack'], portion: 30, cost: 3, nova: 4, tags: ['dairy'] }),
  F('veg_salad', 'Салат из огурцов и помидоров', 18, 0.9, 0.2, 3.5, 1.2, { meals: ['lunch', 'dinner'], portion: 200, prep: 5, cost: 1 }),
  F('veg_salad_oil', 'Салат овощной с маслом', 70, 1, 5, 4, 1.2, { meals: ['lunch', 'dinner'], portion: 200, prep: 5, cost: 1 }),
  F('veg_baked', 'Овощи запечённые', 50, 1.5, 2, 6, 2.5, { meals: ['lunch', 'dinner'], portion: 200, prep: 30, cost: 1 }),
  F('berries', 'Ягоды замороженные', 45, 0.8, 0.4, 10, 3, { meals: ['breakfast', 'snack'], portion: 100 }),
  F('protein_bar', 'Протеиновый батончик', 350, 30, 10, 35, 5, { meals: ['snack'], portion: 50, unit: { name: 'шт', g: 50 }, cost: 3, nova: 4, tags: ['dairy', 'soy'] }),
  // только для расчёта старых блюд ниже
  F('mash', 'Картофельное пюре', 106, 2.2, 4, 15, 1.2, { meals: ['lunch', 'dinner'], portion: 220, nova: 3, tags: ['dairy', 'lactose'] }),
];

// Старые блюда без пары в новой базе (состав — старые продукты)
export const LEGACY_DISHES = [
  { id: 'd:syrniki_sc', name: 'Сырники со сметаной', comp: [['f:syrniki', 180], ['f:sour_cream', 30]], meals: ['breakfast'], prepMin: 25 },
  { id: 'd:pelmeni_sc', name: 'Пельмени со сметаной', comp: [['f:pelmeni', 250], ['f:sour_cream', 30]], meals: ['lunch', 'dinner'], prepMin: 12 },
  { id: 'd:cutlet_mash', name: 'Котлеты с пюре', comp: [['f:chicken_cutlet', 150], ['f:mash', 200]], meals: ['lunch', 'dinner'], prepMin: 35 },
].map((d) => ({ ...d, kind: 'dish', cost: 2, aliases: [], source: LEGACY_SOURCE, legacy: true }));

export const canonicalId = (id) => LEGACY_MAP[id] || id;
