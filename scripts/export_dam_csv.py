#!/usr/bin/env python3
"""Export Bulgaria ENTSO-E A44 DAM prices to a *local* CSV only.

Authentication: SECURITY_TOKEN request header. Never prints or saves the token.
No GitHub commits, artifacts, or public data publication.
"""
from __future__ import annotations
import argparse
import csv
from datetime import date, datetime, timedelta, timezone
import getpass
import os
from pathlib import Path
import sys
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

from entsoe_core import BASE, BG, UTC, ZONE, parse_points, children, one, value, local


def fetch_day(day: date, token: str):
    local_start = datetime(day.year, day.month, day.day, tzinfo=BG)
    local_end = datetime((day + timedelta(days=1)).year, (day + timedelta(days=1)).month, (day + timedelta(days=1)).day, tzinfo=BG)
    start = local_start.astimezone(UTC)
    end = local_end.astimezone(UTC)
    # Request surrounding days to avoid truncation at API/query boundaries.
    # Only the selected Bulgarian delivery day is exported.
    query_start = start - timedelta(days=1)
    query_end = end + timedelta(days=1)
    params = dict(documentType='A44', in_Domain=ZONE, out_Domain=ZONE,
                  periodStart=query_start.strftime('%Y%m%d%H%M'), periodEnd=query_end.strftime('%Y%m%d%H%M'))
    req = urllib.request.Request(BASE + '?' + urllib.parse.urlencode(params),
        headers={'SECURITY_TOKEN':token, 'Accept':'application/xml', 'User-Agent':'EnergyIntel/12.3 (local CSV export)'})
    try:
        with urllib.request.urlopen(req, timeout=45) as response:
            raw = response.read(5_000_001)
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f'ENTSO-E HTTP {exc.code}; verify permission, period or availability') from None
    except (urllib.error.URLError, TimeoutError):
        raise RuntimeError('Connection or timeout error') from None
    if len(raw) > 5_000_000 or b'<!DOCTYPE' in raw.upper() or b'<!ENTITY' in raw.upper():
        raise RuntimeError('Unsafe or oversized XML response')
    try:
        root = ET.fromstring(raw)
        rows = parse_points(root, 'dam')
    except (ET.ParseError, ValueError):
        raise RuntimeError('No recognized A44 price document or invalid XML') from None
    filtered = [r for r in rows if r['timestamp'][:10] == day.isoformat()]
    if not filtered:
        raise RuntimeError('No DAM prices for selected Bulgarian delivery date')
    # Check unambiguous UTC order, homogeneous resolution and no gaps.
    filtered.sort(key=lambda r:r['timestamp_utc'])
    steps = {r['interval_minutes'] for r in filtered}
    if len(steps) != 1 or steps.pop() not in (15,30,60):
        raise RuntimeError('Mixed or unsupported interval resolutions')
    step = filtered[0]['interval_minutes']
    expected = int((end - start).total_seconds() // (step * 60))
    expected_utc = [start + timedelta(minutes=i*step) for i in range(expected)]
    received_utc = {datetime.fromisoformat(r['timestamp_utc']).astimezone(UTC) for r in filtered}
    missing = [t for t in expected_utc if t not in received_utc]
    unexpected = [t for t in received_utc if t < start or t >= end]
    if len(filtered) != expected or missing or unexpected:
        sample = ', '.join(t.astimezone(BG).isoformat(timespec='minutes') for t in missing[:8])
        if len(missing)>8:sample += ', ...'
        details = f' | Missing interval starts (Sofia): {sample}' if missing else ''
        # Diagnostic: inspect raw XML Point positions for the missing intervals.
        # Print only metadata (timestamp / presence / field validity), never token, URL or prices.
        raw_positions = {}
        series_count = len(children(root, 'TimeSeries'))
        for series in children(root, 'TimeSeries'):
            for period in children(series, 'Period'):
                start_text = value(one(period, 'timeInterval'), 'start')
                res = value(period, 'resolution') or ''
                match = __import__('re').fullmatch(r'PT(?:(\d+)H|(\d+)M)', res)
                if not start_text or not match:
                    continue
                try:
                    period_start = datetime.fromisoformat(start_text.replace('Z', '+00:00')).astimezone(UTC)
                    duration = (int(match.group(1)) * 60 if match.group(1) else int(match.group(2)))
                except (ValueError, TypeError):
                    continue
                for point in children(period, 'Point'):
                    position = value(point, 'position')
                    try:
                        p = int(position)
                    except (ValueError, TypeError):
                        continue
                    t = period_start + timedelta(minutes=duration * (p - 1))
                    raw_positions.setdefault(t, []).append({
                        'price_present': value(point, 'price.amount') is not None,
                        'resolution_min': duration,
                    })
        print(f'DIAGNOSTIC | TimeSeries={series_count} | parsed_day={len(filtered)} | expected={expected}', file=sys.stderr)
        for t in missing[:24]:
            entries = raw_positions.get(t, [])
            if not entries:
                reason = 'NOT_PRESENT_IN_XML_POINTS'
            elif not any(e['price_present'] for e in entries):
                reason = 'POINT_PRESENT_WITHOUT_PRICE_AMOUNT'
            else:
                reason = 'POINT_PRESENT_BUT_FILTERED_OR_INVALID; inspect parser rules'
            print(f'DIAGNOSTIC | {t.astimezone(BG).isoformat(timespec="minutes")} | {reason} | raw_points={len(entries)}', file=sys.stderr)
        raise RuntimeError(f'Incomplete delivery day: {len(filtered)}/{expected} intervals; nothing saved{details}')
    return filtered, step



def export(rows, output: Path):
    output.parent.mkdir(parents=True, exist_ok=True)
    # Avoid non-atomic partial files, and refuse to write inside a Git repo.
    for parent in (output.parent, *output.parent.parents):
        if (parent / '.git').exists():
            raise RuntimeError('Refusing to save CSV inside a Git repository; choose a local folder outside the repo')
    tmp = output.with_suffix('.tmp')
    try:
        with tmp.open('w', newline='', encoding='utf-8-sig') as f:
            writer = csv.writer(f)
            writer.writerow(['timestamp','dam_eur_mwh','intraday_eur_mwh','balancing_eur_mwh'])
            for item in rows:
                writer.writerow([item['timestamp'], format(item['dam_eur_mwh'], '.6f').rstrip('0').rstrip('.'), '', ''])
        tmp.replace(output)
    finally:
        tmp.unlink(missing_ok=True)


def main(argv=None):
    p = argparse.ArgumentParser(description='Download verified Bulgaria DAM prices as local CSV (no publishing).')
    p.add_argument('--date', help='Bulgarian delivery date YYYY-MM-DD (default today, Europe/Sofia)')
    p.add_argument('--out', help='Output path (default ~/Downloads/dam_BG_YYYY-MM-DD.csv)')
    args = p.parse_args(argv)
    try:
        day = date.fromisoformat(args.date) if args.date else datetime.now(BG).date()
    except ValueError:
        p.error('--date should be YYYY-MM-DD')
    token = os.environ.get('ENTSOE_API_TOKEN', '').strip() or getpass.getpass('ENTSO-E API token (hidden): ').strip()
    if not token:
        print('Missing token', file=sys.stderr)
        return 2
    out = Path(args.out).expanduser() if args.out else Path.home()/'Downloads'/f'dam_BG_{day.isoformat()}.csv'
    try:
        rows, minutes = fetch_day(day, token)
        export(rows, out)
    except (RuntimeError, OSError) as exc:
        # Avoid outputting the raw HTTP request or authentication header.
        print('ERROR: '+str(exc), file=sys.stderr)
        return 2
    print(f'OK | Bulgaria | delivery date={day} | {len(rows)} intervals x {minutes} min | local CSV={out}')
    print('Source: ENTSO-E Transparency Platform, A44. Values are actual published prices, not simulated.')
    print('Do not commit this file to a public repository unless re-use rights have been verified.')
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
