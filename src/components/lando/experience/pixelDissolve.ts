import { seeded } from './utils';

// Barrido de PÍXELES en un <canvas> (efecto "la pantalla se enciende por
// bloques"). La pantalla se divide en celdas cuadradas; cada celda tiene un
// umbral = distancia al centro (iris) + algo de azar (disolvencia). Con el
// progreso p ∈ [0,1] se pintan (mode 'fill') o se borran (mode 'clear') las
// celdas cuyo umbral es < p. Es barato: solo fillRect, y solo se redibuja
// cuando cambia p. Reversible por construcción (depende solo de p).
export interface PixelDissolve {
  draw: (p: number) => void;
  resize: () => void;
  destroy: () => void;
}

export function createPixelDissolve(
  canvas: HTMLCanvasElement,
  opts: {
    mode: 'fill' | 'clear';
    color: (nx: number, ny: number) => string; // color de cada celda (nx, ny ∈ [0,1])
    cellsAcross?: number;
    seed?: number;
    iris?: number; // peso del iris (0 = solo azar, 1 = solo círculo)
    image?: string | null; // foto OPCIONAL (cover): cada celda pinta su trozo de la foto en vez de un color plano
  }
): PixelDissolve {
  const ctx = canvas.getContext('2d');
  let cells: { x: number; y: number; s: number; t: number; c: string }[] = [];
  let last = -1;
  let lastP = 0;
  let img: HTMLImageElement | null = null;
  if (opts.image) {
    const im = new Image();
    im.decoding = 'async';
    im.onload = () => {
      img = im;
      last = -1;
      draw(lastP);
    };
    im.src = opts.image;
  }

  const resize = () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    // resolución baja a propósito: los bloques se ven nítidos (image-rendering)
    canvas.width = Math.max(1, Math.round(w));
    canvas.height = Math.max(1, Math.round(h));
    const across = opts.cellsAcross ?? (w < 640 ? 14 : 26);
    const size = Math.ceil(w / across);
    const rows = Math.ceil(h / size);
    const r = seeded(opts.seed ?? 11);
    const iris = opts.iris ?? 0.6;
    const maxD = Math.hypot(0.5, (rows * size) / w / 2) || 1;
    cells = [];
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < across; i++) {
        const nx = (i + 0.5) / across;
        const ny = (j + 0.5) / rows;
        const d = Math.hypot(nx - 0.5, ((ny - 0.5) * rows * size) / w) / maxD;
        const t = d * iris + r() * (1 - iris);
        cells.push({ x: i * size, y: j * size, s: size, t: t * 0.96, c: opts.color(nx, ny) });
      }
    }
    last = -1;
  };

  const draw = (p: number) => {
    lastP = p;
    if (!ctx) return;
    const q = Math.round(p * 400) / 400;
    if (q === last) return;
    last = q;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const c of cells) {
      const on = opts.mode === 'fill' ? c.t < q : c.t >= q;
      if (on) {
        if (img) {
          // foto con ajuste tipo cover: cada celda dibuja SU trozo (la textura se conserva)
          const sc = Math.max(canvas.width / img.naturalWidth, canvas.height / img.naturalHeight);
          const ox = (canvas.width - img.naturalWidth * sc) / 2;
          const oy = (canvas.height - img.naturalHeight * sc) / 2;
          ctx.drawImage(img, (c.x - ox) / sc, (c.y - oy) / sc, (c.s + 0.5) / sc, (c.s + 0.5) / sc, c.x, c.y, c.s + 0.5, c.s + 0.5);
        } else {
          ctx.fillStyle = c.c;
          ctx.fillRect(c.x, c.y, c.s + 0.5, c.s + 0.5);
        }
      }
    }
  };

  resize();
  return { draw, resize, destroy: () => (cells = []) };
}
