#!/usr/bin/env python3
"""Append validated metadata-only ENTSO-E checks to a bounded public history.

No prices, production MW, credentials, or raw API responses are stored.
Run ONLY after successful scripts/entsoe_status.py.
"""
from __future__ import annotations
import datetime as dt
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STATUS = ROOT / 'data' / 'entsoe-status.json'
HISTORY = ROOT / 'data' / 'entsoe-status-history.json'
UTC = dt.timezone.utc
MAX_RECORDS = 540
MAX_DAYS = 90


def parse_utc(s):
    try:
        t = dt.datetime.fromisoformat(s.replace('Z', '+00:00'))
        if t.tzinfo is None:
            return None
        return t.astimezone(UTC)
    except (TypeError, ValueError, AttributeError):
        return None


def slim(doc):
    if not isinstance(doc, dict) or doc.get('schema_version') != 1 or doc.get('mode') != 'metadata_only':
        raise ValueError('invalid_status_schema')
    checked = parse_utc(doc.get('checked_at_utc'))
    if checked is None:
        raise ValueError('invalid_checked_at')
    entry = {'checked_at_utc': checked.isoformat(timespec='seconds')}
    for name in ('dam', 'generation'):
        d = doc.get(name)
        if not isinstance(d, dict) or d.get('status') != 'ok':
            raise ValueError(f'{name}_not_ok')
        n = d.get('intervals')
        earliest = parse_utc(d.get('earliest_interval_utc'))
        latest = parse_utc(d.get('latest_interval_utc'))
        if type(n) is not int or not 0 < n < 100000 or not earliest or not latest or earliest > latest:
            raise ValueError(f'{name}_invalid_metadata')
        entry[name] = {
            'intervals': n,
            'earliest_interval_utc': earliest.isoformat(timespec='seconds'),
            'latest_interval_utc': latest.isoformat(timespec='seconds'),
        }
        if name == 'generation':
            k = d.get('production_type_count')
            if type(k) is not int or not 0 < k <= 30:
                raise ValueError('invalid_type_count')
            entry[name]['production_type_count'] = k
    return entry


def merge(previous, entry, now=None):
    now = now or dt.datetime.now(UTC)
    cutoff = now - dt.timedelta(days=MAX_DAYS)
    by_time = {}
    for item in (previous if isinstance(previous, list) else []) + [entry]:
        try:
            time = parse_utc(item['checked_at_utc'])
            if time is not None and cutoff <= time <= now + dt.timedelta(minutes=10):
                # Re-validate; don't retain legacy entries containing extra/unsafe keys.
                minimal = {'schema_version': 1, 'mode': 'metadata_only', **item,
                           'dam': {'status':'ok', **item['dam']},
                           'generation': {'status':'ok', **item['generation']}}
                clean = slim(minimal)
                by_time[clean['checked_at_utc']] = clean
        except (KeyError, TypeError, ValueError):
            continue
    return [by_time[key] for key in sorted(by_time)[-MAX_RECORDS:]]


def main():
    entry = slim(json.loads(STATUS.read_text(encoding='utf-8')))
    previous = []
    if HISTORY.exists():
        old = json.loads(HISTORY.read_text(encoding='utf-8'))
        if old.get('schema_version') != 1 or old.get('mode') != 'metadata_only':
            raise ValueError('invalid_existing_history')
        previous = old.get('checks', [])
    result = {'schema_version': 1, 'mode': 'metadata_only', 'source': 'ENTSO-E Transparency Platform',
              'checks': merge(previous, entry)}
    HISTORY.parent.mkdir(parents=True, exist_ok=True)
    temp = HISTORY.with_suffix('.json.tmp')
    temp.write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    temp.replace(HISTORY)
    print(f'Metadata-only checks stored: {len(result["checks"])}; no prices/MW persisted')


if __name__ == '__main__':
    main()
