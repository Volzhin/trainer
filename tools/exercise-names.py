# -*- coding: utf-8 -*-
"""
Собирает public/data/exercises.en.json — английские названия упражнений.

Запуск: python tools/exercise-names.py

Названия в каталоге не свободный текст, а термины из фиксированного набора:
«нейтральным хватом», «с виса (выше колен)», «акцент на широчайшие». Поэтому
переводим устойчивыми фразами из tools/exercise-glossary.json, начиная с
самых длинных. Пословная замена дала бы «press of bar lying» вместо «bench
press» — в тренировочном приложении неверное название означает выполнение
не того движения.

Проверка встроена: любое название, где после замены осталась кириллица,
печатается как непокрытое и в файл всё равно попадает — но ноль таких строк
единственный признак, что словарь полон. На глаз тысячу названий не
пересмотреть.

Каталог упражнений обновляется целиком, файлом. После обновления скрипт
нужно прогнать заново и проверить, что непокрытых нет.
"""
import json, re, sys, os

sys.stdout.reconfigure(encoding='utf-8')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'public', 'data', 'exercises.json')
OUT = os.path.join(ROOT, 'public', 'data', 'exercises.en.json')
GLOSS = os.path.join(ROOT, 'tools', 'exercise-glossary.json')

CYR = re.compile('[А-Яа-яЁё]')
# Маркер вокруг уже переведённого куска: без него английское слово попадёт
# под следующее правило и переведётся второй раз.
MARK = '\x01'
W = 'А-Яа-яЁёA-Za-z0-9'

# Слипшиеся с цифрой суффиксы («35гр», «2х», «3мя») границы слов не ловят:
# цифра для них такой же символ слова. Разделяем заранее.
PRE = [
    (re.compile(r'(\d)\s*гр\b'), r'\1°'),
    (re.compile(r'(\d)\s*х\b'), r'\1x'),
    (re.compile(r'(\d)\s*мя\b'), r'\1'),
]

# Предлог мог прийти и из фразы, и из отдельного слова: «с супинацией»
# даёт «with with supination». Схлопываем повтор.
DOUBLE = re.compile(r'\b(with|on|in|from|to|at|for|and|the)\s+\1\b')


def main():
    glossary = json.load(open(GLOSS, encoding='utf-8'))
    rows = json.load(open(SRC, encoding='utf-8'))
    names = sorted({r['name'] for r in rows})

    # Длинные фразы раньше коротких: «нейтральным хватом» должно сработать
    # прежде, чем «хватом».
    pats = [
        (re.compile('(?<![' + W + MARK + '])' + re.escape(k) + '(?![' + W + MARK + '])'),
         glossary[k])
        for k in sorted(glossary, key=len, reverse=True)
    ]

    out, left = {}, []
    for name in names:
        s = name
        for pat, val in PRE:
            s = pat.sub(val, s)
        for pat, val in pats:
            s = pat.sub(lambda m, v=val: MARK + v + MARK, s)
        s = s.replace(MARK, '')
        s = re.sub(r'\s+', ' ', s).strip()
        s = re.sub(r'\(\s+', '(', s)
        s = re.sub(r'\s+\)', ')', s)
        s = DOUBLE.sub(r'\1', s)
        s = s[:1].upper() + s[1:] if s else s
        out[name] = s
        if CYR.search(s):
            left.append((name, s))

    json.dump(out, open(OUT, 'w', encoding='utf-8'),
              ensure_ascii=False, indent=0, sort_keys=True)

    print('названий: %d · непокрытых: %d' % (len(names), len(left)))
    for name, s in left[:40]:
        print('   ', name[:70], '->', s[:70])
    return 1 if left else 0


if __name__ == '__main__':
    sys.exit(0 if main() == 0 else 1)
