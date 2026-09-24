import json
import importlib
from decimal import Decimal

BASE = "pygrowup.tables.by_day"
TABLES = ["wfa", "lfa", "wfh", "wfl"]

def to_num(d):
    return float(d)

out = {}
for name in TABLES:
    mod = importlib.import_module(f"{BASE}.{name}")
    data = mod.DATA
    table_out = {}
    for sex, by_t in data.items():
        sex_out = {}
        for t, lms in by_t.items():
            key = str(t)
            sex_out[key] = {
                "l": to_num(lms["l"]),
                "m": to_num(lms["m"]),
                "s": to_num(lms["s"]),
            }
        table_out[sex] = sex_out
    out[name] = table_out

with open("who_tables.json", "w") as f:
    json.dump(out, f)

print("wrote who_tables.json")
for name in TABLES:
    for sex in out[name]:
        print(name, sex, len(out[name][sex]))
