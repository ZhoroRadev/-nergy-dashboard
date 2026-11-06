#!/usr/bin/env python3
"""Read a *contractually authorised* IBEX market data JSON export.
The provider-specific download URL is a GitHub secret. The adapter requires a
strict normalized format; it never guesses vendor fields or invents prices.
"""
import datetime as dt
import json
import os
from pathlib import Path
import sys
import urllib.request
from zoneinfo import ZoneInfo
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'data/intraday.json'
SOFIA=ZoneInfo('Europe/Sofia')
UTC=dt.timezone.utc

def normalize(obj):
    rows=obj.get('records') if isinstance(obj,dict) else obj
    if not isinstance(rows,list): raise ValueError('Expected JSON list or {"records": [...]}')
    result=[]
    for n,row in enumerate(rows,1):
        if not isinstance(row,dict): raise ValueError('Row %s not an object'%n)
        time=row.get('timestamp')
        if not isinstance(time,str): raise ValueError('Row %s missing timestamp'%n)
        ts=dt.datetime.fromisoformat(time.replace('Z','+00:00'))
        if ts.tzinfo is None: raise ValueError('Timezone offset required in row %s'%n)
        val=row.get('intraday_eur_mwh')
        if not isinstance(val,(int,float)) or isinstance(val,bool) or not (-20000<=val<=20000):
            raise ValueError('Row %s missing/invalid intraday_eur_mwh'%n)
        minutes=row.get('interval_minutes')
        if minutes not in (15,30,60):raise ValueError('Row %s requires interval_minutes=15,30,60'%n)
        vol=row.get('volume_mwh')
        if vol is not None and (not isinstance(vol,(int,float)) or isinstance(vol,bool) or vol<0):
            raise ValueError('Invalid volume_mwh in row %s'%n)
        utc=ts.astimezone(UTC)
        result.append({'timestamp':utc.astimezone(SOFIA).isoformat(timespec='seconds'),
          'timestamp_utc':utc.isoformat(timespec='seconds'),
          'intraday_eur_mwh':val,'interval_minutes':minutes,
          'volume_mwh':vol,'price_metric':'VWAP'})
    return sorted(result,key=lambda x:x['timestamp_utc'])

def main():
    if os.getenv('INTRADAY_PUBLICATION_ALLOWED','').lower()!='true':
        print('SKIP: Intraday redistribution not confirmed; no data is published');return 0
    url=os.getenv('IBEX_EXPORT_URL','').strip()
    if not url:
        print('SKIP: No licensed IBEX_EXPORT_URL configured');return 0
    if not url.startswith('https://'): raise ValueError('IBEX_EXPORT_URL must use HTTPS')
    headers={'User-Agent':'EnergyDashboard/4.0','Accept':'application/json'}
    token=os.getenv('IBEX_EXPORT_TOKEN','').strip()
    if token: headers['Authorization']='Bearer '+token
    request=urllib.request.Request(url,headers=headers)
    with urllib.request.urlopen(request,timeout=35) as response:obj=json.load(response)
    rows=normalize(obj)
    if not rows: raise ValueError('No observations; existing data preserved')
    payload={'market':'Intraday continuous','price_metric':'VWAP',
      'source':'Licensed IBEX feed (configured by repository owner)',
      'fetched_at':dt.datetime.now(UTC).isoformat(timespec='seconds'),
      'timezone':'Europe/Sofia','records':rows}
    OUT.parent.mkdir(parents=True,exist_ok=True)
    temp=OUT.with_suffix('.tmp');temp.write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');temp.replace(OUT)
    print('Published',len(rows),'licensed Intraday observations')
    return 0
if __name__=='__main__':
    try:sys.exit(main())
    except Exception as exc:print('Intraday collector failed:',exc,file=sys.stderr);sys.exit(2)
