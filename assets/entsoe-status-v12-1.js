/* Public metadata-only ENTSO-E connection monitor. No token, price, or MW data. */
(() => {
  'use strict';
  const esc = (v) => String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const time = (s) => {
    const d = new Date(s);
    return Number.isFinite(d.getTime()) ? new Intl.DateTimeFormat('bg-BG', {timeZone:'Europe/Sofia', dateStyle:'short',timeStyle:'short'}).format(d) : '—';
  };
  function install() {
    const target = document.getElementById('data');
    if (!target || document.getElementById('entsoe-v121')) return;
    const panel = document.createElement('article');
    panel.id = 'entsoe-v121';
    panel.className = 'panel';
    panel.style.marginTop = '16px';
    panel.innerHTML = `
      <h2>ENTSO-E · автоматична проверка (v12.1)</h2>
      <p class="subtitle">Само статус и времеви обхват, без публични DAM цени или MW по източници.</p>
      <p id="entsoe-v121-state" aria-live="polite">Проверка…</p>
      <div class="sources">
        <div class="source"><strong>DAM (A44)</strong><p id="entsoe-v121-dam">—</p></div>
        <div class="source"><strong>Производство (A75)</strong><p id="entsoe-v121-generation">—</p></div>
      </div>
      <div class="toolbar" style="margin-top:12px"><button class="btn" id="entsoe-v121-refresh" type="button">↻ Провери отново</button><span class="small" id="entsoe-v121-updated"></span></div>
      <p class="hint">Източник: ENTSO-E Transparency Platform. Статусът не е гаранция за пълни или своевременни данни. Публикуването на цени и производствени количества остава изключено до проверка на правата.</p>`;
    target.appendChild(panel);
    const el = (s) => document.getElementById('entsoe-v121-'+s);
    async function refresh() {
      el('state').textContent='Проверка на последния публикуван статус…';
      try {
        const res = await fetch('data/entsoe-status.json?cb='+Date.now(),{cache:'no-store'});
        if (!res.ok) throw new Error('HTTP '+res.status);
        const doc = await res.json();
        if (doc.schema_version !== 1 || doc.mode !== 'metadata_only') throw new Error('Непознат формат');
        const checked = Date.parse(doc.checked_at_utc);
        if (!Number.isFinite(checked)) throw new Error('Невалидна дата');
        const ageH = (Date.now()-checked)/3600000;
        const stale = ageH > 8 || ageH < -0.5;
        el('state').textContent = stale ? '⚠ Последната проверка е остаряла или с некоректен час.' : '✓ Данните за наличността са актуални.';
        for (const kind of ['dam','generation']) {
          const d=doc[kind];
          const label=d?.status === 'ok' && Number.isInteger(d.intervals) && d.intervals>0
            ? `${d.intervals} интервала · последен: ${time(d.latest_interval_utc)}${kind==='generation'&&Number.isInteger(d.production_type_count)?' · '+d.production_type_count+' категории':''}`
            : 'Няма потвърдени данни от последната проверка';
          el(kind).textContent = label;
        }
        el('updated').textContent = 'Проверено: '+time(doc.checked_at_utc);
      } catch (_) {
        el('state').textContent = 'Няма публикуван статус. Провери ENTSO-E status workflow.';
        el('dam').textContent = '—'; el('generation').textContent = '—';
        el('updated').textContent = '';
      }
    }
    el('refresh').addEventListener('click', refresh);
    refresh();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
})();
