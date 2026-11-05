/* SELENE · satelites.js: painel do satélite escolhido + log de comunicações ao vivo. */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const buttons = [...document.querySelectorAll('.nav-btn')];
  const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const int = (v) => Math.round(v).toLocaleString('pt-BR');

  let current = 'sat142';
  let commsKey = '';

  function renderSat(V) {
    const s = V.sats.byId[current];
    if (!s) return;
    $('satName').textContent = s.name;
    const badge = $('satStatus');
    badge.dataset.state = s.state;
    badge.textContent = s.label;
    $('satBox').dataset.state = s.state;                    // âmbar quando degradado / em manutenção

    $('satOrbit').textContent = s.orbit;
    $('satAltitude').textContent = s.alt;
    $('satLatency').textContent = s.lat ? s.lat.toFixed(1) + ' s' : '—';
    $('satSignal').textContent = Math.round(s.sig) + '%';
    $('satSignalFill').style.width = s.sig.toFixed(1) + '%';
    $('pktsSent').textContent = int(s.sent);
    $('pktsRecv').textContent = int(s.recv);
    $('errorRate').textContent = s.err.toFixed(1) + '%';
    $('uplink').textContent = s.up.toFixed(1) + ' Mbps';
    $('downlink').textContent = s.down.toFixed(1) + ' Mbps';
  }

  function renderComms(S) {
    const key = S.comms.map((c) => c.ts).join(',');
    if (key === commsKey) return;                           // só redesenha quando entra uma nova linha
    commsKey = key;
    $('commsTable').innerHTML = S.comms.map((c) => `
        <tr data-state="${c.ok ? 'ok' : 'crit'}">
            <td>${esc(c.from)}</td>
            <td>${esc(c.to)}</td>
            <td>${esc(SELENE.hhmmss(c.ts))}</td>
            <td class="status-green">${c.ok ? 'SUCESSO' : 'FALHA'}</td>
        </tr>`).join('');
  }

  buttons.forEach((btn) => btn.addEventListener('click', () => {
    current = btn.dataset.sat;
    buttons.forEach((b) => { const on = b === btn; b.classList.toggle('active', on); b.setAttribute('aria-pressed', String(on)); });
    renderSat(SELENE.V);
  }));

  SELENE.on((V, S) => { renderSat(V); renderComms(S); });
})();
