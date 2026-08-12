# -*- coding: utf-8 -*-
"""
Собирает английские описания упражнений в public/data/exercises.en.json.

Запуск: python tools/exercise-desc.py   (после tools/exercise-names.py)

Описания в каталоге — построчные подсказки по технике, и строки в них
повторяются: «Негативная фаза подконтрольная» встречается 230 раз. Поэтому
переводим не тексты, а строки: 2976 уникальных на 957 описаний.

Описание уходит в английский только целиком. Если хоть одна его строка без
перевода, оставляем русский оригинал: смесь языков внутри одной подсказки
читается как поломка, а честный русский текст — нет.
"""
import json, re, sys, os

sys.stdout.reconfigure(encoding='utf-8')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'public', 'data', 'exercises.json')
OUT = os.path.join(ROOT, 'public', 'data', 'exercises.en.json')
LINES = os.path.join(ROOT, 'tools', 'desc-lines.en.json')

CYR = re.compile('[А-Яа-яЁё]')


def main():
    table = json.load(open(LINES, encoding='utf-8')) if os.path.exists(LINES) else {}
    rows = json.load(open(SRC, encoding='utf-8'))
    out = json.load(open(OUT, encoding='utf-8')) if os.path.exists(OUT) else {}

    descs = {r['desc'] for r in rows if r.get('desc')}
    all_lines = set()
    for d in descs:
        all_lines.update(l.strip() for l in d.split('\n') if l.strip())

    done = 0
    for d in sorted(descs):
        parts = [l.strip() for l in d.split('\n') if l.strip()]
        en = [table.get(p) for p in parts]
        if all(en) and not any(CYR.search(x) for x in en):
            out['desc:' + d] = '\n'.join(en)
            done += 1

    json.dump(out, open(OUT, 'w', encoding='utf-8'),
              ensure_ascii=False, indent=0, sort_keys=True)

    missing = sorted(l for l in all_lines if l not in table)
    print('строк: %d · переведено: %d · осталось: %d'
          % (len(all_lines), len(all_lines) - len(missing), len(missing)))
    print('описаний: %d · полностью на английском: %d' % (len(descs), done))
    return missing


if __name__ == '__main__':
    main()
