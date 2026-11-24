// Lienzo de la transición "cielo → tablero de oficina" al inicio de Formación.
// Todo depende de un único progreso p ∈ [0,1] (el scroll, vía ScrollTrigger),
// así que es reversible. Fases:
//  A (0.00–0.40) las luces del cielo (mismo tono escritorio #12161F con el que
//                termina la órbita) se desplazan en suave espiral y encajan,
//                una a una, en una retícula ordenada → chinchetas del tablero.
//                Las luces sobrantes se apagan.
//  B (0.22–0.55) aparece la textura del tablero (moteado tipo corcho/fieltro)
//                y un viñeteado; las chinchetas ganan sombra y brillo.
//  Siempre: la lámpara de escritorio arriba al centro (misma que cierra la
//  órbita), cuyo charco de luz ilumina el tablero.
// Con p = 1 queda un tablero estático con su rejilla de chinchetas.

const DESK_RGB = [18, 22, 31]; // #12161F
const BONE = '236,232,242';
const ACCENT = '242,48,210';

type Light = {
  sx: number; sy: number; // posición en el "cielo"
  tx: number; ty: number; // chincheta donde acaba (o NaN si se apaga)
  r: number; b: number; ph: number; spd: number;
  d: number; // retardo 0..1
  sw: number; // giro de la espiral (rad)
  accent: boolean;
};

export type BoardField = {
  cw: number; ch: number; sp: number;
  lights: Light[];
  texture: HTMLCanvasElement | null;
};

/** separación de la rejilla de chinchetas */
export const pinSpacing = (cw: number) => (cw < 640 ? 52 : 72);

// PRNG determinista (mulberry32)
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// textura del tablero pre-renderizada una vez (moteado fino + fibras)
function buildTexture(cw: number, ch: number, dpr: number) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = Math.round(cw * dpr);
  c.height = Math.round(ch * dpr);
  const x = c.getContext('2d');
  if (!x) return null;
  x.scale(dpr, dpr);
  const rand = rng(7);
  const n = Math.round((cw * ch) / 90);
  for (let i = 0; i < n; i++) {
    const light = rand() < 0.5;
    x.fillStyle = light ? `rgba(255,236,214,${0.025 + rand() * 0.04})` : `rgba(0,0,0,${0.08 + rand() * 0.1})`;
    const s = 0.6 + rand() * 1.4;
    x.fillRect(rand() * cw, rand() * ch, s, s);
  }
  // fibras cortas
  x.lineWidth = 0.6;
  for (let i = 0; i < n / 14; i++) {
    const px = rand() * cw;
    const py = rand() * ch;
    const a = rand() * Math.PI;
    const l = 3 + rand() * 7;
    x.strokeStyle = `rgba(255,230,200,${0.025 + rand() * 0.03})`;
    x.beginPath();
    x.moveTo(px, py);
    x.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l);
    x.stroke();
  }
  // viñeteado cálido
  const g = x.createRadialGradient(cw / 2, ch * 0.45, Math.min(cw, ch) * 0.2, cw / 2, ch / 2, Math.max(cw, ch) * 0.75);
  g.addColorStop(0, 'rgba(60,44,40,0.10)');
  g.addColorStop(1, 'rgba(0,0,0,0.2)');
  x.fillStyle = g;
  x.fillRect(0, 0, cw, ch);
  return c;
}

export function buildBoard(cw: number, ch: number, dpr = 1, textured = true): BoardField {
  const sp = pinSpacing(cw);
  const cols = Math.floor(cw / sp);
  const rows = Math.floor(ch / sp);
  const ox = (cw - (cols - 1) * sp) / 2;
  const oy = (ch - (rows - 1) * sp) / 2;
  const rand = rng(20261122);
  const cx = cw / 2;
  const cy = ch / 2;
  const maxD = Math.hypot(cx, cy);
  const pins: { x: number; y: number }[] = [];
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) pins.push({ x: ox + i * sp, y: oy + j * sp });
  // más luces que chinchetas: las sobrantes se apagan al ordenarse
  const extra = Math.round(pins.length * 0.6);
  const lights: Light[] = [];
  const mk = (tx: number, ty: number): Light => {
    const sx = rand() * cw;
    const sy = rand() * ch;
    const big = rand() < 0.08;
    return {
      sx, sy, tx, ty,
      r: big ? 1.5 + rand() : 0.5 + rand() * 0.9,
      b: big ? 1 : 0.35 + rand() * 0.55,
      ph: rand() * Math.PI * 2,
      spd: 0.0012 + rand() * 0.0024,
      d: Math.min(1, Math.hypot(sx - cx, sy - cy) / maxD) * 0.6 + rand() * 0.4,
      sw: (rand() < 0.5 ? -1 : 1) * (0.25 + rand() * 0.4),
      accent: false,
    };
  };
  pins.forEach((p, k) => {
    const l = mk(p.x, p.y);
    // muy pocas chinchetas en el acento, en una retícula regular más abierta
    l.accent = Math.floor(k / rows) % 6 === 3 && (k % rows) % 4 === 2;
    lights.push(l);
  });
  for (let i = 0; i < extra; i++) lights.push(mk(NaN, NaN));
  return { cw, ch, sp, lights, texture: textured ? buildTexture(cw, ch, dpr) : null };
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const ss = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

