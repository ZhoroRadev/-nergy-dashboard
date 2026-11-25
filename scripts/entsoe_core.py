"""ENTSO-E API helpers. Never print, persist or place authentication token in URL."""
from __future__ import annotations
import datetime as dt
import os
import re
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from collections import defaultdict
from zoneinfo import ZoneInfo

UTC = dt.timezone.utc
BG = ZoneInfo('Europe/Sofia')
ZONE = '10YCA-BULGARIA-R'
BASE = 'https://web-api.tp.entsoe.eu/api'
PSR = {'B01':'biomass','B02':'brown_coal','B03':'coal_gas','B04':'gas','B05':'hard_coal','B06':'oil','B07':'oil_shale','B08':'peat','B09':'geothermal','B10':'pumped_storage','B11':'hydro_run_of_river','B12':'hydro_reservoir','B13':'marine','B14':'nuclear','B15':'other_renewable','B16':'solar','B17':'waste','B18':'wind_offshore','B19':'wind_onshore','B20':'other'}

def local(el): return el.tag.rsplit('}',1)[-1]
def children(node, name): return [e for e in node if local(e)==name]
def one(node,name): return next((e for e in node if local(e)==name),None)
def value(node,name):
    e=one(node,name) if node is not None else None
    return e.text.strip() if e is not None and e.text else None

def window():
    now=dt.datetime.now(UTC)
    start=(now-dt.timedelta(days=2)).replace(hour=0,minute=0,second=0,microsecond=0)
    end=(now+dt.timedelta(days=1)).replace(hour=0,minute=0,second=0,microsecond=0)
    return start,end

def fetch_xml(kind: str, token: str):
    if not token: raise ValueError('missing_token')
    start,end=window()
    params={'documentType': 'A44' if kind=='dam' else 'A75',
            'periodStart':start.strftime('%Y%m%d%H%M'),'periodEnd':end.strftime('%Y%m%d%H%M')}
    if kind=='dam':params.update(in_Domain=ZONE,out_Domain=ZONE)
    elif kind=='generation':params.update(processType='A16',in_Domain=ZONE)
    else:raise ValueError('unsupported_document_type')
    req=urllib.request.Request(BASE+'?'+urllib.parse.urlencode(params),headers={'SECURITY_TOKEN':token,'Accept':'application/xml','User-Agent':'EnergyIntel/12.0 (ENTSO-E access verification)'})
    try:
        with urllib.request.urlopen(req,timeout=40) as resp:
            data=resp.read(5_000_001)
    except urllib.error.HTTPError as exc:
        # Never echo raw body, URL or headers; some clients include sensitive text in errors.
        raise RuntimeError(f'http_{exc.code}') from None
    except (urllib.error.URLError,TimeoutError):raise RuntimeError('network_or_timeout') from None
    if len(data)>5_000_000:raise ValueError('response_too_large')
    if b'<!DOCTYPE' in data.upper() or b'<!ENTITY' in data.upper():raise ValueError('unsafe_xml')
    try:return ET.fromstring(data)
    except ET.ParseError:raise ValueError('invalid_xml') from None

def parse_points(root, kind):
    target='Publication_MarketDocument' if kind=='dam' else 'GL_MarketDocument'
    if local(root)!=target:
        # For ENTSO-E no-data Acknowledgement_MarketDocument, do not dump response
        raise ValueError('no_data_or_rejected_document')
    if kind == 'dam':
        return parse_dam_prices(root)
    records={}
    for series in children(root,'TimeSeries'):
        psr=value(one(series,'MktPSRType'),'psrType') if kind=='generation' else None
        if kind=='generation' and (psr not in PSR or value(series,'outBiddingZone_Domain.mRID')):
            continue  # exclude consumption series and unknown PSR labels
        for period in children(series,'Period'):
            it=one(period,'timeInterval')
            start=value(it,'start')
            resolution=value(period,'resolution') or ''
            match=re.fullmatch(r'PT(?:(\d+)H|(\d+)M)',resolution)
            if not start or not match:continue
            minutes=int(match.group(1))*60 if match.group(1) else int(match.group(2))
            if minutes not in (15,30,60):continue
            try:t0=dt.datetime.fromisoformat(start.replace('Z','+00:00')).astimezone(UTC)
            except ValueError:continue
            for point in children(period,'Point'):
                pos=value(point,'position')
                text=value(point,'price.amount' if kind=='dam' else 'quantity')
                if not pos or text is None:continue
                try:
                    n=float(text);p=int(pos)
                except ValueError:continue
                if p<1 or not (-(20000 if kind=='dam' else 0)<=n <= (20000 if kind=='dam' else 50000)):continue
                t=t0+dt.timedelta(minutes=minutes*(p-1));key=t.isoformat(timespec='seconds')
                if kind=='dam':
                    records[key]={'timestamp':t.astimezone(BG).isoformat(timespec='seconds'),'timestamp_utc':key,'dam_eur_mwh':n,'interval_minutes':minutes}
                else:
                    if key not in records:records[key]={'timestamp':t.astimezone(BG).isoformat(timespec='seconds'),'timestamp_utc':key,'interval_minutes':minutes,'generation_mw':{}}
                    k=PSR[psr]; records[key]['generation_mw'][k]=records[key]['generation_mw'].get(k,0)+n
    return [records[k] for k in sorted(records)]


