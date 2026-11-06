/* Optional public display. Loads only a publication-cleared JSON snapshot.
   Does not call ENTSO-E directly or handle credentials. */
(() => {
  'use strict';
  const host = document.getElementById('system');
  if (!host || document.getElementById('entsoe-generation-v12')) return;
  const panel = document.createElement('article');
  panel.id = 'entsoe-generation-v12'; panel.className = 'panel';
  panel.style.marginTop = '16px';
  const title = document.createElement('h2');title.textContent = 'ENTSO-E · Производство по видове (v12)';panel.append(title);
  const note = document.createElement('p');note.className='subtitle';note.textContent='Изчакване на разрешен публичен snapshot от ENTSO-E';panel.append(note);
  const rows = document.createElement('div');rows.className='metrics';rows.style.marginTop='12px';panel.append(rows);
  const info = document.createElement('p');info.className='hint';info.textContent='Източник: ENTSO-E Transparency Platform (A75). Данните могат да бъдат отчетени със закъснение и да включват оценки.';panel.append(info);
  host.append(panel);
  const names={biomass:'Биомаса',brown_coal:'Лигнитни въглища',coal_gas:'Газ от въглища',gas:'Природен газ',hard_coal:'Каменни въглища',oil:'Нефт',oil_shale:'Нефтени шисти',peat:'Торф',geothermal:'Геотермална',pumped_storage:'ПАВЕЦ — генериране',hydro_run_of_river:'ВЕЦ — течащи води',hydro_reservoir:'ВЕЦ — язовирни',marine:'Морска',nuclear:'АЕЦ',other_renewable:'Други ВЕИ',solar:'ФЕЦ',waste:'Отпадъци',wind_offshore:'ВяЕЦ — море',wind_onshore:'ВяЕЦ — суша',other:'Други'};
  const fmt=(x)=>Number(x).toLocaleString('bg-BG',{maximumFractionDigits:1});
  async function reload(){
    try{
      const res=await fetch('data/entsoe-generation.json?v='+Date.now(),{cache:'no-store'});
      if(!res.ok){note.textContent='Няма разрешен публичен snapshot (HTTP '+res.status+').';return;}
      const obj=await res.json(), a=Array.isArray(obj.records)?obj.records:[];
      const last=[...a].reverse().find(r=>r.generation_mw && Object.keys(r.generation_mw).length);
      if(!last)throw Error('Няма разпознати производствени стойности');
      rows.replaceChildren();
      for(const [key,val] of Object.entries(last.generation_mw)){
        if(!(key in names)||!Number.isFinite(val))continue;
        const box=document.createElement('div');box.className='metric';
        const l=document.createElement('div');l.className='label';l.textContent=names[key];
        const v=document.createElement('div');v.className='value';v.textContent=fmt(val);
        const d=document.createElement('div');d.className='desc';d.textContent='MW';
        box.append(l,v,d);rows.append(box);
      }
      note.textContent='Интервал: '+last.timestamp+' · Извлечено: '+obj.fetched_at+' · '+a.length+' налични интервала';
    }catch(_){note.textContent='Проблем при обработване на разрешения snapshot.';}
  }
  reload();
})();
