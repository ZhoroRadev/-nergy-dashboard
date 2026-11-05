#!/usr/bin/env python3
"""Fail-closed ESO generation collector: only explicitly labelled MW measurements."""
import datetime as dt
import json
import pathlib
import re
import sys
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
URL = 'https://www.eso.bg/api/rabota_na_EEC_json.php'
OUT = ROOT / 'data' / 'eso-generation.json'
ALIASES = {
 'АЕЦ': 'nuclear', 'КТЕЦ': 'thermal_condensing', 'КОНДТЕЦ': 'thermal_condensing',
 'ТТЕЦ': 'thermal_district', 'ТОПЛТЕЦ': 'thermal_district',
 'ЗТЕЦ': 'thermal_industrial', 'ЗАВТЕЦ': 'thermal_industrial',
 'ВЕЦ': 'hydro', 'МВЕЦ': 'small_hydro',
 'ВЯЕЦ': 'wind', 'ФЕЦ': 'solar', 'БИОЕЦ': 'biomass',
 'ССЕЕ': 'storage_reported',
}

def canonical(s):
    return re.sub(r'[^A-ZА-Я0-9]', '', str(s).upper().replace('Й','И'))

def category(name):
    s=canonical(name)
    if s in ALIASES: return ALIASES[s]
    # Allow explicitly labelled unit suffixes; do not infer anonymous series.
    if s.endswith('MW') and s[:-2] in ALIASES: return ALIASES[s[:-2]]
    if s.endswith('МВТ') and s[:-3] in ALIASES: return ALIASES[s[:-3]]
    return None

def as_mw(v):
    if isinstance(v,bool) or v is None: return None
    if isinstance(v,dict):
        for key in ('mw','MW','power_mw','value_mw','value','power'):
            if key in v: return as_mw(v[key])
        return None
    if isinstance(v,str):
        v=v.strip().replace(' ', '').replace('\\u00a0','').replace(',','.')
        if not re.fullmatch(r'-?\d+(?:\.\d+)?',v): return None
    try:
        n=float(v)
        return round(n,2) if -15000 <= n <= 15000 else None
    except (ValueError,TypeError):return None

def extract(payload):
    out={}
    def visit(node, depth=0):
        if depth>6:return
        if isinstance(node,dict):
            label=next((node[k] for k in ('name','label','title','source','type','category','name_bg') if isinstance(node.get(k),str)),None)
            if label:
                cat=category(label)
                if cat:
                    val=as_mw(node)
                    if val is not None:out[cat]=val
            for k,v in node.items():
                cat=category(k)
                if cat:
                    val=as_mw(v)
                    if val is not None:out[cat]=val
                if isinstance(v,(list,dict)):visit(v,depth+1)
        elif isinstance(node,list):
            if len(node)==2 and isinstance(node[0],str):
                cat=category(node[0])
                val=as_mw(node[1])
                if cat and val is not None:out[cat]=val
            for item in node:
                if isinstance(item,(dict,list)):visit(item,depth+1)
    visit(payload)
    return out

def main():
    req=urllib.request.Request(URL,headers={'User-Agent':'EnergyIntelDashboard/2.0','Accept':'application/json'})
    with urllib.request.urlopen(req,timeout=30) as resp:
        data=json.loads(resp.read(2_000_000))
    values=extract(data)
    # No publication unless enough independently named source types were recognized.
    main_categories=set(values)-{'storage_reported'}
    if len(main_categories)<3:
        root_keys=list(data)[:20] if isinstance(data,dict) else f'list length {len(data)}' if isinstance(data,list) else str(type(data))
        print('Unrecognized ESO generation schema; top-level:',root_keys,file=sys.stderr)
        print('Recognized categories:',sorted(values),file=sys.stderr)
        return 2
    now=dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds')
    snapshot={'source':URL,'fetched_at':now,'units':'MW','generation_mw':values,
              'note':'ССЕЕ е отделна отчетена категория; знакът и физическият смисъл се проверяват отделно.'}
    OUT.parent.mkdir(parents=True,exist_ok=True)
    tmp=OUT.with_suffix('.tmp');tmp.write_text(json.dumps(snapshot,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');tmp.replace(OUT)
    print('Recognized ESO generation fields:', ', '.join(sorted(values)))
    return 0

if __name__=='__main__':
    try:sys.exit(main())
    except Exception as e:print('ESO generation collector failed:',e,file=sys.stderr);sys.exit(2)
