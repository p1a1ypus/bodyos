// Справочник упражнений и шаблоны программ.
// muscles — доли для дробного объёма; equip — что нужно (любой из вариантов набора); contra — травмы, при которых не предлагаем.

export const MUSCLES = {
  chest: 'Грудь',
  back: 'Спина',
  shoulders: 'Плечи',
  biceps: 'Бицепс',
  triceps: 'Трицепс',
  quads: 'Квадрицепс',
  hamstrings: 'Бицепс бедра',
  glutes: 'Ягодицы',
  calves: 'Икры',
  core: 'Кор',
};

export const EQUIPMENT_PROFILES = {
  gym: { label: 'Зал', has: ['barbell', 'dumbbell', 'machine', 'cable', 'bench', 'bar', 'bodyweight'] },
  home: { label: 'Дом с гантелями', has: ['dumbbell', 'bench', 'bodyweight'] },
  bar: { label: 'Турники и брусья', has: ['bar', 'bodyweight'] },
  none: { label: 'Ничего', has: ['bodyweight'] },
};

export const INJURIES = {
  shoulder: 'Плечо',
  knee: 'Колено',
  lower_back: 'Поясница',
  elbow: 'Локоть',
  wrist: 'Запястье',
};

const ex = (id, name, pattern, muscles, equip, increment, contra = []) => ({
  id, name, pattern, muscles, equip, increment, contra, loaded: increment > 0,
});

