(() => {
  'use strict';
  // This is a public-data health panel, NOT a password or authentication mechanism.
  const SOURCES = [
    ['ЕСО товар','data/eso.json'],
    ['ЕСО история','data/eso_history.json'],
    ['DAM (само разрешен публичен snapshot)','data/dam.json'],
    ['Intraday (само разрешен публичен snapshot)','data/intraday.json'],
    ['Генерация (при разрешен източник)','data/eso_generation.json']
  ];
  function el(t,attrs={},txt='') { const e=document.createElement(t); for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);e.textContent=txt;return e; }
  function attach() {
    const section=document.querySelector('#data');if(!section || document.querySelector('#securityV10'))return;
    const panel=el('article',{id:'securityV10',class:'panel',style:'margin-top:16px'});
    panel.append(el('h2',{},'v10.0 · Статус на публичните източници'));
    panel.append(el('p',{class:'muted'},'Само проверки на публични файлове. Тази страница няма потребителско удостоверяване и не е подходяща за фирмени тайни или търговски позиции.'));
    const button=el('button',{type:'button',class:'btn'},'Провери източниците');
    const table=el('table');const tbody=el('tbody');table.append(tbody);panel.append(button,table);section.append(panel);
    const refresh=async()=>{
      button.disabled=true;tbody.replaceChildren();
      for(const [label,path] of SOURCES){
        const row=el('tr');row.append(el('td',{},label));const status=el('td',{},'Проверка…');row.append(status);tbody.append(row);
        try {
          const ctrl=new AbortController();const timeout=setTimeout(()=>ctrl.abort(),8000);
          let response;try{response=await fetch(path+'?v='+Date.now(),{cache:'no-store',signal:ctrl.signal});}finally{clearTimeout(timeout);}
          if(!response.ok)throw new Error('HTTP '+response.status);
          const payload=await response.json();
          const count=Array.isArray(payload)?payload.length:(Array.isArray(payload.load_mw)?payload.load_mw.length:(Array.isArray(payload.points)?payload.points.length:null));
          status.textContent='Достъпен JSON'+(count!==null?' · '+count+' записа':'');
        }catch(e){status.textContent='Няма достъпни данни · '+(e.name==='AbortError'?'timeout':String(e.message).slice(0,80));}
      }
      button.disabled=false;
    };
    button.addEventListener('click',refresh);refresh();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',attach);else attach();
})();
