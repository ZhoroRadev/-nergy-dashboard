/* Energy Trading Dashboard v5 — independent ESO load analysis.
   Reads existing public data/eso.json; never changes collectors or market data. */
(() => {
  'use strict';
  const fmt = (n, places=0) => Number.isFinite(n) ? n.toLocaleString('bg-BG', {minimumFractionDigits:places,maximumFractionDigits:places}) : '—';
  const timeFmt = new Intl.DateTimeFormat('bg-BG', { timeZone:'Europe/Sofia',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false });
  const dateFmt = new Intl.DateTimeFormat('bg-BG', { timeZone:'Europe/Sofia',dateStyle:'medium',timeStyle:'short' });
  const css = `
    #esoLoadV5{margin-top:16px}
    #esoLoadV5 .v5-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:14px 0}
    #esoLoadV5 .v5-stat{background:#17263c;border:1px solid #26364c;border-radius:10px;padding:14px}
    #esoLoadV5 .v5-caption{font-size:12px;color:#94a9c2}
    #esoLoadV5 .v5-number{font-size:23px;font-weight:750;margin:8px 0 3px}
    #esoLoadV5 .v5-status{padding:8px 11px;border:1px solid #35516c;border-radius:8px;background:#14243a;color:#aec5df;font-size:12px}
    #esoLoadV5 .v5-status.warn{color:#ffcd8f;border-color:#75522a;background:#302719}
    #esoLoadV5 .v5-status.error{color:#ff9bab;border-color:#743b48;background:#301e2a}
    #esoLoadV5 .v5-actions{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin:12px 0}
    #esoLoadV5 .v5-chart-wrap{height:310px;position:relative}
    #esoLoadV5 .v5-btn{border:1px solid #3b5878;background:#192d46;border-radius:8px;color:#eaf2ff;padding:8px 12px;cursor:pointer}
    #esoLoadV5 .v5-scroll{max-height:260px;overflow:auto}
    #esoLoadV5 table{width:100%;border-collapse:collapse}
    #esoLoadV5 td,#esoLoadV5 th{padding:8px 10px;border-bottom:1px solid #26364c;text-align:right}
    #esoLoadV5 td:first-child,#esoLoadV5 th:first-child{text-align:left}
    @media(max-width:980px){#esoLoadV5 .v5-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media(max-width:550px){#esoLoadV5 .v5-metrics{grid-template-columns:1fr 1fr}#esoLoadV5 .v5-number{font-size:19px}}
  `;
  function node(tag, cls, text) { const el=document.createElement(tag); if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el; }
  function launch() {
    const system = document.getElementById('system');
    if (!system || document.getElementById('esoLoadV5')) return;
    const style=node('style');style.textContent=css;document.head.appendChild(style);
    const wrap=node('article','panel');wrap.id='esoLoadV5';
    const title=node('h2',null,'ЕСО · разширен анализ на системния товар (v5.0)');wrap.appendChild(title);
    const subtitle=node('p','small','Реално отчетени стойности в MW · последните налични до 24 часа · време Europe/Sofia');wrap.appendChild(subtitle);
    const metrics=node('div','v5-metrics');
    const metricIds=[['last','Последен товар','MW'],['min','Минимум','MW'],['max','Максимум','MW'],['avg','Средноаритметичен товар','MW'],['delta','Изменение спрямо предходен','MW'],['deltaPct','Изменение спрямо предходен','%'],['records','Брой наблюдения','за последните 24 ч.'],['age','Възраст на последното измерване','минути']];
    metricIds.forEach(([id,label,unit])=>{const box=node('div','v5-stat');box.appendChild(node('div','v5-caption',label));const val=node('div','v5-number','—');val.id='v5-'+id;box.appendChild(val);box.appendChild(node('div','v5-caption',unit));metrics.appendChild(box);});
    wrap.appendChild(metrics);
    const status=node('div','v5-status','Зареждане на данните от ЕСО…');status.id='v5-status';wrap.appendChild(status);
    const actions=node('div','v5-actions');const info=node('span','small','');info.id='v5-info';actions.appendChild(info);
    const refresh=node('button','v5-btn','↻ Обнови анализа');refresh.type='button';refresh.onclick=update;actions.appendChild(refresh);wrap.appendChild(actions);
    const plot=node('div','v5-chart-wrap');const canvas=node('canvas');canvas.id='v5-chart';plot.appendChild(canvas);wrap.appendChild(plot);
    const tableTitle=node('h3',null,'Последни измервания');wrap.appendChild(tableTitle);
    const scroll=node('div','v5-scroll');const table=node('table');const header=node('thead');const headRow=node('tr');['Интервал (София)','Товар (MW)','Промяна (MW)'].forEach(s=>headRow.appendChild(node('th',null,s)));header.appendChild(headRow);table.appendChild(header);const body=node('tbody');body.id='v5-rows';table.appendChild(body);scroll.appendChild(table);wrap.appendChild(scroll);
    const note=node('p','small','Средната стойност е аритметична средна на наличните измервания, не средна мощност, претеглена по време. Възможни са липсващи интервали. Проверявай актуалността на данните преди оперативни решения.');wrap.appendChild(note);
    const oldPanel=system.querySelector('.panel');if(oldPanel)oldPanel.insertAdjacentElement('afterend',wrap);else system.appendChild(wrap);
    update();setInterval(update, 5*60*1000);
  }
  let chartInstance=null;
  function paintStatus(message,level='normal') { const s=document.getElementById('v5-status');if(!s)return;s.className='v5-status'+(level==='normal'?'':' '+level);s.textContent=message; }
  function set(id,value){const el=document.getElementById('v5-'+id);if(el)el.textContent=value;}
  function reset(){['last','min','max','avg','delta','deltaPct','records','age'].forEach(id=>set(id,'—'));document.getElementById('v5-rows').replaceChildren();if(chartInstance){chartInstance.destroy();chartInstance=null;}}
  async function update() {
    if(!document.getElementById('esoLoadV5'))return;
    try {
      const response=await fetch('data/eso.json?cacheBust='+Date.now(),{cache:'no-store'});
      if(!response.ok)throw new Error('data/eso.json: HTTP '+response.status);
      const json=await response.json();
      if(!Array.isArray(json.load_mw))throw new Error('Непознат формат на данните за товара');
      const now=Date.now(),cutoff=now-24*3600*1000;
      const entries=json.load_mw.map(r=>({t:Date.parse(r.timestamp),v:r.value})).filter(r=>Number.isFinite(r.t)&&Number.isFinite(r.v)&&r.v>=0&&r.v<=15000&&r.t<=now+15*60*1000&&r.t>=cutoff).sort((a,b)=>a.t-b.t);
      const dedup=[];for(const e of entries){if(dedup.length&&e.t===dedup[dedup.length-1].t)dedup[dedup.length-1]=e;else dedup.push(e);}
      if(!dedup.length)throw new Error('Няма валидни измервания през последните 24 часа');
      const last=dedup[dedup.length-1],previous=dedup.length>1?dedup[dedup.length-2]:null;
      const min=Math.min(...dedup.map(x=>x.v)),max=Math.max(...dedup.map(x=>x.v));
      const avg=dedup.reduce((sum,x)=>sum+x.v,0)/dedup.length;
      const delta=previous?last.v-previous.v:null;
      const age=(now-last.t)/60000;
      set('last',fmt(last.v));set('min',fmt(min));set('max',fmt(max));set('avg',fmt(avg,1));
      set('delta',delta===null?'—':(delta>0?'+':'')+fmt(delta));
      set('deltaPct',delta===null||previous.v===0?'—':(delta>0?'+':'')+fmt(100*delta/previous.v,2));
      set('records',String(dedup.length));set('age',fmt(Math.max(0,age),0));
      const fetched=Date.parse(json.fetched_at),fetchedAge=Number.isFinite(fetched)?(now-fetched)/60000:null;
      const stamp=Number.isFinite(fetched)?dateFmt.format(new Date(fetched)):'неизвестно';
      document.getElementById('v5-info').textContent=`Извлечено: ${stamp} · Последен интервал: ${dateFmt.format(new Date(last.t))}`;
      if(age>120||fetchedAge!==null&&fetchedAge>90){paintStatus(`Внимание: данните може да са остарели. Последното измерване е от преди ${fmt(age,0)} мин; последно извличане: ${stamp}.`,'warn');}
      else paintStatus(`Данните са налични: ${dedup.length} измервания през последните 24 часа. Последен интервал: ${timeFmt.format(new Date(last.t))}.`);
      const tbody=document.getElementById('v5-rows');tbody.replaceChildren();
      dedup.slice(-24).reverse().forEach((r,i)=>{const idx=dedup.length-1-i,prev=idx>0?dedup[idx-1]:null;const row=node('tr');row.appendChild(node('td',null,timeFmt.format(new Date(r.t))));row.appendChild(node('td',null,fmt(r.v)));row.appendChild(node('td',null,prev?(r.v-prev.v>0?'+':'')+fmt(r.v-prev.v):'—'));tbody.appendChild(row);});
      if(window.Chart){if(chartInstance)chartInstance.destroy();chartInstance=new window.Chart(document.getElementById('v5-chart'),{type:'line',data:{labels:dedup.map(r=>timeFmt.format(new Date(r.t))),datasets:[{label:'Системен товар (MW)',data:dedup.map(r=>r.v),borderColor:'#5ca9ff',backgroundColor:'rgba(92,169,255,.14)',fill:true,tension:.25,pointRadius:2,borderWidth:2}]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},plugins:{legend:{labels:{color:'#cad9eb'}}},scales:{x:{ticks:{color:'#94a9c2',maxTicksLimit:10},grid:{color:'#26364c'}},y:{title:{display:true,text:'MW',color:'#94a9c2'},ticks:{color:'#94a9c2'},grid:{color:'#26364c'}}}}});}
      else paintStatus('Данните са заредени, но библиотеката Chart.js не е достъпна. Таблицата и показателите работят.','warn');
    } catch(error) {reset();paintStatus('Неуспешно зареждане: '+error.message,'error');document.getElementById('v5-info').textContent='Последно проверено: '+dateFmt.format(new Date());}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',launch,{once:true});else launch();
})();
