// ── Canvas (apenas corda, gancho e partículas) ──────────────────────────────
const canvas = document.getElementById('canvas');
const ctx    = canvas.getContext('2d');

let W = window.innerWidth;
let H = window.innerHeight;
canvas.width  = W;
canvas.height = H;

window.addEventListener('resize', () => {
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width  = W;
  canvas.height = H;
  recalcularLayout();
  const novos = gerarDadosObstaculos();
  obstaculos.forEach((o, i) => {
    if (!o.vivo) return;
    const n = novos[i];
    o.r = n.r; o.bx = n.bx; o.by = n.by;
    o.ampX = n.ampX; o.ampY = n.ampY;
    o.faseX = n.faseX; o.faseY = n.faseY;
    o.velX = n.velX; o.velY = n.velY;
    o.dxVel = n.dxVel; o.dyVel = n.dyVel;
    o.limEsq = n.limEsq; o.limDir = n.limDir;
    o.limTop = n.limTop; o.limBot = n.limBot;
  });
});

// ── Referências HTML ─────────────────────────────────────────────────────────
const elPersonagem = document.getElementById('personagem');
const elAlvo       = document.getElementById('alvo');
const elVidas      = document.getElementById('vidas');
const elGameover   = document.getElementById('gameover');
const elFundo1     = document.getElementById('fundo1');
const elFundo2     = document.getElementById('fundo2');
const elMeteoros   = Array.from(document.querySelectorAll('.meteoro'));

// ── Fundo em loop ────────────────────────────────────────────────────────────
const VEL_FUNDO = 1.5;
let offsetFundo = 0;
elFundo1.style.left = '0px';
elFundo2.style.left = W + 'px';

function moverFundo() {
  offsetFundo -= VEL_FUNDO;
  if (offsetFundo <= -W) offsetFundo += W;
  elFundo1.style.left = offsetFundo + 'px';
  elFundo2.style.left = (offsetFundo + W) + 'px';
}

// ── Vidas ────────────────────────────────────────────────────────────────────
function renderizarVidas(qtd) {
  elVidas.innerHTML = '';
  for (let i = 0; i < 3; i++) {
    const img = document.createElement('img');
    img.src = i < qtd ? './src/img/engrenagem-verde.png' : './src/img/engrenagem-vermelha.png';
    img.alt = i < qtd ? 'vida' : 'sem vida';
    elVidas.appendChild(img);
  }
}

// ── Dimensões e zonas ────────────────────────────────────────────────────────
const TOTAL_COLUNAS = 20;
let LARG_COL, CY;
let COL_MIN, COL_MAX, COL_OBS_ESQ;
let ZONA_X1, ZONA_X2, ZONA_W;
let PERS_TAM, PERS_X, PERS_VEL;
let ALVO_TAM, ALVO_VX, AMPLITUDE_ZZ;
const VEL_ZZ = 0.035;
let GANCHO_VEL, RETRAIR_VEL;
let RAIO_P, RAIO_M, RAIO_G;

function recalcularLayout() {
  LARG_COL = W / TOTAL_COLUNAS;
  CY = H / 2;
  COL_MIN     = 9;
  COL_MAX     = 19;
  COL_OBS_ESQ = 5;
  ZONA_X1     = COL_OBS_ESQ * LARG_COL;
  ZONA_X2     = COL_MAX     * LARG_COL;
  ZONA_W      = ZONA_X2 - ZONA_X1;
  PERS_TAM    = H * 0.3;
  PERS_X      = W * 0.03;
  PERS_VEL    = H * 0.01;
  ALVO_TAM    = H * 0.1;
  ALVO_VX     = W * 0.0018;
  AMPLITUDE_ZZ = H * 0.25;
  GANCHO_VEL  = W * 0.011;
  RETRAIR_VEL = W * 0.019;
  RAIO_P = H * 0.05;
  RAIO_M = H * 0.08;
  RAIO_G = H * 0.11;
}
recalcularLayout();

// ── Estados ──────────────────────────────────────────────────────────────────
const ESTADO = {
  PARADO: 'parado', LANCANDO: 'lancando', RETRAINDO: 'retraindo',
  PEGOU: 'pegou', PENALIDADE: 'penalidade', GAMEOVER: 'gameover',
};

