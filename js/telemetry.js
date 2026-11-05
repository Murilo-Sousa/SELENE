/* ============================================================================
   SELENE · telemetry.js
   Fonte única de dados do painel.

   - Um único estado (S) alimenta as 7 páginas, então os números nunca se contradizem.
   - Tudo que aparece na tela é DERIVADO desse estado (V): percentuais, autonomia,
     status (ok / warn / crit), contagem de alertas...
   - Os alertas nascem de CONDIÇÕES (ex.: reserva de água < 35%), não de texto fixo.
   - Uma simulação leve (a cada 2 s) faz os valores oscilarem e dispara incidentes.
   - O estado fica em sessionStorage para continuar igual ao navegar entre páginas.

   Marcação suportada nas páginas (data-attributes):
     data-bind="caminho"        texto   (+ data-fmt, data-prefix, data-suffix, data-tick)
     data-bar="caminho"         largura em % de uma barra
     data-ring="caminho"        anel de progresso SVG (círculo .progress-ring-fill)
     data-state-of="caminho"    aplica data-state="ok|warn|crit" no elemento
     data-status="caminho"      data-state + rótulo (NORMAL / ATENÇÃO / CRÍTICO)
     data-caret="caminho"       alterna fa-caret-up / fa-caret-down pelo sinal
   ========================================================================== */
