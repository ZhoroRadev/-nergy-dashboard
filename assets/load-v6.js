/* Energy Intel v6 — historical load, day-over-day comparison, and simple seasonal baseline.
   Data: verified ESO readings from data/eso_history.json; no synthetic measurements.
   Forecast requires two real observations for each of the 24 clock hours.
*/
(() => {
  'use strict';
  const fmt = (x, decimals=0) => Number.isFinite(x) ? x.toLocaleString('bg-BG',{minimumFractionDigits:decimals,maximumFractionDigits:decimals}) : '—';
  const fdate = new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Sofia',year:'numeric',month:'2-digit',day:'2-digit'});
  const fhour = new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Sofia',hour:'2-digit',hourCycle:'h23'});
  const ft = new Intl.DateTimeFormat('bg-BG',{timeZone:'Europe/Sofia',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
  const css=`#esoLoadV6{margin-top:16px}#esoLoadV6 .v6stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:12px 0}#esoLoadV6 .v6stat{background:#17263c;border:1px solid #2a3e55;padding:14px;border-radius:10px}#esoLoadV6 .v6label{color:#a3b9d2;font-size:12px}#esoLoadV6 .v6num{font-size:22px;font-weight:750;margin:5px 0}#esoLoadV6 .v6note{border:1px solid #35516c;background:#14243a;border-radius:8px;padding:10px;color:#c1d5ec;font-size:13px}#esoLoadV6 .v6warning{color:#ffcb89;border-color:#76552c;background:#302719}#esoLoadV6 .v6chart{position:relative;height:270px;margin-top:12px}#esoLoadV6 .v6toolbar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:12px 0}#esoLoadV6 .v6button{background:#1a334d;border:1px solid #466080;border-radius:8px;color:#e8f3ff;cursor:pointer;padding:8px 12px}@media(max-width:750px){#esoLoadV6 .v6stats{grid-template-columns:1fr 1fr}}@media(max-width:500px){#esoLoadV6 .v6stats{grid-template-columns:1fr}}`;
  const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
  let pastChart=null, predictChart=null;
  function makeCard(parent,label,id,unit){const c=el('div','v6stat');c.append(el('div','v6label',label));const value=el('div','v6num','—');value.id=id;c.append(value,el('div','v6label',unit));parent.append(c);}
  function start(){const section=document.getElementById('system');if(!section||document.getElementById('esoLoadV6'))return;const style=el('style');style.textContent=css;document.head.append(style);
    const card=el('article','panel');card.id='esoLoadV6';card.append(el('h2',null,'ЕСО · история и ориентировъчна прогноза (v6.0)'));
    card.append(el('p','small','История: реални измервания на ЕСО · часови интервали, време Europe/Sofia · архив до 90 дни'));
    const stats=el('div','v6stats');makeCard(stats,'Архивирани измервания','v6count','записа');makeCard(stats,'Спрямо същия час вчера','v6yesterday','MW');makeCard(stats,'Покритие на историята','v6coverage','часа');card.append(stats);
    const info=el('div','v6note','Зареждане на историческите данни…');info.id='v6status';card.append(info);
    const tools=el('div','v6toolbar');const button=el('button','v6button','↻ Обнови историята');button.type='button';button.onclick=refresh;tools.append(button);card.append(tools);
    card.append(el('h3',null,'Последни 7 дни — налични измервания'));let box=el('div','v6chart');let cv=el('canvas');cv.id='v6history';box.append(cv);card.append(box);
    card.append(el('h3',null,'Следващи 24 часа — сезонен ориентир'));let hint=el('p','small','Метод: среден товар за същия час от последните два завършени денонощия; не е обучена прогноза, не използва метеорологичен модел. Не е подходяща за оперативни оферти.');card.append(hint);
    const fstatus=el('div','v6note','Изчакване на достатъчна история…');fstatus.id='v6forecastStatus';card.append(fstatus);
    box=el('div','v6chart');cv=el('canvas');cv.id='v6forecast';box.append(cv);card.append(box);
    card.append(el('p','small','Данните може да са непълни. Няма запълване на липсващи измервания. Архивът започва от първото успешно изпълнение след инсталиране на v6.0.'));
    const v5=document.getElementById('esoLoadV5');if(v5)v5.insertAdjacentElement('afterend',card);else section.append(card);refresh();setInterval(refresh,5*60*1000);
  }
  function draw(id,old,labels,datasets){if(old)old.destroy();if(!window.Chart)return null;return new Chart(document.getElementById(id),{type:'line',data:{labels,datasets},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},plugins:{legend:{labels:{color:'#c5d6eb'}}},scales:{x:{ticks:{color:'#9aafc7',maxTicksLimit:10},grid:{color:'#24354c'}},y:{title:{display:true,text:'MW',color:'#9aafc7'},ticks:{color:'#9aafc7'},grid:{color:'#24354c'}}}}});}
  const day = t=>fdate.format(new Date(t));
  const hour = t=>Number(fhour.format(new Date(t)));
  async function refresh(){const stat=document.getElementById('v6status'),fstat=document.getElementById('v6forecastStatus');if(!stat)return;
    try{const response=await fetch('data/eso_history.json?t='+Date.now(),{cache:'no-store'});if(!response.ok)throw new Error('HTTP '+response.status+' — файлът с историята още не е създаден');
      const data=await response.json();if(!Array.isArray(data.load_mw))throw Error('Неизвестен JSON формат');
      const now=Date.now();const rows=data.load_mw.map(x=>({t:Date.parse(x.timestamp),v:Number(x.value)})).filter(x=>Number.isFinite(x.t)&&Number.isFinite(x.v)&&x.v>=0&&x.v<=15000&&x.t<=now+15*60e3&&x.t>=now-91*864e5).sort((a,b)=>a.t-b.t);
      const map=new Map(rows.map(x=>[x.t,x]));const vals=[...map.values()].sort((a,b)=>a.t-b.t);
      if(!vals.length)throw Error('Няма валидни исторически данни');
      const first=vals[0],last=vals[vals.length-1];document.getElementById('v6count').textContent=fmt(vals.length);document.getElementById('v6coverage').textContent=fmt((last.t-first.t)/36e5,0);
      const prior=vals.filter(x=>Math.abs(x.t-(last.t-864e5))<=35*60e3).sort((a,b)=>Math.abs(a.t-(last.t-864e5))-Math.abs(b.t-(last.t-864e5)))[0];
      document.getElementById('v6yesterday').textContent=prior?((last.v-prior.v>0?'+':'')+fmt(last.v-prior.v)):'—';
      stat.className='v6note';stat.textContent=`Архив: ${vals.length} реални записа · от ${ft.format(new Date(first.t))} до ${ft.format(new Date(last.t))}. ${prior?'Сравнението е с измерване приблизително 24 часа по-рано.':'За сравнение с вчера още няма съответен интервал.'}`;
      const recent=vals.filter(x=>x.t>=last.t-7*864e5);pastChart=draw('v6history',pastChart,recent.map(x=>ft.format(new Date(x.t))),[{label:'Измерен товар (MW)',data:recent.map(x=>x.v),borderColor:'#63b1ff',backgroundColor:'rgba(99,177,255,.10)',fill:true,pointRadius:recent.length>100?0:2,borderWidth:2,tension:.2}]);
      // Require at least 48 h of elapsed history and >=2 observations for every hour-of-day.
      const historySpan=(last.t-first.t)/36e5;const byHour=Array.from({length:24},()=>new Map());
      for(const x of vals){if(x.t<last.t-72*36e5 || x.t>last.t)continue;const h=hour(x.t),d=day(x.t);byHour[h].set(d,x.v);}
      const available=byHour.filter(x=>x.size>=2).length;
      if(historySpan<47 || available<24){fstat.className='v6note v6warning';fstat.textContent=`Прогноза още не се показва. Нужни са поне 48 часа история и по две отчетени стойности за всеки часови интервал (покрити ${available}/24 часа).`;if(predictChart){predictChart.destroy();predictChart=null;}return;}
      const forecast=[];for(let i=1;i<=24;i++){const t=last.t+i*36e5,h=hour(t);const readings=[...byHour[h].values()].slice(-2);forecast.push({t,v:readings.reduce((a,b)=>a+b,0)/readings.length});}
      fstat.className='v6note v6warning';fstat.textContent='Ориентировъчна сезонна базова линия, не оперативна прогноза. За по-точен модел ще са нужни седмици история, календарни фактори и проверка на точността.';
      predictChart=draw('v6forecast',predictChart,forecast.map(x=>ft.format(new Date(x.t))),[{label:'Ориентир за товар (MW)',data:forecast.map(x=>Math.round(x.v)),borderColor:'#e9b252',backgroundColor:'rgba(233,178,82,.10)',fill:true,pointRadius:1,borderDash:[6,4],tension:.15}]);
    }catch(e){stat.className='v6note v6warning';stat.textContent='Историята все още не е налична: '+e.message+'; провери GitHub Actions → Collect ESO public data.';fstat.className='v6note v6warning';fstat.textContent='Прогнозата е недостъпна без проверени исторически данни.';}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