let persY = CY - PERS_TAM / 2;
let gancho = { x: 0, y: 0 };
let estadoJogo = ESTADO.PARADO;
let pegou = false, obsCapturado = null;
let vidas = 3, teclas = {}, particulas = [], flashVermelho = 0;

renderizarVidas(vidas);

// ── Alvo ──────────────────────────────────────────────────────────────────────
function criarAlvo() {
  return { x: COL_MIN * LARG_COL, y: CY, fase: 0, vx: ALVO_VX, capturado: false };
}
let alvo = criarAlvo();

// ── Geração dos obstáculos ────────────────────────────────────────────────────
/*
  Sistema de zonas suaves (não rígidas):
  A zona de obstáculos é dividida em 15 regiões (5×3) apenas para garantir
  distribuição inicial. Após posicionados, cada meteoro tem:

    - bx / by      → centro base da sua zona
    - faseX / faseY → fases independentes nos dois eixos (movimento elíptico livre)
    - velX / velY  → velocidades angulares diferentes por eixo (cria Lissajous)
    - ampX / ampY  → amplitudes diferentes por eixo
    - dxVel/dyVel  → deriva lenta do centro base (o meteoro "vaga" pela zona)
    - limEsq/Dir/Top/Bot → zona ampliada (60% da célula em cada direção)
      → zona maior que a versão anterior, movimentos bem mais abertos

  Resultado: trajetórias imprevisíveis, nunca retas, sem enfileiramento.
*/

// Embaralha array no lugar
function embaralhar(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function raioDoTipo(tipo) {
  if (tipo === 'p') return RAIO_P;
  if (tipo === 'm') return RAIO_M;
  return RAIO_G;
}

// Distribui os tipos de forma balanceada: 5 de cada, mas embaralhados por faixa
function tiposPorFaixa() {
  // 3 faixas verticais, cada uma com mix equilibrado
  const faixa0 = embaralhar(['p','m','g','p','m']);
  const faixa1 = embaralhar(['m','g','p','g','m']);
  const faixa2 = embaralhar(['g','p','m','g','p']);
  return [...faixa0, ...faixa1, ...faixa2];
}

function gerarDadosObstaculos() {
  const CELS_X = 5;
  const CELS_Y = 3;
  const CEL_W  = ZONA_W / CELS_X;
  const CEL_H  = H / CELS_Y;

  // Cada meteoro tem uma zona ampliada = 1.6× a célula original centrada nela
  // Isso faz os meteoros cruzarem entre células vizinhas sem se concentrarem
  const FATOR_ZONA = 0.75;

  const tipos = tiposPorFaixa();
  const dados = [];

  for (let linha = 0; linha < CELS_Y; linha++) {
    for (let col = 0; col < CELS_X; col++) {
      const idx  = linha * CELS_X + col;
      const tipo = tipos[idx];
      const r    = raioDoTipo(tipo);
      const pad  = r + 8;

      // Centro base: posição aleatória dentro da célula com margem
      const celEsq = ZONA_X1 + col  * CEL_W;
      const celTop = linha * CEL_H;
      const bx = celEsq + pad + Math.random() * (CEL_W - pad * 2);
      const by = celTop  + pad + Math.random() * (CEL_H - pad * 2);

      // Amplitude X e Y independentes — cria trajetória elíptica, não circular
      // Baseadas no tamanho da zona ampliada menos o raio do meteoro
      const zonaW = CEL_W * FATOR_ZONA;
      const zonaH = CEL_H * FATOR_ZONA;
      const ampX = Math.max(r * 0.5, (zonaW * 0.5 - r) * (0.55 + Math.random() * 0.45));
      const ampY = Math.max(r * 0.5, (zonaH * 0.5 - r) * (0.55 + Math.random() * 0.45));

      // Velocidade angular X e Y com razão irracional → nunca repete exatamente
      // Valores mais altos = movimento mais ágil e imprevisível
      const velBase = 0.022 + Math.random() * 0.030;
      const velX = velBase * (0.7 + Math.random() * 0.6);
      const velY = velBase * (0.7 + Math.random() * 0.6) * (Math.random() < 0.5 ? 1.3 : 0.8);

      // Fases iniciais aleatórias e independentes por eixo
      const faseX = Math.random() * Math.PI * 2;
      const faseY = Math.random() * Math.PI * 2;

      // Deriva do centro base: velocidade e direção aleatória
      // O meteoro lentamente vagueia pela zona (como uma órbita instável)
      const dxVel = (Math.random() - 0.5) * 0.25;
      const dyVel = (Math.random() - 0.5) * 0.25;

      // Limites da zona — ampliados para maior liberdade de movimento
      const limEsq = Math.max(ZONA_X1 + r, celEsq - CEL_W * (FATOR_ZONA - 0.5) * 0.5);
      const limDir = Math.min(ZONA_X2 - r, celEsq + CEL_W + CEL_W * (FATOR_ZONA - 0.5) * 0.5);
      const limTop = Math.max(r, celTop - CEL_H * (FATOR_ZONA - 0.5) * 0.5);
      const limBot = Math.min(H - r, celTop + CEL_H + CEL_H * (FATOR_ZONA - 0.5) * 0.5);

      dados.push({
        idx, tipo, r,
        bx, by, x: bx, y: by,
        faseX, faseY, velX, velY,
        ampX, ampY,
        dxVel, dyVel,
        limEsq, limDir, limTop, limBot,
        vivo: true, morrendo: false, escala: 1,
      });
    }
  }
  return dados;
}

let obstaculos = gerarDadosObstaculos();

// ── Entrada ───────────────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  teclas[e.code] = true;
  if (e.code === 'Space') {
    e.preventDefault();
    if (estadoJogo === ESTADO.PARADO) {
      estadoJogo = ESTADO.LANCANDO;
      gancho.x   = PERS_X + PERS_TAM;
      gancho.y   = persY + PERS_TAM / 2;
      pegou = false; obsCapturado = null;
    }
    if (estadoJogo === ESTADO.GAMEOVER) reiniciarJogo();
  }
  if (e.code === 'ArrowUp' || e.code === 'ArrowDown') e.preventDefault();
});
document.addEventListener('keyup', e => { teclas[e.code] = false; });

