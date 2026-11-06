(() => {
  'use strict';
  const ID = 'bessV11';
  const fmt = (x, digits=2) => Number.isFinite(x) ? x.toLocaleString('bg-BG',{minimumFractionDigits:digits,maximumFractionDigits:digits}) : '—';
  const esc = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let savedRows=[]; let latest=null; let graph=null;
  function csvFields(line,separator) {
    let a=[],s='',inQuote=false;
    for(let i=0;i<line.length;i++) {
      const c=line[i];
      if(c==='"'){if(inQuote && line[i+1]==='"'){s+='"';i++;}else inQuote=!inQuote;}
      else if(c===separator && !inQuote){a.push(s.trim());s='';}
      else s+=c;
    }
    if(inQuote)throw Error('Незатворени кавички в CSV');
    a.push(s.trim());return a;
  }
  function parsePriceCsv(text,market) {
    const lines=text.replace(/^\uFEFF/,'').split(/\r?\n/).map(x=>x.trim()).filter(x=>x && !x.startsWith('#'));
    if(lines.length<3)throw Error('Нужни са заглавен ред и поне два ценови интервала.');
    const sep=(lines[0].match(/;/g)||[]).length > (lines[0].match(/,/g)||[]).length ? ';' : ',';
    const hdr=csvFields(lines[0],sep).map(x=>x.toLowerCase().replace(/^\ufeff/,''));
    const ti=hdr.indexOf('timestamp'), pi=hdr.indexOf(market);
    if(ti<0||pi<0)throw Error('CSV изисква колони timestamp и '+market+'.');
    const rows=[];
    for(let i=1;i<lines.length;i++) {
      const cells=csvFields(lines[i],sep);
      const dateText=cells[ti]||'', raw=(cells[pi]||'').trim();
      if(!raw)continue;
      if(!/(Z|[+-]\d\d:\d\d)$/i.test(dateText))throw Error('Ред '+(i+1)+': timestamp трябва да има Z или UTC offset (+02:00/+03:00).');
      const t=Date.parse(dateText);
      const v=Number(sep===';' ? raw.replace(',','.') : raw);
      if(!Number.isFinite(t)||!Number.isFinite(v)||v < -10000||v>10000)throw Error('Невалидна дата или цена на ред '+(i+1));
      rows.push({t,price:v});
    }
    rows.sort((a,b)=>a.t-b.t);
    if(rows.length<2)throw Error('Недостатъчно наблюдения с цени за избрания пазар.');
    if(rows.length>192)throw Error('До 192 интервала (48 часа при 15 минути) на импортиране.');
    const steps=rows.slice(1).map((r,i)=>(r.t-rows[i].t)/60000);
    const minutes=steps[0];
    if(![15,30,60].includes(minutes) || steps.some(s=>s!==minutes)) throw Error('Нужни са последователни интервали с еднаква стъпка 15, 30 или 60 минути. Няма да запълваме липсващи цени.');
    return {rows,hours:minutes/60,minutes};
  }
  // Exact enumeration of discrete SOC levels (1% resolution). All paths start/end with prescribed SOC.
  function optimize(prices, hours, cfg) {
    const {capacity,power,etaC,etaD,initial,finalSoc,wear}=cfg;
    const n=prices.length, N=100, unit=capacity/N;
    const start=Math.round(initial), end=Math.round(finalSoc);
    let prev=new Float64Array(N+1).fill(-Infinity);prev[start]=0;
    const parents=[];
    for(let t=0;t<n;t++) {
      const next=new Float64Array(N+1).fill(-Infinity), parent=new Int16Array(N+1).fill(-1);
      for(let a=0;a<=N;a++) {
        if(!Number.isFinite(prev[a]))continue;
        const maxUp=Math.min(N, a+Math.floor((power*hours*etaC/unit)+1e-9));
        const minDown=Math.max(0, a-Math.floor((power*hours/etaD/unit)+1e-9));
        for(let b=minDown;b<=maxUp;b++) {
          const delta=(b-a)*unit;
          const buy=delta>0?delta/etaC:0;
          const sell=delta<0?-delta*etaD:0;
          const cash=sell*(prices[t]-wear)-buy*prices[t];
          const v=prev[a]+cash;
          if(v>next[b]+1e-8){next[b]=v;parent[b]=a;}
        }
      }
      parents.push(parent);prev=next;
    }
    if(!Number.isFinite(prev[end]))throw Error('Невъзможно е достигането на крайния SOC с тези ограничения.');
    let state=end, points=[];
    for(let t=n-1;t>=0;t--) {
      const before=parents[t][state];if(before<0)throw Error('Не може да се възстанови графикът.');
      const delta=(state-before)*unit;
      const buy=delta>0?delta/etaC:0, sell=delta<0?-delta*etaD:0;
      const income=sell*prices[t]-buy*prices[t]-sell*wear;
      points.unshift({soc:state,price:prices[t],charge:buy,discharge:sell,cash:income});state=before;
    }
    const total=points.reduce((a,p)=>a+p.cash,0);
    return {points,total,charge:points.reduce((a,p)=>a+p.charge,0),discharge:points.reduce((a,p)=>a+p.discharge,0)};
  }
  function makePanel() {
    const section=document.getElementById('battery');if(!section||document.getElementById(ID))return;
    const panel=document.createElement('article');panel.id=ID;panel.className='panel';panel.style.marginTop='16px';
    panel.innerHTML=`<h2>BESS v11.0 · График за заряд и разряд по цени</h2>
    <p class="muted">Сценарен оптимизатор по реални цени от CSV. Не извършва сделки или команди към батерия. Цените се четат само в браузъра; няма публично качване.</p>
    <div class="controls" style="display:flex;flex-wrap:wrap;gap:12px">
      <label>CSV файл с цени<input type="file" id="b11file" accept=".csv,text/csv"></label>
      <label>Пазар<select id="b11market"><option value="dam_eur_mwh">DAM</option><option value="intraday_eur_mwh">Intraday</option></select></label>
      <label>Мощност (MW)<input id="b11power" type="number" min="0.1" max="10000" step="0.1" value="10"></label>
      <label>Капацитет (MWh)<input id="b11capacity" type="number" min="0.1" max="100000" step="0.1" value="20"></label>
      <label>Първоначален SOC (%)<input id="b11soc" type="number" min="0" max="100" step="1" value="50"></label>
      <label>Краен SOC (%)<input id="b11final" type="number" min="0" max="100" step="1" value="50"></label>
      <label>КПД цикъл (%)<input id="b11eta" type="number" min="1" max="100" step="1" value="88"></label>
      <label>Разход деградация (€/MWh изход)<input id="b11wear" type="number" min="0" max="10000" step="0.1" value="5"></label>
    </div>
    <div class="toolbar" style="margin:14px 0;display:flex;gap:10px;flex-wrap:wrap"><button class="btn primary" id="b11run">Изчисли оптимален график</button><button class="btn" id="b11export" disabled>↓ График CSV</button><button class="btn" id="b11template">↓ CSV шаблон</button></div>
    <div class="hint" id="b11status" role="status">Очаква реален CSV с цени и ISO часове с UTC offset.</div>
    <div class="metrics" style="margin-top:16px"><div class="metric"><div class="label">Сценарен нетен резултат (€)</div><div class="value" id="b11profit">—</div></div><div class="metric"><div class="label">Заредена енергия (MWh от мрежата)</div><div class="value" id="b11charge">—</div></div><div class="metric"><div class="label">Отдадена енергия (MWh към мрежата)</div><div class="value" id="b11discharge">—</div></div><div class="metric"><div class="label">Обхват на цените</div><div class="value" id="b11range" style="font-size:17px">—</div></div></div>
    <div class="chart" style="height:320px;position:relative;margin-top:18px"><canvas id="b11chart"></canvas></div>
    <div class="tablewrap" style="max-height:440px;overflow:auto"><table><thead><tr><th>Интервал</th><th>Цена €/MWh</th><th>Заряд MWh</th><th>Разряд MWh</th><th>SOC след (%)</th><th>Нетно €</th></tr></thead><tbody id="b11rows"><tr><td colspan="6">Все още няма график.</td></tr></tbody></table></div>
    <p class="hint" style="margin-top:12px">Модел: дискретен SOC през 1%, без едновременен заряд/разряд, с ограничения за MW и MWh, симетрично разпределен КПД по заряд и разряд. Допуска отрицателни цени. Нетният резултат отчита въведения разход за деградация, но НЕ включва мрежови тарифи, такси, небаланси, температурни ограничения, износване според дълбочина на цикъл, резерви за услуги или реални пазарни ограничения. При твърде груба стъпка 1% резултатът е приблизителен. Само за аналитичен сценарий, не за оперативни оферти.</p>`;
    section.appendChild(panel);
    document.getElementById('b11template').onclick=()=>download('bess_price_template.csv','timestamp,dam_eur_mwh,intraday_eur_mwh\n', 'text/csv');
    document.getElementById('b11run').onclick=run;
    document.getElementById('b11export').onclick=()=>{
      if(!latest)return;
      const header='timestamp,price_eur_mwh,charge_mwh_grid,discharge_mwh_grid,soc_percent,net_eur';
      const lines=latest.result.points.map((p,i)=>[new Date(latest.times[i]).toISOString(),p.price,p.charge.toFixed(5),p.discharge.toFixed(5),p.soc,p.cash.toFixed(4)].join(','));
      download('bess_v11_schedule.csv',[header,...lines].join('\r\n')+'\r\n','text/csv');
    };
    document.getElementById('b11market').onchange=()=>{latest=null;document.getElementById('b11export').disabled=true;};
  }
  function download(name,content,type){const blob=new Blob(['\uFEFF',content],{type:type+';charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);}
  function number(id,min,max){const v=Number(document.getElementById(id).value);if(!Number.isFinite(v)||v<min||v>max)throw Error('Невалидна стойност в '+id);return v;}
  async function run() {
    const status=document.getElementById('b11status');
    try {
      const file=document.getElementById('b11file').files[0];if(!file)throw Error('Избери CSV файл с действителни цени.');
      if(file.size>1000000)throw Error('CSV файлът е твърде голям (максимум 1 MB).');
      const market=document.getElementById('b11market').value;
      const parsed=parsePriceCsv(await file.text(),market);
      const capacity=number('b11capacity',0.1,100000),power=number('b11power',0.1,10000),eff=number('b11eta',1,100)/100;
      const cfg={capacity,power,etaC:Math.sqrt(eff),etaD:Math.sqrt(eff),initial:number('b11soc',0,100),finalSoc:number('b11final',0,100),wear:number('b11wear',0,10000)};
      if(!Number.isInteger(cfg.initial)||!Number.isInteger(cfg.finalSoc))throw Error('SOC трябва да е цяло число (стъпка 1%).');
      const result=optimize(parsed.rows.map(r=>r.price),parsed.hours,cfg);
      latest={result,times:parsed.rows.map(r=>r.t),market};
      document.getElementById('b11profit').textContent=fmt(result.total);
      document.getElementById('b11charge').textContent=fmt(result.charge);
      document.getElementById('b11discharge').textContent=fmt(result.discharge);
      document.getElementById('b11range').textContent=parsed.rows.length+' × '+parsed.minutes+' мин';
      const timeFormat=new Intl.DateTimeFormat('bg-BG',{timeZone:'Europe/Sofia',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false,timeZoneName:'shortOffset'});
      document.getElementById('b11rows').innerHTML=result.points.map((p,i)=>`<tr><td>${esc(timeFormat.format(new Date(parsed.rows[i].t)))}</td><td>${fmt(p.price)}</td><td>${fmt(p.charge,3)}</td><td>${fmt(p.discharge,3)}</td><td>${p.soc}</td><td>${fmt(p.cash)}</td></tr>`).join('');
      document.getElementById('b11export').disabled=false;
      status.textContent='Изчислени '+parsed.rows.length+' последователни интервала от избрания CSV. Всички данни остават в браузъра. Крайният SOC е '+cfg.finalSoc+'%.';
      if(graph){graph.destroy();graph=null;}
      if(window.Chart){graph=new Chart(document.getElementById('b11chart'),{type:'bar',data:{labels:parsed.rows.map(r=>timeFormat.format(new Date(r.t))),datasets:[{label:'Заряд (MWh)',data:result.points.map(p=>p.charge),backgroundColor:'#60a5fa'},{label:'Разряд (MWh)',data:result.points.map(p=>-p.discharge),backgroundColor:'#34d399'}]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},scales:{x:{ticks:{maxTicksLimit:12}},y:{title:{display:true,text:'MWh (+ заряд / − разряд)'}}}}});}
    } catch(e) {status.textContent='Грешка: '+e.message;document.getElementById('b11export').disabled=true;latest=null;}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',makePanel);else makePanel();
  // Exposed only to local automated tests; never carries credentials or network actions.
  if(typeof module!=='undefined'&&module.exports)module.exports={parsePriceCsv,optimize};
})();
