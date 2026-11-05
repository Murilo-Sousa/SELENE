/* SELENE · energia.js: histórico de consumo das últimas 24 h (gráfico em canvas, com tooltip). */
(() => {
  'use strict';

  const HOURS = ['00', '02', '04', '06', '08', '10', '12', '14', '16', '18', '20', '22', '24'];

  const chart = SeleneCharts.line(document.getElementById('energyHistoryChart'), {
    showY: true, yTicks: 4, unit: ' KW', yUnit: '',
    fmt: (v) => Math.round(v).toString(),
    tipTitle: (h) => h + ':00',
  });

  SELENE.on((V, S) => chart.update(S.energy.h24, HOURS));
})();