// ── Reiniciar ─────────────────────────────────────────────────────────────────
function reiniciarJogo() {
  vidas = 3;
  renderizarVidas(vidas);
  obstaculos = gerarDadosObstaculos();
  elMeteoros.forEach(el => {
    el.style.display = ''; el.style.opacity = '1'; el.style.transform = '';
  });
  alvo = criarAlvo();
  elAlvo.style.display = '';
  persY = CY - PERS_TAM / 2;
  estadoJogo = ESTADO.PARADO;
  elGameover.classList.remove('visivel');
}

// ── Partículas ────────────────────────────────────────────────────────────────
function criarParticulas(x, y, cor, n = 14) {
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 / n) * i;
    particulas.push({
      x, y,
      vx: Math.cos(a) * (2 + Math.random() * 4),
      vy: Math.sin(a) * (2 + Math.random() * 4),
      vida: 1, cor, tam: 3 + Math.random() * 6,
    });
  }
}

// ── Lógica dos meteoros ───────────────────────────────────────────────────────
// Mantém o centro base dentro dos limites da zona (deriva não sai da zona)
function limitarCentroBase(o) {
  const margem = o.r + 4;
  o.bx = Math.max(o.limEsq + margem, Math.min(o.limDir - margem, o.bx));
  o.by = Math.max(o.limTop + margem, Math.min(o.limBot - margem, o.by));
  // Inverte a deriva ao bater nos limites
  if (o.bx <= o.limEsq + margem || o.bx >= o.limDir - margem) o.dxVel *= -1;
  if (o.by <= o.limTop + margem || o.by >= o.limBot - margem) o.dyVel *= -1;
}

// Garante que a posição calculada não ultrapasse os limites da zona
function limitarPosicao(o) {
  o.x = Math.max(o.limEsq, Math.min(o.limDir, o.x));
  o.y = Math.max(o.limTop, Math.min(o.limBot, o.y));
}

