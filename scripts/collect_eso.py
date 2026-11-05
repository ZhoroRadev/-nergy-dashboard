#!/usr/bin/env python3
"""Best-effort ESO collector. Fails closed on unrecognized schemas; no made-up load."""
import datetime as dt
import json
import pathlib
import re
import sys
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
URL = 'https://www.eso.bg/api/last24load.json.php'
OUT = ROOT / 'data' / 'eso.json'


def normalized_timestamp(value):
    if not isinstance(value, str):
        return None
    value = value.strip()
    if re.fullmatch(r'\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?', value):
        return value.replace(' ', 'T')
    return None


def normalize_load(payload):
    """Only recognize explicit MW and timestamp keys, not arrays with unknown meaning."""
    series = payload if isinstance(payload, list) else None
    if isinstance(payload, dict):
        for key in ('load_mw', 'measurements', 'data', 'values'):
            if isinstance(payload.get(key), list):
                series = payload[key]
                break
    if not isinstance(series, list):
        return []
    result = []
    for item in series:
        if not isinstance(item, dict):
            continue
        timestamp = next((normalized_timestamp(item[k]) for k in ('timestamp', 'datetime', 'time') if k in item), None)
        value = next((item[k] for k in ('load_mw', 'loadMW', 'power_mw') if k in item), None)
        if timestamp is None or value is None:
            continue
        try:
            value = float(value)
            if not 0 <= value <= 15000:
                continue
        except (TypeError, ValueError):
            continue
        result.append({'timestamp': timestamp, 'value': value})
    return sorted(result, key=lambda r: r['timestamp'])


def main():
    req = urllib.request.Request(URL, headers={'User-Agent': 'EnergyIntelDashboard/1.0 (public data)', 'Accept': 'application/json'})
    with urllib.request.urlopen(req, timeout=22) as response:
        raw = response.read(5_000_000)
    data = json.loads(raw)
    load = normalize_load(data)
    if not load:
        print('ESO schema not recognized; existing published data left unchanged.', file=sys.stderr)
        return 2
    snapshot = {'source': URL, 'fetched_at': dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds'), 'load_mw': load}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    tmp = OUT.with_suffix('.tmp')
    tmp.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    tmp.replace(OUT)
    print(f'Loaded {len(load)} ESO observations')
    return 0


if __name__ == '__main__':
    sys.exit(main())
