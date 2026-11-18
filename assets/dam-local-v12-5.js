/* EnergyIntel v12.5: Browser-local, user-permissioned DAM folder -> BESS v11 bridge.
   No uploads, credentials, background file access, or GitHub price publication. */
(() => {
 'use strict';
 const FILE_RE=/^dam_BG_(\d{4}-\d{2}-\d{2})\.csv$/i;
 const MAX_FILES=500, MAX_BYTES=1024*1024;
 let fileMap=new Map(), folderHandle=null;
 const id=s=>document.getElementById(s);
 const info=(msg,bad=false)=>{const p=id('dam125status');if(p){p.textContent=msg;p.style.color=bad?'#fca5a5':'';}};
 function renderDays(){
   const select=id('dam125date');if(!select)return;
   const days=[...fileMap.keys()].sort().reverse();
   select.replaceChildren();
   for(const d of days){const option=document.createElement('option');option.value=d;option.textContent=d;select.append(option);}
   id('dam125load').disabled=!days.length;
   info(days.length?`Намерени са ${days.length} дни с DAM CSV. Избери дата и натисни „Зареди в BESS“. Данните остават в браузъра.`:'Не са намерени файлове dam_BG_YYYY-MM-DD.csv.',!days.length);
 }
 function validName(name){const m=FILE_RE.exec(name);if(!m)return null;const d=m[1];return Number.isFinite(Date.parse(d+'T00:00:00Z'))&&new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d?d:null;}
 async function chooseDirectory(){
  if(!window.showDirectoryPicker){id('dam125folder').click();return;}
  try{
    const handle=await window.showDirectoryPicker({mode:'read'});
    const next=new Map();let count=0;
    for await(const [name,entry] of handle.entries()){
      if(++count>MAX_FILES)throw Error(`Папката съдържа повече от ${MAX_FILES} елемента; избери само DAM папката.`);
      const day=validName(name);
      if(day && entry.kind==='file')next.set(day,entry);
    }
    folderHandle=handle;fileMap=next;renderDays();
  }catch(err){if(err.name!=='AbortError')info('Не успях да отворя папката: '+err.message,true);}
 }
 function chooseLegacy(ev){
  try{
   const files=[...(ev.target.files||[])];if(files.length>MAX_FILES)throw Error('Твърде много файлове; избери само папката DAM.');
   const next=new Map();
   for(const file of files){const day=validName(file.name);if(day)next.set(day,file);}
   folderHandle=null;fileMap=next;renderDays();
  }catch(err){info(err.message,true);}
 }
 async function load(){
   try{
    const day=id('dam125date').value, entry=fileMap.get(day);
    if(!entry)throw Error('Няма избран ден.');
    const file=entry instanceof File?entry:await entry.getFile();
    if(file.size===0 || file.size>MAX_BYTES)throw Error('CSV файлът е празен или над 1 MB.');
    const text=await file.text();
    const header=text.replace(/^\uFEFF/,'').split(/\r?\n/,1)[0].toLowerCase();
    if(!header.includes('timestamp')||!header.includes('dam_eur_mwh'))throw Error('CSV няма колоните timestamp и dam_eur_mwh.');
    const input=id('b11file');if(!input)throw Error('Липсва BESS v11 (поле b11file). Първо провери, че assets/bess-v11.js е зареден.');
    const market=id('b11market');if(market)market.value='dam_eur_mwh';
    const dt=new DataTransfer();dt.items.add(new File([text],file.name,{type:'text/csv'}));
    input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));
    info(`Зареден в BESS: ${file.name}. Натисни „Изчисли оптимален график“ в панела BESS v11. Файлът не се изпраща никъде.`);
   }catch(err){info('Грешка: '+err.message,true);}
 }
 function init(){
   const bess=id('bessV11');
   if(!bess)return;
   if(id('dam125panel'))return;
   const panel=document.createElement('article');panel.id='dam125panel';panel.className='panel';panel.style.marginTop='16px';
   const title=document.createElement('h2');title.textContent='DAM локален архив · v12.5';panel.append(title);
   const p=document.createElement('p');p.className='muted';p.textContent='Свързва локалните CSV файлове от Windows Task Scheduler с BESS v11. Браузърът изисква да разрешиш достъпа до папката. Няма мрежово изпращане или публикуване на цените.';panel.append(p);
   const toolbar=document.createElement('div');toolbar.className='toolbar';toolbar.style.cssText='display:flex;flex-wrap:wrap;align-items:end;gap:12px;margin:14px 0';
   const folder=document.createElement('button');folder.type='button';folder.className='btn';folder.textContent='Избери DAM папка';folder.addEventListener('click',chooseDirectory);toolbar.append(folder);
   const legacy=document.createElement('input');legacy.type='file';legacy.id='dam125folder';legacy.setAttribute('webkitdirectory','');legacy.setAttribute('directory','');legacy.multiple=true;legacy.style.display='none';legacy.addEventListener('change',chooseLegacy);toolbar.append(legacy);
   const label=document.createElement('label');label.textContent='Пазарен ден ';const select=document.createElement('select');select.id='dam125date';select.setAttribute('aria-label','Дата на DAM');label.append(select);toolbar.append(label);
   const loadButton=document.createElement('button');loadButton.type='button';loadButton.className='btn primary';loadButton.id='dam125load';loadButton.textContent='Зареди в BESS';loadButton.disabled=true;loadButton.addEventListener('click',load);toolbar.append(loadButton);
   panel.append(toolbar);
   const note=document.createElement('div');note.id='dam125status';note.className='hint';note.setAttribute('role','status');note.textContent='Натисни „Избери DAM папка“, после посочи Documents\\EnergyIntel\\DAM. Защитеният достъп се разрешава от теб.';panel.append(note);
   const foot=document.createElement('p');foot.className='hint';foot.style.marginTop='12px';foot.textContent='Изборът на папка важи за текущата сесия на страницата. След презареждане може да се наложи да я избереш отново. Този модул не обновява автоматично отворената страница и не извършва сделки.';panel.append(foot);
   bess.parentElement.insertBefore(panel,bess);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