// Resolve sobreposição entre meteoros (empurrão mínimo, sem sair da zona)
function separarMeteoros() {
  const vivos = obstaculos.filter(o => o.vivo && !o.morrendo);
  for (let i = 0; i < vivos.length; i++) {
    for (let j = i + 1; j < vivos.length; j++) {
      const a = vivos[i], b = vivos[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const minD = a.r + b.r + 4;
      if (dist < minD && dist > 0.1) {
        const emp = (minD - dist) / 2;
        const nx = dx / dist, ny = dy / dist;
        a.x -= nx * emp; a.y -= ny * emp;
        b.x += nx * emp; b.y += ny * emp;
        limitarPosicao(a); limitarPosicao(b);
      }
    }
  }
}

function atualizarMeteoros() {
  for (const o of obstaculos) {
    if (!o.vivo) continue;

    if (o.morrendo) {
      o.escala -= 0.07;
      const el = elMeteoros[o.idx];
      el.style.opacity = Math.max(0, o.escala);
      if (o.escala <= 0) { o.vivo = false; o.morrendo = false; el.style.display = 'none'; }
      continue;
    }

    if (o === obsCapturado) { posicionarMeteoro(o); continue; }

    // Avança as fases X e Y independentemente
    o.faseX += o.velX;
    o.faseY += o.velY;

    // Centro base deriva lentamente pela zona (movimento de vagabundagem)
    o.bx += o.dxVel;
    o.by += o.dyVel;
    limitarCentroBase(o);

    // Posição = centro base + oscilação elíptica (Lissajous)
    // Eixos X e Y têm amplitudes e velocidades diferentes → trajetória sempre nova
    o.x = o.bx + Math.cos(o.faseX) * o.ampX;
    o.y = o.by + Math.sin(o.faseY) * o.ampY;

    limitarPosicao(o);
    posicionarMeteoro(o);
  }
  separarMeteoros();
}

function posicionarMeteoro(o) {
  const el  = elMeteoros[o.idx];
  const tam = o.r * 2;
  el.style.left   = (o.x - o.r) + 'px';
  el.style.top    = (o.y - o.r) + 'px';
  el.style.width  = tam + 'px';
  el.style.height = tam + 'px';
}

function checarGanchoVsMeteoros() {
  if (estadoJogo !== ESTADO.LANCANDO) return;
  for (const o of obstaculos) {
    if (!o.vivo || o.morrendo) continue;
    const dx = gancho.x - o.x, dy = gancho.y - o.y;
    if (Math.sqrt(dx * dx + dy * dy) < o.r) {
      obsCapturado = o;
      criarParticulas(gancho.x, gancho.y, '#E24B4A');
      estadoJogo = ESTADO.RETRAINDO;
      break;
    }
  }
}

// ── Atualização por frame ─────────────────────────────────────────────────────
function atualizar() {
  moverFundo();
  if (estadoJogo === ESTADO.GAMEOVER) return;

  if (teclas['ArrowUp'])   persY = Math.max(0,            persY - PERS_VEL);
  if (teclas['ArrowDown']) persY = Math.min(H - PERS_TAM, persY + PERS_VEL);

  elPersonagem.style.left   = PERS_X + 'px';
  elPersonagem.style.top    = persY  + 'px';
  elPersonagem.style.width  = PERS_TAM + 'px';
  elPersonagem.style.height = PERS_TAM + 'px';

  atualizarMeteoros();
  if (flashVermelho > 0) flashVermelho--;

  if (!alvo.capturado) {
    alvo.fase += VEL_ZZ;
    alvo.x    += alvo.vx;
    alvo.y     = CY + Math.sin(alvo.fase) * AMPLITUDE_ZZ;
    const col = Math.floor(alvo.x / LARG_COL);
    if (alvo.vx > 0 && col >= COL_MAX) { alvo.x = COL_MAX * LARG_COL; alvo.vx = -ALVO_VX; }
    if (alvo.vx < 0 && col <= COL_MIN) { alvo.x = COL_MIN * LARG_COL; alvo.vx =  ALVO_VX; }
  }

  elAlvo.style.left    = (alvo.x - ALVO_TAM / 2) + 'px';
  elAlvo.style.top     = (alvo.y - ALVO_TAM / 2) + 'px';
  elAlvo.style.width   = ALVO_TAM + 'px';
  elAlvo.style.height  = ALVO_TAM + 'px';
  elAlvo.style.display = (estadoJogo === ESTADO.PEGOU && pegou) ? 'none' : '';

  if (estadoJogo === ESTADO.LANCANDO) {
    gancho.x += GANCHO_VEL;
    checarGanchoVsMeteoros();
    if (estadoJogo === ESTADO.LANCANDO && !pegou) {
      const dx = gancho.x - alvo.x, dy = gancho.y - alvo.y;
      if (!alvo.capturado && Math.sqrt(dx * dx + dy * dy) < ALVO_TAM / 2) {
        pegou = true; alvo.capturado = true;
        criarParticulas(gancho.x, gancho.y, '#EF9F27');
        estadoJogo = ESTADO.RETRAINDO;
      }
    }
    if (gancho.x > W - 10) estadoJogo = ESTADO.RETRAINDO;
  }

  if (estadoJogo === ESTADO.RETRAINDO) {
    gancho.x -= RETRAIR_VEL;
    if (obsCapturado) { obsCapturado.x = gancho.x; obsCapturado.y = gancho.y; }
    if (pegou)        { alvo.x = gancho.x; alvo.y = gancho.y; }

    if (gancho.x <= PERS_X + PERS_TAM) {
      gancho.x = PERS_X + PERS_TAM;
      gancho.y = persY + PERS_TAM / 2;

      if (pegou) {
        estadoJogo = ESTADO.PEGOU;
        criarParticulas(PERS_X + PERS_TAM, persY + PERS_TAM / 2, '#5DCAA5');
        setTimeout(() => { pegou = false; alvo = criarAlvo(); estadoJogo = ESTADO.PARADO; }, 700);
      } else if (obsCapturado) {
        vidas--;
        renderizarVidas(Math.max(0, vidas));
        flashVermelho = 45;
        criarParticulas(PERS_X + PERS_TAM, persY + PERS_TAM / 2, '#E24B4A', 20);
        obsCapturado.morrendo = true;
        obsCapturado.escala   = 1;
        obsCapturado = null;
        if (vidas <= 0) {
          estadoJogo = ESTADO.GAMEOVER;
          elGameover.classList.add('visivel');
        } else {
          estadoJogo = ESTADO.PENALIDADE;
          setTimeout(() => { estadoJogo = ESTADO.PARADO; }, 600);
        }
      } else {
        estadoJogo = ESTADO.PARADO;
      }
    }
  }

  if (estadoJogo !== ESTADO.LANCANDO && estadoJogo !== ESTADO.RETRAINDO) {
    gancho.x = PERS_X + PERS_TAM;
    gancho.y = persY + PERS_TAM / 2;
  }

  particulas = particulas.filter(p => p.vida > 0);
  for (const p of particulas) {
    p.x += p.vx; p.y += p.vy;
    p.vy += 0.12; p.vida -= 0.038; p.tam *= 0.97;
  }
}

// ── Desenho (corda, gancho, partículas) ───────────────────────────────────────
function desenharCordaGancho() {
  if (estadoJogo !== ESTADO.LANCANDO && estadoJogo !== ESTADO.RETRAINDO) return;
  const ox = PERS_X + PERS_TAM;
  const oy = persY  + PERS_TAM / 2;

  ctx.strokeStyle = 'rgba(200,195,175,0.85)';
  ctx.lineWidth   = Math.max(1.5, H * 0.004);
  ctx.setLineDash([Math.round(H * 0.014), Math.round(H * 0.008)]);
  ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(gancho.x, gancho.y); ctx.stroke();
  ctx.setLineDash([]);

  const rg = Math.round(H * 0.02);
  ctx.fillStyle = '#D3D1C7'; ctx.strokeStyle = '#5F5E5A';
  ctx.lineWidth = Math.max(1, H * 0.003);
  ctx.beginPath(); ctx.arc(gancho.x, gancho.y, rg, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

  ctx.beginPath();
  ctx.arc(gancho.x + rg * 0.7, gancho.y + rg * 0.7, rg * 0.55, Math.PI * 0.4, Math.PI * 1.6);
  ctx.strokeStyle = '#888780'; ctx.lineWidth = Math.max(2, H * 0.005); ctx.stroke();
}

function desenharParticulas() {
  for (const p of particulas) {
    ctx.globalAlpha = p.vida; ctx.fillStyle = p.cor;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.tam, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function desenharFlash() {
  if (flashVermelho > 0) {
    ctx.fillStyle = `rgba(226,74,74,${0.2 * (flashVermelho / 45)})`;
    ctx.fillRect(0, 0, W, H);
  }
}

function desenhar() {
  ctx.clearRect(0, 0, W, H);
  desenharCordaGancho();
  desenharParticulas();
  desenharFlash();
}

// ── Loop ──────────────────────────────────────────────────────────────────────
function loop() { atualizar(); desenhar(); requestAnimationFrame(loop); }
loop();
