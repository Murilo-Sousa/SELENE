/* ============================================================================
   SELENE · core.js
   Comportamento compartilhado por TODAS as páginas (antes estava copiado em 6 arquivos):
   relógio, faixas da navegação lateral, botão AO VIVO, sequência de boot,
   avisos (toasts) de alertas novos e a partida da telemetria.
   ========================================================================== */
(() => {
  'use strict';

  const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, r = document) => r.querySelector(s);
  const ROOT = document.body.dataset.root || '';        // '' na home, '../' nas demais
  const PAGE = document.body.dataset.page || '';

  /* ------------------------------ relógio ------------------------------ */
  const clock = $('#currentTime');
  const paintClock = () => {
    if (clock) clock.textContent = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };
  paintClock();
  setInterval(paintClock, 1000);

  /* ------------- faixas verdes da navegação lateral (efeito "flash") ------------- */
  const navItems = [...document.querySelectorAll('.nav-vertical-item')];
  let navStyle = null, navPending = false;
  function positionFlashes() {
    if (!navItems.length) return;
    if (!navStyle) { navStyle = document.createElement('style'); navStyle.id = 'nav-flash'; document.head.appendChild(navStyle); }
    navStyle.textContent = navItems
      .map((el, i) => `.nav-vertical-item[data-index="${el.dataset.index ?? i}"]::before{top:${Math.round(el.getBoundingClientRect().top)}px}`)
      .join('\n');
  }
  const schedulePositions = () => {
    if (navPending) return;
    navPending = true;
    requestAnimationFrame(() => { navPending = false; positionFlashes(); });
  };
  positionFlashes();
  addEventListener('scroll', schedulePositions, { passive: true });
  addEventListener('resize', schedulePositions);
  addEventListener('load', schedulePositions);

  if (!window.SELENE) return;

  /* ------------------------- botão AO VIVO / PAUSADO ------------------------- */
  const right = $('.topbar-right');
  if (right) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'live';
    b.title = 'Pausar ou retomar a telemetria simulada';
    b.innerHTML = '<i class="live-dot" aria-hidden="true"></i><span></span>';
    b.addEventListener('click', () => SELENE.togglePause());
    right.insertBefore(b, right.firstChild);
    SELENE.on(() => {
      const live = !SELENE.paused;
      b.setAttribute('aria-pressed', String(live));
      b.classList.toggle('is-paused', !live);
      b.lastChild.textContent = live ? 'AO VIVO' : 'PAUSADO';
      document.body.classList.toggle('is-paused', !live);
    });
  }

  /* --------- selo com o nº de alertas ativos no ícone "Alertas" --------- */
  const alertLink = $('.nav-item.alert') || $('.nav-vertical-item.alert-item');
  if (alertLink) {
    SELENE.on((V) => {
      const n = V.alerts.activeCrit + V.alerts.activeWarn;
      alertLink.dataset.count = n;
      alertLink.dataset.sev = V.alerts.activeCrit ? 'crit' : 'warn';
      alertLink.setAttribute('aria-label', `Alertas (${n} ativos)`);
    });
  }

  /* --------------------------- avisos (toasts) --------------------------- */
  let toasts = null, lastSeen = null;
  const GLYPH = { crit: '✖ CRÍTICO', warn: '▲ ATENÇÃO', ok: '● NORMALIZADO' };
  function toast(e) {
    if (!toasts) {
      toasts = document.createElement('div');
      toasts.className = 'toasts';
      toasts.setAttribute('role', 'status');
      document.body.appendChild(toasts);
    }
    const state = e.type === 'info' ? 'ok' : e.type;
    const a = document.createElement('a');
    a.className = 'toast';
    a.dataset.state = state;
    a.href = ROOT + 'alertas/alertas.html';
    a.innerHTML = '<b></b><span></span>';
    a.firstChild.textContent = GLYPH[state];
    a.lastChild.textContent = e.msg;
    toasts.appendChild(a);
    while (toasts.children.length > 3) toasts.firstChild.remove();
    setTimeout(() => { a.classList.add('out'); setTimeout(() => a.remove(), 400); }, 6500);
  }
  SELENE.on((V, S) => {
    if (lastSeen === null) { lastSeen = S.nextId; return; }
    if (PAGE !== 'alertas') {
      S.events
        .filter((e) => e.id >= lastSeen && (e.type !== 'info' || e.key.startsWith('ok-')))
        .reverse()
        .forEach(toast);
    }
    lastSeen = S.nextId;
  });

  /* ------------------------ sequência de boot (1ª visita) ------------------------ */
  const BOOT_KEY = 'selene.booted';
  let booted = false;
  try { booted = !!sessionStorage.getItem(BOOT_KEY); } catch (e) { booted = true; }

  function boot(V) {
    if (booted || reduced || document.body.dataset.boot === 'off') return;
    try { sessionStorage.setItem(BOOT_KEY, '1'); } catch (e) { /* ignora */ }
    const a = V.alerts;
    const lines = [
      'SELENE // MONITORAMENTO DA COLÔNIA LUNAR',
      '> SENSORES ........................ OK',
      '> LINK TERRA-LUA (SELELINK-3) ..... OK',
      '> TELEMETRIA SOL-142 .............. SINCRONIZADA',
      `> ALERTAS ATIVOS: ${a.activeCrit} CRÍTICO(S) · ${a.activeWarn} ATENÇÃO`,
    ];
    const ov = document.createElement('div');
    ov.id = 'boot';
    ov.setAttribute('aria-hidden', 'true');
    ov.innerHTML = '<pre></pre><span class="boot-hint">TOQUE OU PRESSIONE UMA TECLA PARA PULAR</span>';
    document.body.appendChild(ov);
    const pre = ov.firstChild;

    let done = false, li = 0, ci = 0, timer = 0;
    const finish = () => {
      if (done) return;
      done = true; clearTimeout(timer);
      removeEventListener('keydown', finish); ov.removeEventListener('pointerdown', finish);
      ov.classList.add('out');
      setTimeout(() => ov.remove(), 380);
    };
    addEventListener('keydown', finish);
    ov.addEventListener('pointerdown', finish);

    (function type() {
      if (done) return;
      if (li >= lines.length) { timer = setTimeout(finish, 450); return; }
      const line = lines[li];
      pre.textContent = lines.slice(0, li).join('\n') + (li ? '\n' : '') + line.slice(0, ++ci) + '▌';
      if (ci >= line.length) { li++; ci = 0; timer = setTimeout(type, 140); }
      else timer = setTimeout(type, 7);
    })();
  }
  const off = SELENE.on((V) => { off(); boot(V); });

  /* ------------------------------- partida ------------------------------- */
  const go = () => SELENE.start();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go);
  else go();
})();
