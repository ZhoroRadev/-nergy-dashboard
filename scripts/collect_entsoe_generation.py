#!/usr/bin/env python3
"""Publishing is OFF by default. Enable only after right-holder clearance."""
import datetime as dt
import json
import os
import pathlib
import sys
from entsoe_core import UTC,fetch_xml,parse_points
OUT=pathlib.Path(__file__).resolve().parents[1]/'data'/'entsoe-generation.json'

def main():
    if os.getenv('ENTSOE_GENERATION_PUBLICATION_ALLOWED','').lower()!='true':
        print('SKIP: ENTSOE_GENERATION_PUBLICATION_ALLOWED is not true; no public data written')
        return 0
    token=os.getenv('ENTSOE_API_TOKEN','').strip()
    if not token:print('ERROR: ENTSOE_API_TOKEN missing');return 2
    try:rows=parse_points(fetch_xml('generation',token),'generation')
    except (ValueError,RuntimeError) as e:print('Collection failed:',e);return 2
    if not rows:print('ERROR: No recognized generation records; old data retained');return 2
    data={'source':'ENTSO-E Transparency Platform - Actual Generation per Production Type (A75)',
          'fetched_at':dt.datetime.now(UTC).isoformat(timespec='seconds'),
          'timezone':'Europe/Sofia','records':rows,'note':'Net actual generation by PSR; pumped-storage consumption omitted where identified; source reporting may be delayed.'}
    OUT.parent.mkdir(parents=True,exist_ok=True)
    tmp=OUT.with_suffix('.tmp');tmp.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');tmp.replace(OUT)
    print(f'Generation public snapshot written: {len(rows)} intervals')
    return 0
if __name__=='__main__':sys.exit(main())
