/* Energy Intel v9.0 — browser-only, illustrative solar portfolio forecast.
   No portfolio details or actual production are transmitted to GitHub.
   Forecast requests transmit coordinates and PV orientation to Open-Meteo. */
(() => {
'use strict';
const $ = id => document.getElementById(id);
const KEY='energyintel_v8_plants', SNAP='energyintel_v8_forecasts';
const MAX=20;
const CITIES={sofia:['София',42.6977,23.3219],plovdiv:['Пловдив',42.1354,24.7453],varna:['Варна',43.2141,27.9147],pleven:['Плевен',43.4170,24.6067],stara:['Стара Загора',42.4258,25.6345],burgas:['Бургас',42.5048,27.4626]};
const F=(v,d=2)=>Number.isFinite(v)?v.toLocaleString('bg-BG',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
const asNum=v=>v===''?NaN:Number(v);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let plants=[], projected=[], actual=new Map(), chart=null, series=[], controller=null, generation=0, lastSavedGeneration=-1;
function readJSON(key,fall){try{return JSON.parse(localStorage.getItem(key))??fall}catch{return fall}}
function savePlants(){try{localStorage.setItem(KEY,JSON.stringify(plants))}catch{message('Не може да се запише в браузъра. Използвай CSV експорт.',true)}}
function message(s,bad=false){const el=$('pv8-msg');if(el){el.textContent=s;el.style.color=bad?'#ffd093':'#a9e4d4'}}
function validate(p){if(!p.id||!p.name||!/^[\w\-]{1,40}$/.test(p.id))throw Error('ID: само латински букви, цифри, _ и - (до 40 знака).');if(!(p.lat>=41&&p.lat<=45&&p.lon>=22&&p.lon<=29))throw Error('Координатите трябва да са в България.');if(!(p.mwp>0&&p.mwp<=1000&&p.loss>=0&&p.loss<=60&&p.tilt>=0&&p.tilt<=90&&p.az>=-180&&p.az<=180&&p.ac>=0.5&&p.ac<=1.5))throw Error('Невалидна мощност, загуби, наклон, азимут или AC/DC лимит.')}
const css=`
.pv8-form{display:flex;gap:10px;flex-wrap:wrap;align-items:end;margin:12px 0}.pv8-form label{display:flex;flex-direction:column;gap:5px;color:#b3c7df;font-size:12px}.pv8-form input,.pv8-form select{background:#0b182b;color:#e9f3ff;padding:9px;border:1px solid #39516d;border-radius:7px;max-width:145px;min-width:100px}.pv8-btn{background:#1c3a59;color:#f2f7ff;border:1px solid #476686;border-radius:7px;padding:10px 13px;cursor:pointer}.pv8-btn:disabled{opacity:.5;cursor:wait}.pv8-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin:12px 0}.pv8-card{background:#172a42;border:1px solid #2c4869;padding:15px;border-radius:9px}.pv8-card small{display:block;color:#abc0d9;margin-bottom:7px}.pv8-card b{font-size:21px}.pv8-scroll{overflow:auto;max-height:360px}.pv8-table{border-collapse:collapse;width:100%;font-size:12px}.pv8-table th,.pv8-table td{border-bottom:1px solid #30435a;padding:9px 8px;text-align:right;white-space:nowrap}.pv8-table th:first-child,.pv8-table td:first-child{text-align:left}.pv8-note{font-size:12px;color:#acbfd6;line-height:1.65;margin:12px 0}.pv8-layout{display:flex;gap:10px;flex-wrap:wrap;align-items:center}.pv8-divider{border-top:1px solid #30435a;margin:18px 0}.pv8-import{display:flex;flex-wrap:wrap;gap:12px;align-items:center}`;
function mount(){if(!$('weather')||$('pv8-panel'))return;const style=document.createElement('style');style.textContent=css;document.head.append(style);
const box=document.createElement('article');box.id='pv8-panel';box.className='panel';box.style.marginTop='18px';box.innerHTML=`
<h2>ФЕЦ портфейл — прогнозиране и проверка (v9.0)</h2>
<p class="pv8-note">Добавяй отделни ФЕЦ с координати в България, номинална DC мощност и параметри. Това е ориентировъчна, невалидарана прогноза. Примерните записи не са реални централи. Версиите на прогнозите се архивират автоматично локално.</p>
<div class="pv8-form">
<label>ID<input id="pv8-id" placeholder="pv_001" maxlength="40"></label><label>Име<input id="pv8-name" placeholder="ФЕЦ 1" maxlength="80"></label>
<label>Град (попълва координати)<select id="pv8-city"><option value="sofia">София</option><option value="plovdiv">Пловдив</option><option value="varna">Варна</option><option value="pleven">Плевен</option><option value="stara">Стара Загора</option><option value="burgas">Бургас</option></select></label>
<label>Ширина<input id="pv8-lat" type="number" min="41" max="45" step="0.0001" value="42.6977"></label><label>Дължина<input id="pv8-lon" type="number" min="22" max="29" step="0.0001" value="23.3219"></label>
<label>MWp DC<input id="pv8-mwp" type="number" min="0.01" step="0.1" value="5"></label><label>Загуби (%)<input id="pv8-loss" type="number" min="0" max="60" value="12"></label>
<label>Наклон (°)<input id="pv8-tilt" type="number" min="0" max="90" value="30"></label><label>Азимут (0=юг)<input id="pv8-az" type="number" min="-180" max="180" value="0"></label><label>AC/DC лимит<input id="pv8-ac" type="number" min="0.5" max="1.5" step="0.05" value="0.9"></label>
<button class="pv8-btn" type="button" id="pv8-add">Добави / замени по ID</button>
</div>
<p class="pv8-note">Регистърът се пази само в локалния браузър. За фирмени портфейли използвай одобрена защитена среда. При прогноза параметрите и координатите се изпращат към Open-Meteo.</p>
<div class="pv8-scroll"><table class="pv8-table"><thead><tr><th>ID и име</th><th>Координати</th><th>MWp</th><th>Наклон / азимут</th><th>Прогноза 24 ч.</th><th>Действие</th></tr></thead><tbody id="pv8-plants"></tbody></table></div>
<div class="pv8-layout" style="margin:14px 0"><button class="pv8-btn" id="pv8-run">↻ Обнови портфейлната прогноза</button><button class="pv8-btn" id="pv8-csv" disabled>↓ Прогноза CSV</button><button class="pv8-btn" id="pv8-export-plants">↓ ФЕЦ регистър CSV</button><button class="pv8-btn" id="pv8-save" disabled>↓ Архив на прогнози (JSON)</button><button class="pv8-btn" id="pv8-clear">Изчисти портфейла</button></div>
<p id="pv8-msg" class="pv8-note" role="status">Добави ФЕЦ и натисни „Обнови портфейлната прогноза“.</p>
<div id="pv8-cards" class="pv8-cards"></div><div class="chart" style="min-height:330px"><canvas id="pv8-chart"></canvas></div>
<h3>Почасова портфейлна прогноза (48 часа)</h3><div class="pv8-scroll"><table class="pv8-table"><thead><tr><th>Час (София)</th><th>Общо MW</th><th>Общо MWh</th><th>Брой ФЕЦ с данни</th></tr></thead><tbody id="pv8-rows"><tr><td colspan="4">Няма прогноза</td></tr></tbody></table></div>
<div class="pv8-divider"></div><h3>Прогноза спрямо действително производство</h3>
<p class="pv8-note">1) При всяко успешно обновяване версията се записва автоматично в браузъра (преди периода на доставка). 2) По-късно импортирай действителните измервания с CSV: <code>plant_id,timestamp,actual_mwh</code>. Timestamp: <code>2026-11-07T12:00:00+02:00</code> или местен час <code>2026-11-07T12:00</code> (Europe/Sofia). За повторения при смяна на часовото време използвай ISO с UTC offset. Един ред е един часов интервал, означен с неговото начало. Сравняват се само съвпадащи завод, час и запазена предварителна прогноза.</p>
<div class="pv8-import"><input id="pv8-actual-file" type="file" accept=".csv,text/csv"><button class="pv8-btn" id="pv8-template">↓ CSV шаблон</button><button class="pv8-btn" id="pv8-eval-export">↓ Резултати CSV</button><button class="pv8-btn" id="pv8-clear-forecasts">Изчисти запазените прогнози</button></div>
<p id="pv8-actual-status" class="pv8-note">Измервания не са заредени.</p>
<div class="pv8-cards" id="pv8-eval"></div><p class="pv8-note" id="pv8-calibration-note">Калибрацията е информативна, без автоматична промяна на прогнозите.</p><h3>Показатели по ФЕЦ</h3><div class="pv8-scroll"><table class="pv8-table"><thead><tr><th>ФЕЦ</th><th>Интервали</th><th>MAE (MWh)</th><th>WAPE</th><th>Bias (MWh)</th><th>Коеф. (само анализ)</th></tr></thead><tbody id="pv8-perplant"><tr><td colspan="6">Няма реални измервания.</td></tr></tbody></table></div><h3>Съпоставени часови данни</h3><div class="pv8-scroll"><table class="pv8-table"><thead><tr><th>ФЕЦ</th><th>Час (София)</th><th>Прогноза MWh</th><th>Реално MWh</th><th>Грешка MWh</th></tr></thead><tbody id="pv8-eval-rows"><tr><td colspan="5">Все още няма съпоставими измервания.</td></tr></tbody></table></div>
<p class="pv8-note">Модел: P = min(MWp × GTI/1000 × (1−загуби) × max(0,1−0,004×(Tcell−25)), MWp × AC/DC лимит), Tcell ≈ Tair + 0,03×GTI. За точни търговски прогнози са нужни реални инверторни параметри, измервания, backtesting и лицензирани метеорологични данни. <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a>: безплатният API не е за търговска употреба.</p>`;
$('weather').appendChild(box);
plants=readJSON(KEY,[]).filter(p=>{try{validate(p);return true}catch{return false}}).slice(0,MAX);renderPlants();evaluate();
$('pv8-city').addEventListener('change',()=>{const c=CITIES[$('pv8-city').value];$('pv8-lat').value=c[1];$('pv8-lon').value=c[2]});
$('pv8-add').addEventListener('click',addPlant);$('pv8-run').addEventListener('click',run);$('pv8-csv').addEventListener('click',exportForecast);$('pv8-export-plants').addEventListener('click',exportPlants);$('pv8-save').addEventListener('click',exportSnapshots);$('pv8-clear').addEventListener('click',()=>{if(confirm('Изчисти регистъра на ФЕЦ само в този браузър?')){plants=[];projected=[];series=[];savePlants();renderPlants();renderForecast();}});
$('pv8-actual-file').addEventListener('change',importActual);$('pv8-eval-export').addEventListener('click',exportEvaluation);$('pv8-template').addEventListener('click',()=>download('actual_production_template.csv','plant_id,timestamp,actual_mwh\r\n', 'text/csv'));$('pv8-clear-forecasts').addEventListener('click',()=>{if(confirm('Изтрий всички запазени прогнозни snapshots в този браузър?')){localStorage.removeItem(SNAP);lastSavedGeneration=-1;evaluate();}});
}
function addPlant(){try{const p={id:$('pv8-id').value.trim(),name:$('pv8-name').value.trim(),lat:asNum($('pv8-lat').value),lon:asNum($('pv8-lon').value),mwp:asNum($('pv8-mwp').value),loss:asNum($('pv8-loss').value),tilt:asNum($('pv8-tilt').value),az:asNum($('pv8-az').value),ac:asNum($('pv8-ac').value)};validate(p);const i=plants.findIndex(x=>x.id===p.id);if(i<0&&plants.length>=MAX)throw Error('Максимум 20 ФЕЦ в тази версия.');if(i>=0)plants[i]=p;else plants.push(p);savePlants();projected=[];series=[];renderPlants();renderForecast();message('Регистърът е записан локално. Обнови прогнозата за новите параметри.')}catch(e){message(e.message,true)}}
function renderPlants(){const totals=new Map(projected.map(p=>[p.id,p.rows.slice(0,24).reduce((a,x)=>a+x.power,0)]));$('pv8-plants').innerHTML=plants.map(p=>`<tr><td>${esc(p.id)} · ${esc(p.name)}</td><td>${F(p.lat,4)}, ${F(p.lon,4)}</td><td>${F(p.mwp)}</td><td>${p.tilt}° / ${p.az}°</td><td>${totals.has(p.id)?F(totals.get(p.id))+' MWh':'—'}</td><td><button class="pv8-btn" type="button" data-remove="${esc(p.id)}">Премахни</button></td></tr>`).join('')||'<tr><td colspan="6">Няма добавени централи.</td></tr>';$('pv8-plants').querySelectorAll('[data-remove]').forEach(b=>b.addEventListener('click',()=>{plants=plants.filter(p=>p.id!==b.dataset.remove);savePlants();projected=[];series=[];renderPlants();renderForecast();}));}
function nowIso(){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Sofia',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).format(new Date()).replace(' ','T')}
function power(r,p){const g=Math.max(0,r.g),cell=r.temp+.03*g;return Math.max(0,Math.min(p.mwp*p.ac,p.mwp*g/1000*(1-p.loss/100)*Math.max(0,1-.004*(cell-25))))}
async function request(p,signal){const q=new URLSearchParams({latitude:String(p.lat),longitude:String(p.lon),hourly:'global_tilted_irradiance,temperature_2m',tilt:String(p.tilt),azimuth:String(p.az),timezone:'Europe/Sofia',forecast_days:'4'});const response=await fetch('https://api.open-meteo.com/v1/forecast?'+q,{signal,cache:'no-store'});if(!response.ok)throw Error('HTTP '+response.status);const data=await response.json();if(data.error)throw Error(data.reason||'API отказа заявката');const h=data.hourly;if(!h||!Array.isArray(h.time)||!Array.isArray(h.global_tilted_irradiance)||!Array.isArray(h.temperature_2m))throw Error('Непълни данни');const start=h.time.findIndex(t=>t>=nowIso());if(start<0)throw Error('Няма бъдещи часове');const rows=h.time.slice(start,start+48).map((t,i)=>({t,g:Number(h.global_tilted_irradiance[start+i]),temp:Number(h.temperature_2m[start+i])}));if(rows.length<24||rows.some(x=>!Number.isFinite(x.g)||!Number.isFinite(x.temp)))throw Error('Няма 24 валидни часови интервала');return rows.map(r=>({t:r.t,power:power(r,p)}));}
async function run(){if(!plants.length){message('Първо добави поне една централа.',true);return}if(controller)controller.abort();const local=++generation;controller=new AbortController();projected=[];series=[];$('pv8-run').disabled=true;$('pv8-save').disabled=true;$('pv8-csv').disabled=true;message('Извличане на Open-Meteo прогнози: 0/'+plants.length+' ФЕЦ…');const errors=[];const next=plants.slice();const results=[];async function worker(){while(next.length&&!controller.signal.aborted){const p=next.shift();try{results.push({id:p.id,name:p.name,rows:await request(p,controller.signal)})}catch(e){if(e.name!=='AbortError')errors.push(p.id+': '+e.message)}if(local===generation)message('Обработени: '+(results.length+errors.length)+'/'+plants.length+' ФЕЦ…')}}await Promise.all(Array.from({length:Math.min(3,plants.length)},()=>worker()));if(local!==generation)return;projected=results;const hours=[...new Set(results.flatMap(p=>p.rows.map(r=>r.t)))].sort().slice(0,48);series=hours.map(t=>{const values=results.map(p=>p.rows.find(r=>r.t===t)?.power).filter(Number.isFinite);return {t,power:values.reduce((a,b)=>a+b,0),n:values.length}});renderForecast();renderPlants();if(results.length)saveSnapshot(true);$('pv8-run').disabled=false;$('pv8-csv').disabled=!projected.length;$('pv8-save').disabled=!projected.length;message('Успешни прогнози: '+results.length+'/'+plants.length+' ФЕЦ. '+(errors.length?'Грешки: '+errors.join(' | '):'Числата са ориентировъчни.'),errors.length>0);}
function renderForecast(){if(chart){chart.destroy();chart=null}if(!series.length){$('pv8-rows').innerHTML='<tr><td colspan="4">Няма прогноза</td></tr>';$('pv8-cards').innerHTML='';$('pv8-csv').disabled=true;$('pv8-save').disabled=true;return;}const full=series.filter(x=>x.n===projected.length);const complete24=full.length>=24&&series.slice(0,24).every(x=>x.n===projected.length);const e24=complete24?series.slice(0,24).reduce((a,b)=>a+b.power,0):NaN;const totalMWp=plants.filter(p=>projected.some(x=>x.id===p.id)).reduce((a,b)=>a+b.mwp,0);$('pv8-cards').innerHTML=`<div class="pv8-card"><small>Прогнозирани ФЕЦ</small><b>${projected.length}/${plants.length}</b></div><div class="pv8-card"><small>Обща DC мощност</small><b>${F(totalMWp)} MWp</b></div><div class="pv8-card"><small>Енергия следващи 24 часа</small><b>${F(e24)} MWh</b><small>${complete24?'По наличните валидни прогнози':'Непълно покритие'}</small></div><div class="pv8-card"><small>Времеви интервали</small><b>${full.length}</b><small>Пълно портфейлно покритие</small></div>`;
$('pv8-rows').innerHTML=series.map(r=>`<tr><td>${esc(r.t.replace('T',' '))}</td><td>${r.n===projected.length?F(r.power,3):'—'}</td><td>${r.n===projected.length?F(r.power,3):'—'}</td><td>${r.n}/${projected.length}</td></tr>`).join('');if(typeof Chart!=='undefined'){chart=new Chart($('pv8-chart'),{type:'line',data:{labels:series.map(r=>r.t.slice(5).replace('T',' ')),datasets:[{label:'Общо прогнозно ФЕЦ производство (MW)',data:series.map(r=>r.n===projected.length?r.power:null),borderColor:'#70c4ff',backgroundColor:'rgba(80,165,255,0.13)',fill:true,tension:.17,pointRadius:0,spanGaps:false}]},options:{responsive:true,maintainAspectRatio:false,scales:{x:{ticks:{color:'#a8c2df',maxTicksLimit:12},grid:{color:'#293c54'}},y:{min:0,ticks:{color:'#a8c2df'},grid:{color:'#293c54'},title:{display:true,text:'MW'}}}}});}}
function download(filename,data,type='text/csv;charset=utf-8'){const u=URL.createObjectURL(new Blob(['\ufeff',data],{type}));const a=document.createElement('a');a.href=u;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(u),1200)}
function exportForecast(){if(!projected.length)return;let lines=['plant_id,plant_name,timestamp,forecast_mw,forecast_mwh'];for(const p of projected)for(const r of p.rows)lines.push([p.id,'"'+p.name.replace(/"/g,'""')+'"',r.t,r.power.toFixed(5),r.power.toFixed(5)].join(','));download('pv_portfolio_forecast.csv',lines.join('\r\n'))}
function exportPlants(){let lines=['plant_id,name,latitude,longitude,mwp_dc,loss_percent,tilt_deg,azimuth_deg,ac_dc_limit'];for(const p of plants)lines.push([p.id,'"'+p.name.replace(/"/g,'""')+'"',p.lat,p.lon,p.mwp,p.loss,p.tilt,p.az,p.ac].join(','));download('pv_portfolio_register.csv',lines.join('\r\n'))}
function safeSnapshots(){return readJSON(SNAP,[]).filter(r=>r&&typeof r.id==='string'&&typeof r.t==='string'&&Number.isFinite(Number(r.p))&&Number.isFinite(Date.parse(r.captured)))}
function saveSnapshot(auto=false){
  if(!projected.length)return;
  if(auto && lastSavedGeneration===generation)return;
  const store=safeSnapshots(), captured=new Date().toISOString();
  for(const p of projected)for(const r of p.rows){
    const key=p.id+'|'+r.t+'|'+captured;
    if(!store.some(x=>x.id+'|'+x.t+'|'+x.captured===key))store.push({id:p.id,t:r.t,p:r.power,captured});
  }
  // Keep versions rather than replacing observations at the same delivery hour.
  // Prefer latest 10,000 points if browser storage becomes constrained.
  store.sort((a,b)=>a.captured.localeCompare(b.captured));
  const limited=store.slice(-10000);
  try{
    localStorage.setItem(SNAP,JSON.stringify(limited));
    lastSavedGeneration=generation;
    message('Версията е '+(auto?'автоматично ':'')+'архивирана: '+projected.length+' ФЕЦ, общо '+limited.length+' прогнозни точки. Данните са само в този браузър.');
    evaluate();
  }catch(e){message('Неуспешен локален архив (вероятно запълнена памет). Използвай CSV експорт.',true)}
}
function exportSnapshots(){const rows=safeSnapshots();if(!rows.length){message('Няма архивирани прогнози.',true);return;}download('pv_forecast_versions_backup.json',JSON.stringify({version:9,exported_at:new Date().toISOString(),snapshots:rows},null,2),'application/json')}
function parseCSV(text){const s=text.replace(/^\uFEFF/,'').trim().split(/\r?\n/);if(s.length<2)throw Error('CSV файлът е празен.');const head=s.shift().split(',').map(x=>x.trim().toLowerCase());for(const f of ['plant_id','timestamp','actual_mwh'])if(!head.includes(f))throw Error('Липсва колона '+f);const out=[];for(const ln of s){if(!ln.trim())continue;const v=ln.split(',');if(v.length!==head.length)throw Error('Провери CSV формата — не се поддържат запетаи в текстови полета.');const obj=Object.fromEntries(head.map((h,i)=>[h,v[i].trim()]));const val=Number(obj.actual_mwh.replace(',','.'));if(!Number.isFinite(val)||val<0)throw Error('Невалидно actual_mwh');const t=obj.timestamp;if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:[+-]\d{2}:\d{2})?$/.test(t))throw Error('Невалиден ISO timestamp: '+t);out.push({id:obj.plant_id,t,energy:val})}return out;}
function localHour(stamp){const d=new Date(stamp);if(!Number.isFinite(d.getTime()))return null;const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Sofia',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(d);const o=Object.fromEntries(parts.map(p=>[p.type,p.value]));return `${o.year}-${o.month}-${o.day}T${o.hour}:00`}
async function importActual(e){const file=e.target.files?.[0];if(!file)return;if(file.size>2_000_000){$('pv8-actual-status').textContent='CSV е твърде голям (макс. 2 MB).';return}try{const rows=parseCSV(await file.text());actual=new Map(rows.map(r=>[r.id+'|'+(r.t.match(/[+-]\d{2}:\d{2}$/)?localHour(r.t):r.t.slice(0,13)+':00'),r.energy]));$('pv8-actual-status').textContent='Заредени '+rows.length+' реални измервания само в текущия браузър. Данните не се изпращат на GitHub.';evaluate()}catch(err){$('pv8-actual-status').textContent='Грешка: '+err.message}}
function matchedRows(){
 const versions=safeSnapshots();const chosen=new Map();
 for(const r of versions){
   const hour=r.t.slice(0,13)+':00';
   const localCapture=localHour(r.captured);
   // Historical backtest: only forecast versions captured BEFORE delivery hour.
   if(!localCapture||localCapture>=hour)continue;
   const k=r.id+'|'+hour;
   if(!actual.has(k))continue;
   const prev=chosen.get(k);
   // Evaluate earliest available pre-delivery forecast, not a revised late forecast.
   if(!prev||r.captured<prev.captured)chosen.set(k,{id:r.id,t:hour,p:Number(r.p),real:actual.get(k),captured:r.captured});
 }
 return [...chosen.values()].sort((a,b)=>a.t.localeCompare(b.t)||a.id.localeCompare(b.id));
}
function summary(rows){
 const n=rows.length, total=rows.reduce((a,r)=>a+r.real,0), predicted=rows.reduce((a,r)=>a+r.p,0);
 return {n,mae:n?rows.reduce((a,r)=>a+Math.abs(r.p-r.real),0)/n:NaN,
 wape:total>0?100*rows.reduce((a,r)=>a+Math.abs(r.p-r.real),0)/total:NaN,
 bias:n?(predicted-total)/n:NaN, total,predicted};
}
function evaluate(){
 const overlap=matchedRows(), stat=summary(overlap), versions=safeSnapshots();
 $('pv8-eval').innerHTML=`<div class="pv8-card"><small>Съпоставени часови интервали</small><b>${stat.n}</b></div><div class="pv8-card"><small>MAE (MWh/час)</small><b>${F(stat.mae,3)}</b></div><div class="pv8-card"><small>WAPE (%)</small><b>${Number.isFinite(stat.wape)?F(stat.wape)+'%':'—'}</b></div><div class="pv8-card"><small>Bias (прогноза − реално, MWh/час)</small><b>${F(stat.bias,3)}</b></div><div class="pv8-card"><small>Архивирани прогнозни версии (точки)</small><b>${versions.length}</b></div>`;
 const byPlant=new Map();for(const r of overlap){if(!byPlant.has(r.id))byPlant.set(r.id,[]);byPlant.get(r.id).push(r)}
 const per=[];
 for(const [id,rows] of byPlant){
   const s=summary(rows);const daytime=rows.filter(r=>r.p>0.05||r.real>0.05);
   const days=new Set(daytime.map(r=>r.t.slice(0,10))).size;
   const totalForecast=daytime.reduce((a,r)=>a+r.p,0);
   const totalActual=daytime.reduce((a,r)=>a+r.real,0);
   const factor=daytime.length>=24&&days>=3&&totalForecast>0?totalActual/totalForecast:NaN;
   per.push({id,s,factor,days,daycount:daytime.length});
 }
 $('pv8-perplant').innerHTML=per.map(x=>`<tr><td>${esc(x.id)}</td><td>${x.s.n}</td><td>${F(x.s.mae,3)}</td><td>${Number.isFinite(x.s.wape)?F(x.s.wape)+'%':'—'}</td><td>${F(x.s.bias,3)}</td><td>${Number.isFinite(x.factor)?F(x.factor,3):'—'}</td></tr>`).join('')||'<tr><td colspan="6">Няма съпоставени данни.</td></tr>';
 $('pv8-calibration-note').textContent='Информативен коефициент = сумарно реално / сумарно прогнозно за дневни часове; показва се само при ≥24 дневни интервала, обхващащи ≥3 различни дни. Не се прилага автоматично. Bias > 0 означава надценяване. Сравнява се най-ранната запазена прогноза преди интервала.';
 $('pv8-eval-rows').innerHTML=overlap.slice(-150).reverse().map(r=>`<tr><td>${esc(r.id)}</td><td>${esc(r.t.replace('T',' '))}</td><td>${F(r.p,3)}</td><td>${F(r.real,3)}</td><td>${F(r.p-r.real,3)}</td></tr>`).join('')||'<tr><td colspan="5">Няма съпоставими данни. Направи прогноза преди часа на доставка и по-късно импортирай действително производство.</td></tr>';
}
function exportEvaluation(){const rows=matchedRows();if(!rows.length){message('Няма резултати за изтегляне.',true);return}
 const lines=['plant_id,timestamp,forecast_mwh,actual_mwh,error_mwh,forecast_saved_at'];
 for(const r of rows)lines.push([r.id,r.t,r.p.toFixed(5),r.real.toFixed(5),(r.p-r.real).toFixed(5),r.captured].join(','));
 download('pv_forecast_accuracy.csv',lines.join('\r\n'));
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
})();
