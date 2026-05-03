// ─── Canvas e contexto ───────────────────────────────────────────────────────
const canvas = document.getElementById('canvas');
const ctx    = canvas.getContext('2d');

// Dimensões reais do canvas = tamanho da janela
let W = window.innerWidth;
let H = window.innerHeight;
canvas.width  = W;
canvas.height = H;

// Atualiza tamanho se a janela for redimensionada
window.addEventListener('resize', () => {
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width  = W;
  canvas.height = H;
  recalcularLayout();
});

// ─── Imagens —  ──────────────────────────────
const IMG = {
  personagem: carregarImg('./src/img/maquina-tempo3.gif'),
  alvo:       carregarImg('./src/img/engrenagem.png'),
  obstaculo:  carregarImg('./src/img/meteoro.png'),
  vidaCheia:  carregarImg('./src/img/engrenagem-verde.png'),
  vidaVazia:  carregarImg('./src/img/engrenagem-vermelha.png'),
};

function carregarImg(src) {
  const img = new Image();
  img.src = src;
  return img;
}

// ─── Fundo em loop ───────────────────────────────────────────────────────────
const fundo1 = document.getElementById('fundo1');
const fundo2  = document.getElementById('fundo2');
const VELOCIDADE_FUNDO = 1.5; // pixels por frame
let offsetFundo = 0;

function iniciarFundo() {
  const larg = W;
  fundo1.style.width = larg + 'px';
  fundo2.style.width = larg + 'px';
  fundo1.style.left  = '0px';
  fundo2.style.left  = larg + 'px';
}
iniciarFundo();

function moverFundo() {
  offsetFundo -= VELOCIDADE_FUNDO;
  const larg = W;
  if (offsetFundo <= -larg) offsetFundo += larg;
  fundo1.style.left = offsetFundo + 'px';
  fundo2.style.left = (offsetFundo + larg) + 'px';
}

// ─── Vidas no DOM ────────────────────────────────────────────────────────────
const Vidas = document.getElementById('vidas');

function renderizarVidas(qtd) {
  Vidas.innerHTML = '';
  for (let i = 0; i < 3; i++) {
    const img = document.createElement('img');
    img.src = i < qtd ? './src/img/engrenagem-verde.png' : './src/img/engrenagem-vermelha.png';
    img.alt = i < qtd ? 'vida' : 'sem vida';
    Vidas.appendChild(img);
  }
}

// ─── Constantes proporcionais ao tamanho da tela ─────────────────────────────
// Tudo é calculado em função de W e H para escalar com a janela

const TOTAL_COLUNAS = 20;
let LARG_COLUNA, CX, CY;
let COL_MIN, COL_MAX, COL_OBS_ESQ;
let ZONA_X1, ZONA_X2, ZONA_W;
let PERS_W, PERS_H, PERS_X, PERS_VEL;
let GANCHO_VEL, RETRAIR_VEL;
let ALVO_TAM;
let AMPLITUDE_ZZ, VEL_ZZ, ALVO_VX;
let MARGEM;
let RAIO_MIN_OBS, RAIO_MAX_OBS;

function recalcularLayout() {
  LARG_COLUNA = W / TOTAL_COLUNAS;
  CX = W / 2;
  CY = H / 2;

  COL_MIN      = 9;
  COL_MAX      = 19;
  COL_OBS_ESQ  = 5;
  ZONA_X1      = COL_OBS_ESQ * LARG_COLUNA;
  ZONA_X2      = COL_MAX     * LARG_COLUNA;
  ZONA_W       = ZONA_X2 - ZONA_X1;

  // Personagem escala com a altura
  PERS_H    = Math.round(H * 0.14);
  PERS_W    = PERS_H;
  PERS_X    = Math.round(W * 0.015);
  PERS_VEL  = Math.round(H * 0.008);

  GANCHO_VEL  = Math.round(W * 0.011);
  RETRAIR_VEL = Math.round(W * 0.009);

  ALVO_TAM    = Math.round(H * 0.12);
  AMPLITUDE_ZZ = H * 0.25;
  VEL_ZZ       = 0.035;
  ALVO_VX      = W * 0.0018;

  MARGEM       = Math.round(H * 0.06);
  RAIO_MIN_OBS = Math.round(H * 0.03);
  RAIO_MAX_OBS = Math.round(H * 0.05);
}