// equip: массив требований, каждое — строка (нужно это) — все должны быть в наборе
export const EXERCISES = [
  ex('back_squat', 'Присед со штангой', 'squat', { quads: 1, glutes: 0.5, core: 0.25 }, ['barbell'], 5, ['knee', 'lower_back']),
  ex('leg_press', 'Жим ногами', 'squat', { quads: 1, glutes: 0.5 }, ['machine'], 5, ['knee']),
  ex('goblet_squat', 'Гоблет-присед', 'squat', { quads: 1, glutes: 0.5 }, ['dumbbell'], 2, ['knee']),
  ex('bw_squat', 'Присед с весом тела', 'squat', { quads: 1, glutes: 0.5 }, ['bodyweight'], 0, ['knee']),
  ex('box_squat_bw', 'Присед на опору', 'squat', { quads: 1, glutes: 0.5 }, ['bodyweight'], 0, []),

  ex('rdl', 'Румынская тяга со штангой', 'hinge', { hamstrings: 1, glutes: 1, back: 0.25 }, ['barbell'], 5, ['lower_back']),
  ex('db_rdl', 'Румынская тяга с гантелями', 'hinge', { hamstrings: 1, glutes: 1 }, ['dumbbell'], 2, ['lower_back']),
  ex('hip_thrust', 'Ягодичный мост со штангой', 'hinge', { glutes: 1, hamstrings: 0.5 }, ['barbell', 'bench'], 5, []),
  ex('leg_curl', 'Сгибание ног в тренажёре', 'hinge', { hamstrings: 1 }, ['machine'], 5, ['knee']),
  ex('glute_bridge', 'Ягодичный мост', 'hinge', { glutes: 1, hamstrings: 0.5 }, ['bodyweight'], 0, []),
  ex('single_leg_bridge', 'Мост на одной ноге', 'hinge', { glutes: 1, hamstrings: 0.5 }, ['bodyweight'], 0, []),

  ex('bench_press', 'Жим штанги лёжа', 'h_push', { chest: 1, triceps: 0.5, shoulders: 0.5 }, ['barbell', 'bench'], 2.5, ['shoulder', 'wrist']),
  ex('chest_press', 'Жим в тренажёре', 'h_push', { chest: 1, triceps: 0.5, shoulders: 0.5 }, ['machine'], 5, ['shoulder']),
  ex('db_bench', 'Жим гантелей лёжа', 'h_push', { chest: 1, triceps: 0.5, shoulders: 0.5 }, ['dumbbell', 'bench'], 2, ['shoulder']),
  ex('db_floor_press', 'Жим гантелей с пола', 'h_push', { chest: 1, triceps: 0.5, shoulders: 0.25 }, ['dumbbell'], 2, []),
  ex('pushup', 'Отжимания', 'h_push', { chest: 1, triceps: 0.5, shoulders: 0.5 }, ['bodyweight'], 0, ['wrist']),
  ex('incline_pushup', 'Отжимания от опоры', 'h_push', { chest: 1, triceps: 0.5, shoulders: 0.5 }, ['bodyweight'], 0, []),
  ex('dips', 'Отжимания на брусьях', 'h_push', { chest: 0.5, triceps: 1, shoulders: 0.5 }, ['bar'], 0, ['shoulder', 'elbow']),

  ex('ohp', 'Жим штанги стоя', 'v_push', { shoulders: 1, triceps: 0.5 }, ['barbell'], 2.5, ['shoulder', 'lower_back']),
  ex('db_ohp', 'Жим гантелей сидя', 'v_push', { shoulders: 1, triceps: 0.5 }, ['dumbbell'], 2, ['shoulder']),
  ex('pike_pushup', 'Отжимания пайк', 'v_push', { shoulders: 1, triceps: 0.5 }, ['bodyweight'], 0, ['shoulder', 'wrist']),
  ex('lateral_raise', 'Махи гантелями в стороны', 'v_push', { shoulders: 1 }, ['dumbbell'], 1, []),

  ex('barbell_row', 'Тяга штанги в наклоне', 'h_pull', { back: 1, biceps: 0.5, shoulders: 0.25 }, ['barbell'], 2.5, ['lower_back']),
  ex('cable_row', 'Тяга горизонтального блока', 'h_pull', { back: 1, biceps: 0.5 }, ['cable'], 5, []),
  ex('db_row', 'Тяга гантели в наклоне', 'h_pull', { back: 1, biceps: 0.5 }, ['dumbbell'], 2, []),
  ex('inverted_row', 'Австралийские подтягивания', 'h_pull', { back: 1, biceps: 0.5 }, ['bar'], 0, []),
  ex('prone_y_raise', 'Подъёмы рук лёжа на животе', 'h_pull', { back: 0.5, shoulders: 0.5 }, ['bodyweight'], 0, []),

  ex('lat_pulldown', 'Тяга верхнего блока', 'v_pull', { back: 1, biceps: 0.5 }, ['cable'], 5, []),
  ex('pullup', 'Подтягивания', 'v_pull', { back: 1, biceps: 0.5 }, ['bar'], 0, ['shoulder', 'elbow']),
  ex('negative_pullup', 'Негативные подтягивания', 'v_pull', { back: 1, biceps: 0.5 }, ['bar'], 0, []),
  ex('db_pullover', 'Пуловер с гантелью', 'v_pull', { back: 0.5, chest: 0.5 }, ['dumbbell', 'bench'], 2, ['shoulder']),

  ex('walking_lunge', 'Выпады с гантелями', 'lunge', { quads: 1, glutes: 0.5 }, ['dumbbell'], 2, ['knee']),
  ex('split_squat', 'Болгарские выпады', 'lunge', { quads: 1, glutes: 0.5 }, ['bodyweight'], 0, ['knee']),
  ex('step_up', 'Зашагивания на опору', 'lunge', { quads: 1, glutes: 0.5 }, ['bodyweight'], 0, []),

  ex('db_curl', 'Сгибания с гантелями', 'arms_bi', { biceps: 1 }, ['dumbbell'], 1, ['elbow']),
  ex('barbell_curl', 'Сгибания со штангой', 'arms_bi', { biceps: 1 }, ['barbell'], 2.5, ['elbow', 'wrist']),
  ex('chinup', 'Подтягивания обратным хватом', 'arms_bi', { biceps: 1, back: 0.5 }, ['bar'], 0, ['elbow']),
  ex('pushdown', 'Разгибания на блоке', 'arms_tri', { triceps: 1 }, ['cable'], 2.5, ['elbow']),
  ex('db_overhead_ext', 'Французский жим с гантелью', 'arms_tri', { triceps: 1 }, ['dumbbell'], 1, ['elbow', 'shoulder']),
  ex('diamond_pushup', 'Отжимания узким упором', 'arms_tri', { triceps: 1, chest: 0.5 }, ['bodyweight'], 0, ['wrist', 'elbow']),
  ex('bench_dip', 'Обратные отжимания от опоры', 'arms_tri', { triceps: 1 }, ['bodyweight'], 0, ['shoulder']),

  ex('calf_raise_machine', 'Подъёмы на носки в тренажёре', 'calves', { calves: 1 }, ['machine'], 5, []),
  ex('calf_raise', 'Подъёмы на носки', 'calves', { calves: 1 }, ['bodyweight'], 0, []),

  ex('hanging_knee_raise', 'Подъёмы коленей в висе', 'core', { core: 1 }, ['bar'], 0, ['shoulder']),
  ex('dead_bug', 'Мёртвый жук', 'core', { core: 1 }, ['bodyweight'], 0, []),
  ex('crunch', 'Скручивания', 'core', { core: 1 }, ['bodyweight'], 0, ['lower_back']),
];