def parse_dam_prices(root):
    """Expand explicit A03 variable-sized blocks; never infer A01 missing points.

    Time intervals are parsed in UTC, so DST repeated local times are distinct.
    The A03 price is held only within its own Period, never across periods.
    """
    if local(root) != 'Publication_MarketDocument':
        raise ValueError('no_data_or_rejected_document')
    records = {}
    for series in children(root, 'TimeSeries'):
        curve = value(series, 'curveType')
        if curve not in ('A01', 'A03'):
            raise ValueError('unsupported_curve_type_' + str(curve))
        currency = value(series, 'currency_Unit.name')
        if currency is not None and currency != 'EUR':
            raise ValueError('unexpected_price_currency_' + currency)
        for period in children(series, 'Period'):
            interval = one(period, 'timeInterval')
            start_text = value(interval, 'start')
            end_text = value(interval, 'end')
            resolution = value(period, 'resolution') or ''
            match = re.fullmatch(r'PT(?:(\d+)H|(\d+)M)', resolution)
            if not start_text or not end_text or not match:
                raise ValueError('invalid_price_period')
            minutes = int(match.group(1)) * 60 if match.group(1) else int(match.group(2))
            if minutes not in (15,30,60):
                raise ValueError('unsupported_price_resolution')
            try:
                t0 = dt.datetime.fromisoformat(start_text.replace('Z', '+00:00')).astimezone(UTC)
                t1 = dt.datetime.fromisoformat(end_text.replace('Z', '+00:00')).astimezone(UTC)
            except ValueError:
                raise ValueError('invalid_price_period_time') from None
            span = int((t1-t0).total_seconds())
            if span <= 0 or span % (minutes*60):
                raise ValueError('invalid_price_period_duration')
            count = span // (minutes*60)
            explicit = {}
            for point in children(period, 'Point'):
                pos = value(point, 'position')
                amt = value(point, 'price.amount')
                try:
                    position = int(pos)
                except (TypeError,ValueError):
                    raise ValueError('invalid_price_position') from None
                if position < 1 or position > count or position in explicit:
                    raise ValueError('duplicate_or_out_of_range_price_position')
                if amt is None:
                    # No published price is a data gap, not a value to carry forward.
                    explicit[position] = None
                else:
                    try: price = float(amt)
                    except ValueError: raise ValueError('invalid_price_amount') from None
                    if not (-20000 <= price <= 20000) or not __import__('math').isfinite(price):
                        raise ValueError('out_of_range_price_amount')
                    explicit[position] = price
            held = None
            for position in range(1,count+1):
                if position in explicit:
                    held = explicit[position]
                elif curve != 'A03':
                    held = None
                if held is None:
                    continue
                t = t0 + dt.timedelta(minutes=minutes*(position-1))
                key = t.isoformat(timespec='seconds')
                item = dict(timestamp=t.astimezone(BG).isoformat(timespec='seconds'),
                            timestamp_utc=key, dam_eur_mwh=held, interval_minutes=minutes)
                if key in records and (records[key]['dam_eur_mwh'] != held or records[key]['interval_minutes'] != minutes):
                    # Avoid silently mixing another auction/series into the same instant.
                    raise ValueError('conflicting_price_series')
                records[key] = item
    return [records[k] for k in sorted(records)]
