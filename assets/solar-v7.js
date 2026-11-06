/* Energy Intel v7: standalone illustrative PV production estimates.
   Open-Meteo GTI is irradiance on a tilted plane, not actual plant output. */
(() => {
  'use strict';
  const CITIES = {
    sofia: ['София',42.6977,23.3219], plovdiv:['Пловдив',42.1354,24.7453],
    varna:['Варна',43.2141,27.9147], pleven:['Плевен',43.4170,24.6067],
    stara:['Стара Загора',42.4258,25.6345], burgas:['Бургас',42.5048,27.4626]
  };
  const $ = (id) => document.getElementById(id);
  const fmt = (v, digits=1) => Number.isFinite(v) ? new Intl.NumberFormat('bg-BG',{minimumFractionDigits:digits,maximumFractionDigits:digits}).format(v) : '—';
  let chart = null;
  let lastData = null;
  let inFlight = null;
  const css = `
  .pv7-controls{display:flex;flex-wrap:wrap;gap:12px;align-items:end;margin:14px 0}
  .pv7-controls label{display:flex;flex-direction:column;gap:5px;font-size:12px;color:#adc0d9}
  .pv7-controls input,.pv7-controls select{background:#0b182a;color:#eef5ff;border:1px solid #39516d;border-radius:7px;padding:9px;min-width:95px;max-width:170px}
  .pv7-controls button,.pv7-button{border:1px solid #446383;background:#1b3856;color:#fff;border-radius:7px;padding:10px 14px;cursor:pointer}
  .pv7-controls button:disabled{opacity:.55;cursor:wait}
  .pv7-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(175px,1fr));gap:12px;margin:12px 0}
  .pv7-card{background:#15263e;border:1px solid #2d4564;border-radius:11px;padding:15px}
  .pv7-card small{display:block;color:#afc0d7;margin-bottom:7px}
  .pv7-card b{font-size:23px;color:#e7f2ff}
  .pv7-note{font-size:12px;color:#adbed4;line-height:1.6;margin:10px 0}
  .pv7-warn{color:#ffcb7e}.pv7-good{color:#81dfc0}
  .pv7-table{overflow-x:auto;max-height:340px;overflow-y:auto}
  .pv7-table table{width:100%;border-collapse:collapse;font-size:12px}
  .pv7-table th,.pv7-table td{padding:8px 12px;border-bottom:1px solid #2b3c55;text-align:right;white-space:nowrap}
  .pv7-table th:first-child,.pv7-table td:first-child{text-align:left}
  `;
  const style = document.createElement('style'); style.textContent=css; document.head.appendChild(style);

  function mount() {
    const host = $('weather');
    if (!host || $('pv7-panel')) return;
    const section = document.createElement('article');
    section.id='pv7-panel'; section.className='panel'; section.style.marginTop='18px';
    section.innerHTML = `
      <h2>ФЕЦ — прогнозно производство (v7.0)</h2>
      <p class="pv7-note">Ориентировъчна оценка по наклонена радиация GTI и температура. Не са реални производствени измервания или валидиран модел за конкретен ФЕЦ.</p>
      <div class="pv7-controls">
        <label>Точка<select id="pv7-city"><option value="sofia">София</option><option value="plovdiv">Пловдив</option><option value="varna">Варна</option><option value="pleven">Плевен</option><option value="stara">Стара Загора</option><option value="burgas">Бургас</option></select></label>
        <label>Своя мощност (MWp DC)<input id="pv7-mwp" type="number" min="0.01" max="1000" step="0.1" value="5"></label>
        <label>Загуби без температура (%)<input id="pv7-loss" type="number" min="0" max="60" step="1" value="12"></label>
        <label>Наклон (°)<input id="pv7-tilt" type="number" min="0" max="90" step="1" value="30"></label>
        <label>Азимут (°; 0=юг)<input id="pv7-az" type="number" min="-180" max="180" step="1" value="0"></label>
        <label>AC/DC лимит<input id="pv7-acratio" type="number" min="0.5" max="1.5" step="0.05" value="0.90"></label>
        <button id="pv7-refresh" type="button">↻ Обнови ФЕЦ прогноза</button>
        <button id="pv7-export" type="button" disabled>↓ CSV</button>
      </div>
      <div id="pv7-state" class="pv7-note" role="status">Зареждане на метеорологична прогноза…</div>
      <div id="pv7-cards" class="pv7-cards"></div>
      <div class="chart" style="min-height:330px"><canvas id="pv7-chart"></canvas></div>
      <h3 style="margin:12px 0">Прогноза по часове — избрана мощност</h3>
      <div class="pv7-table"><table><thead><tr><th>Час (София)</th><th>GTI (W/m²)</th><th>Темп. (°C)</th><th>Мощност (MW)</th><th>Енергия (MWh)</th></tr></thead><tbody id="pv7-rows"></tbody></table></div>
      <p class="pv7-note">Метод: P<sub>AC</sub> = min(P<sub>DC</sub> × GTI/1000 × (1 − загуби) × max(0,1 − 0,004 × (T<sub>cell</sub> − 25)), P<sub>DC</sub> × AC/DC лимит), където T<sub>cell</sub> ≈ T<sub>air</sub> + 0,03 × GTI. Номинална мощност в MWp (DC). Енергията за часов интервал е средната мощност × 1 час. Няма моделиране на засенчване, сняг, спирания, ограничения на мрежата и деградация.</p>
      <p class="pv7-note">Метеопрогноза: <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a> (данни CC BY 4.0, изчисленията са изменени). Безплатният API е само за нетърговско използване; за служебна/търговска употреба е необходим подходящ лиценз.</p>`;
    host.appendChild(section);
    // Match existing weather selection without changing its handlers.
    const globalCity = $('location');
    if (globalCity && CITIES[globalCity.value]) $('pv7-city').value=globalCity.value;
    $('pv7-refresh').addEventListener('click', fetchForecast);
    $('pv7-export').addEventListener('click', exportCSV);
    for (const id of ['pv7-mwp','pv7-loss','pv7-acratio']) $(id).addEventListener('change', render);
    for (const id of ['pv7-city','pv7-tilt','pv7-az']) $(id).addEventListener('change', fetchForecast);
    if (globalCity) globalCity.addEventListener('change',()=> {if(CITIES[globalCity.value]){$('pv7-city').value=globalCity.value;fetchForecast();}});
    fetchForecast();
  }
  function number(id, fallback){const v=Number($(id).value);return Number.isFinite(v)?v:fallback;}
  function forecastRows(){
    if (!lastData) return [];
    const h=lastData.hourly;
    if (!h || !Array.isArray(h.time) || !Array.isArray(h.global_tilted_irradiance) || !Array.isArray(h.temperature_2m)) throw Error('Непълни прогнозни данни от API.');
    // ISO hourly strings are local Europe/Sofia because API timezone=Europe/Sofia.
    const nowIso=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Sofia',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).format(new Date()).replace(' ','T');
    const start=h.time.findIndex(t=>t>=nowIso);
    if(start<0) throw Error('Няма бъдещи часови интервали.');
    return h.time.slice(start,start+48).map((t,i)=>({t,g:Number(h.global_tilted_irradiance[start+i]),temp:Number(h.temperature_2m[start+i])}))
      .filter(r=>Number.isFinite(r.g)&&Number.isFinite(r.temp));
  }
  function forecastPower(row,mwp,loss,acRatio){
    const g=Math.max(0,row.g);
    const tempCell=row.temp+0.03*g;
    const thermal=Math.max(0,1-0.004*(tempCell-25));
    return Math.min(mwp*acRatio,Math.max(0,mwp*g/1000*(1-loss/100)*thermal));
  }
  function render(){
    if(!lastData) return;
    try {
      const rows=forecastRows();
      const mwp=number('pv7-mwp',5), loss=number('pv7-loss',12), ac=number('pv7-acratio',0.9);
      if(!(mwp>0&&mwp<=1000&&loss>=0&&loss<=60&&ac>=0.5&&ac<=1.5)) throw Error('Провери въведените MWp, загуби и AC/DC лимит.');
      if(rows.length<24) throw Error('Недостатъчно прогнозни интервали за 24 часа.');
      const top=rows.slice(0,24);
      const totals=[1,5,20,mwp].map(p=>top.reduce((sum,r)=>sum+forecastPower(r,p,loss,ac),0));
      $('pv7-cards').innerHTML=[1,5,20,mwp].map((p,i)=>`<div class="pv7-card"><small>${i===3?'Избрана мощност':'Примерен ФЕЦ'} · ${fmt(p,1)} MWp</small><b>${fmt(totals[i],2)} MWh</b><small>Енергия · следващи 24 ч.</small><small>Среден коефициент на използване: ${fmt(totals[i]/(p*24)*100,1)}%</small></div>`).join('');
      const points=rows.map(r=>forecastPower(r,mwp,loss,ac));
      $('pv7-rows').innerHTML=rows.map((r,i)=>`<tr><td>${r.t.replace('T',' ')}</td><td>${fmt(r.g,0)}</td><td>${fmt(r.temp,1)}</td><td>${fmt(points[i],3)}</td><td>${fmt(points[i],3)}</td></tr>`).join('');
      if(typeof Chart!=='undefined'){
        if(chart) chart.destroy();
        chart=new Chart($('pv7-chart'),{type:'line',data:{labels:rows.map(r=>r.t.slice(5).replace('T',' ')),datasets:[{label:'Ориентировъчна мощност (MW)',data:points,borderColor:'#66b6ff',backgroundColor:'rgba(102,182,255,0.11)',fill:true,tension:.22,pointRadius:0,borderWidth:2}]},options:{responsive:true,maintainAspectRatio:false,plugins:{tooltip:{mode:'index',intersect:false}},scales:{x:{ticks:{color:'#a3b7d0',maxTicksLimit:12},grid:{color:'#293c54'}},y:{min:0,max:Math.max(1,mwp*ac),title:{display:true,text:'MW'},ticks:{color:'#a3b7d0'},grid:{color:'#293c54'}}}}});
      }
      $('pv7-export').disabled=false;
      $('pv7-state').className='pv7-note pv7-good';
      $('pv7-state').textContent=`Прогноза за ${CITIES[$('pv7-city').value][0]} · ${rows.length} валидни часа · GTI върху наклон ${number('pv7-tilt',30)}° · актуализирано на ${new Date().toLocaleString('bg-BG',{timeZone:'Europe/Sofia'})}. Числата са моделни оценки.`;
    }catch(e){$('pv7-state').className='pv7-note pv7-warn';$('pv7-state').textContent=e.message;$('pv7-export').disabled=true;}
  }
  async function fetchForecast(){
    if(!$('pv7-city')) return;
    if(inFlight) inFlight.abort();
    inFlight=new AbortController(); const signal=inFlight.signal;
    $('pv7-refresh').disabled=true;
    $('pv7-state').className='pv7-note'; $('pv7-state').textContent='Извличане на прогноза GTI от Open-Meteo…';
    const city=CITIES[$('pv7-city').value]||CITIES.sofia;
    const params=new URLSearchParams({latitude:String(city[1]),longitude:String(city[2]),hourly:'global_tilted_irradiance,temperature_2m',tilt:String(number('pv7-tilt',30)),azimuth:String(number('pv7-az',0)),timezone:'Europe/Sofia',forecast_days:'4'});
    try{
      const res=await fetch('https://api.open-meteo.com/v1/forecast?'+params,{signal,cache:'no-store'});
      if(!res.ok)throw Error(`Open-Meteo HTTP ${res.status}`);
      const body=await res.json();
      if(body.error)throw Error(body.reason||'Грешка от Open-Meteo');
      lastData=body;
      render();
    }catch(e){if(e.name!=='AbortError'){$('pv7-state').className='pv7-note pv7-warn';$('pv7-state').textContent='Неуспешна заявка: '+e.message;lastData=null;$('pv7-export').disabled=true;}}
    finally{$('pv7-refresh').disabled=false;}
  }
  function exportCSV(){
    if(!lastData)return;
    const rows=forecastRows(),mw=number('pv7-mwp',5),loss=number('pv7-loss',12),ac=number('pv7-acratio',0.9);
    const csv=['local_time_europe_sofia,gti_w_m2,temp_c,pv_power_mw,pv_energy_mwh',...rows.map(r=>{const p=forecastPower(r,mw,loss,ac);return [r.t,r.g,r.temp,p.toFixed(5),p.toFixed(5)].join(',');})].join('\r\n');
    const link=document.createElement('a');const url=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));link.href=url;link.download='pv_forecast_bg.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1500);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
})();
