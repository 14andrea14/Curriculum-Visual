import gsap from 'gsap';

// LÍQUIDO que sube desde el borde inferior y revela la escena final (pradera).
//
// Técnica (barata a propósito, sin filtros ni SVG animado):
//  1) La superficie es una función de onda (3 senos con fases y velocidades distintas,
//     más una leve inclinación que "chapotea"). Se evalúa en ~N puntos por cuadro.
//  2) Con esos puntos se arma un `clip-path: polygon(...)` sobre el escenario (capa fija
//     a pantalla completa): lo único que cambia por cuadro es la máscara, que Chrome
//     aplica en el compositor sin volver a rasterizar el contenido.
//  3) Un único <canvas> 2D (también fijo, encima, sin eventos) dibuja la "piel" del
//     líquido con los MISMOS puntos: borde translúcido con los colores del cielo del
//     pie (azul -> lavanda -> rosa), línea de brillo (menisco), destellos que viajan,
//     burbujas que suben dentro y gotas que saltan por encima de la superficie.
//  4) Todo corre en UN solo tick de gsap SOLO mientras la transición está activa
//     (0 < progreso < 1); en los extremos se detiene y se limpia (visibility/clip-path).
// El progreso sale del scroll (reversible): al subir, el líquido se drena.

const TAU = Math.PI * 2;

// capas de la piel: de la más ancha (tenue, azulada) a la más fina (brillante, rosada)
const SKIN: { d: number; c: string }[] = [
  { d: 150, c: 'rgba(96,124,226,0.05)' },
  { d: 104, c: 'rgba(140,146,238,0.07)' },
  { d: 68, c: 'rgba(184,166,246,0.09)' },
  { d: 40, c: 'rgba(222,188,246,0.12)' },
  { d: 20, c: 'rgba(244,208,250,0.16)' },
  { d: 7, c: 'rgba(255,236,255,0.24)' },
];

type Bubble = { x: number; y: number; r: number; vy: number; ph: number; wob: number };
type Drop = { x: number; y: number; vx: number; vy: number; r: number; on: boolean };

export type LiquidOpts = {
  /** capa fija a pantalla completa con la escena (se recorta con polygon) */
  stage: HTMLElement;
  /** canvas fijo de la piel (burbujas, brillo, gotas) */
  canvas: HTMLCanvasElement;
  /** progreso del scroll SIN acotar (<0 antes del tramo, >1 después); se llama en cada cuadro activo */
  read: () => number;
  /** px de scroll que dura el tramo (para el precalentamiento previo) */
  span: () => number;
  /** se llama en cada cuadro con el progreso ya suavizado (paralaje, disparo del contenido) */
  onFrame: (p: number) => void;
};

export type LiquidHandle = {
  /** despierta el tick (llamar cuando el scroll cambie dentro del tramo) */
  wake: () => void;
  destroy: () => void;
};

