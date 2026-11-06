#!/usr/bin/env python3
"""Fetch ENTSO-E A44 day-ahead prices for Bulgarian bidding zone.
Only publish when ENTSOE_API_TOKEN and MARKET_PUBLICATION_ALLOWED=true.
No mock data and no hardcoded tokens.
"""
import datetime as dt
import json
import os
from pathlib import Path
import sys
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from zoneinfo import ZoneInfo

ROOT=Path(__file__).resolve().parents[1]
OUTPUT=ROOT/'data/dam.json'
ZONE='10YCA-BULGARIA-R'
SOFIA=ZoneInfo('Europe/Sofia')
UTC=dt.timezone.utc

def extract(xml):
    root=ET.fromstring(xml)
    # ENTSO-E uses default namespace; localname access is independent of version.
    local=lambda el: (el.tag if hasattr(el,'tag') else el).rsplit('}',1)[-1]
    def children(node,name): return [v for v in node if local(v)==name]
    def one(node,name):
        vals=children(node,name)
        return vals[0] if vals else None
    def txt(node,name):
        x=one(node,name)
        return x.text.strip() if x is not None and x.text else None
    if local(root.tag)!='Publication_MarketDocument':
        reason=[]
        for node in root.iter():
            if local(node.tag)=='text' and node.text: reason.append(node.text.strip())
        raise ValueError('ENTSO-E returned no price document: '+'; '.join(reason[:2]))
    out={}
    for series in children(root,'TimeSeries'):
        for period in children(series,'Period'):
            interval=one(period,'timeInterval')
            if interval is None: continue
            start=txt(interval,'start')
            resolution=txt(period,'resolution')
            if not start or not resolution or not resolution.startswith('PT') or not resolution.endswith('M'):
                continue
            minutes=int(resolution[2:-1])
            if minutes not in (15,30,60): continue
            start_dt=dt.datetime.fromisoformat(start.replace('Z','+00:00')).astimezone(UTC)
            for point in children(period,'Point'):
                pos=txt(point,'position')
                price=txt(point,'price.amount')
                if not pos or price is None: continue
                amount=float(price)
                if not (-20000 <= amount <= 20000): continue
                moment=start_dt+dt.timedelta(minutes=minutes*(int(pos)-1))
                key=moment.isoformat(timespec='seconds')
                out[key]={'timestamp':moment.astimezone(SOFIA).isoformat(timespec='seconds'),
                          'timestamp_utc':key,'dam_eur_mwh':amount,'interval_minutes':minutes}
    return [out[k] for k in sorted(out)]

def main():
    token=os.getenv('ENTSOE_API_TOKEN','').strip()
    if not token: print('SKIP: ENTSOE_API_TOKEN not configured'); return 0
    if os.getenv('MARKET_PUBLICATION_ALLOWED','').lower()!='true':
        print('SKIP: MARKET_PUBLICATION_ALLOWED not true; no public publishing'); return 0
    now=dt.datetime.now(UTC)
    start=(now-dt.timedelta(days=2)).replace(hour=0,minute=0,second=0,microsecond=0)
    end=(now+dt.timedelta(days=3)).replace(hour=0,minute=0,second=0,microsecond=0)
    params={'documentType':'A44','in_Domain':ZONE,'out_Domain':ZONE,
            'periodStart':start.strftime('%Y%m%d%H%M'),'periodEnd':end.strftime('%Y%m%d%H%M')}
    # Credential only in secret-backed request header, not in public logs, URLs or JSON.
    url='https://web-api.tp.entsoe.eu/api?'+urllib.parse.urlencode(params)
    req=urllib.request.Request(url,headers={'SECURITY_TOKEN':token,'User-Agent':'EnergyDashboard/4.0'})
    with urllib.request.urlopen(req,timeout=35) as resp: xml=resp.read(4_000_000)
    records=extract(xml)
    if not records: raise ValueError('No valid DAM observations; leaving existing data intact')
    obj={'market':'DAM','source':'ENTSO-E Transparency Platform / 12.1.d',
         'fetched_at':now.isoformat(timespec='seconds'),'timezone':'Europe/Sofia',
         'records':records}
    OUTPUT.parent.mkdir(parents=True,exist_ok=True)
    tmp=OUTPUT.with_suffix('.tmp');tmp.write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');tmp.replace(OUTPUT)
    print('Published',len(records),'DAM observations; earliest',records[0]['timestamp_utc'],'latest',records[-1]['timestamp_utc'])
    return 0
if __name__=='__main__':
    try: sys.exit(main())
    except Exception as exc: print('DAM collection failed:',str(exc),file=sys.stderr);sys.exit(2)
