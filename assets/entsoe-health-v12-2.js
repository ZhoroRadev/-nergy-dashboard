/* ENTSO-E health v12.2: metadata only, no secret, market prices or production MW */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const fmt = (value) => {
    const t = new Date(value);
    return Number.isFinite(t.getTime())
      ? new Intl.DateTimeFormat('bg-BG', {timeZone:'Europe/Sofia',dateStyle:'short',timeStyle:'short'}).format(t)
      : '—';
  };
  const hours = (a, b) => (a-b)/3_600_000;
  const label = (age, caution, critical) => {
    if (!Number.isFinite(age) || age < -0.5) return ['Невалидна времева отметка', 'bad'];
    if (age > critical) return ['Критично забавяне', 'bad'];
    if (age > caution) return ['Забавени данни', 'warn'];
    return ['В норма', 'ok'];
  };
  function install() {
    const target = $('data');
    if (!target || $('entsoe-health-v122')) return;
    const p = document.createElement('article');
    p.id = 'entsoe-health-v122';
    p.className = 'panel';
    p.style.marginTop = '16px';
    p.innerHTML = `
      <h2>ENTSO-E · контрол на актуалността (v12.2)</h2>
      <p class="subtitle">Последен проверен статус и история на успешните автоматични проверки. Не показва цени или MW.</p>
      <p id="eh122-state" aria-live="polite">Зареждане…</p>
      <div class="sources">
        <div class="source"><strong>Автоматична проверка</strong><p id="eh122-check">—</p><p class="small" id="eh122-check-detail"></p></div>
        <div class="source"><strong>DAM · времево покритие</strong><p id="eh122-dam">—</p><p class="small" id="eh122-dam-detail"></p></div>
        <div class="source"><strong>Производство · актуалност</strong><p id="eh122-generation">—</p><p class="small" id="eh122-generation-detail"></p></div>
      </div>
      <div class="toolbar" style="margin-top:12px"><button class="btn" type="button" id="eh122-refresh">↻ Обнови проверката</button><span class="small" id="eh122-count"></span></div>
      <h3 style="margin:16px 0 9px">Последни успешни проверки</h3>
      <div class="tablewrap"><table><thead><tr><th>Проверено (София)</th><th>DAM интервали</th><th>Последен DAM интервал</th><th>Производство интервали</th><th>Последен производствен интервал</th></tr></thead><tbody id="eh122-rows"><tr><td colspan="5">Зареждане…</td></tr></tbody></table></div>
      <p class="hint">Прагове за наблюдение (примерни): последна проверка 8/12 ч.; последен производствен интервал 6/12 ч. За DAM отчитаме дали има времево покритие напред, а не наричаме бъдещ интервал „ново измерване“. Тези индикатори не доказват пълнота или окончателност на данните. Историята пази само успешните проверки; неуспехите са видими в GitHub Actions. Няма публикувани пазарни цени, MW или API ключове.</p>`;
    target.appendChild(p);
    async function getJson(path) {
      const r = await fetch(path + '?v=' + Date.now(), {cache:'no-store'});
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }
    function detailDate(x) { return fmt(x); }
    function validStatus(d) {
      return d && d.schema_version === 1 && d.mode === 'metadata_only' &&
        d.dam?.status === 'ok' && d.generation?.status === 'ok' &&
        Number.isInteger(d.dam.intervals) && Number.isInteger(d.generation.intervals);
    }
    async function refresh() {
      $('eh122-state').textContent='Проверка на публикуваните метаданни…';
      try {
        const [status, hist] = await Promise.all([
          getJson('data/entsoe-status.json'),
          getJson('data/entsoe-status-history.json').catch(() => null)
        ]);
        if (!validStatus(status)) throw new Error('Неразпознат метаданен формат');
        const now=Date.now();
        const checked=Date.parse(status.checked_at_utc);
        const damLast=Date.parse(status.dam.latest_interval_utc);
        const genLast=Date.parse(status.generation.latest_interval_utc);
        const [checkState,checkLevel]=label(hours(now,checked),8,12);
        const [genState,genLevel]=label(hours(now,genLast),6,12);
        const damCoverageH=hours(damLast,now);
        const damState= !Number.isFinite(damCoverageH) ? 'Неизвестно покритие' :
          damCoverageH >= -1 ? 'Има покритие до близък/бъдещ интервал' : 'Последният интервал е в миналото';
        const allGood=checkLevel==='ok' && genLevel==='ok' && Number.isFinite(damCoverageH) && damCoverageH>=-1;
        $('eh122-state').textContent=allGood ? '✓ Статусът и времевият обхват изглеждат актуални.' : '⚠ Има забавяне или непълно времево покритие — виж подробностите.';
        $('eh122-check').textContent=checkState;
        $('eh122-check-detail').textContent=`Проверено: ${fmt(status.checked_at_utc)} · възраст ${Number.isFinite(checked)?Math.max(0,hours(now,checked)).toFixed(1):'—'} ч.`;
        $('eh122-dam').textContent=damState;
        $('eh122-dam-detail').textContent=`${status.dam.intervals} интервала · край ${detailDate(status.dam.latest_interval_utc)} · ${Number.isFinite(damCoverageH)?damCoverageH.toFixed(1):'—'} ч. спрямо момента`;
        $('eh122-generation').textContent=genState;
        $('eh122-generation-detail').textContent=`${status.generation.intervals} интервала · последен ${detailDate(status.generation.latest_interval_utc)} · ${Number.isFinite(genLast)?Math.max(0,hours(now,genLast)).toFixed(1):'—'} ч. назад`;
        const checks = hist?.schema_version===1 && hist.mode==='metadata_only' && Array.isArray(hist.checks)
          ? hist.checks.filter(x=>x && x.dam && x.generation && Number.isInteger(x.dam.intervals) && Number.isInteger(x.generation.intervals)).slice(-12).reverse() : [];
        $('eh122-count').textContent=checks.length ? `${hist.checks.length} успешни проверки в архива` : 'Архивът още не е създаден или е празен';
        const body=$('eh122-rows');body.replaceChildren();
        if (!checks.length) { const tr=document.createElement('tr');const td=document.createElement('td');td.colSpan=5;td.textContent='Няма история засега. Стартирай ENTSO-E status workflow след обновяването.';tr.appendChild(td);body.appendChild(tr); }
        for (const x of checks) {
          const tr=document.createElement('tr');
          [fmt(x.checked_at_utc),x.dam.intervals,fmt(x.dam.latest_interval_utc),x.generation.intervals,fmt(x.generation.latest_interval_utc)]
            .forEach(v=>{const td=document.createElement('td');td.textContent=String(v);tr.appendChild(td);});
          body.appendChild(tr);
        }
      } catch (err) {
        $('eh122-state').textContent='Няма валиден публикуван статус: '+(err.message==='HTTP 404'?'HTTP 404':'провери ENTSO-E workflow');
      }
    }
    $('eh122-refresh').addEventListener('click',refresh);
    refresh();
  }
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',install);
  else install();
})();
