# SELENE · Monitoramento da Colônia Lunar

Painel de controle de uma colônia lunar fictícia (**SOL-142**), com estética de monitor CRT verde. Reúne energia, água,
atmosfera, alimentos, alertas e satélites em sete telas que leem **o mesmo estado**: quando o CO₂ sobe, o módulo de
habitação muda de cor, um aviso aparece, o alerta entra no histórico e, mais tarde, é resolvido, tudo ao vivo.

Projeto de UX/UI e front-end, criado por **Murilo de Melo Sousa** (Projeto Selene · FIAP).

**Demonstração online: [selene-op70.onrender.com](https://selene-op70.onrender.com)**

> Projeto fictício, feito para fins de estudo. Todos os dados são simulados.

<!-- Para o GitHub: adicione um print da home em docs/preview.png e descomente a linha abaixo.
![Painel principal do SELENE](docs/preview.png)
-->

## Destaques

- **Dados vivos:** a telemetria é simulada em tempo real (atualização a cada 2 s) e persiste entre as páginas.
- **Cor com significado:** verde = normal, âmbar = atenção, vermelho = crítico. O estado é calculado por limiares, nunca
  escrito à mão, e é reforçado por símbolos (▲ e ✖), para que a cor não seja o único sinal.
- **Alertas com ciclo de vida:** cada alerta nasce de uma condição, fica `ATIVO` e passa a `RESOLVIDO` quando o valor
  normaliza, gerando um evento informativo.
- **Atmosfera CRT:** scanlines, vinheta, brilho nos números, sequência de boot e câmera com HUD e transição com glitch.
- **Sem build e sem framework:** HTML, CSS e JavaScript puros. Os gráficos são desenhados em `<canvas>`.
- **Acessível:** navegação com `aria-label` e `aria-current`, `focus-visible`, avisos com `role="status"` e respeito a
  `prefers-reduced-motion`.

## Telas

| Página | O que mostra |
|---|---|
| **Geral** (`index.html`) | Câmera, consumo de energia, pressão atmosférica, status dos módulos A–E, energia solar, água, oxigênio, alimento, temperatura interna e link Terra-Lua |
| **Energia** | Painéis solares, bateria de backup, reator nuclear e consumo total (anéis de progresso), distribuição por módulo e histórico de 24 h |
| **Água** | Reserva, taxa de reciclagem, extração do solo lunar, fluxos diários (ciclo fechado) e qualidade da água (pH, cloro, turbidez, nitrato) |
| **Atmosfera** | O₂, CO₂, pressão, umidade, composição do ar, eficiência dos filtros (HEPA, purificador, gerador de O₂) e temperatura |
| **Alimentos** | Reserva total, produção agrícola, consumo diário, autonomia e cultivos ativos do Módulo C |
| **Alertas** | Feed de eventos com filtros (todos, críticos, atenção, informativos) e estado ATIVO / RESOLVIDO |
| **Satélites** | SAT-142 a SAT-145: órbita, altitude, latência, sinal, pacotes, taxa de erro, uplink/downlink e log de comunicações |

## Demonstração pelo console

O motor de telemetria expõe `window.SELENE`. Para provocar incidentes ao vivo:

```js
SELENE.trigger('co2')      // pico de CO₂ no módulo habitacional
SELENE.trigger('dust')     // poeira nos painéis solares: geração cai
SELENE.trigger('reactor')  // flutuação no reator principal
SELENE.togglePause()       // equivale ao botão AO VIVO / PAUSADO
SELENE.S                   // estado cru
SELENE.V                   // visão derivada (o que a interface lê)
```

## Estrutura

```
SELENE/
├── index.html              Painel principal
├── style.css               Layout da home (grade fluida a partir de 1281 px)
├── responsive.css          Regras para telas até 1280 px
├── effects.css             Cor por estado, efeitos CRT, avisos, boot (carrega por último)
├── js/
│   ├── telemetry.js        Estado, simulação, derivação, alertas e vinculação com o DOM
│   ├── core.js             Relógio, botão AO VIVO, selo de alertas, avisos e boot
│   ├── charts.js           Gráficos de linha e de barras em canvas
│   └── home.js             Gráficos e câmera da home
├── energia/                energia.html · energia.css · energia.js
├── agua/                   agua.html · agua.css
├── atmosfera/              atmosfera.html · atmosfera.css
├── alimentos/              alimentos.html · alimentos.css
├── alertas/                alertas.html · alertas.css · alertas.js
├── satelites/              satelites.html · satelites.css · satelites.js
├── imgs/                   Imagens da câmera (WebP)
└── favicon/                Ícones e manifest
```

## Como funciona

### Uma fonte de verdade

`js/telemetry.js` guarda todo o estado da colônia em um único objeto (`S`). A cada tick, uma **visão derivada** (`V`) é
recalculada a partir dele: porcentagens, autonomias, estados `ok | warn | crit`, composição do ar, status dos módulos
e contagem de alertas. As páginas apenas leem `V`. O estado fica em `sessionStorage` (chave `selene.telemetry.v2`) e é
reiniciado se a sessão ficar parada por mais de 20 minutos.

```
 simulação (a cada 2 s) ──► S (estado) ──► compute() ──► V (visão) ──► interface
                                              └──────► evaluate() ──► alertas (ATIVO → RESOLVIDO)
```

A simulação usa variações aleatórias suaves com retorno à média e um agendador de cenários (pico de CO₂, poeira solar,
oscilação do reator, eventos informativos e log de comunicações). Água e comida usam tempo acelerado para que a
mudança seja perceptível.

### Vinculação declarativa

O HTML se liga ao estado por atributos `data-*`, sem JavaScript por página:

| Atributo | Efeito |
|---|---|
| `data-bind="water.pct"` | Escreve o valor no texto. Aceita `data-fmt` (`int`, `d1`, `d2`, `pct`, `sign0`, `neg0`, `pos0`, `time`), `data-prefix`, `data-suffix` e `data-tick` (pisca quando o valor muda) |
| `data-bar="food.pct"` | Define a largura (%) de uma barra |
| `data-ring="energy.solar.pct"` | Preenche um anel de progresso SVG |
| `data-state-of="atmos.co2.state"` | Aplica `data-state="ok\|warn\|crit"` ao elemento |
| `data-status="water.state"` | Aplica o estado e o rótulo (NORMAL / ATENÇÃO / CRÍTICO) |
| `data-caret="energy.solar.vsYesterday"` | Alterna o ícone ▲ / ▼ pelo sinal do valor |

```html
<div class="card" data-state-of="water.state">
  <span data-bind="water.pct" data-fmt="int"></span>% de reserva
  <div class="bar"><i data-bar="water.pct"></i></div>
</div>
```

### Cor por estado

Em vez de classes por componente, o CSS redefine `--primary-green` dentro de `[data-state]`. Qualquer elemento que
use a variável herda a cor do estado:

| Estado | Cor | Sinais adicionais |
|---|---|---|
| `ok` | `#4DB04D` | — |
| `warn` | `#FFB000` | prefixo ▲ |
| `crit` | `#FF4D3D` | prefixo ✖, selo invertido, painel pulsando |

### Limiares

| Métrica | Atenção | Crítico |
|---|---|---|
| Reserva de água | < 50 % | < 35 % |
| CO₂ | > 500 ppm | > 800 ppm |
| Cloro livre | < 1,0 mg/L | < 0,4 mg/L |
| Turbidez | > 2 NTU | > 4 NTU |
| Nitrato | > 45 mg/L | > 50 mg/L |
| Painéis solares (% da capacidade) | < 40 % | < 20 % |
| Bateria de backup | < 30 % | < 15 % |
| Consumo ÷ geração | > 85 % | > 95 % |
| Filtro HEPA, purificador, gerador de O₂ | < 80 % | < 60 % |
| Reserva de alimentos | < 40 % ou < 45 dias | < 25 % ou < 30 dias |
| Eficiência da produção agrícola | < 90 % | < 70 % |
| Satélite | sinal < 90 % ou erro > 5 % (degradado) | — |

O O₂, a pressão, a umidade, a temperatura e o pH usam faixas ideais, com atenção e crítico em cada extremo. O estado de
cada módulo da home é o pior estado entre as métricas que o compõem.

### Adicionar uma nova métrica

1. Inclua o valor no estado inicial (`seed()`) e, se variar, em `step()`.
2. Derive porcentagem e estado em `compute()`.
3. Se deve gerar alerta, adicione uma condição em `conditions()`.
4. No HTML, vincule com `data-bind`, `data-bar` ou `data-state-of`.

## Design

- **Paleta:** fundo preto, verde `#4DB04D` como cor primária, âmbar e vermelho reservados para estados.
- **Tipografia:** *Bowlby One* nos títulos e *Geom* no restante.
- **Navegação:** barra inferior na home e barra lateral nas demais telas, com selo de alertas ativos no item "Alertas".
- **Responsividade:** grade fluida de 3 colunas a partir de 1281 px; em telas menores, o layout empilha (`responsive.css`).
- **Movimento:** todos os efeitos (boot, varredura, flicker, glitch, pulso) são desligados com `prefers-reduced-motion`.

## Tecnologias

HTML5 · CSS3 (Grid, Flexbox, variáveis) · JavaScript (ES6+) · Canvas 2D · Font Awesome 6 · Google Fonts · Figma · Claude

## Autor

**Murilo de Melo Sousa** · estudante de Web Design (FIAP) e técnico em Desenvolvimento de Sistemas (SENAI).
