/* ============================================================================
   SELENE · charts.js
   Gráficos de linha e barras em <canvas>, sem dependências.

   - Herdam a cor do próprio <canvas> (CSS `color`), então mudam para âmbar/vermelho
     quando o painel pai recebe data-state="warn|crit".
   - Suavizam a transição entre leituras (desligado com prefers-reduced-motion).
   - Tooltip ao passar o mouse / tocar.

   Uso:
     const c = SeleneCharts.line(canvas, { unit: ' KW', showY: true, min: 20, max: 100 });
     c.update([..valores..], [..rótulos..]);
   ========================================================================== */
(() => {
  'use strict';

  const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const FONT = '600 9px "Geom", system-ui, sans-serif';

  const rgba = (c, a) => {
    const m = String(c).match(/[\d.]+/g) || [77, 176, 77];
    return `rgba(${m[0]},${m[1]},${m[2]},${a})`;
  };

  function fit(canvas) {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return null;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx, w, h };
  }

  /* núcleo comum: dados animados + resize + tooltip */
  function base(canvas, opts, render) {
    const chart = { cur: [], tgt: [], labels: [], hover: -1, raf: 0, geo: null };
    const host = canvas.parentElement;
    const tip = document.createElement('div');
    tip.className = 'chart-tip';
    tip.hidden = true;
    host.appendChild(tip);

    const fmt = opts.fmt || ((v) => (Math.round(v * 10) / 10).toString());
    const unit = opts.unit || '';

    function draw() {
      const f = fit(canvas);
      if (!f || !chart.cur.length) return;
      chart.geo = render(f, chart, canvas) || null;
    }

    function loop() {
      let moving = false;
      for (let i = 0; i < chart.tgt.length; i++) {
        const d = chart.tgt[i] - chart.cur[i];
        if (Math.abs(d) > 0.002 * Math.max(1, Math.abs(chart.tgt[i]))) { chart.cur[i] += d * 0.22; moving = true; }
        else chart.cur[i] = chart.tgt[i];
      }
      draw();
      chart.raf = moving ? requestAnimationFrame(loop) : 0;
    }

    function update(values, labels) {
      chart.labels = labels || chart.labels;
      chart.tgt = values.slice();
      if (reduced || chart.cur.length !== values.length) chart.cur = values.slice();
      if (reduced) draw();
      else if (!chart.raf) chart.raf = requestAnimationFrame(loop);
      if (chart.hover >= 0) showTip();
    }

    function showTip() {
      const g = chart.geo, i = chart.hover;
      if (!g || i < 0 || i >= chart.tgt.length) { tip.hidden = true; return; }
      const title = opts.tipTitle ? opts.tipTitle(chart.labels[i], i) : chart.labels[i];
      tip.innerHTML = `<b></b><span></span>`;
      tip.firstChild.textContent = title;
      tip.lastChild.textContent = fmt(chart.tgt[i]) + unit;
      tip.hidden = false;
      const x = g.x(i), y = g.y(chart.cur[i]);
      const tw = tip.offsetWidth, th = tip.offsetHeight;
      tip.style.left = Math.max(2, Math.min(canvas.clientWidth - tw - 2, x - tw / 2)) + 'px';
      tip.style.top = Math.max(2, y - th - 10) + 'px';
    }

    function pointer(e) {
      const g = chart.geo;
      if (!g) return;
      const r = canvas.getBoundingClientRect();
      chart.hover = g.at(e.clientX - r.left);
      draw();
      showTip();
    }
    canvas.addEventListener('pointermove', pointer);
    canvas.addEventListener('pointerdown', pointer);
    canvas.addEventListener('pointerleave', () => { chart.hover = -1; tip.hidden = true; draw(); });

    if (window.ResizeObserver) new ResizeObserver(draw).observe(canvas);
    else window.addEventListener('resize', draw);

    return { update, draw };
  }

  /* ---------------------------------- linha ---------------------------------- */
  function line(canvas, opts = {}) {
    return base(canvas, opts, ({ ctx, w, h }, chart, cv) => {
      const col = getComputedStyle(cv).color;
      const n = chart.cur.length;
      const pad = { l: opts.showY ? 40 : 10, r: 12, t: 12, b: 20 };
      const iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;

      let lo = opts.min, hi = opts.max;
      if (lo == null || hi == null) {
        const mn = Math.min(...chart.tgt), mx = Math.max(...chart.tgt), span = mx - mn || 1;
        if (lo == null) lo = mn - span * 0.3;
        if (hi == null) hi = mx + span * 0.3;
      }
      const x = (i) => pad.l + (n === 1 ? iw / 2 : (iw * i) / (n - 1));
      const y = (v) => pad.t + ih * (1 - (v - lo) / (hi - lo));
      const at = (px) => Math.max(0, Math.min(n - 1, Math.round(((px - pad.l) / iw) * (n - 1))));

      ctx.font = FONT;
      ctx.textBaseline = 'middle';

      // grade + eixo Y
      const ticks = opts.yTicks || 3;
      for (let t = 0; t <= ticks; t++) {
        const v = lo + ((hi - lo) * t) / ticks, yy = y(v);
        ctx.strokeStyle = rgba(col, 0.16);
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(pad.l, yy); ctx.lineTo(w - pad.r, yy); ctx.stroke();
        if (opts.showY) {
          ctx.fillStyle = rgba(col, 0.75); ctx.textAlign = 'right';
          ctx.fillText(Math.round(v) + (opts.yUnit || ''), pad.l - 6, yy);
        }
      }

      // eixo X
      const maxLabels = Math.max(2, Math.floor(iw / 44)), every = Math.ceil(n / maxLabels);
      ctx.textBaseline = 'alphabetic'; ctx.fillStyle = rgba(col, 0.85);
      chart.labels.forEach((lb, i) => {
        if (i % every !== 0 && i !== n - 1) return;
        ctx.textAlign = i === 0 ? 'left' : i === n - 1 ? 'right' : 'center';
        ctx.fillText(lb, i === 0 ? x(i) - 2 : i === n - 1 ? x(i) + 2 : x(i), h - 5);
      });

      // curva suave
      const pts = chart.cur.map((v, i) => ({ x: x(i), y: y(v) }));
      // Catmull-Rom → Bézier: a curva PASSA por todos os pontos; o eixo Y dos
      // controles é limitado ao intervalo do segmento para não "estourar" picos.
      const trace = () => {
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 0; i < n - 1; i++) {
          const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
          const lo = Math.min(p1.y, p2.y), hi = Math.max(p1.y, p2.y);
          const c1y = Math.max(lo, Math.min(hi, p1.y + (p2.y - p0.y) / 6));
          const c2y = Math.max(lo, Math.min(hi, p2.y - (p3.y - p1.y) / 6));
          ctx.bezierCurveTo(p1.x + (p2.x - p0.x) / 6, c1y, p2.x - (p3.x - p1.x) / 6, c2y, p2.x, p2.y);
        }
      };

      // área
      trace();
      ctx.lineTo(pts[n - 1].x, pad.t + ih); ctx.lineTo(pts[0].x, pad.t + ih); ctx.closePath();
      const g = ctx.createLinearGradient(0, pad.t, 0, pad.t + ih);
      g.addColorStop(0, rgba(col, 0.32)); g.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = g; ctx.fill();

      // linha com brilho
      trace();
      ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.lineJoin = 'round';
      ctx.shadowColor = rgba(col, 0.9); ctx.shadowBlur = reduced ? 0 : 8; ctx.stroke();
      ctx.shadowBlur = 0;

      // pontos
      pts.forEach((p, i) => {
        const last = i === n - 1, hov = i === chart.hover;
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(p.x, p.y, last || hov ? 3.8 : 2.4, 0, Math.PI * 2); ctx.fill();
        if (last) { ctx.strokeStyle = rgba(col, 0.5); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, Math.PI * 2); ctx.stroke(); }
      });

      // cursor
      if (chart.hover >= 0) {
        const hx = x(chart.hover);
        ctx.setLineDash([3, 3]); ctx.strokeStyle = rgba(col, 0.55); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(hx, pad.t); ctx.lineTo(hx, pad.t + ih); ctx.stroke(); ctx.setLineDash([]);
      }
      return { x, y, at };
    });
  }

  /* --------------------------------- barras ---------------------------------- */
  function bars(canvas, opts = {}) {
    return base(canvas, opts, ({ ctx, w, h }, chart, cv) => {
      const col = getComputedStyle(cv).color;
      const n = chart.cur.length;
      const pad = { l: 6, r: 6, t: 10, b: 20 };
      const iw = w - pad.l - pad.r, ih = h - pad.t - pad.b, slot = iw / n, bw = slot * 0.6;

      let lo = opts.min, hi = opts.max;
      if (lo == null || hi == null) { lo = 0; hi = Math.max(...chart.tgt) * 1.15; }
      const x = (i) => pad.l + slot * i + slot / 2;
      const y = (v) => pad.t + ih * (1 - (v - lo) / (hi - lo));
      const at = (px) => Math.max(0, Math.min(n - 1, Math.floor((px - pad.l) / slot)));

      ctx.strokeStyle = rgba(col, 0.2); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(pad.l, pad.t + ih + 0.5); ctx.lineTo(w - pad.r, pad.t + ih + 0.5); ctx.stroke();

      ctx.font = FONT; ctx.textAlign = 'center';
      chart.cur.forEach((v, i) => {
        const top = Math.min(y(v), pad.t + ih - 2), last = i === n - 1 || i === chart.hover;
        ctx.fillStyle = last ? col : rgba(col, 0.55);
        if (last && !reduced) { ctx.shadowColor = rgba(col, 0.8); ctx.shadowBlur = 8; }
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x(i) - bw / 2, top, bw, pad.t + ih - top, [3, 3, 0, 0]);
        else ctx.rect(x(i) - bw / 2, top, bw, pad.t + ih - top);
        ctx.fill(); ctx.shadowBlur = 0;
        ctx.fillStyle = rgba(col, 0.85);
        if (chart.labels[i] != null) ctx.fillText(chart.labels[i], x(i), h - 5);
      });
      return { x, y, at };
    });
  }

  window.SeleneCharts = { line, bars };
})();