export const isTwinkling = (p: number) => p < 0.4;

export type DrawOpts = {
  /** y de la bombilla (px desde arriba del lienzo) = 10vh, igual que la órbita */
  bulbY: number;
  /** alto de la ventana: la franja superior lisa se mide en vh */
  vh: number;
  /** hay foto de fondo: sin textura ni chinchetas ni charco propios */
  photo: boolean;
};

export function drawBoard(ctx: CanvasRenderingContext2D, f: BoardField, p: number, time: number, o: DrawOpts) {
  const { cw, ch } = f;
  const A = ss(0.0, 0.4, p);
  const B = ss(0.22, 0.55, p);

  ctx.fillStyle = `rgb(${DESK_RGB[0]},${DESK_RGB[1]},${DESK_RGB[2]})`;
  ctx.fillRect(0, 0, cw, ch);
  // lámpara de escritorio arriba al centro (continúa la de la órbita): su
  // charco de luz cálida crece un poco cuando aparece el tablero
  // la lámpara se enciende tras el relevo de la bombilla de la órbita
  const L = o.photo ? 0 : ss(0.3, 0.52, p);
  if (L > 0) {
    const lr = Math.max(cw, ch) * (0.55 + 0.2 * B);
    const lamp = ctx.createRadialGradient(cw / 2, o.bulbY, 0, cw / 2, o.bulbY, lr);
    lamp.addColorStop(0, `rgba(255,206,150,${(0.11 + 0.05 * B) * L})`);
    lamp.addColorStop(0.45, `rgba(255,190,140,${(0.04 + 0.03 * B) * L})`);
    lamp.addColorStop(1, 'rgba(255,190,140,0)');
    ctx.fillStyle = lamp;
    ctx.fillRect(0, 0, cw, ch);
  }
  if (f.texture && B > 0 && !o.photo) {
    ctx.globalAlpha = B;
    ctx.drawImage(f.texture, 0, 0, cw, ch);
    ctx.globalAlpha = 1;
  }

  const cx = cw / 2;
  const cy = ch / 2;
  for (const s of f.lights) {
    const q = clamp01((A - s.d * 0.45) / 0.55);
    const e = easeInOutCubic(q);
    const tw = 0.55 + 0.45 * Math.sin(time * s.spd + s.ph);
    const ang = (1 - e) * s.sw;
    const co = Math.cos(ang);
    const si = Math.sin(ang);
    const rx = cx + (s.sx - cx) * co - (s.sy - cy) * si;
    const ry = cy + (s.sx - cx) * si + (s.sy - cy) * co;

    // con foto, todas las luces se apagan (la foto trae sus propias chinchetas)
    if (Number.isNaN(s.tx) || o.photo) {
      // luz sobrante: deriva un poco y se apaga
      const a = tw * s.b * (1 - e);
      if (a < 0.01) continue;
      ctx.fillStyle = `rgba(${BONE},${a})`;
      ctx.beginPath();
      ctx.arc(rx, ry, s.r, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }

    const x = mix(rx, s.tx, e);
    const y = mix(ry, s.ty, e);
    const col = s.accent ? ACCENT : BONE;
    if (e < 1) {
      const a = mix(tw * s.b, 0.85, e);
      const r = mix(s.r, 2.4, e);
      if (s.r > 1.4 && e < 0.8) {
        ctx.fillStyle = `rgba(${col},${a * 0.12 * (1 - e)})`;
        ctx.beginPath();
        ctx.arc(x, y, r * 4.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = `rgba(${e > 0.5 ? col : BONE},${a})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      // al encajar: pequeño "clic" (anillo que se abre)
      if (q > 0.85) {
        const k = (q - 0.85) / 0.15;
        ctx.strokeStyle = `rgba(${col},${0.5 * (1 - k)})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(s.tx, s.ty, 2.4 + k * 7, 0, Math.PI * 2);
        ctx.stroke();
      }
    } else {
      // chincheta: sombra proyectada + cabeza + brillo (la sombra crece con B)
      if (B > 0) {
        ctx.fillStyle = `rgba(0,0,0,${0.5 * B})`;
        ctx.beginPath();
        ctx.ellipse(x + 2.2, y + 2.8, 3, 2.4, 0.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = s.accent ? `rgba(${ACCENT},0.9)` : `rgba(${BONE},${mix(0.85, 0.55, B)})`;
      ctx.beginPath();
      ctx.arc(x, y, 2.4, 0, Math.PI * 2);
      ctx.fill();
      if (B > 0) {
        ctx.fillStyle = `rgba(255,255,255,${0.7 * B})`;
        ctx.beginPath();
        ctx.arc(x - 0.8, y - 0.8, 0.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // franja superior lisa (#12161F) para que el borde con la órbita no se vea:
  // plana los primeros ~18vh y se funde hacia el tablero hasta ~34vh
  const flat = o.vh * 0.18;
  const fade = o.vh * 0.34;
  const g = ctx.createLinearGradient(0, 0, 0, fade);
  g.addColorStop(0, `rgb(${DESK_RGB.join(",")})`);
  g.addColorStop(flat / fade, `rgb(${DESK_RGB.join(",")})`);
  g.addColorStop(1, `rgba(${DESK_RGB.join(",")},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, cw, fade);
}