recalcularLayout();

// ─── Estados do jogo ─────────────────────────────────────────────────────────
const ESTADO = {
  PARADO:    'parado',
  LANCANDO:  'lancando',
  RETRAINDO: 'retraindo',
  PEGOU:     'pegou',
  PENALIDADE:'penalidade',
  GAMEOVER:  'gameover',
};

// ─── Variáveis de estado ─────────────────────────────────────────────────────
let persY      = CY - PERS_H / 2;
let gancho     = { x: 0, y: 0 };
let estadoJogo = ESTADO.PARADO;
let pegou      = false;
let obsCapturado = null;
let vidas      = 3;
let teclas     = {};
let particulas = [];
let flashVermelho = 0;

renderizarVidas(vidas);

// ─── Alvo ────────────────────────────────────────────────────────────────────
function criarAlvo() {
  return {
    x: COL_MIN * LARG_COLUNA,
    y: CY,
    fase: 0,
    vx: ALVO_VX,
    capturado: false,
  };
}
let alvo = criarAlvo();

// ─── Obstáculos ──────────────────────────────────────────────────────────────
const MODOS_MOV = ['cimabaixo', 'ladolado', 'circulo'];

function gerarObstaculos() {
  const DIST_MIN = RAIO_MAX_OBS * 2 + Math.round(H * 0.08);
  const posicionados = [];
  let tentativas = 0;

  while (posicionados.length < 15 && tentativas < 5000) {
    tentativas++;
    const r = RAIO_MIN_OBS + Math.floor(Math.random() * (RAIO_MAX_OBS - RAIO_MIN_OBS + 1));
    const x = ZONA_X1 + MARGEM + r + Math.random() * (ZONA_W - MARGEM * 2 - r * 2);
    const y = MARGEM + r + Math.random() * (H - MARGEM * 2 - r * 2);

    let ok = true;
    for (const p of posicionados) {
      const dx = x - p.bx, dy = y - p.by;
      if (Math.sqrt(dx * dx + dy * dy) < p.r + r + DIST_MIN) { ok = false; break; }
    }
    if (!ok) continue;

    const i = posicionados.length;
    posicionados.push({
      bx: x, by: y, r,
      modo:  MODOS_MOV[i % MODOS_MOV.length],
      vel:   0.016 + Math.random() * 0.022,
      amp:   r * 1.8 + Math.random() * r * 1.4,
      fase:  Math.random() * Math.PI * 2,
      x, y,
      vivo: true, morrendo: false, escala: 1,
    });
  }
  return posicionados;
}

let obstaculos = gerarObstaculos();

// ─── Entrada de teclado ───────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  teclas[e.code] = true;

  if (e.code === 'Space') {
    e.preventDefault();
    if (estadoJogo === ESTADO.PARADO) {
      estadoJogo   = ESTADO.LANCANDO;
      gancho.x     = PERS_X + PERS_W;
      gancho.y     = persY + PERS_H / 2;
      pegou        = false;
      obsCapturado = null;
    }
    if (estadoJogo === ESTADO.GAMEOVER) reiniciarJogo();
  }
  if (e.code === 'ArrowUp' || e.code === 'ArrowDown') e.preventDefault();
});
document.addEventListener('keyup', e => { teclas[e.code] = false; });

// ─── Reiniciar ────────────────────────────────────────────────────────────────
function reiniciarJogo() {
  vidas = 3;
  renderizarVidas(vidas);
  obstaculos = gerarObstaculos();
  alvo = criarAlvo();
  persY = CY - PERS_H / 2;
  estadoJogo = ESTADO.PARADO;
  document.getElementById('gameover').classList.remove('visivel');
}

