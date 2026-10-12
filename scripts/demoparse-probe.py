"""Разведка формата: что реально достаёт demoparser2 из дотного .dem.

Запуск: .venv-parse/Scripts/python.exe scripts/demoparse-probe.py <путь.dem>
"""

import sys
import pandas as pd

from demoparser2 import DemoParser

pd.set_option("display.width", 200)
pd.set_option("display.max_columns", 40)

path = sys.argv[1]
p = DemoParser(path)

print("=== header ===")
try:
    print(p.parse_header())
except Exception as e:  # noqa: BLE001
    print("header не удалось:", e)

print("\n=== player info (ники/steamid из реплея) ===")
try:
    info = p.parse_player_info()
    print(info.to_string())
except Exception as e:  # noqa: BLE001
    print("player_info не удалось:", e)

print("\n=== game events ===")
try:
    events = p.list_game_events()
    print(len(events), "шт:", sorted(events))
except Exception as e:  # noqa: BLE001
    print("list_game_events не удалось:", e)
