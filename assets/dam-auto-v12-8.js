/* v12.8 Optional public DAM panel. Never loads Volue, BESS schedules or secrets. */
(()=>{'use strict';
 const section=document.getElementById('market'); if(!section)return;
 const panel=document.createElement('article'); panel.className='panel wide';
 panel.style.marginTop='16px';
 panel.innerHTML='<h2>Автоматичен DAM · ENTSO-E A44</h2><p id="dam128status" class="small">Зареждане...</p><div class="toolbar" style="margin:12px 0"><label>Пазарен ден <select id="dam128day"></select></label><button class="btn" id="dam128load">Зареди</button></div><div class="chart" style="height:320px"><canvas id="dam128chart"></canvas></div><div class="tablewrap" style="max-height:230px;overflow:auto"><table><thead><tr><th>Българско време</th><th>EUR/MWh</th></tr></thead><tbody id="dam128rows"></tbody></table></div><p class="hint">Източник: ENTSO-E Transparency Platform, A44. Времена: Europe/Sofia. Данните се публикуват само при потвърдени права за повторно използване.</p>';
 section.append(panel);
 const el=id=>document.getElementById(id),status=t=>el('dam128status').textContent=t;
 let catalog=[], chart=null;
 async function getJSON(url){const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);return r.json();}
 function validDay(s){return /^\d{4}-\d{2}-\d{2}$/.test(s)}
 // Populate the legacy Market v3 dashboard without altering its other data sources.
 function bridgeToMain(rows, day){
  try {
   if(typeof market==='undefined' || !Array.isArray(market) ||
      typeof refreshDays!=='function' || typeof updateMarket!=='function') return;
   const merged=new Map(market.map(r=>[r.timestamp,r]));
   for(const r of rows){
    const time=r.timestamp;
    if(typeof time!=='string' || !time.startsWith(day+'T') ||
       !Number.isFinite(r.dam_eur_mwh)) throw Error('Невалиден ред за основния екран');
    const previous=merged.get(time)||{};
    merged.set(time,{...previous,timestamp:time,dam_eur_mwh:r.dam_eur_mwh,
      intraday_eur_mwh:previous.intraday_eur_mwh??null,
      balancing_eur_mwh:previous.balancing_eur_mwh??null});
   }
   market=[...merged.values()].sort((a,b)=>a.timestamp.localeCompare(b.timestamp));
   refreshDays();
   updateMarket();
   if(typeof setBanner==='function')setBanner('DAM цените се зареждат автоматично от публичния ENTSO-E архив. Intraday и балансиращите цени се зареждат отделно.',true);
   const source=document.getElementById('marketSourceStatus');
   if(source)source.textContent='DAM автоматично · ENTSO-E A44';
   const info=document.getElementById('priceInfo');
   if(info)info.textContent=`${market.length} наблюдения · DAM автоматично`;
   const message=document.getElementById('importMessage');
   if(message)message.textContent=`DAM автоматично: ${day} · ${rows.length} периода. Ръчното зареждане на CSV остава достъпно.`;
  }catch(e){console.warn('DAM main dashboard bridge:',e.message);}
 }
 async function load(){
  const day=el('dam128day').value;if(!validDay(day))return;
  try{
   const data=await getJSON('data/dam-'+day+'.json');
   const rows=data.rows;
   if(data.delivery_date_bg!==day || data.interval_minutes!==15 || !Array.isArray(rows) || ![92,96,100].includes(rows.length))throw Error('Непълни или невалидни 15-минутни данни');
   const tbody=el('dam128rows');tbody.replaceChildren();
   const labels=[],prices=[];
   for(const r of rows){
    if(typeof r.timestamp!=='string'||!Number.isFinite(r.dam_eur_mwh))throw Error('Невалиден запис');
    labels.push(r.timestamp.substring(11,16));prices.push(r.dam_eur_mwh);
    const tr=document.createElement('tr');const a=document.createElement('td'),b=document.createElement('td');
    a.textContent=r.timestamp.replace('T',' '); b.textContent=Number(r.dam_eur_mwh).toLocaleString('bg-BG',{minimumFractionDigits:2,maximumFractionDigits:2});tr.append(a,b);tbody.append(tr);
   }
   if(chart){chart.destroy();chart=null;}
   if(window.Chart){chart=new Chart(el('dam128chart'),{type:'line',data:{labels,datasets:[{label:'DAM (EUR/MWh)',data:prices,borderColor:'#60a5fa',pointRadius:0,tension:0}]},options:{responsive:true,maintainAspectRatio:false,scales:{x:{ticks:{maxTicksLimit:12}}}}});}
   bridgeToMain(rows,day);
   status(`${day}: ${rows.length} интервала × 15 мин. Източник: ENTSO-E. Данните са публикувани при потвърдени права.`);
  }catch(err){status('Не успях да заредя цените: '+err.message);}
 }
 async function init(){
  try{
   const state=await getJSON('data/dam-public-status.json');
   const published=!!state.publication_enabled;
   if(!published){status('Автоматичният колектор е активен, но публичното публикуване на цените не е разрешено.');el('dam128load').disabled=true;return;}
   const manifest=await getJSON('data/dam-public-index.json');
   catalog=(manifest.available_days||[]).filter(x=>validDay(x.date));
   const sel=el('dam128day');sel.replaceChildren();
   for(const x of catalog){const opt=document.createElement('option');opt.value=x.date;opt.textContent=x.date;sel.append(opt);}
   if(!catalog.length)throw Error('Няма налични дати');
   await load();
  }catch(e){status('Няма автоматично публикувани DAM цени: '+e.message);el('dam128load').disabled=true;}
 }
 el('dam128load').addEventListener('click',load);init();
})();