// ─── Partículas de efeito ─────────────────────────────────────────────────────
function criarParticulas(x, y, cor, n = 14) {
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 / n) * i;
    particulas.push({
      x, y,
      vx: Math.cos(a) * (2 + Math.random() * 4),
      vy: Math.sin(a) * (2 + Math.random() * 4),
      vida: 1, cor,
      tam: 3 + Math.random() * 6,
    });
  }
}

// ─── Limitar obstáculo dentro da zona ────────────────────────────────────────
function limitarObs(o) {
  const esq = ZONA_X1 + o.r + 2;
  const dir = ZONA_X2 - o.r - 2;
  const top = o.r + 2;
  const bot = H - o.r - 2;
  o.x = Math.max(esq, Math.min(dir, o.x));
  o.y = Math.max(top, Math.min(bot, o.y));
}

// Separa obstáculos que se sobrepõem
function separarObstaculos() {
  const vivos = obstaculos.filter(o => o.vivo && !o.morrendo);
  for (let i = 0; i < vivos.length; i++) {
    for (let j = i + 1; j < vivos.length; j++) {
      const a = vivos[i], b = vivos[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const minD = a.r + b.r + 4;
      if (dist < minD && dist > 0) {
        const empurrao = (minD - dist) / 2;
        const nx = dx / dist, ny = dy / dist;
        a.x -= nx * empurrao; a.y -= ny * empurrao;
        b.x += nx * empurrao; b.y += ny * empurrao;
        limitarObs(a); limitarObs(b);
      }
    }
  }
}

// Atualiza posição de cada obstáculo
function atualizarObstaculos() {
  for (const o of obstaculos) {
    if (!o.vivo) continue;
    if (o.morrendo) {
      o.escala -= 0.07;
      if (o.escala <= 0) { o.vivo = false; o.morrendo = false; }
      continue;
    }
    if (o === obsCapturado) continue;
    o.fase += o.vel;
    if (o.modo === 'cimabaixo') {
      o.x = o.bx;
      o.y = o.by + Math.sin(o.fase) * o.amp;
    } else if (o.modo === 'ladolado') {
      o.x = o.bx + Math.sin(o.fase) * o.amp;
      o.y = o.by;
    } else {
      o.x = o.bx + Math.cos(o.fase) * o.amp * 0.65;
      o.y = o.by + Math.sin(o.fase) * o.amp * 0.65;
    }
    limitarObs(o);
  }
  separarObstaculos();
}

// Verifica se o gancho tocou algum obstáculo
function checarGanchoVsObstaculos() {
  if (estadoJogo !== ESTADO.LANCANDO) return;
  for (const o of obstaculos) {
    if (!o.vivo || o.morrendo) continue;
    const dx = gancho.x - o.x, dy = gancho.y - o.y;
    if (Math.sqrt(dx * dx + dy * dy) < o.r + 8) {
      obsCapturado = o;
      criarParticulas(gancho.x, gancho.y, '#E24B4A');
      estadoJogo = ESTADO.RETRAINDO;
      break;
    }
  }
}

// ─── Atualização por frame ───────────────────────────────────────────────────
function atualizar() {
  moverFundo();
  if (estadoJogo === ESTADO.GAMEOVER) return;

  // Mover personagem
  if (teclas['ArrowUp'])   persY = Math.max(0,        persY - PERS_VEL);
  if (teclas['ArrowDown']) persY = Math.min(H - PERS_H, persY + PERS_VEL);

  atualizarObstaculos();
  if (flashVermelho > 0) flashVermelho--;

  // Mover alvo em zigue-zague
  if (!alvo.capturado) {
    alvo.fase += VEL_ZZ;
    alvo.x    += alvo.vx;
    alvo.y     = CY + Math.sin(alvo.fase) * AMPLITUDE_ZZ;
    const col = Math.floor(alvo.x / LARG_COLUNA);
    if (alvo.vx > 0 && col >= COL_MAX) { alvo.x = COL_MAX * LARG_COLUNA; alvo.vx = -ALVO_VX; }
    if (alvo.vx < 0 && col <= COL_MIN) { alvo.x = COL_MIN * LARG_COLUNA; alvo.vx =  ALVO_VX; }
  }

  // Lançar gancho
  if (estadoJogo === ESTADO.LANCANDO) {
    gancho.x += GANCHO_VEL;
    checarGanchoVsObstaculos();

    // Verificar colisão com alvo
    if (estadoJogo === ESTADO.LANCANDO && !pegou) {
      const dx = gancho.x - alvo.x, dy = gancho.y - alvo.y;
      if (!alvo.capturado && Math.sqrt(dx * dx + dy * dy) < ALVO_TAM / 2 + 9) {
        pegou = true; alvo.capturado = true;
        criarParticulas(gancho.x, gancho.y, '#EF9F27');
        estadoJogo = ESTADO.RETRAINDO;
      }
    }
    if (gancho.x > W - 10) estadoJogo = ESTADO.RETRAINDO;
  }

  // Retrair gancho
  if (estadoJogo === ESTADO.RETRAINDO) {
    gancho.x -= RETRAIR_VEL;
    if (obsCapturado) { obsCapturado.x = gancho.x; obsCapturado.y = gancho.y; }
    if (pegou)        { alvo.x = gancho.x; alvo.y = gancho.y; }

    if (gancho.x <= PERS_X + PERS_W) {
      gancho.x = PERS_X + PERS_W;
      gancho.y = persY + PERS_H / 2;

      if (pegou) {
        // Acertou o alvo — ponto
        estadoJogo = ESTADO.PEGOU;
        criarParticulas(PERS_X + PERS_W, persY + PERS_H / 2, '#5DCAA5');
        setTimeout(() => { pegou = false; alvo = criarAlvo(); estadoJogo = ESTADO.PARADO; }, 700);

      } else if (obsCapturado) {
        // Acertou obstáculo — perde vida e obstáculo some
        vidas--;
        renderizarVidas(Math.max(0, vidas));
        flashVermelho = 45;
        criarParticulas(PERS_X + PERS_W, persY + PERS_H / 2, '#E24B4A', 20);
        obsCapturado.morrendo = true;
        obsCapturado.escala   = 1;
        obsCapturado = null;

        if (vidas <= 0) {
          estadoJogo = ESTADO.GAMEOVER;
          document.getElementById('gameover').classList.add('visivel');
        } else {
          estadoJogo = ESTADO.PENALIDADE;
          setTimeout(() => { estadoJogo = ESTADO.PARADO; }, 600);
        }
      } else {
        estadoJogo = ESTADO.PARADO;
      }
    }
  }

  // Reposicionar gancho quando parado
  if (estadoJogo !== ESTADO.LANCANDO && estadoJogo !== ESTADO.RETRAINDO) {
    gancho.x = PERS_X + PERS_W;
    gancho.y = persY + PERS_H / 2;
  }

  // Partículas
  particulas = particulas.filter(p => p.vida > 0);
  for (const p of particulas) {
    p.x += p.vx; p.y += p.vy;
    p.vy += 0.12;
    p.vida -= 0.038;
    p.tam  *= 0.97;
  }
}

// ─── Desenhar personagem ──────────────────────────────────────────────────────
function desenharPersonagem() {
  const py = persY;
  if (IMG.personagem.complete && IMG.personagem.naturalWidth) {
    ctx.drawImage(IMG.personagem, PERS_X, py, PERS_W, PERS_H);
  } else {
    // Fallback visual até a imagem carregar
    ctx.fillStyle = '#534AB7';
    ctx.beginPath();
    ctx.roundRect(PERS_X, py, PERS_W, PERS_H, 6);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('PERS', PERS_X + PERS_W / 2, py + PERS_H / 2);
  }
}

// ─── Desenhar corda e gancho ──────────────────────────────────────────────────
function desenharGancho() {
  if (estadoJogo !== ESTADO.LANCANDO && estadoJogo !== ESTADO.RETRAINDO) return;
  const ox = PERS_X + PERS_W;
  const oy = persY + PERS_H / 2;

  // Corda
  ctx.strokeStyle = 'rgba(200,195,175,0.85)';
  ctx.lineWidth = Math.max(1.5, H * 0.004);
  ctx.setLineDash([Math.round(H * 0.014), Math.round(H * 0.008)]);
  ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(gancho.x, gancho.y); ctx.stroke();
  ctx.setLineDash([]);

  // Ponta do gancho
  const raioGancho = Math.round(H * 0.02);
  ctx.fillStyle = '#D3D1C7'; ctx.strokeStyle = '#5F5E5A';
  ctx.lineWidth = Math.max(1, H * 0.003);
  ctx.beginPath(); ctx.arc(gancho.x, gancho.y, raioGancho, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();

  // Curva do gancho
  ctx.beginPath();
  ctx.arc(gancho.x + raioGancho * 0.7, gancho.y + raioGancho * 0.7,
          raioGancho * 0.55, Math.PI * 0.4, Math.PI * 1.6);
  ctx.strokeStyle = '#888780';
  ctx.lineWidth = Math.max(2, H * 0.005);
  ctx.stroke();
}

// ─── Desenhar alvo ────────────────────────────────────────────────────────────
function desenharAlvo() {
  if (estadoJogo === ESTADO.PEGOU && pegou) return;
  const tx = alvo.x, ty = alvo.y, ts = ALVO_TAM;

  if (IMG.alvo.complete && IMG.alvo.naturalWidth) {
    ctx.drawImage(IMG.alvo, tx - ts / 2, ty - ts / 2, ts, ts);
  } else {
    ctx.fillStyle = '#EF9F27';
    ctx.beginPath();
    ctx.roundRect(tx - ts / 2, ty - ts / 2, ts, ts, 6);
    ctx.fill();
    ctx.fillStyle = '#FAC775';
    ctx.font = `bold ${Math.round(ts * 0.28)}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('ALVO', tx, ty);
  }
}

// ─── Desenhar obstáculos ──────────────────────────────────────────────────────
function desenharObstaculos() {
  for (const o of obstaculos) {
    if (!o.vivo) continue;
    const s = o.morrendo ? o.escala : 1;

    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.scale(s, s);
    ctx.globalAlpha = o.morrendo ? o.escala : 1;

    // Recorte circular
    ctx.beginPath(); ctx.arc(0, 0, o.r, 0, Math.PI * 2); ctx.clip();

    if (IMG.obstaculo.complete && IMG.obstaculo.naturalWidth) {
      ctx.drawImage(IMG.obstaculo, -o.r, -o.r, o.r * 2, o.r * 2);
    } else {
      ctx.fillStyle = '#7F77DD';
      ctx.beginPath(); ctx.arc(0, 0, o.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${Math.round(o.r * 0.65)}px sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('OBS', 0, 0);
    }

    ctx.restore();

    // Borda do círculo (fora do clip)
    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.scale(s, s);
    ctx.globalAlpha = o.morrendo ? o.escala : 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = Math.max(1, H * 0.003);
    ctx.beginPath(); ctx.arc(0, 0, o.r, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
}

// ─── Desenhar partículas ─────────────────────────────────────────────────────
function desenharParticulas() {
  for (const p of particulas) {
    ctx.globalAlpha = p.vida;
    ctx.fillStyle   = p.cor;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.tam, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ─── Efeitos de flash ─────────────────────────────────────────────────────────
function desenharFlash() {
  if (flashVermelho > 0) {
    ctx.fillStyle = `rgba(226,74,74,${0.2 * (flashVermelho / 45)})`;
    ctx.fillRect(0, 0, W, H);
  }
}

// ─── Desenho principal por frame ─────────────────────────────────────────────
function desenhar() {
  ctx.clearRect(0, 0, W, H);
  desenharObstaculos();
  desenharAlvo();
  desenharGancho();
  desenharPersonagem();
  desenharParticulas();
  desenharFlash();
}

// ─── Loop principal ───────────────────────────────────────────────────────────
function loop() {
  atualizar();
  desenhar();
  requestAnimationFrame(loop);
}

loop();