export const createLiquid = ({ stage, canvas, read, span, onFrame }: LiquidOpts): LiquidHandle => {
  const ctx = canvas.getContext('2d');
  if (!ctx) return { wake: () => {}, destroy: () => {} };

  // geometría (px CSS de la ventana fija)
  let W = 1;
  let V = 1;
  let Hs = 1;
  let dpr = 1;
  let amax = 40;
  let m0 = 30;
  let f1 = 1;
  let f2 = 2;
  let f3 = 3;
  let n = 64;
  let xs = new Float32Array(n + 1);
  let ys = new Float32Array(n + 1);

  const measure = () => {
    W = Math.max(1, canvas.clientWidth);
    V = Math.max(1, canvas.clientHeight);
    Hs = Math.max(1, stage.offsetHeight);
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(V * dpr);
    // amplitud máxima de la ola (más chica en móvil) y margen para que arranque/termine fuera de pantalla
    amax = Math.max(22, Math.min(56, V * 0.05));
    m0 = 2.2 * 0.3 * amax * 1.1;
    const l1 = Math.max(520, Math.min(1300, W * 0.85));
    f1 = W / l1;
    f2 = W / (l1 * 0.48);
    f3 = W / (l1 * 0.29);
    const nn = Math.max(36, Math.min(96, Math.round(W / 16)));
    if (nn !== n) {
      n = nn;
      xs = new Float32Array(n + 1);
      ys = new Float32Array(n + 1);
    }
    for (let i = 0; i <= n; i++) xs[i] = (W * i) / n;
  };

  // ── estado ──
  let p = 0; // progreso suavizado
  let spd = 0; // velocidad suavizada (progreso/seg), > 0 subiendo
  let t = 0; // reloj de las olas (seg)
  let last = 0;
  let running = false;
  let visible = false; // escenario visible
  let clipped = false; // escenario con clip-path
  let lastPoly = '';
  let skinOn = false;

  // desplazamiento vertical de la superficie en x (px; negativo = hacia arriba)
  let A = 0;
  const off = (x: number) => {
    const u = x / W;
    return (
      A *
      (Math.sin(TAU * f1 * u + 1.4 * t) +
        0.55 * Math.sin(TAU * f2 * u - 2.1 * t + 1.3) +
        0.28 * Math.sin(TAU * f3 * u + 3.0 * t + 2.4) +
        0.5 * (u - 0.5) * Math.sin(0.7 * t))
    );
  };
  let base = 0;
  const surfY = (x: number) => base + off(x);

  // burbujas y gotas (grupos pequeños, reutilizados)
  const bubbles: Bubble[] = [];
  const drops: Drop[] = [];
  const spawnBubble = (b: Bubble) => {
    b.r = 2.5 + Math.pow(Math.random(), 2) * 9;
    b.x = Math.random() * W;
    b.y = V + b.r + Math.random() * V * 0.7;
    b.vy = 30 + b.r * 8 + Math.random() * 34;
    b.ph = Math.random() * TAU;
    b.wob = 4 + Math.random() * 10;
  };
  const spawnDrop = (x: number, y: number, boost = 1) => {
    const d = drops.find((q) => !q.on);
    if (!d) return;
    d.on = true;
    d.x = x;
    d.y = y - 2;
    d.vx = (Math.random() - 0.5) * 130;
    d.vy = -(150 + Math.random() * 330) * boost;
    d.r = 1.5 + Math.random() * 3.3;
  };
  const resetFx = () => {
    bubbles.length = 0;
    for (let i = 0; i < 16; i++) {
      const b = { x: 0, y: 0, r: 0, vy: 0, ph: 0, wob: 0 };
      spawnBubble(b);
      bubbles.push(b);
    }
    drops.length = 0;
    for (let i = 0; i < 24; i++) drops.push({ x: 0, y: 0, vx: 0, vy: 0, r: 2, on: false });
  };

  const setStage = (vis: boolean) => {
    if (vis === visible) return;
    visible = vis;
    stage.style.visibility = vis ? 'visible' : 'hidden';
  };
  const setClip = (poly: string | null) => {
    if (poly === null) {
      if (clipped) {
        stage.style.clipPath = '';
        lastPoly = '';
        clipped = false;
      }
      return;
    }
    if (poly !== lastPoly) stage.style.clipPath = poly;
    lastPoly = poly;
    clipped = true;
  };
  const setSkin = (on: boolean) => {
    if (on === skinOn) return;
    skinOn = on;
    canvas.style.visibility = on ? 'visible' : 'hidden';
    if (!on) ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const curve = (dy: number, dir: 1 | -1) => {
    if (dir === 1) for (let i = 0; i <= n; i++) ctx.lineTo(xs[i], ys[i] + dy);
    else for (let i = n; i >= 0; i--) ctx.lineTo(xs[i], ys[i] + dy);
  };

  const drawSkin = (dt: number, fade: number) => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, V);
    ctx.globalAlpha = 1;

    // 1) piel translúcida: franjas entre la curva y la curva desplazada hacia abajo
    for (const L of SKIN) {
      ctx.beginPath();
      ctx.moveTo(xs[0], ys[0]);
      curve(0, 1);
      curve(L.d, -1);
      ctx.closePath();
      ctx.fillStyle = L.c;
      ctx.fill();
    }

    // 2) burbujas dentro del líquido (suben más lento que la superficie)
    ctx.lineWidth = 1.3;
    for (const b of bubbles) {
      b.y -= b.vy * dt;
      const bx = b.x + Math.sin(t * 1.7 + b.ph) * b.wob;
      const sy = surfY(bx);
      if (b.y - b.r < sy) {
        // llegó a la superficie: revienta (a veces salpica) y renace abajo
        if (sy < V - 12 && sy > -20 && Math.random() < 0.4) spawnDrop(bx, sy, 0.6);
        spawnBubble(b);
        continue;
      }
      if (b.y > V + b.r) continue;
      const a = Math.min(1, (b.y - sy) / 40) * fade;
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.arc(bx, b.y, b.r, 0, TAU);
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.62)';
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(bx - b.r * 0.3, b.y - b.r * 0.32, Math.max(0.8, b.r * 0.2), 0, TAU);
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // 3) brillo del menisco: halo suave + línea fina + destellos que viajan
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(xs[0], ys[0]);
    curve(0, 1);
    ctx.strokeStyle = 'rgba(255,240,255,0.2)';
    ctx.lineWidth = 8;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.92)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.save();
    ctx.translate(0, 11);
    ctx.setLineDash([90, 330]);
    ctx.lineDashOffset = -t * 80;
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.restore();
    ctx.setLineDash([]);

    // 4) gotas que saltan por encima de la superficie
    ctx.fillStyle = 'rgba(255,238,255,0.92)';
    for (const d of drops) {
      if (!d.on) continue;
      d.vy += 1500 * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      if ((d.vy > 0 && d.y > surfY(d.x) + 1) || d.y > V + 20) {
        d.on = false;
        continue;
      }
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, TAU);
      ctx.fill();
    }
  };

  const tick = () => {
    const now = performance.now();
    const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
    last = now;
    t += dt;

    const raw = read();
    const target = Math.min(1, Math.max(0, raw));
    const prev = p;
    p += (target - p) * (1 - Math.exp(-dt * 14));
    if (Math.abs(target - p) < 4e-4) p = target;
    spd += ((p - prev) / dt - spd) * (1 - Math.exp(-dt * 8));

    onFrame(p);

    if (p <= 0) {
      // Precalentamiento: poco antes de que empiece el tramo, el escenario ya está
      // "visible" pero recortado a un polígono vacío; así el primer cuadro del líquido no
      // paga la creación de capas ni la decodificación de las imágenes grandes.
      const warm = raw > -(V * 1.5) / Math.max(1, span());
      if (warm) {
        setClip('polygon(0px 0px,0px 0px,0px 0px)');
        setStage(true);
      } else {
        setClip(null);
        setStage(false);
      }
      setSkin(false);
    } else if (p >= 1) {
      setClip(null);
      setStage(true);
      setSkin(false);
    } else {
      // amplitud: más grande a media subida, se calma al llenarse; el chapoteo crece con la velocidad
      const sp = Math.min(1, Math.abs(spd) / 0.5);
      const s = Math.sin(Math.PI * p);
      A = amax * (0.3 + (0.7 + 0.35 * sp) * s);
      base = V + m0 - p * (V + 2 * m0);
      for (let i = 0; i <= n; i++) ys[i] = base + off(xs[i]);
      // polígono en coordenadas del escenario (anclado abajo, alto Hs >= V)
      const o = V - Hs;
      let poly = 'polygon(-2px ' + (ys[0] - o).toFixed(1) + 'px';
      for (let i = 0; i <= n; i++) poly += ',' + xs[i].toFixed(1) + 'px ' + (ys[i] - o).toFixed(1) + 'px';
      poly += ',' + (W + 2) + 'px ' + (ys[n] - o).toFixed(1) + 'px,' + (W + 2) + 'px ' + (Hs + 2) + 'px,-2px ' + (Hs + 2) + 'px)';
      setClip(poly);
      setStage(true);
      setSkin(true);
      // las gotas nacen de la superficie mientras sube
      if (spd > 0.03 && base > -30 && Math.random() < dt * 14) {
        const x = Math.random() * W;
        spawnDrop(x, surfY(x));
      }
      const fade = 1 - Math.min(1, Math.max(0, (p - 0.82) / 0.16));
      drawSkin(dt, fade);
    }

    // en los extremos y ya asentado: se detiene el tick
    if ((p <= 0 || p >= 1) && p === target) stop();
  };

  const stop = () => {
    if (!running) return;
    running = false;
    gsap.ticker.remove(tick);
  };
  const wake = () => {
    if (running) return;
    running = true;
    last = performance.now();
    gsap.ticker.add(tick);
  };

  measure();
  resetFx();
  const ro = new ResizeObserver(() => {
    measure();
    resetFx();
    wake();
  });
  ro.observe(canvas);
  ro.observe(stage);

  // estado inicial coherente con el scroll actual (sin esperar a un evento)
  p = read();
  wake();

  return {
    wake,
    destroy: () => {
      stop();
      ro.disconnect();
      stage.style.clipPath = '';
      stage.style.visibility = '';
      canvas.style.visibility = '';
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    },
  };
};