export const EXERCISES_BY_ID = Object.fromEntries(EXERCISES.map((e) => [e.id, e]));

export const PATTERN_LABELS = {
  squat: 'Присед', hinge: 'Наклон / таз', h_push: 'Жим горизонтальный', v_push: 'Жим вертикальный',
  h_pull: 'Тяга горизонтальная', v_pull: 'Тяга вертикальная', lunge: 'Выпады', arms_bi: 'Бицепс',
  arms_tri: 'Трицепс', calves: 'Икры', core: 'Кор',
};

const s = (pattern, sets, repMin, repMax) => ({ pattern, sets, repMin, repMax });

// Шаблоны под дни в неделю; слот — паттерн движения, упражнение подбирается под оборудование и травмы
export const PROGRAM_TEMPLATES = {
  2: {
    name: 'Всё тело A/B, 2 дня',
    days: [
      { name: 'День A', slots: [s('squat', 3, 6, 10), s('h_push', 3, 6, 10), s('h_pull', 3, 8, 12), s('hinge', 2, 8, 12), s('v_pull', 2, 8, 12), s('core', 2, 10, 15)] },
      { name: 'День B', slots: [s('hinge', 3, 6, 10), s('v_push', 3, 6, 10), s('v_pull', 3, 6, 10), s('lunge', 2, 8, 12), s('h_push', 2, 8, 12), s('arms_bi', 2, 10, 15)] },
    ],
  },
  3: {
    name: 'Всё тело A/B/C, 3 дня',
    days: [
      { name: 'День A', slots: [s('squat', 3, 6, 10), s('h_push', 3, 6, 10), s('h_pull', 3, 8, 12), s('arms_bi', 2, 10, 15), s('calves', 2, 10, 15), s('core', 2, 10, 15)] },
      { name: 'День B', slots: [s('hinge', 3, 6, 10), s('v_push', 3, 6, 10), s('v_pull', 3, 6, 10), s('arms_tri', 2, 10, 15), s('lunge', 2, 8, 12), s('core', 2, 10, 15)] },
      { name: 'День C', slots: [s('lunge', 3, 8, 12), s('h_push', 3, 8, 12), s('h_pull', 3, 8, 12), s('hinge', 2, 8, 12), s('v_push', 2, 10, 15), s('calves', 2, 10, 15)] },
    ],
  },
  4: {
    name: 'Верх / низ, 4 дня',
    days: [
      { name: 'Верх 1', slots: [s('h_push', 3, 6, 10), s('h_pull', 3, 6, 10), s('v_push', 3, 8, 12), s('v_pull', 3, 8, 12), s('arms_bi', 2, 10, 15), s('arms_tri', 2, 10, 15)] },
      { name: 'Низ 1', slots: [s('squat', 3, 6, 10), s('hinge', 3, 8, 12), s('lunge', 2, 8, 12), s('calves', 3, 10, 15), s('core', 2, 10, 15)] },
      { name: 'Верх 2', slots: [s('v_push', 3, 6, 10), s('v_pull', 3, 6, 10), s('h_push', 3, 8, 12), s('h_pull', 3, 8, 12), s('arms_tri', 2, 10, 15), s('arms_bi', 2, 10, 15)] },
      { name: 'Низ 2', slots: [s('hinge', 3, 6, 10), s('squat', 3, 8, 12), s('lunge', 2, 10, 15), s('calves', 3, 10, 15), s('core', 2, 10, 15)] },
    ],
  },
};
