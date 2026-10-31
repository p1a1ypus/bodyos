"""CSV базы продуктов → data/foods_seed.json + проверки целостности (FOOD_DB_INTEGRATION.md, раздел 6, тесты 1–5).

Запуск из корня проекта:  python tools/convert_foods.py
Источник: data/source/body_os_foods.csv (CoFID 2021, OGL v3.0). Пустая ячейка → null, числа → числа.
Если проверка не проходит, JSON не пишется и скрипт выходит с кодом 1.
"""
import csv
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'data' / 'source' / 'body_os_foods.csv'
OUT = ROOT / 'data' / 'foods_seed.json'

TEXT = {
    'cofid_code', 'name_ru', 'name_en', 'category_ru', 'state_ru', 'cooking_method_ru', 'fibre_method',
    'yield_basis', 'yield_raw_code', 'yield_note', 'cofid_group', 'source', 'source_version', 'source_license', 'source_ref',
}
INT = {'id', 'nova_guess'}
EXPECTED_ROWS = 721


def value(col, raw):
    raw = raw.strip()
    if raw == '':
        return None
    if col in TEXT:
        return raw
    if col in INT:
        return int(float(raw))
    x = float(raw)
    # убрать хвосты двоичной арифметики (1.7999999999999998 → 1.8), значения источника не трогаем
    x = round(x, 4)
    return int(x) if x == int(x) and abs(x) < 1e15 else x


def load():
    with SRC.open(encoding='utf-8') as f:
        reader = csv.DictReader(f)
        rows = [{k: value(k, v) for k, v in r.items()} for r in reader]
        return reader.fieldnames, rows


def check(rows):
    """Тесты-инварианты 1–5. Возвращает список ошибок."""
    errors = []
    by_code = {}
    # 1. cofid_code уникален, строк 721
    for r in rows:
        c = r['cofid_code']
        if c in by_code:
            errors.append(f'1: повтор кода {c}')
        by_code[c] = r
    if len(rows) != EXPECTED_ROWS:
        errors.append(f'1: строк {len(rows)}, ожидалось {EXPECTED_ROWS}')
    # 2. yield_raw_code резолвится; сырая пара — «сырой» или «сушёный»
    for r in rows:
        rc = r['yield_raw_code']
        if rc is None:
            continue
        raw = by_code.get(rc)
        if raw is None:
            errors.append(f'2: {r["cofid_code"]} ссылается на несуществующий {rc}')
        elif raw['state_ru'] not in ('сырой', 'сушёный'):
            errors.append(f'2: сырая пара {rc} для {r["cofid_code"]} в состоянии «{raw["state_ru"]}»')
    # 3. yield_factor 0,4–4,0; со сноской допускается 0,3–6,5
    for r in rows:
        y = r['yield_factor']
        if y is None:
            continue
        lo, hi = (0.3, 6.5) if r['yield_note'] else (0.4, 4.0)
        if not lo <= y <= hi:
            errors.append(f'3: {r["cofid_code"]} yield_factor {y} вне {lo}–{hi}')
    # 4. энергия сходится с макросами у ≥ 95% строк
    checked = 0
    ok = 0
    for r in rows:
        if any(r[k] is None for k in ('kcal', 'protein_g', 'fat_g', 'carbs_g')) or not r['kcal']:
            continue
        calc = 4 * r['protein_g'] + 9 * r['fat_g'] + 3.75 * r['carbs_g'] + 7 * (r['alcohol_g'] or 0)
        checked += 1
        if abs(calc - r['kcal']) / r['kcal'] <= 0.05:
            ok += 1
    share = ok / checked if checked else 0
    if share < 0.95:
        errors.append(f'4: энергия сходится у {share:.1%} строк (нужно ≥ 95%)')
    # 5. salt_g = round(sodium_mg × 0,0025, 2)
    for r in rows:
        if r['sodium_mg'] is None:
            continue
        # как в источнике: sodium × 2,5 / 1000 и round() Python; иной порядок операций сдвигает половинки
        want = round(r['sodium_mg'] * 2.5 / 1000, 2)
        if r['salt_g'] is None or not math.isclose(r['salt_g'], want, abs_tol=1e-9):
            errors.append(f'5: {r["cofid_code"]} salt_g {r["salt_g"]}, ожидалось {want}')
    return errors, {'energy_checked': checked, 'energy_ok_share': round(share, 4)}


def main():
    cols, rows = load()
    errors, stats = check(rows)
    print(f'строк: {len(rows)}, столбцов: {len(cols)}; баланс энергии: {stats}')
    if errors:
        print('Проверки не пройдены:')
        for e in errors[:50]:
            print('  ', e)
        print(f'всего ошибок: {len(errors)}')
        sys.exit(1)
    OUT.write_text(json.dumps(rows, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(f'записано: {OUT.relative_to(ROOT)} ({OUT.stat().st_size // 1024} КБ)')


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    main()
