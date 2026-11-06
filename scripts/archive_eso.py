#!/usr/bin/env python3
"""Merge verified ESO hourly observations into a rolling 90-day public history.
No fabricated data. Does not modify the raw ESO snapshot.
"""
import datetime as dt
import json
import math
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'data' / 'eso.json'
TARGET = ROOT / 'data' / 'eso_history.json'
UTC = dt.timezone.utc


def parse_stamp(raw):
    if not isinstance(raw, str):
        return None
    try:
        stamp = dt.datetime.fromisoformat(raw.replace('Z', '+00:00'))
        if stamp.tzinfo is None:
            return None  # Never guess timezone.
        return stamp.astimezone(UTC)
    except ValueError:
        return None


def merge(current, old=None, now=None):
    now = now or dt.datetime.now(UTC)
    cutoff = now - dt.timedelta(days=90)
    rows = {}
    for payload in [old or {}, current]:
        for point in payload.get('load_mw', []):
            if not isinstance(point, dict):
                continue
            stamp = parse_stamp(point.get('timestamp'))
            try:
                number = float(point['value'])
            except (KeyError, TypeError, ValueError):
                continue
            if (stamp is None or not math.isfinite(number) or
                    not (0 <= number <= 15000) or
                    not (cutoff <= stamp <= now + dt.timedelta(minutes=15))):
                continue
            key = stamp.isoformat(timespec='seconds')
            rows[key] = {'timestamp': key, 'value': number}
    result = [rows[k] for k in sorted(rows)]
    return result


def main():
    if not SOURCE.exists():
        raise SystemExit('No data/eso.json: refusing to update history')
    current = json.loads(SOURCE.read_text(encoding='utf-8'))
    if not isinstance(current.get('load_mw'), list):
        raise SystemExit('Invalid ESO snapshot schema')
    old = json.loads(TARGET.read_text(encoding='utf-8')) if TARGET.exists() else {}
    merged = merge(current, old)
    if not merged:
        raise SystemExit('No valid ESO observations: history unchanged')
    result = {
        'source': 'https://www.eso.bg/api/last24load.json.php',
        'archive_updated_at': dt.datetime.now(UTC).isoformat(timespec='seconds'),
        'retention_days': 90,
        'load_mw': merged,
    }
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    temp = TARGET.with_suffix('.tmp')
    temp.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    os.replace(temp, TARGET)
    print('ESO history contains', len(merged), 'validated observations')


if __name__ == '__main__':
    main()
