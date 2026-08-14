/**
 * Gera os PNGs de ícone do PWA e das notificações.
 *
 * Por que um gerador e não arquivos binários commitados: ícone de notificação
 * PRECISA ser PNG — o Chrome no Android não decodifica SVG em `icon`/`badge` de
 * forma confiável, e o sintoma é silencioso (cai no ícone padrão do sistema sem
 * erro nenhum). Com um script, mudar a cor de uma cadeira ou o glifo é uma
 * edição de código revisável, em vez de um blob que ninguém sabe recriar.
 *
 * Sem dependência externa: PNG é assinatura + IHDR + IDAT (deflate) + IEND, e o
 * zlib já vem no Node. Instalar sharp/canvas só para desenhar um relógio de
 * 512px não se paga.
 *
 * Uso: node scripts/gerar-icones.mjs
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const SAIDA = join(AQUI, '..', 'public', 'icons');

// ---------------------------------------------------------------- PNG

const TABELA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = TABELA_CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(tipo, dados) {
  const tamanho = Buffer.alloc(4);
  tamanho.writeUInt32BE(dados.length);
  const corpo = Buffer.concat([Buffer.from(tipo, 'ascii'), dados]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(corpo));
  return Buffer.concat([tamanho, corpo, crc]);
}

/** @param {number} w @param {number} h @param {Buffer} rgba w*h*4 bytes */
function png(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bits por canal
  ihdr[9] = 6; // RGBA
  // 10..12 = compressão, filtro e entrelaçamento, todos no modo padrão (0).

  // Cada scanline leva um byte de filtro na frente. Filtro 0 (nenhum) é o
  // suficiente: estas imagens são pequenas e o deflate já resolve o resto.
  const linhas = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) {
    linhas[y * (w * 4 + 1)] = 0;
    rgba.copy(linhas, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(linhas, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------- desenho

const hexParaRgb = (hex) => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

/**
 * Desenha um relógio: fundo (quadrado arredondado ou círculo cheio, no caso
 * maskable) com mostrador e dois ponteiros.
 *
 * A antialiasing é por supersampling 3x3 — sem ela, um círculo de 192px fica
 * visivelmente serrilhado na bandeja de notificação.
 */
function desenharRelogio({ tamanho, fundo, traco, maskable = false, transparente = false }) {
  const [fr, fg, fb] = fundo ? hexParaRgb(fundo) : [0, 0, 0];
  const [tr, tg, tb] = hexParaRgb(traco);
  const rgba = Buffer.alloc(tamanho * tamanho * 4);

  const c = tamanho / 2;
  // Maskable reserva 20% de margem para o recorte do sistema não comer o glifo.
  const escala = maskable ? 0.6 : 0.78;
  const raio = (tamanho / 2) * escala;
  const espessura = Math.max(2, tamanho * 0.055);
  const raioFundo = tamanho * 0.22; // canto do quadrado arredondado

  const dentroDoFundo = (x, y) => {
    if (transparente) return false;
    if (maskable) return true; // o sistema recorta
    const dx = Math.max(raioFundo - x, 0, x - (tamanho - raioFundo));
    const dy = Math.max(raioFundo - y, 0, y - (tamanho - raioFundo));
    return Math.hypot(dx, dy) <= raioFundo;
  };

  // Ponteiros: 10h10, a pose clássica de vitrine — legível e simétrica.
  const ponteiros = [
    { ang: -Math.PI / 3, comp: raio * 0.52 }, // minutos, ~10
    { ang: -Math.PI * 0.87, comp: raio * 0.38 }, // horas, ~2
  ];

  const noGlifo = (x, y) => {
    const dx = x - c;
    const dy = y - c;
    const dist = Math.hypot(dx, dy);

    // Aro do mostrador.
    if (Math.abs(dist - raio) <= espessura / 2) return true;
    if (dist > raio) return false;

    // Ponteiros: distância do ponto ao segmento que sai do centro.
    for (const { ang, comp } of ponteiros) {
      const px = Math.cos(ang) * comp;
      const py = Math.sin(ang) * comp;
      const t = Math.max(0, Math.min(1, (dx * px + dy * py) / (px * px + py * py)));
      if (Math.hypot(dx - px * t, dy - py * t) <= espessura * 0.42) return true;
    }
    return false;
  };

  const AMOSTRAS = 3;
  for (let y = 0; y < tamanho; y++) {
    for (let x = 0; x < tamanho; x++) {
      let fundoAcc = 0;
      let glifoAcc = 0;
      for (let sy = 0; sy < AMOSTRAS; sy++) {
        for (let sx = 0; sx < AMOSTRAS; sx++) {
          const px = x + (sx + 0.5) / AMOSTRAS;
          const py = y + (sy + 0.5) / AMOSTRAS;
          if (dentroDoFundo(px, py)) fundoAcc++;
          if (noGlifo(px, py)) glifoAcc++;
        }
      }
      const total = AMOSTRAS * AMOSTRAS;
      const aFundo = fundoAcc / total;
      const aGlifo = glifoAcc / total;

      // Glifo por cima do fundo; alfa final é a união dos dois.
      const alfa = Math.max(aFundo, aGlifo);
      const i = (y * tamanho + x) * 4;
      if (alfa === 0) continue;

      const mistura = aGlifo / Math.max(alfa, 1e-6);
      rgba[i] = Math.round(tr * mistura + fr * (1 - mistura));
      rgba[i + 1] = Math.round(tg * mistura + fg * (1 - mistura));
      rgba[i + 2] = Math.round(tb * mistura + fb * (1 - mistura));
      rgba[i + 3] = Math.round(alfa * 255);
    }
  }

  return png(tamanho, tamanho, rgba);
}

// ---------------------------------------------------------------- saída

const REGISTRO = '#2F4A9C'; // azul do app
const ALARME = '#B85210'; // laranja de alarme
const ALERTA = '#A33A2E';
const BRANCO = '#FFFFFF';

const arquivos = {
  'icone-192.png': { tamanho: 192, fundo: REGISTRO, traco: BRANCO },
  'icone-512.png': { tamanho: 512, fundo: REGISTRO, traco: BRANCO },
  'icone-maskable.png': { tamanho: 512, fundo: REGISTRO, traco: BRANCO, maskable: true },

  // Notificações. Cores distintas para ela distinguir na bandeja sem ler.
  'abertura.png': { tamanho: 192, fundo: REGISTRO, traco: BRANCO },
  'fechamento.png': { tamanho: 192, fundo: ALARME, traco: BRANCO },
  'alerta.png': { tamanho: 192, fundo: ALERTA, traco: BRANCO },
  'icone.png': { tamanho: 192, fundo: REGISTRO, traco: BRANCO },

  // Badge: o Android recorta como silhueta monocromática, então só o traço
  // importa — fundo colorido aqui vira um borrão cinza.
  'badge.png': { tamanho: 96, traco: BRANCO, transparente: true },
};

mkdirSync(SAIDA, { recursive: true });
for (const [nome, opcoes] of Object.entries(arquivos)) {
  writeFileSync(join(SAIDA, nome), desenharRelogio(opcoes));
  console.log(`✓ ${nome} (${opcoes.tamanho}px)`);
}