(() => {
  'use strict';

  const VERSION = 2;
  const KEY = 'selene.telemetry.v' + VERSION;
  const PAUSE_KEY = 'selene.paused';
  const TICK_MS = 2000;
  const ACCEL = 1500;          // 1 s real = 25 min simulados (só p/ estoques lentos: água e comida)
  const MAX_EVENTS = 40;
  const LABELS = { ok: 'NORMAL', warn: 'ATENÇÃO', crit: 'CRÍTICO' };
  const RANK = { ok: 0, warn: 1, crit: 2 };

  /* ---------- utilitários ---------- */
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const rnd = (a = -1, b = 1) => a + Math.random() * (b - a);
  const approach = (v, t, k) => v + (t - v) * k;
  const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
  const worst = (...s) => s.reduce((a, b) => (RANK[b] > RANK[a] ? b : a), 'ok');
  const low = (v, warn, crit) => (v < crit ? 'crit' : v < warn ? 'warn' : 'ok');
  const high = (v, warn, crit) => (v > crit ? 'crit' : v > warn ? 'warn' : 'ok');
  const band = (v, lo, hi, t1, t2) => {
    const d = v < lo ? lo - v : v > hi ? v - hi : 0;
    return d === 0 ? 'ok' : d <= t1 ? 'warn' : 'crit';
  };
  const get = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
  const cap1 = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  const store = {
    read(k) { try { return JSON.parse(sessionStorage.getItem(k)); } catch (e) { return null; } },
    write(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* modo privado etc. */ } },
  };

  /* ---------- formatadores ---------- */
  const FMT = {
    txt: (v) => String(v),
    int: (v) => Math.round(v).toLocaleString('pt-BR'),
    d1: (v) => (Math.round(v * 10) / 10).toFixed(1),
    d2: (v) => (Math.round(v * 100) / 100).toFixed(2),
    pct: (v) => Math.round(v) + '%',
    sign0: (v) => (Math.round(v) > 0 ? '+' : Math.round(v) < 0 ? '−' : '') + Math.abs(Math.round(v)),
    neg0: (v) => '−' + Math.abs(Math.round(v)),
    pos0: (v) => '+' + Math.abs(Math.round(v)),
    time: (v) => hhmmss(v),
  };
  const hhmmss = (ts) => new Date(ts).toLocaleTimeString('pt-BR', { hour12: false });
  function rel(ts) {
    const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
    if (s < 10) return 'agora';
    if (s < 60) return s + ' segundos atrás';
    const m = Math.floor(s / 60);
    if (m < 60) return m + (m === 1 ? ' minuto atrás' : ' minutos atrás');
    const h = Math.floor(m / 60);
    return h + (h === 1 ? ' hora atrás' : ' horas atrás');
  }

  /* ==========================================================================
     ESTADO INICIAL
     ========================================================================== */
  function seed() {
    const now = Date.now();
    let id = 0;
    const ev = (type, key, icon, msg, detail, ageMin, resolved = false) =>
      ({ id: ++id, type, key, icon, msg, detail, ts: now - ageMin * 60000, resolved });

    const events = [
      ev('crit', 'reactor', 'fa-bolt', 'Flutuação no reator principal', 'Variação de tensão detectada no Módulo de Energia - Setor A', 2),
      ev('crit', 'water', 'fa-droplet', 'Reserva de água abaixo do mínimo', 'Nível crítico no reservatório sul: 30% da capacidade', 15),
      ev('warn', 'co2', 'fa-cloud', 'CO₂ acima do recomendado', 'Pico de 512 PPM no Módulo Habitat — já normalizado', 60, true),
      ev('warn', 'agri', 'fa-burger', 'Produção agrícola reduzida', 'Queda de 16% na produção do setor C - Possível infestação', 120),
      ev('warn', 'hepa', 'fa-microchip', 'Filtro HEPA saturado', 'Eficiência do filtro caiu para 72% - Manutenção necessária', 180),
      ev('info', 'maint', 'fa-solar-panel', 'Manutenção preventiva', 'Troca de filtros programada para hoje às 14h', 240),
      ev('warn', 'sat144', 'fa-satellite', 'Link degradado com SAT-144', 'Sinal em 88% e taxa de erro de 7.6% - Possível interferência solar', 300),
      ev('info', 'sync', 'fa-chart-line', 'Sincronização concluída', 'Banco de dados atualizado com dados das últimas 24h', 360),
      ev('info', 'selftest', 'fa-check-circle', 'Teste de sistemas completo', 'Todos os sistemas de suporte vitais operacionais', 480),
      ev('info', 'link', 'fa-satellite', 'Link com Terra estabelecido', 'Comunicação via SAT-142 normalizada', 720),
    ];

    const c = (from, to, secAgo, ok = true) => ({ from, to, ts: now - secAgo * 1000, ok });

    return {
      v: VERSION,
      last: now,
      nextId: id + 1,
      energy: {
        solar: { cap: 1176, out: 847 },
        reactor: { cap: 400, out: 280, fluct: true },
        battery: { cap: 500, kwh: 450 },
        use: { A: 187, B: 217, C: 124, D: 43, INFRA: 50 },       // soma = 621 kW
        h7: [598, 634, 612, 655, 603, 641, 621],                  // consumo total, últimas 7 leituras
        h24: [545, 520, 495, 480, 520, 590, 670, 705, 690, 650, 615, 580, 621], // a cada 2 h
      },
      water: {
        cap: 3700, l: 1120, human: 28, agri: 9, recycle: 0.9, extract: 20, extractMax: 50,
        q: { ph: 7.2, cl: 0.8, ntu: 1.2, no3: 15 },
      },
      atmos: {
        o2: 21.2, co2: 412, kpa: 101.3, rh: 55, ar: 0.9, hepa: 72, scrub: 98, o2gen: 100,
        temp: 21.5, heat: 45, purity: 95,
        hp: [101.1, 101.4, 100.9, 101.6, 101.2, 101.5, 101.3],
      },
      food: {
        kg: 2450, cap: 3600, prod: 42, target: 50, crew: 32, research: 6,
        crops: [
          { name: 'Alface', area: 45, stage: 75, status: 'COLHEITA', days: 5, kg: 18 },
          { name: 'Tomate', area: 30, stage: 40, status: 'CRESCIMENTO', days: 18, kg: 12 },
          { name: 'Trigo', area: 60, stage: 85, status: 'MATURAÇÃO', days: 10, kg: 25 },
          { name: 'Batata', area: 25, stage: 15, status: 'PLANTIO', days: 35, kg: 8 },
          { name: 'Cenoura', area: 35, stage: 50, status: 'DESENVOLV.', days: 22, kg: 15 },
        ],
      },
      sats: {
        sat142: { name: 'SAT-142', orbit: 'NRHO (halo lunar)', alt: '36.000 km', base: 92, sig: 92, lat: 2.62, sent: 1247, recv: 1198, up: 12.4, down: 18.7, up0: 12.4, down0: 18.7, drop: 0.04 },
        sat143: { name: 'SAT-143', orbit: 'Lunar baixa (LLO)', alt: '100 km', base: 96, sig: 96, lat: 2.6, sent: 2891, recv: 2845, up: 25.8, down: 32.4, up0: 25.8, down0: 32.4, drop: 0.016 },
        sat144: { name: 'SAT-144', orbit: 'NRHO (halo lunar)', alt: '36.000 km', base: 88, sig: 88, lat: 2.64, sent: 987, recv: 912, up: 8.2, down: 11.5, up0: 8.2, down0: 11.5, drop: 0.076 },
        sat145: { name: 'SAT-145', orbit: 'Lunar baixa (LLO)', alt: '100 km', base: 0, sig: 0, lat: 0, sent: 0, recv: 0, up: 0, down: 0, drop: 0, maint: true },
      },
      comms: [
        c('BASE SELENE', 'SAT-142', 40), c('SAT-143', 'BASE SELENE', 95), c('BASE SELENE', 'SAT-144', 170),
        c('SAT-142', 'HOUSTON', 260), c('BASE SELENE', 'SAT-145', 400, false),
      ],
      events,
      sc: {
        h7Next: now + 9000, commsNext: now + 6000, infoNext: now + 100000, incidentNext: now + 45000,
        reactorClearAt: now + 70000, reactorRetryAt: 0,
        co2Until: 0, co2Target: 0, dustUntil: 0, dust: 0,
      },
    };
  }

  /* ==========================================================================
     ESTADO + VISÃO DERIVADA
     ========================================================================== */
  let S = null;        // estado "cru"
  let V = null;        // visão derivada (o que a UI lê)
  let paused = !!store.read(PAUSE_KEY);
  const subs = new Set();

  function compute() {
    const E = S.energy, W = S.water, A = S.atmos, F = S.food;
    const out = {};

    /* energia */
    const use = sum(E.use);
    const gen = E.solar.out + E.reactor.out;
    const solarPct = (E.solar.out / E.solar.cap) * 100;
    const batPct = (E.battery.kwh / E.battery.cap) * 100;
    const reactPct = (E.reactor.out / E.reactor.cap) * 100;
    const usePct = (use / gen) * 100;
    out.energy = {
      solar: { out: E.solar.out, cap: E.solar.cap, pct: solarPct, state: low(solarPct, 40, 20), vsYesterday: (E.solar.out / 756 - 1) * 100 },
      reactor: { out: E.reactor.out, cap: E.reactor.cap, pct: reactPct, state: E.reactor.fluct ? 'crit' : 'ok', note: E.reactor.fluct ? ' · FLUTUAÇÃO' : '' },
      battery: { kwh: E.battery.kwh, cap: E.battery.cap, pct: batPct, state: low(batPct, 30, 15) },
      gen, use, usePct, useState: high(usePct, 85, 95),
      mods: [['MOD - A', 'HABITAÇÃO', 'A'], ['MOD - B', 'PESQUISA', 'B'], ['MOD - C', 'AGRICULTURA', 'C'],
             ['MOD - D', 'ARMAZENAMENTO', 'D'], ['INFRA', 'ESTRUTURA', 'INFRA']]
        .map(([id, name, k]) => ({ id, name, kw: E.use[k], pct: (E.use[k] / use) * 100 })),
    };

    /* água */
    const wUse = W.human + W.agri;
    const wRec = wUse * W.recycle;
    const wNet = wRec + W.extract - wUse;
    const wPct = (W.l / W.cap) * 100;
    out.water = {
      l: W.l, cap: W.cap, pct: wPct, state: low(wPct, 50, 35),
      use: wUse, human: W.human, agri: W.agri, recycled: wRec, extract: W.extract,
      extractPct: (W.extract / W.extractMax) * 100, recycleRate: W.recycle * 100,
      net: wNet, weekPct: (wNet * 7 / W.cap) * 100, autonomy: Math.floor(W.l / wUse),
      q: {
        ph: { v: W.q.ph, state: band(W.q.ph, 6.5, 8.5, 0.5, 1.5) },
        cl: { v: W.q.cl, state: low(W.q.cl, 1.0, 0.4) },
        ntu: { v: W.q.ntu, state: high(W.q.ntu, 2, 4) },
        no3: { v: W.q.no3, state: high(W.q.no3, 45, 50) },
      },
    };

    /* atmosfera */
    const other = 0.04 + A.co2 / 10000;                       // CO₂ + traços (1 ppm = 0,0001 %)
    const n2 = 100 - A.o2 - A.ar - other;                     // composição sempre fecha em 100 %
    const filt = (A.hepa + A.scrub + A.o2gen) / 3;
    out.atmos = {
      o2: { v: A.o2, state: band(A.o2, 20.5, 22.5, 0.8, 2), bar: (A.o2 / 24) * 100 },
      co2: { v: A.co2, state: high(A.co2, 500, 800), bar: (A.co2 / 1000) * 100 },
      kpa: { v: A.kpa, state: band(A.kpa, 99, 103.5, 2, 5), bar: (A.kpa / 106.6) * 100 },
      rh: { v: A.rh, state: band(A.rh, 45, 65, 5, 15) },
      n2, ar: A.ar, other, n2State: 'ok', arState: 'ok',
      hepa: { v: A.hepa, state: low(A.hepa, 80, 60) },
      scrub: { v: A.scrub, state: low(A.scrub, 80, 60) },
      o2gen: { v: A.o2gen, state: low(A.o2gen, 80, 60) },
      filt: { v: filt, state: low(filt, 85, 70) },
      temp: { v: A.temp, state: band(A.temp, 19, 24, 2, 5) },
      heat: A.heat, purity: A.purity,
    };

    /* alimentos */
    const fCons = F.crew + F.research;
    const fPct = (F.kg / F.cap) * 100;
    const fAut = Math.floor(F.kg / fCons);
    const fEff = (F.prod / F.target) * 100;
    out.food = {
      kg: F.kg, cap: F.cap, pct: fPct, autonomy: fAut, state: worst(low(fPct, 40, 25), low(fAut, 45, 30)),
      prod: F.prod, target: F.target, eff: fEff, effState: low(fEff, 90, 70),
      crew: F.crew, research: F.research, cons: fCons, consBar: (fCons / F.target) * 100, net: F.prod - fCons,
      nextHarvest: Math.min(...F.crops.map((x) => x.days)),
      crops: F.crops,
    };

    /* satélites */
    const byId = {};
    Object.entries(S.sats).forEach(([id, s]) => {
      const err = s.sent ? ((s.sent - s.recv) / s.sent) * 100 : 0;
      let state = 'ok', label = 'ATIVO';
      if (s.maint) { state = 'warn'; label = 'MANUTENÇÃO'; }
      else if (s.sig < 90 || err > 5) { state = 'warn'; label = 'DEGRADADO'; }
      byId[id] = { id, name: s.name, orbit: s.orbit, alt: s.alt, lat: s.maint ? null : s.lat, sig: s.sig,
                   sent: s.sent, recv: s.recv, err, up: s.up, down: s.down, state, label, maint: !!s.maint };
    });
    const active = Object.values(byId).filter((s) => !s.maint);
    out.sats = { byId, latency: active.reduce((a, s) => a + s.lat, 0) / active.length };

    /* módulos (home) */
    out.mods = [
      { id: 'MOD - A', name: 'HABITAÇÃO', state: worst(out.atmos.o2.state, out.atmos.co2.state, out.atmos.rh.state, out.atmos.temp.state) },
      { id: 'MOD - B', name: 'PESQUISA', state: 'ok' },
      { id: 'MOD - C', name: 'AGRICULTURA', state: out.food.effState },
      { id: 'MOD - D', name: 'ARMAZENAMENTO', state: out.food.state },
      { id: 'MOD - E', name: 'ENERGIA', state: worst(out.energy.reactor.state, out.energy.battery.state, out.energy.useState) },
    ];

    out.alerts = countAlerts();
    return out;
  }

  function countAlerts() {
    const r = { crit: 0, warn: 0, info: 0, total: S.events.length, activeCrit: 0, activeWarn: 0 };
    S.events.forEach((e) => {
      r[e.type]++;
      if (!e.resolved && e.type === 'crit') r.activeCrit++;
      if (!e.resolved && e.type === 'warn') r.activeWarn++;
    });
    const pc = (n) => (r.total ? (n / r.total) * 100 : 0);
    r.critPct = pc(r.crit); r.warnPct = pc(r.warn); r.infoPct = pc(r.info);
    r.critState = r.activeCrit ? 'crit' : 'ok';
    r.warnState = r.activeWarn ? 'warn' : 'ok';
    r.critWord = r.activeCrit ? 'URGENTE' : 'SOB CONTROLE';
    r.warnWord = r.activeWarn ? 'MONITORAR' : 'SEM PENDÊNCIAS';
    return r;
  }

  /* ==========================================================================
     ALERTAS: nascem de condições
     ========================================================================== */
  function conditions() {
    const c = [];
    const E = V.energy, W = V.water, A = V.atmos, F = V.food, T = V.sats.byId;
    const R = Math.round;

    if (E.reactor.state === 'crit') c.push({ key: 'reactor', sev: 'crit', icon: 'fa-bolt',
      msg: 'Flutuação no reator principal', detail: 'Variação de tensão detectada no Módulo de Energia - Setor A'});

    if (W.state !== 'ok') c.push({ key: 'water', sev: W.state, icon: 'fa-droplet',
      msg: W.state === 'crit' ? 'Reserva de água abaixo do mínimo' : 'Reserva de água em nível de atenção',
      detail: W.state === 'crit' ? `Nível crítico no reservatório sul: ${R(W.pct)}% da capacidade`
                                 : `Reservatório sul em ${R(W.pct)}% da capacidade - recuperação em andamento`});

    if (A.co2.state !== 'ok') c.push({ key: 'co2', sev: A.co2.state, icon: 'fa-cloud',
      msg: A.co2.state === 'crit' ? 'CO₂ acima do limite seguro' : 'CO₂ acima do recomendado',
      detail: `Concentração de ${R(A.co2.v)} PPM no Módulo Habitat`});

    if (F.effState !== 'ok') c.push({ key: 'agri', sev: F.effState, icon: 'fa-burger',
      msg: 'Produção agrícola reduzida', detail: `Queda de ${R(100 - F.eff)}% na produção do setor C - Possível infestação`});

    if (A.hepa.state !== 'ok') c.push({ key: 'hepa', sev: A.hepa.state, icon: 'fa-microchip',
      msg: 'Filtro HEPA saturado', detail: `Eficiência do filtro caiu para ${R(A.hepa.v)}% - Manutenção necessária`});

    if (T.sat144.state !== 'ok') c.push({ key: 'sat144', sev: 'warn', icon: 'fa-satellite',
      msg: 'Link degradado com SAT-144', detail: `Sinal em ${R(T.sat144.sig)}% e taxa de erro de ${T.sat144.err.toFixed(1)}% - Possível interferência solar`});

    if (E.battery.state !== 'ok') c.push({ key: 'battery', sev: E.battery.state, icon: 'fa-bolt',
      msg: 'Bateria de backup baixa', detail: `Carga em ${R(E.battery.pct)}% (${R(E.battery.kwh)} kWh)`});

    if (F.state !== 'ok') c.push({ key: 'food', sev: F.state, icon: 'fa-burger',
      msg: 'Reserva de alimentos em queda', detail: `Autonomia de ${F.autonomy} dias`});

    return c;
  }

  function pushEvent(type, key, icon, msg, detail, resolved = false) {
    const e = { id: S.nextId++, type, key, icon, msg, detail, ts: Date.now(), resolved };
    S.events.unshift(e);
    if (S.events.length > MAX_EVENTS) S.events.length = MAX_EVENTS;
    return e;
  }

  function evaluate() {
    const conds = conditions();
    const byKey = Object.fromEntries(conds.map((c) => [c.key, c]));

    // condições novas ou que mudaram de severidade
    conds.forEach((c) => {
      const act = S.events.find((e) => e.key === c.key && !e.resolved);
      if (!act) pushEvent(c.sev, c.key, c.icon, c.msg, c.detail);
      else if (act.type !== c.sev) { act.resolved = true; pushEvent(c.sev, c.key, c.icon, c.msg, c.detail); }
    });

    // condições que sumiram: resolve e registra
    const keys = new Set(S.events.filter((e) => !e.resolved && e.type !== 'info').map((e) => e.key));
    keys.forEach((k) => {
      if (byKey[k]) return;
      S.events.forEach((e) => { if (e.key === k && !e.resolved) e.resolved = true; });
      pushEvent('info', 'ok-' + k, 'fa-check-circle', okText(k).msg, okText(k).detail);
    });

    V.alerts = countAlerts();
  }

  // textos de "normalizado" (usam a definição mais recente da condição quando existe)
  function okText(key) {
    const map = {
      reactor: ['Reator principal estabilizado', 'Tensão nominal restabelecida no Módulo de Energia - Setor A'],
      water: ['Reserva de água normalizada', `Reservatório sul em ${Math.round(V.water.pct)}% da capacidade`],
      co2: ['CO₂ normalizado', `Concentração de ${Math.round(V.atmos.co2.v)} PPM no Módulo Habitat`],
      agri: ['Produção agrícola recuperada', 'Setor C dentro da meta diária'],
      hepa: ['Filtro HEPA renovado', 'Eficiência do filtro de volta ao normal'],
      sat144: ['Link com SAT-144 normalizado', 'Sinal e taxa de erro dentro do esperado'],
      battery: ['Bateria de backup recuperada', `Carga em ${Math.round(V.energy.battery.pct)}%`],
      food: ['Reserva de alimentos normalizada', `Autonomia de ${V.food.autonomy} dias`],
    };
    const m = map[key] || ['Condição normalizada', ''];
    return { msg: m[0], detail: m[1] };
  }

  /* ==========================================================================
     SIMULAÇÃO
     ========================================================================== */
  const BASE_USE = { A: 187, B: 217, C: 124, D: 43, INFRA: 50 };
  const COMMS_POOL = [['BASE SELENE', 'SAT-142'], ['SAT-143', 'BASE SELENE'], ['BASE SELENE', 'SAT-144'],
                      ['SAT-142', 'HOUSTON'], ['SAT-143', 'HOUSTON'], ['BASE SELENE', 'SAT-143']];
  const INFO_POOL = [
    ['fa-chart-line', 'Telemetria sincronizada', 'Pacote de dados enviado e confirmado pela Terra'],
    ['fa-check-circle', 'Backup de dados concluído', 'Cópia de segurança do banco de bordo verificada'],
    ['fa-droplet', 'Ciclo de reciclagem concluído', 'Membrana de filtragem operando dentro do esperado'],
    ['fa-microchip', 'Calibração de sensores concluída', 'Sensores atmosféricos recalibrados no Módulo Habitat'],
  ];

  function scenarios(now) {
    const sc = S.sc, E = S.energy;

    // reator: estabiliza depois de um tempo e pode voltar a oscilar
    if (E.reactor.fluct && sc.reactorClearAt && now >= sc.reactorClearAt) {
      E.reactor.fluct = false; sc.reactorClearAt = 0; sc.reactorRetryAt = now + rnd(150000, 240000);
    } else if (!E.reactor.fluct && sc.reactorRetryAt && now >= sc.reactorRetryAt) {
      E.reactor.fluct = true; sc.reactorClearAt = now + rnd(50000, 90000); sc.reactorRetryAt = 0;
    }

    // incidentes aleatórios
    if (now >= sc.incidentNext) {
      sc.incidentNext = now + rnd(45000, 90000);
      if (Math.random() < 0.55 && now > sc.co2Until) trigger('co2');
      else if (now > sc.dustUntil) trigger('dust');
    }

    // mensagens informativas
    if (now >= sc.infoNext) {
      sc.infoNext = now + rnd(80000, 140000);
      const p = INFO_POOL[Math.floor(Math.random() * INFO_POOL.length)];
      pushEvent('info', 'note', p[0], p[1], p[2]);
    }

    // comunicações
    if (now >= sc.commsNext) {
      sc.commsNext = now + rnd(7000, 14000);
      const [from, to] = Math.random() < 0.06 ? ['BASE SELENE', 'SAT-145'] : COMMS_POOL[Math.floor(Math.random() * COMMS_POOL.length)];
      const ok = to !== 'SAT-145' && Math.random() > 0.05;
      S.comms.unshift({ from, to, ts: now, ok });
      if (S.comms.length > 8) S.comms.length = 8;
    }
  }

  function trigger(kind) {
    const now = Date.now(), sc = S.sc;
    if (kind === 'co2') { sc.co2Until = now + rnd(28000, 42000); sc.co2Target = rnd(560, 640); }
    else if (kind === 'dust') {
      sc.dustUntil = now + rnd(25000, 40000); sc.dust = rnd(0.07, 0.12);
      pushEvent('info', 'dust', 'fa-solar-panel', 'Queda temporária na geração solar', 'Poeira lunar sobre os painéis do Setor B - limpeza automática acionada');
    } else if (kind === 'reactor') { S.energy.reactor.fluct = true; sc.reactorClearAt = now + rnd(50000, 80000); sc.reactorRetryAt = 0; }
    if (V) { V = compute(); evaluate(); notify(); save(); }
  }

  function step(dt, now) {
    const sc = S.sc, E = S.energy, W = S.water, A = S.atmos, F = S.food;

    /* energia */
    const dust = now < sc.dustUntil ? sc.dust : 0;
    E.solar.out = clamp(approach(E.solar.out, (850 + 22 * Math.sin(now / 55000)) * (1 - dust), 0.25) + rnd(-4, 4), 0, E.solar.cap);
    E.reactor.out = clamp(approach(E.reactor.out, 280, 0.3) + (E.reactor.fluct ? rnd(-15, 15) : rnd(-1.2, 1.2)), 0, E.reactor.cap);
    const f = 1 + 0.035 * Math.sin(now / 70000);
    Object.keys(BASE_USE).forEach((k) => { E.use[k] = clamp(approach(E.use[k], BASE_USE[k] * f, 0.3) + rnd(-2.2, 2.2), 10, 400); });
    const total = sum(E.use), gen = E.solar.out + E.reactor.out;
    E.battery.kwh = clamp(approach(E.battery.kwh, 450, 0.02) + (gen > total ? 0.15 : -0.15) + rnd(-0.2, 0.2), 0, E.battery.cap);
    E.h24[12] = total;
    if (now >= sc.h7Next) { E.h7.shift(); E.h7.push(total); S.atmos.hp.shift(); S.atmos.hp.push(A.kpa); sc.h7Next = now + 9000; }
    else { E.h7[6] = total; A.hp[6] = A.kpa; }

    /* atmosfera */
    A.o2 = clamp(approach(A.o2, 21.2, 0.2) + rnd(-0.015, 0.015), 19, 23);
    const co2T = now < sc.co2Until ? sc.co2Target : 412;
    A.co2 = clamp(approach(A.co2, co2T, 0.18) + rnd(-2.5, 2.5), 380, 1200);
    A.kpa = clamp(approach(A.kpa, 101.3, 0.2) + rnd(-0.04, 0.04), 98, 104);
    A.rh = clamp(approach(A.rh, 55, 0.1) + rnd(-0.25, 0.25), 30, 80);
    A.hepa = clamp(A.hepa + rnd(-0.03, 0.03), 40, 100);
    A.temp = clamp(approach(A.temp, 21.5, 0.1) + rnd(-0.05, 0.05), 15, 30);
    A.heat = clamp(approach(A.heat, 45, 0.1) + rnd(-0.4, 0.4), 0, 100);
    A.purity = clamp(approach(A.purity, 95, 0.1) + rnd(-0.1, 0.1), 80, 100);

    /* água (estoque lento, com aceleração) */
    const wUse = W.human + W.agri, net = wUse * W.recycle + W.extract - wUse;
    W.l = clamp(W.l + (net * dt * ACCEL) / 86400, 0, W.cap);
    W.q.ph = clamp(approach(W.q.ph, 7.2, 0.1) + rnd(-0.015, 0.015), 6, 9);
    W.q.cl = clamp(approach(W.q.cl, 0.85, 0.05) + rnd(-0.01, 0.01), 0.2, 2);
    W.q.ntu = clamp(approach(W.q.ntu, 1.2, 0.1) + rnd(-0.02, 0.02), 0.1, 6);
    W.q.no3 = clamp(approach(W.q.no3, 15, 0.1) + rnd(-0.15, 0.15), 1, 60);

    /* alimentos */
    F.prod = clamp(approach(F.prod, 42, 0.2) + rnd(-0.6, 0.6), 30, 55);
    F.kg = clamp(F.kg + ((F.prod - (F.crew + F.research)) * dt * ACCEL) / 86400, 0, F.cap);

    /* satélites */
    Object.values(S.sats).forEach((s) => {
      if (s.maint) return;
      s.sig = clamp(approach(s.sig, s.base, 0.1) + rnd(-0.6, 0.6), 60, 99.5);
      const pk = Math.round(rnd(0, 4));
      s.sent += pk;
      for (let i = 0; i < pk; i++) if (Math.random() > s.drop) s.recv++;
      s.up = clamp(approach(s.up, s.up0, 0.1) + rnd(-0.25, 0.25), 1, 60);
      s.down = clamp(approach(s.down, s.down0, 0.1) + rnd(-0.25, 0.25), 1, 60);
      s.lat = clamp(approach(s.lat, 2.62, 0.1) + rnd(-0.01, 0.01), 2.5, 2.8);
    });
  }

  /* ==========================================================================
     BINDING (data-attributes → DOM)
     ========================================================================== */
  let els = null;
  function collect(root = document) {
    const q = (s) => [...root.querySelectorAll(s)];
    els = { text: q('[data-bind]'), bar: q('[data-bar]'), ring: q('[data-ring]'),
            stateOf: q('[data-state-of]'), status: q('[data-status]'), caret: q('[data-caret]') };
  }
  function flash(el) {
    el.classList.remove('tick'); void el.offsetWidth; el.classList.add('tick');
    el.addEventListener('animationend', () => el.classList.remove('tick'), { once: true });
  }
  function bind() {
    if (!els) collect();
    const ok = (v) => v != null && !(typeof v === 'number' && !isFinite(v));
    els.text.forEach((el) => {
      const raw = get(V, el.dataset.bind);
      if (!ok(raw)) return;
      let s = (FMT[el.dataset.fmt || 'txt'] || FMT.txt)(raw);
      if (el.dataset.prefix) s = el.dataset.prefix + s;
      if (el.dataset.suffix) s += el.dataset.suffix;
      if (el.textContent !== s) { el.textContent = s; if (el.hasAttribute('data-tick')) flash(el); }
    });
    els.bar.forEach((el) => { const v = get(V, el.dataset.bar); if (ok(v)) el.style.width = clamp(v, 0, 100).toFixed(1) + '%'; });
    els.ring.forEach((el) => {
      const v = get(V, el.dataset.ring), fill = el.querySelector('.progress-ring-fill');
      if (!ok(v) || !fill) return;
      const C = 2 * Math.PI * 45;
      fill.style.strokeDasharray = C; fill.style.strokeDashoffset = C * (1 - clamp(v, 0, 100) / 100);
    });
    els.stateOf.forEach((el) => { const v = get(V, el.dataset.stateOf); if (v) el.dataset.state = v; });
    els.status.forEach((el) => {
      const st = get(V, el.dataset.status);
      if (!st) return;
      el.dataset.state = st;
      const label = el.dataset['label' + cap1(st)] || LABELS[st];
      if (el.textContent !== label) el.textContent = label;
    });
    els.caret.forEach((el) => {
      const v = get(V, el.dataset.caret);
      if (!ok(v)) return;
      el.classList.toggle('fa-caret-up', v >= 0); el.classList.toggle('fa-caret-down', v < 0);
    });
  }

  /* ==========================================================================
     CICLO DE VIDA
     ========================================================================== */
  function save() { S.last = Date.now(); store.write(KEY, S); }
  function notify() { subs.forEach((fn) => { try { fn(V, S); } catch (e) { console.error('[SELENE]', e); } }); }

  function tick() {
    const now = Date.now();
    const dt = clamp((now - S.last) / 1000, 0, 8);
    if (!paused) { scenarios(now); step(dt, now); }
    V = compute();
    evaluate();
    save();
    bind();
    notify();
  }

  function start() {
    const saved = store.read(KEY);
    // estado salvo vale se for da mesma versão e recente (senão recomeça do cenário inicial)
    S = saved && saved.v === VERSION && Date.now() - saved.last < 20 * 60 * 1000 ? saved : seed();
    S.last = Date.now();
    V = compute();
    evaluate();
    save();
    bind();
    notify();
    setInterval(tick, TICK_MS);
  }

  function setPaused(p) {
    paused = !!p; store.write(PAUSE_KEY, paused);
    S.last = Date.now();
    notify();
  }

  window.SELENE = {
    start,
    on(fn) { subs.add(fn); return () => subs.delete(fn); },
    rebind(root) { collect(root); bind(); },
    get S() { return S; },
    get V() { return V; },
    get paused() { return paused; },
    togglePause() { setPaused(!paused); return paused; },
    trigger, fmt: FMT, rel, hhmmss, LABELS,
  };
})();
