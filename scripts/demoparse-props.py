"""Разведка свойств: какие пропсы вообще обновляются в дотном .dem.

Запуск: .venv-parse/Scripts/python.exe scripts/demoparse-props.py <путь.dem> [подстрока]
"""

import sys

from demoparser2 import DemoParser

path = sys.argv[1]
needle = (sys.argv[2] if len(sys.argv) > 2 else "").lower()

p = DemoParser(path)

print("=== list_updated_fields() ===")
try:
    fields = p.list_updated_fields()
    print("всего полей:", len(fields))
    hits = [f for f in fields if needle in f.lower()] if needle else fields
    print(f"подстрока {needle!r}: {len(hits)} совпадений")
    for f in sorted(hits)[:200]:
        print("  ", f)
except Exception as e:  # noqa: BLE001
    print("не удалось:", type(e).__name__, e)

print("\n=== list_game_events() ===")
try:
    print(p.list_game_events())
except Exception as e:  # noqa: BLE001
    print("не удалось:", e)
