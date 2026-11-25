#!/usr/bin/env python3
"""ENTSO-E DAM A44 collector; fail closed on any price re-publication rights."""
import argparse
from datetime import date,datetime,timedelta,timezone
import json,os,sys
from pathlib import Path
from zoneinfo import ZoneInfo
from export_dam_csv import fetch_day

SOFIA=ZoneInfo('Europe/Sofia')

def build_rows(rows, day):
    entries=[]
    for r in rows:
        entries.append({'timestamp':r['timestamp'], 'timestamp_utc':r['timestamp_utc'],
          'dam_eur_mwh':r['dam_eur_mwh']})
    entries.sort(key=lambda r:r['timestamp_utc'])
    if len(entries) not in (92,96,100) or len({r['timestamp_utc'] for r in entries})!=len(entries):
        raise ValueError('Invalid BG quarter-hour coverage')
    if any(not isinstance(r['dam_eur_mwh'],(int,float)) for r in entries):
        raise ValueError('Invalid DAM price')
    return {'delivery_date_bg':day.isoformat(),'timezone':'Europe/Sofia','source':'ENTSO-E Transparency Platform (A44)',
            'currency':'EUR/MWh','interval_minutes':15,'intervals':len(entries),'rows':entries}

def write_json(path,data):
    path.parent.mkdir(parents=True,exist_ok=True)
    temp=path.with_name(path.name+'.tmp')
    temp.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    temp.replace(path)

def main(argv=None):
    ap=argparse.ArgumentParser()
    ap.add_argument('--out',default='data')
    ap.add_argument('--today',help='YYYY-MM-DD Bulgarian date; optional testing override')
    args=ap.parse_args(argv)
    today=date.fromisoformat(args.today) if args.today else datetime.now(SOFIA).date()
    token=os.environ.get('ENTSOE_API_TOKEN','').strip()
    if not token:
        print('ERROR: Missing ENTSOE_API_TOKEN secret',file=sys.stderr)
        return 2
    publish=os.environ.get('PUBLISH_DAM_PRICES')=='true' and os.environ.get('DAM_RIGHTS_CONFIRMED')=='true'
    base=Path(args.out)
    state={'updated_at_utc':datetime.now(timezone.utc).isoformat(timespec='seconds'),
           'source':'ENTSO-E Transparency Platform (A44)',
           'publication_enabled':publish,'days':[],'notes':[]}
    candidates=[]
    for day in [today,today+timedelta(days=1)]:
        try:
            rows,step=fetch_day(day,token)
            if step!=15: raise ValueError(f'15-minute series not available (resolution={step})')
            obj=build_rows(rows,day)
            state['days'].append({'date':day.isoformat(),'complete':True,'intervals':len(rows)})
            candidates.append(obj)
            print(f'VALIDATED day={day} intervals={len(rows)}')
        except (RuntimeError,OSError,ValueError) as exc:
            state['days'].append({'date':day.isoformat(),'complete':False})
            # Only emit known, sanitized failure categories; never expose API tokens/URLs.
            reason = str(exc)
            if reason.startswith('ENTSO-E HTTP '):
                import re
                match = re.search(r'ENTSO-E HTTP (\d{3})', reason)
                detail = 'HTTP_' + match.group(1) if match else 'HTTP_ERROR'
            elif reason.startswith('Incomplete delivery day:'):
                import re
                match = re.search(r'(\d+)/(\d+) intervals', reason)
                detail = 'INCOMPLETE_' + match.group(1) + '_OF_' + match.group(2) if match else 'INCOMPLETE_DAY'
            elif 'No recognized A44 price document or invalid XML' in reason:
                detail = 'INVALID_XML_OR_DOCUMENT'
            elif 'No DAM prices for selected Bulgarian delivery date' in reason:
                detail = 'NO_PRICES_FOR_DAY'
            elif 'Connection or timeout error' in reason:
                detail = 'NETWORK_OR_TIMEOUT'
            elif 'Mixed or unsupported interval resolutions' in reason:
                detail = 'BAD_RESOLUTION'
            elif '15-minute series not available' in reason:
                detail = 'NOT_15_MINUTE'
            elif 'Invalid BG quarter-hour coverage' in reason:
                detail = 'INVALID_COVERAGE'
            else:
                detail = 'OTHER_' + type(exc).__name__
            print(f'NOT_READY day={day} reason={detail}', flush=True)
    if not candidates:
        print('ERROR: No validated DAM day; keep old public file',file=sys.stderr)
        return 1
    if publish:
        # Never publish a partial day; one JSON per market day and a manifest for frontend.
        for item in candidates:
            write_json(base/f"dam-{item['delivery_date_bg']}.json",item)
        manifest={'updated_at_utc':state['updated_at_utc'],
           'available_days':[{'date':x['delivery_date_bg'],'path':f"data/dam-{x['delivery_date_bg']}.json"} for x in candidates],
           'source':state['source'],'disclaimer':'Public prices only if redistribution permission is confirmed.'}
        # Merge previously published day entries, retaining 14 days.
        old_path=base/'dam-public-index.json'
        if old_path.exists():
            try:
                old=json.loads(old_path.read_text(encoding='utf-8'))
                for entry in old.get('available_days',[]):
                    d=entry.get('date','')
                    if d not in {x['date'] for x in manifest['available_days']} and (base/f'dam-{d}.json').exists():
                        manifest['available_days'].append({'date':d,'path':f'data/dam-{d}.json'})
            except (ValueError,OSError): pass
        manifest['available_days']=sorted(manifest['available_days'],key=lambda x:x['date'],reverse=True)[:14]
        write_json(old_path,manifest)
        print('PUBLISHED_PRICE_FILES=YES')
    else:
        print('PUBLISHED_PRICE_FILES=NO (rights gate disabled)')
    write_json(base/'dam-public-status.json',state)
    return 0

if __name__=='__main__':
    raise SystemExit(main())
