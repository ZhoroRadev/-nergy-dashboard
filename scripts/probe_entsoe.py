#!/usr/bin/env python3
"""Read-only diagnostics. Does not save response, publish anything or print token."""
import os
import sys
from entsoe_core import fetch_xml,parse_points

def main():
    token=os.environ.get('ENTSOE_API_TOKEN','').strip()
    if not token:
        print('CHECK FAILED: ENTSOE_API_TOKEN missing')
        return 2
    failed=False
    for kind in ('dam','generation'):
        try:
            rows=parse_points(fetch_xml(kind,token),kind)
            if not rows:print(f'{kind.upper()}: NO_RECOGNIZED_RECORDS');failed=True;continue
            keys=sorted({k for r in rows for k in r.get('generation_mw',{})})
            print(f'{kind.upper()}: OK | intervals={len(rows)} | first_utc={rows[0]["timestamp_utc"]} | last_utc={rows[-1]["timestamp_utc"]}' + (f' | production_types={len(keys)}' if keys else ''))
        except (ValueError,RuntimeError) as exc:
            print(f'{kind.upper()}: FAILED | {str(exc)}')
            failed=True
    print('No market or generation data was written to the repository.')
    return 1 if failed else 0
if __name__=='__main__':sys.exit(main())
