/* SELENE · home.js: gráficos e câmeras do painel principal.
   A câmera é independente dos gráficos (antes, se o Chart.js falhasse, ela nem iniciava). */
(() => {
  'use strict';

  /* ---------------- gráficos ---------------- */
  const LABELS_7 = ['-6', '-5', '-4', '-3', '-2', '-1', 'AGORA'];

  const energy = SeleneCharts.line(document.getElementById('energyChart'), {
    unit: ' KW', fmt: (v) => Math.round(v).toString(),
    tipTitle: (l) => (l === 'AGORA' ? 'AGORA' : l + ' LEITURA'),
  });
  const pressure = SeleneCharts.bars(document.getElementById('pressureChart'), {
    unit: ' KPA', min: 100.4, max: 102.2, fmt: (v) => v.toFixed(2),
    tipTitle: (l) => (l === 'AGORA' ? 'AGORA' : l + ' LEITURA'),
  });

  SELENE.on((V, S) => {
    energy.update(S.energy.h7, LABELS_7);
    pressure.update(S.atmos.hp, LABELS_7);
  });

  /* ---------------- câmeras ---------------- */
  const CAMS = [
    { src: 'imgs/img1.webp', name: 'CAM-01 · ECLUSA PRINCIPAL' },
    { src: 'imgs/img2.webp', name: 'CAM-02 · OBSERVATÓRIO' },
    { src: 'imgs/img3.webp', name: 'CAM-03 · HALL CENTRAL' },
    { src: 'imgs/img4.webp', name: 'CAM-04 · ESTUFA (MÓD. C)' },
  ];
  CAMS.forEach((c) => { new Image().src = c.src; });          // pré-carrega

  const box = document.getElementById('camera');
  const layers = [document.getElementById('camA'), document.getElementById('camB')];
  const nameEl = document.getElementById('camName');
  const tsEl = document.getElementById('camTs');
  let idx = 0, front = 0;

  layers[0].style.backgroundImage = `url(${CAMS[0].src})`;

  function nextCam() {
    idx = (idx + 1) % CAMS.length;
    const back = 1 - front;
    layers[back].style.backgroundImage = `url(${CAMS[idx].src})`;
    layers[back].classList.add('on');
    layers[front].classList.remove('on');
    front = back;
    nameEl.textContent = CAMS[idx].name;
    box.classList.remove('glitch'); void box.offsetWidth; box.classList.add('glitch');   // quadro "picotado" na troca
  }
  setInterval(nextCam, 5000);

  const paintTs = () => { tsEl.textContent = new Date().toLocaleTimeString('pt-BR', { hour12: false }); };
  paintTs();
  setInterval(paintTs, 1000);
})();
