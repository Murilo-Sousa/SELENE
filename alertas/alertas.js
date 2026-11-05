/* SELENE · alertas.js: feed de eventos gerado a partir do estado (telemetry.js).
   Alertas têm ciclo de vida: ATIVO → RESOLVIDO. Novos eventos entram no topo. */
(() => {
  'use strict';

  const list = document.getElementById('alertsTable');
  const buttons = [...document.querySelectorAll('.filter-btn')];
  const BADGE = { crit: 'CRÍTICO', warn: 'ATENÇÃO', info: 'INFO' };

  let filter = 'all';
  let lastKey = '';
  let maxSeen = 0;
  let first = true;

  const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function rowHTML(e, isNew) {
    const state = e.type === 'info' ? 'ok' : e.type;
    const tag = e.type === 'info' ? '' : `<span class="alert-state">${e.resolved ? 'RESOLVIDO' : 'ATIVO'}</span>`;
    return `
      <div class="alert-row${e.resolved ? ' resolved' : ''}${isNew ? ' new' : ''}" data-state="${state}" data-type="${e.type}">
          <div class="alert-icon"><i class="fa-solid ${esc(e.icon)}" aria-hidden="true"></i></div>
          <div class="alert-content">
              <div class="alert-message">${esc(e.msg)}</div>
              <div class="alert-detail">${esc(e.detail)}</div>
          </div>
          <div class="alert-time">
              <span data-ts="${e.ts}">${esc(SELENE.rel(e.ts))}</span>
              <span class="alert-badge" data-state="${state}">${BADGE[e.type]}</span>${tag}
          </div>
      </div>`;
  }

  function render(S) {
    const evs = S.events.filter((e) => filter === 'all' || e.type === filter);
    const key = filter + '|' + evs.map((e) => e.id + (e.resolved ? 'r' : 'a')).join(',');

    if (key !== lastKey) {                                  // só redesenha quando a lista muda
      lastKey = key;
      list.innerHTML = evs.length
        ? evs.map((e) => rowHTML(e, !first && e.id > maxSeen)).join('')
        : '<div class="alert-empty">NENHUM EVENTO NESTA CATEGORIA</div>';
    }
    list.querySelectorAll('[data-ts]').forEach((el) => { el.textContent = SELENE.rel(+el.dataset.ts); });
    S.events.forEach((e) => { if (e.id > maxSeen) maxSeen = e.id; });
    first = false;
  }

  buttons.forEach((btn) => btn.addEventListener('click', () => {
    filter = btn.dataset.filter;
    buttons.forEach((b) => { const on = b === btn; b.classList.toggle('active', on); b.setAttribute('aria-pressed', String(on)); });
    lastKey = '';
    render(SELENE.S);
  }));

  SELENE.on((V, S) => render(S));
  setInterval(() => { if (SELENE.S) list.querySelectorAll('[data-ts]').forEach((el) => { el.textContent = SELENE.rel(+el.dataset.ts); }); }, 1000);
})();
