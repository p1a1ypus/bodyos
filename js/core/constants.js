// Пороги и стартовые коэффициенты. Пороги SAFETY не меняются ни одной настройкой (ТЗ, раздел 8).

export const SAFETY = Object.freeze({
  floorKcal: Object.freeze({ f: 1200, m: 1500 }),
  maxDeficitRate: 1.0, // % массы тела в неделю
  maxSurplusRate: 0.5,
  medMaxDeficitRate: 0.5, // при диагнозах из раздела 4
  medMaxSurplusRate: 0.25,
  rapidLossRate: 1.5, // потеря > 1.5 %/нед две недели подряд → поддержание
  minBmi: 18.5,
  minAge: 18,
  lowReadiness: 2,
  lowReadinessDays: 5,
});

export const KCAL_PER_KG = 7700;

export const MODEL = Object.freeze({
  trendAlpha: 0.1, // EMA для отображаемого тренда веса
  minWeighInsPerWeek: 3,
  fullDayMinEntries: 3,
  fullDayMinKcal: 800,
  minFullDaysPerWeek: 4,
  calibrationWindowDays: 28, // окно для оценки изменения веса при калибровке
  calibrationMinSpanDays: 13, // меньше двух недель взвешиваний наклон слишком шумный
  kLowConfidence: 0.3,
  kHighConfidence: 0.5,
  confidenceThreshold: 0.5,
  confidenceStart: 0.3,
  confidenceUp: 0.1,
  confidenceDown: 0.2,
  proteinMin: 1.6, // г/кг
  proteinMax: 2.2,
  proteinTarget: 1.8,
  fatMin: 0.6,
  fatTarget: 0.8,
});

export const COACH = Object.freeze({
  sleepMinHours: 6.5,
  progressStepKcal: 100,
  slowWeeksToAdjust: 2,
  fastFactor: 1.5,
  gainNoStrengthWeeks: 3,
  volumeMin: 6,
  volumeMax: 25,
  deloadSoreness: 4,
  deloadDropWeeks: 2,
  plateauWeeks: 3,
  plateauRate: 0.1, // |%/нед| ниже — «нет тренда»
  plateauBudgetStep: 150,
  dietBreakAfterWeeks: 10,
  dietBreakWeeks: 2,
  maintenanceBeforeNextPhase: 2,
  poolReplaceDemote: 3,
  poolOutsideSuggest: 2,
  poolWindowDays: 14,
});

export const STACK = Object.freeze({
  minItems: 3,
  maxItems: 5,
  closeBelowKcal: 150,
  tolerance: 0.1,
  maxConsecutiveDays: 2,
  repeatRuleMinPool: 10,
});

// Слова, которых нет ни в интерфейсе, ни в промптах (раздел 8). Тест lexicon сканирует все файлы, кроме этого.
export const FORBIDDEN_WORDS = ['читмил', 'сжечь', 'сжига', 'сорвал', 'срыв', 'плохо'];

export const CONFIDENCE = Object.freeze({
  plan: 0.9, // «съел как в плане»
  barcode: 0.9,
  search: 0.85,
  llm: 0.75,
  approx: 0.4, // «примерно N ккал»
});
