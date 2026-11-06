#!/usr/bin/env python3
"""Collect metadata only from ENTSO-E A44/A75. Never persist prices, MW or tokens."""
from __future__ import annotations
import datetime as dt
import json
import os
from pathlib import Path
from entsoe_core import fetch_xml, parse_points

UTC = dt.timezone.utc
OUT = Path(__file__).resolve().parents[1] / 'data' / 'entsoe-status.json'

def summarize(kind: str, rows: list[dict]) -> dict:
    if not rows:
        raise ValueError('no_recognized_intervals')
    times = [dt.datetime.fromisoformat(row['timestamp_utc']) for row in rows]
    if any(t.utcoffset() != dt.timedelta(0) for t in times):
        raise ValueError('non_utc_timestamps')
    if kind == 'generation':
        categories = sorted({key for row in rows for key in row.get('generation_mw', {})})
        if not categories:
            raise ValueError('missing_production_types')
        return {
            'status': 'ok', 'intervals': len(rows), 'production_type_count': len(categories),
            'earliest_interval_utc': min(times).isoformat(timespec='seconds'),
            'latest_interval_utc': max(times).isoformat(timespec='seconds'),
        }
    if kind == 'dam':
        return {
            'status': 'ok', 'intervals': len(rows),
            'earliest_interval_utc': min(times).isoformat(timespec='seconds'),
            'latest_interval_utc': max(times).isoformat(timespec='seconds'),
        }
    raise ValueError('unknown_kind')

def run() -> int:
    token = os.environ.get('ENTSOE_API_TOKEN', '').strip()
    if not token:
        print('ERROR: ENTSOE_API_TOKEN is not configured')
        return 2
    status = {
        'schema_version': 1,
        'source': 'ENTSO-E Transparency Platform',
        'checked_at_utc': dt.datetime.now(UTC).isoformat(timespec='seconds'),
        'coverage': 'Bulgaria',
        'mode': 'metadata_only',
        'dam': {}, 'generation': {},
        'disclaimer': 'Metadata about API availability; no market prices or production quantities are published.'
    }
    all_ok = True
    for kind in ('dam', 'generation'):
        try:
            records = parse_points(fetch_xml(kind, token), kind)
            status[kind] = summarize(kind, records)
            print(f'{kind.upper()}: OK; intervals={status[kind]["intervals"]}')
        except Exception as exc:
            # No raw error text: some library errors may embed URLs/credentials.
            status[kind] = {'status': 'failed', 'error_code': exc.__class__.__name__}
            print(f'{kind.upper()}: FAILED ({exc.__class__.__name__})')
            all_ok = False
    if not all_ok:
        print('ERROR: Nothing published. Previous public status retained.')
        return 1
    OUT.parent.mkdir(parents=True, exist_ok=True)
    temp = OUT.with_suffix('.json.tmp')
    temp.write_text(json.dumps(status, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    temp.replace(OUT)
    print('Public metadata-only status updated. No raw prices/volumes written.')
    return 0

if __name__ == '__main__':
    raise SystemExit(run())
