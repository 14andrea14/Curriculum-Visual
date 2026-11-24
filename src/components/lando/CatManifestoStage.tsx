import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CircuitBg } from './shared';
import { WORDS, MANIFESTO_TAGLINE } from './ManifestoSection';
import { PORTFOLIO_DATA } from '../../data/portfolioData';

// ¿Existe /public/stage/cat-floor.webp? Se detecta al compilar (solo las claves del
// glob, no importa nada): si no está, no se pide (antes daba un 404 en cada carga).
const HAS_CAT_FLOOR = Object.keys(import.meta.glob('/public/stage/*.webp')).includes('/public/stage/cat-floor.webp');

// ESCENA FINAL DE LA PORTADA: un gato recortado camina SOBRE el manifiesto.
// Capas (z-index internos, todo dentro de un contenedor absolute inset-0).
// Cada capa va envuelta en un div de paralaje (el cursor la mueve según su
// profundidad; se actualiza por rAF + refs, sin re-render de React):
//   z-0   fondo cinematográfico: degradado radial profundo, neblina de color,
//         circuito casi imperceptible, horizonte y suelo con reflejo (depth 0.2)
//   z-[5] foco de luz que sigue al cursor (mix-blend screen)
//   z-10  palabras de atrás (todas las blancas; las de acento solo cuando el
//         gato ya mira a cámara)                                  (depth 0.55)
//   z-[15] piso opcional /stage/cat-floor.webp
//   z-20  `cat` (escala/desvanece al "pasar la cámara")           (depth 0.65)
//   z-[25] luz tipo luciérnaga que acompaña al gato
//   z-30  palabras de adelante (SOLO las de acento, mientras el gato camina de
//         lado; cuando mira a cámara se funden y pasan a la capa de atrás) (depth 0.7)
//   z-[35] grano animado + viñeta
//   z-40  marquee
// Las palabras NO se ven antes de que pase el gato: cada una aparece con una
// máscara que sube + un destello neón que se apaga; al retroceder se ocultan.
// En walk=1 queda igual que el estado final de ManifestoSection.

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const ramp = (v: number, a: number, b: number) => clamp01((v - a) / (b - a));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (t: number) => t * t * (3 - 2 * t);

const EASE = 'cubic-bezier(0.65,0.05,0,1)';
// blanco roto (como el crema de Lando) para todo lo que no es acento
const INK = '#ECE8F2';
const REVEAL_MS = 750;
// Altura (fracción del alto) a la que va la cabeza del gato / la luz
const HEAD_Y = 0.58;
// A partir de aquí el gato gira la cabeza hacia la cámara (cuadro ~70 de 121)
// y luego camina hacia ella: queda por DELANTE de todas las palabras.
const FRONT_AT = 0.58;
// Desplazamiento máximo (px) de la capa más cercana con el cursor
const PARALLAX_PX = 18;
// (back y front cercanas entre sí para que la frase no se "rompa" entre capas)
const DEPTH = { bg: 0.2, back: 0.55, cat: 0.65, front: 0.7 } as const;
// Holgura del recorte de cada palabra (acentos de mayúsculas / itálica)
const PAD = { t: '0.16em', x: '0.08em', b: '0.12em' };

const GRAIN_SVG =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.9 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")";

const STAGE_CSS = `
@keyframes cms-grain {
  0% { transform: translate3d(0,0,0) } 17% { transform: translate3d(-4%,3%,0) }
  33% { transform: translate3d(3%,-5%,0) } 50% { transform: translate3d(-6%,-2%,0) }
  67% { transform: translate3d(5%,4%,0) } 83% { transform: translate3d(-2%,6%,0) }
  100% { transform: translate3d(0,0,0) }
}
@keyframes cms-flash {
  0%   { text-shadow: 0 0 2px #fff, 0 0 16px var(--fc), 0 0 42px var(--fc); filter: brightness(1.7); }
  35%  { text-shadow: 0 0 1px #fff, 0 0 12px var(--fc), 0 0 30px var(--fc); filter: brightness(1.3); }
  100% { text-shadow: 0 0 0 rgba(255,255,255,0), 0 0 0 rgba(0,0,0,0), 0 0 0 rgba(0,0,0,0); filter: brightness(1); }
}
@keyframes cms-bokeh {
  0%   { transform: translate3d(-50%,-50%,0) scale(1); }
  33%  { transform: translate3d(calc(-50% + 1.6vmin), calc(-50% - 1.2vmin),0) scale(1.08); }
  66%  { transform: translate3d(calc(-50% - 1.2vmin), calc(-50% + 0.8vmin),0) scale(0.94); }
  100% { transform: translate3d(-50%,-50%,0) scale(1); }
}
.cms-grain { animation: cms-grain 0.9s steps(6) infinite; }
/* par tipográfico de landonorris.com: Mona Sans (la misma) + serif de contraste recta
   (Brier es comercial: se usa Gloock, de Google Fonts, del mismo carácter) */
.cms-sans { font-family: "Mona Sans", "Inter", sans-serif; font-weight: 800; font-variation-settings: "wdth" 88; letter-spacing: -0.01em; }
.cms-serif { font-family: "Gloock", Georgia, serif; font-weight: 400; font-style: normal; letter-spacing: -0.005em; }
.cms-off .cms-grain, .cms-off .cms-bokeh { animation-play-state: paused; }
.cms-bokeh { transform: translate(-50%,-50%); animation: cms-bokeh 16s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) { .cms-grain, .cms-bokeh { animation: none; } }
`;

// Estela neón del cursor
const TRAIL_MS = 420;
const TRAIL_COLS = [
  [242, 48, 210], // cola: magenta
  [242, 48, 210], // medio: magenta
  [255, 214, 246], // punta: magenta casi blanco
];
const trailCol = (u: number) => {
  const s = u * 2;
  const i = Math.min(1, Math.floor(s));
  const t = s - i;
  const a = TRAIL_COLS[i];
  const b = TRAIL_COLS[i + 1];
  return `${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)}`;
};

type Pos = { x: number; y: number };

type StageProps = {
  enter: number;
  walk: number;
  cat: React.ReactNode;
  className?: string;
};

// El padre (HeroSection) se re-renderiza en cada frame de scroll y crea un elemento
// `cat` nuevo cada vez: se compara ese elemento por tipo + props superficiales, así
// el escenario solo se re-renderiza cuando algo suyo cambió de verdad.
const sameNode = (a: React.ReactNode, b: React.ReactNode) => {
  if (a === b) return true;
  if (!React.isValidElement(a) || !React.isValidElement(b)) return false;
  if (a.type !== b.type || a.key !== b.key) return false;
  const pa = a.props as Record<string, unknown>;
  const pb = b.props as Record<string, unknown>;
  const ka = Object.keys(pa);
  if (ka.length !== Object.keys(pb).length) return false;
  return ka.every((k) => Object.is(pa[k], pb[k]));
};
const sameProps = (a: StageProps, b: StageProps) =>
  a.enter === b.enter && a.walk === b.walk && a.className === b.className && sameNode(a.cat, b.cat);

const CatManifestoStageImpl: React.FC<StageProps> = ({ enter, walk, cat, className = '' }) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const wordRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const frontWordRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const bgRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLDivElement>(null);
  const catParRef = useRef<HTMLDivElement>(null);
  const frontRef = useRef<HTMLDivElement>(null);
  const spotRef = useRef<HTMLDivElement>(null);
  const circuitRef = useRef<HTMLDivElement>(null);
  const trailRef = useRef<HTMLCanvasElement>(null);
  const posRef = useRef<Pos[]>([]);
  const activeRef = useRef(false);
  const kickRef = useRef<() => void>(() => {});
  const [pos, setPos] = useState<Pos[]>([]);
  const [reduce, setReduce] = useState(false);
  const [floorOk, setFloorOk] = useState(HAS_CAT_FLOOR);
  const { profile } = PORTFOLIO_DATA;

  // prefers-reduced-motion
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduce(mq.matches);
    on();
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);

  // Medir posiciones de las palabras (normalizadas al contenedor): solo en mount,
  // al redimensionar y cuando cargan las fuentes. Se mide el envoltorio (sin
  // transform propio), así la animación de revelado no altera la medida.
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let raf = 0;
    const measure = () => {
      raf = 0;
      const r = root.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const next = wordRefs.current.map((el) => {
        if (!el) return { x: 0, y: 0 };
        const b = el.getBoundingClientRect();
        // x = borde izquierdo + un poco (se enciende cuando el gato "la alcanza")
        return { x: (b.left + b.width * 0.25 - r.left) / r.width, y: (b.top + b.height / 2 - r.top) / r.height };
      });
      posRef.current = next;
      setPos(next);
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null;
    ro?.observe(root);
    window.addEventListener('resize', schedule);
    document.fonts?.ready.then(schedule).catch(() => {});
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', schedule);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // Reacción al cursor: foco de luz + paralaje por capas + brillo de palabras
  // cercanas. Todo por rAF escribiendo estilos en refs (sin setState).
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let raf = 0;
    let has = false; // ya hubo movimiento del puntero
    let tx = 0, ty = 0; // objetivo normalizado -1..1
    let cx = 0, cy = 0; // actual (suavizado)
    let px = 0, py = 0; // píxeles relativos al contenedor (objetivo)
    let sx = 0, sy = 0; // píxeles del foco (suavizado)
    let spotA = 0; // opacidad del foco (suavizada)
    let rw = 1, rh = 1;
    const lastHv: number[] = [];
    // estela: puntos recientes del puntero (px relativos al contenedor) y chispas
    const pts: { x: number; y: number; t: number }[] = [];
    const sparks: { x: number; y: number; vx: number; vy: number; t: number; c: string }[] = [];
    let speed = 0; // 0..1, velocidad del puntero suavizada
    let lastX = 0, lastY = 0, lastT = 0;
    let dpr = 1;
    const fitCanvas = () => {
      const cv = trailRef.current;
      if (!cv) return;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      const W = Math.round(rw * dpr);
      const H = Math.round(rh * dpr);
      if (cv.width !== W || cv.height !== H) {
        cv.width = W;
        cv.height = H;
      }
    };

    const setT = (el: HTMLElement | null, d: number) => {
      if (!el) return;
      el.style.transform = reduce ? '' : `translate3d(${(-cx * PARALLAX_PX * d).toFixed(2)}px, ${(-cy * PARALLAX_PX * d * 0.6).toFixed(2)}px, 0)`;
    };

    const tick = () => {
      raf = 0;
      const k = reduce ? 1 : 0.09;
      cx += (tx - cx) * k;
      cy += (ty - cy) * k;
      sx += (px - sx) * (reduce ? 1 : 0.16);
      sy += (py - sy) * (reduce ? 1 : 0.16);
      const targetA = has && activeRef.current ? 1 : 0;
      spotA += (targetA - spotA) * 0.08;

      setT(bgRef.current, DEPTH.bg);
      setT(backRef.current, DEPTH.back);
      setT(catParRef.current, DEPTH.cat);
      setT(frontRef.current, DEPTH.front);

      const spot = spotRef.current;
      if (spot) {
        spot.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0) translate(-50%, -50%)`;
        spot.style.opacity = spotA.toFixed(3);
      }
      // circuito encendido bajo el cursor (el radio "respira" un poco con la velocidad)
      const circ = circuitRef.current;
      if (circ) {
        circ.style.setProperty('--mx', `${sx.toFixed(1)}px`);
        circ.style.setProperty('--my', `${sy.toFixed(1)}px`);
        circ.style.setProperty('--mr', `${(Math.min(rw, rh) * (0.2 + 0.06 * speed)).toFixed(1)}px`);
        circ.style.opacity = spotA.toFixed(3);
      }
      speed *= 0.92;

      // estela neón: cinta que se afina hacia la cola (cian -> magenta -> rosa) + chispas
      const cv = trailRef.current;
      const ctx = cv?.getContext('2d');
      let trailAlive = false;
      if (cv && ctx) {
        const now = performance.now();
        while (pts.length && now - pts[0].t > TRAIL_MS) pts.shift();
        for (let i = sparks.length - 1; i >= 0; i--) if (now - sparks[i].t > 650) sparks.splice(i, 1);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, cv.width, cv.height);
        if (pts.length > 1 || sparks.length) {
          trailAlive = true;
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.globalCompositeOperation = 'lighter';
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          const n = pts.length;
          for (let i = 1; i < n; i++) {
            const a = pts[i - 1];
            const b = pts[i];
            const life = Math.max(0, 1 - (now - b.t) / TRAIL_MS);
            const u = i / (n - 1);
            const col = trailCol(u);
            ctx.strokeStyle = `rgba(${col},${(0.9 * life).toFixed(3)})`;
            ctx.shadowColor = `rgba(${col},${life.toFixed(3)})`;
            ctx.shadowBlur = 16;
            ctx.lineWidth = 1.5 + 9 * life * u;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
          // núcleo blanco fino en la parte nueva
          ctx.shadowBlur = 0;
          for (let i = Math.max(1, n - 8); i < n; i++) {
            const life = Math.max(0, 1 - (now - pts[i].t) / TRAIL_MS);
            ctx.strokeStyle = `rgba(255,255,255,${(0.7 * life).toFixed(3)})`;
            ctx.lineWidth = 1.2 * life + 0.4;
            ctx.beginPath();
            ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
            ctx.lineTo(pts[i].x, pts[i].y);
            ctx.stroke();
          }
          for (const sp of sparks) {
            const age = (now - sp.t) / 650;
            const x = sp.x + sp.vx * age * 60;
            const y = sp.y + sp.vy * age * 60 + age * age * 18;
            ctx.fillStyle = `rgba(${sp.c},${(1 - age).toFixed(3)})`;
            ctx.shadowColor = `rgba(${sp.c},1)`;
            ctx.shadowBlur = 10;
            ctx.beginPath();
            ctx.arc(x, y, 1.6 * (1 - age) + 0.4, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.shadowBlur = 0;
        }
      }

      // palabras cercanas al cursor: brillo leve (en ambas capas)
      const ps = posRef.current;
      const mxn = sx / rw;
      const myn = sy / rh;
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i];
        let hv = 0;
        if (has && p) {
          const d = Math.hypot((p.x + 0.03 - mxn) * (rw / rh), p.y - myn);
          hv = spotA * Math.max(0, 1 - d / 0.32);
          hv = hv * hv;
        }
        if (Math.abs((lastHv[i] ?? -1) - hv) < 0.004) continue;
        lastHv[i] = hv;
        // brillo neón con leve desdoble cian/rosa (aberración) en las palabras cercanas
        const f =
          hv > 0.01
            ? `brightness(${(1 + 0.35 * hv).toFixed(3)}) drop-shadow(0 0 ${(14 * hv).toFixed(1)}px rgba(242,48,210,${(0.55 * hv).toFixed(3)}))`
            : '';
        const a = wordRefs.current[i];
        const b = frontWordRefs.current[i];
        if (a) a.style.filter = f;
        if (b) b.style.filter = f;
      }

      const moving =
        Math.abs(tx - cx) > 0.001 || Math.abs(ty - cy) > 0.001 ||
        Math.abs(px - sx) > 0.3 || Math.abs(py - sy) > 0.3 ||
        Math.abs(targetA - spotA) > 0.004 || trailAlive;
      if (moving) raf = requestAnimationFrame(tick);
    };
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };
    kickRef.current = kick;

    const onMove = (ev: PointerEvent) => {
      if (!activeRef.current) return;
      const r = root.getBoundingClientRect();
      if (!r.width || !r.height) return;
      rw = r.width;
      rh = r.height;
      px = ev.clientX - r.left;
      py = ev.clientY - r.top;
      tx = clamp01(px / r.width) * 2 - 1;
      ty = clamp01(py / r.height) * 2 - 1;
      if (!has) {
        has = true;
        sx = px;
        sy = py;
      }
      if (!reduce) {
        fitCanvas();
        const now = performance.now();
        const dist = Math.hypot(px - lastX, py - lastY);
        const dt = Math.max(1, now - lastT);
        if (lastT && dt < 120) {
          speed = Math.min(1, Math.max(speed, dist / dt / 2.2));
          // chispas al moverse rápido
          if (dist > 14 && sparks.length < 60) {
            const c = trailCol(Math.random());
            sparks.push({ x: px, y: py, vx: (Math.random() - 0.5) * 1.6, vy: (Math.random() - 0.7) * 1.4, t: now, c });
          }
        }
        lastX = px;
        lastY = py;
        lastT = now;
        pts.push({ x: px, y: py, t: now });
        if (pts.length > 40) pts.shift();
      }
      kick();
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    kick();
    return () => {
      window.removeEventListener('pointermove', onMove);
      if (raf) cancelAnimationFrame(raf);
      kickRef.current = () => {};
    };
  }, [reduce]);

  const e = clamp01(enter);
  const w = clamp01(walk);

  // activo solo mientras la escena es visible (el foco se apaga al salir)
  useEffect(() => {
    const act = e > 0;
    if (activeRef.current !== act) {
      activeRef.current = act;
      kickRef.current();
    }
  }, [e]);

  // x del gato en pantalla: entra hasta 0.2 (walk 0→0.2), camina 0.2→0.83, luego se queda
  const catX = w < 0.2 ? lerp(-0.08, 0.2, w / 0.2) : Math.min(w, 0.83);
  // cierre: el gato pasa la cámara (0.9→1)
  const exit = smooth(ramp(w, 0.9, 1));
  const allOn = w >= 0.9;
  const tagOn = w >= 0.88;
  // el gato mira a cámara: todas las palabras quedan detrás de él
  // las palabras de acento siguen DELANTE del gato (efecto atrás/adelante); cuando mira a
  // cámara solo su CABEZA queda delante: la capa de adelante se recorta con un hueco suave
  // donde está la cabeza (ver headCut más abajo)
  const catFront = false;
  const headCut = smooth(ramp(w, FRONT_AT - 0.04, FRONT_AT + 0.02)) * (1 - exit);
  // posición/tamaño de la CARA (con orejas) medidos en los cuadros del video: quieta de
  // frente (cuadros 72-100) y luego acercándose a cámara. [cuadro, x, y, radio en vw]
  const FACE_KF: [number, number, number, number][] = [
    [70, 0.285, 0.565, 0.06], [100, 0.285, 0.565, 0.06], [104, 0.335, 0.49, 0.066], [108, 0.37, 0.44, 0.082],
    [112, 0.405, 0.42, 0.1], [116, 0.435, 0.47, 0.13], [121, 0.47, 0.48, 0.18],
  ];
  const fr = w * 120 + 1; // mismo mapeo que la secuencia del gato (121 cuadros)
  let ki = 0;
  while (ki < FACE_KF.length - 2 && fr > FACE_KF[ki + 1][0]) ki++;
  const [f0, x0, y0, r0] = FACE_KF[ki];
  const [f1, x1, y1, r1] = FACE_KF[ki + 1];
  const kt = Math.min(1, Math.max(0, (fr - f0) / (f1 - f0)));
  // del cuadro a la pantalla: el video se dibuja en "cover" (si la ventana es más ancha que
  // 16:9 se recorta arriba y abajo), así que hay que aplicar la misma escala y desplazamiento
  const VW = typeof window !== 'undefined' ? window.innerWidth : 1920;
  const VH = typeof window !== 'undefined' ? window.innerHeight : 1080;
  const cs = Math.max(VW / 1920, VH / 1080);
  const offX = (VW - 1920 * cs) / 2;
  const offY = (VH - 1080 * cs) / 2;
  const headPX = offX + lerp(x0, x1, kt) * 1920 * cs;
  const headPY = offY + lerp(y0, y1, kt) * 1080 * cs;
  const headRX = lerp(r0, r1, kt) * 1920 * cs; // px
  const headRY = headRX * 1.18;
  // la luz aparece al empezar a caminar y se apaga en el cierre
  const glow = ramp(w, 0.02, 0.15) * (1 - smooth(ramp(w, 0.85, 1)));
  const marquee = smooth(ramp(w, 0.9, 1));
  // reflejo del suelo: se enciende con la caminata y baja en el cierre
  const floorGlow = 0.35 + 0.65 * ramp(w, 0.02, 0.2) * (1 - 0.6 * exit);

  // Una palabra: envoltorio que recorta (máscara) + palabra que sube desde abajo
  const word = (i: number, front: boolean) => {
    const wd = WORDS[i];
    const p = pos[i];
    const on = allOn || (w > 0 && !!p && catX >= p.x);
    const isKey = !!wd.key;
    // en qué capa se ve esta palabra
    const shown = isKey ? (front ? !catFront : catFront) : !front;
    // brillo extra según cercanía a la luz del gato (aspecto ~16:9)
    let k = 0;
    if (p && glow > 0 && on) {
      const dx = (p.x - catX) * 1.78;
      const dy = p.y - HEAD_Y;
      k = glow * Math.max(0, 1 - Math.hypot(dx, dy) / 0.55);
    }
    const color = wd.key ?? INK;
    const isMobileClient = typeof window !== 'undefined' && window.innerWidth < 768;
    const revealMs = isMobileClient ? 360 : REVEAL_MS;
    const wrap: React.CSSProperties = {
      display: 'inline-block',
      whiteSpace: 'nowrap',
      padding: `${PAD.t} ${PAD.x} ${PAD.b}`,
      margin: `-${PAD.t} -${PAD.x} -${PAD.b}`,
      // máscara: recorta mientras la palabra sube; ya revelada se abre para el glow
      clipPath: on ? 'inset(-0.7em -0.6em -0.7em -0.6em)' : 'inset(-0.7em -0.6em 0em -0.6em)',
      transition: on
        ? `clip-path 0s linear ${revealMs}ms, opacity 280ms ease`
        : 'clip-path 0s, opacity 280ms ease',
      opacity: shown ? 1 : 0,
      visibility: isKey || shown ? 'visible' : 'hidden',
    };
    const inner: React.CSSProperties & { ['--fc']?: string } = {
      display: 'inline-block',
      color,
      ['--fc']: wd.key ?? '#F230D2',
      transform: on || reduce ? 'translate3d(0,0,0)' : 'translate3d(0,118%,0)',
      opacity: on ? 1 : 0,
      transition: on
        ? `transform ${revealMs}ms ${EASE}, opacity ${reduce ? 400 : 260}ms ease`
        : `transform 420ms ${EASE}, opacity 320ms ease`,
      animation: on && !reduce ? `cms-flash 900ms cubic-bezier(0.2,0.6,0.2,1) both` : 'none',
      textShadow:
        k > 0.01
          ? `0 0 ${(6 + 20 * k).toFixed(1)}px rgba(242,48,210,${(0.6 * k).toFixed(3)})`
          : 'none',
      willChange: 'transform, opacity',
    };
    return (
      <React.Fragment key={i}>
        <span
          ref={(el) => {
            if (front) frontWordRefs.current[i] = el;
            else wordRefs.current[i] = el;
          }}
          aria-hidden
          className={wd.key ? 'cms-serif' : ''}
          style={wrap}
        >
          <span style={inner}>{wd.t}</span>
        </span>{' '}
      </React.Fragment>
    );
  };

  // Una capa de palabras: misma tipografía/layout que el manifiesto
  const layer = (front: boolean, z: string, ref: React.RefObject<HTMLDivElement>) => (
    <div ref={ref} className={`absolute inset-0 ${z} pointer-events-none`} style={{ willChange: 'transform' }}>
      {/* data-recede: gancho para "La corriente" (FlagBand): al salir del manifiesto el
          texto se aleja (escala + opacidad) mientras la línea de horizonte se vuelve pista */}
      <div data-recede className="absolute inset-0 flex flex-col items-center justify-center px-5 sm:px-10">
        {/* En móvil (<sm) tamaño fluido con clamp(1.75rem,8.2vw,3rem) para pantallas de 360px-390px; escritorio sin cambios */}
        <p className="cms-sans uppercase text-center leading-[0.94] max-w-[1500px] text-[clamp(1.75rem,8.2vw,3rem)] sm:text-[5.6vw] lg:text-[5.1vw]">
          {WORDS.map((_, i) => word(i, front))}
        </p>
        {/* frase chica aparte, con otra letra (mono técnica), al cerrar la caminata */}
        <p
          aria-hidden
          className="mt-[3.5vh] cms-sans uppercase text-center text-[clamp(0.9rem,1.2vw,1.2rem)] text-[#ECE8F2]/70"
          style={{
            letterSpacing: '0.3em',
            fontWeight: 600,
            visibility: front ? 'hidden' : 'visible',
            opacity: tagOn ? 1 : 0,
            transform: tagOn || reduce ? 'none' : 'translateY(14px)',
            transition: `opacity 600ms ease, transform 700ms ${EASE}`,
          }}
        >
          {MANIFESTO_TAGLINE}
        </p>
      </div>
    </div>
  );

  return (
    <div
      ref={rootRef}
      className={`absolute inset-0 overflow-hidden text-white ${e > 0 ? '' : 'cms-off'} ${className}`}
      style={{ opacity: smooth(e), visibility: e > 0 ? 'visible' : 'hidden', background: '#02050A' }}
    >
      <style>{STAGE_CSS}</style>

      {/* ---------- FONDO (paralaje mínimo; sobredimensionado para no ver bordes) ----------
          Al estilo del manifiesto de landonorris.com (pedido explícito): fondo oscuro CASI
          PLANO de un solo tono (azul noche), con líneas finísimas apenas visibles (allá
          curvas de nivel; aquí pistas de circuito, su motivo) y un único acento de color.
          Solo queda un brillo magenta suave en el piso donde camina el gato. */}
      <div ref={bgRef} aria-hidden className="absolute -inset-6 z-0 pointer-events-none" style={{ willChange: 'transform' }}>
        <div
          className="absolute inset-0"
          style={{ background: 'radial-gradient(110% 90% at 50% 42%, #0E1E31 0%, #0A1A2B 60%, #0A1A2B 100%)' }}
        />
        {/* pistas de circuito finísimas en todo el fondo (como las curvas de nivel de Lando) */}
        <div
          className="absolute inset-0"
          style={{ WebkitMaskImage: 'linear-gradient(to bottom, #000 0%, #000 70%, transparent 100%)', maskImage: 'linear-gradient(to bottom, #000 0%, #000 70%, transparent 100%)' }}
        >
          <CircuitBg seed={11} count={30} stroke="#ECE8F2" opacity={0.045} />
        </div>
        {/* suelo: se oscurece hacia abajo desde el horizonte */}
        <div
          className="absolute inset-x-0 bottom-0"
          style={{
            top: '74%',
            background: 'linear-gradient(to bottom, rgba(10,26,43,0) 0%, rgba(10,26,43,0.7) 45%, #0A1A2B 100%)',
          }}
        />
        {/* línea de horizonte a la altura de las patas (un solo color) */}
        <div
          className="absolute inset-x-0"
          style={{
            top: '80.5%',
            height: 1,
            opacity: 0.4,
            background: 'linear-gradient(90deg, rgba(236,232,242,0) 6%, rgba(236,232,242,0.35) 35%, rgba(242,48,210,0.55) 52%, rgba(236,232,242,0.3) 70%, rgba(236,232,242,0) 94%)',
          }}
        />
        {/* brillo magenta suave donde camina el gato */}
        <div
          className="absolute inset-0"
          style={{
            opacity: floorGlow,
            background: 'radial-gradient(36% 7% at 46% 81%, rgba(242,48,210,0.22) 0%, rgba(242,48,210,0.07) 50%, rgba(242,48,210,0) 100%)',
            transition: 'opacity 400ms ease',
          }}
        />
      </div>

      {/* EL CURSOR ENCIENDE EL CIRCUITO: debajo de la noche hay una placa; alrededor del
          puntero sus pistas se iluminan (cian adentro, magenta en un anillo más amplio).
          La máscara sigue al cursor vía variables CSS (--mx/--my/--mr) escritas por rAF. */}
      <div
        ref={circuitRef}
        aria-hidden
        className="absolute inset-0 z-[4] pointer-events-none"
        style={{
          opacity: 0,
          WebkitMaskImage: 'radial-gradient(circle var(--mr, 0px) at var(--mx, -999px) var(--my, -999px), #000 0%, rgba(0,0,0,0.55) 45%, transparent 100%)',
          maskImage: 'radial-gradient(circle var(--mr, 0px) at var(--mx, -999px) var(--my, -999px), #000 0%, rgba(0,0,0,0.55) 45%, transparent 100%)',
        }}
      >
        <CircuitBg seed={11} count={30} stroke="#F230D2" opacity={0.7} className="drop-shadow-[0_0_6px_rgba(242,48,210,0.9)]" />
      </div>

      {/* foco de luz que sigue al cursor (ilumina el fondo) */}
      <div aria-hidden className="absolute inset-0 z-[5] pointer-events-none overflow-hidden">
        <div
          ref={spotRef}
          className="absolute left-0 top-0 rounded-full"
          style={{
            width: '62vmin',
            height: '62vmin',
            opacity: 0,
            background:
              'radial-gradient(circle, rgba(242,48,210,0.16) 0%, rgba(242,48,210,0.06) 32%, rgba(242,48,210,0) 68%)',
            mixBlendMode: 'screen',
            willChange: 'transform, opacity',
          }}
        />
      </div>

      {/* texto accesible (las capas visuales son aria-hidden) */}
      <span className="sr-only">{WORDS.map((x) => x.t).join(' ')} {MANIFESTO_TAGLINE}.</span>

      {layer(false, 'z-10', backRef)}

      {/* piso opcional bajo el gato */}
      {floorOk && (
        <img
          src="/stage/cat-floor.webp"
          alt=""
          aria-hidden
          onError={() => setFloorOk(false)}
          className="absolute bottom-0 left-0 w-full z-[15] pointer-events-none select-none"
          style={{ opacity: 1 - exit }}
        />
      )}

      {/* gato (paralaje) — colocado en z-[32] para que su cara y cuerpo queden SIEMPRE POR DELANTE del texto (pedido explícito) */}
      <div ref={catParRef} className="absolute inset-0 z-[32] pointer-events-none" style={{ willChange: 'transform' }}>
        <div
          className="absolute inset-0"
          style={{
            opacity: 1 - exit,
            transform: reduce ? undefined : `scale(${lerp(1, 1.35, exit)})`,
            transformOrigin: `${Math.round(catX * 100)}% 60%`,
            willChange: 'transform, opacity',
            visibility: exit >= 1 ? 'hidden' : 'visible',
          }}
        >
          {cat}
        </div>
      </div>

      {/* luz tipo luciérnaga a la altura de la cabeza */}
      {/* el div exterior (inset-0) se traslada catX*100% de su propio ancho = ancho del contenedor */}
      <div
        aria-hidden
        className="absolute inset-0 z-[25] pointer-events-none"
        style={{ transform: `translate3d(${(catX * 100).toFixed(2)}%, 0, 0)`, opacity: glow, visibility: glow > 0 ? 'visible' : 'hidden' }}
      >
        <div
          className="absolute left-0 rounded-full"
          style={{
            top: `${HEAD_Y * 100}%`,
            width: '46vmin',
            height: '46vmin',
            transform: 'translate(-50%, -50%)',
            background: 'radial-gradient(circle, rgba(242,48,210,0.24) 0%, rgba(242,48,210,0.08) 34%, rgba(242,48,210,0) 70%)',
            mixBlendMode: 'screen',
          }}
        />
      </div>

      <div
        className="absolute inset-0 z-30 pointer-events-none"
        style={
          headCut > 0.001
            ? {
                WebkitMaskImage: `radial-gradient(ellipse ${headRX.toFixed(1)}px ${headRY.toFixed(1)}px at ${headPX.toFixed(1)}px ${headPY.toFixed(1)}px, rgba(0,0,0,${(1 - headCut).toFixed(3)}) 80%, #000 100%)`,
                maskImage: `radial-gradient(ellipse ${headRX.toFixed(1)}px ${headRY.toFixed(1)}px at ${headPX.toFixed(1)}px ${headPY.toFixed(1)}px, rgba(0,0,0,${(1 - headCut).toFixed(3)}) 80%, #000 100%)`,
              }
            : undefined
        }
      >
        {layer(true, 'z-30', frontRef)}
      </div>

      {/* estela neón del cursor (por encima de las palabras, se suma con "lighter") */}
      <canvas ref={trailRef} aria-hidden className="absolute inset-0 z-[33] w-full h-full pointer-events-none" />

      {/* grano fino animado + viñeta */}
      <div aria-hidden className="absolute inset-0 z-[35] pointer-events-none overflow-hidden">
        <div
          className="cms-grain absolute -inset-[10%]"
          style={{ backgroundImage: GRAIN_SVG, backgroundSize: '220px 220px', opacity: 0.055, mixBlendMode: 'screen' }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(140% 120% at 50% 35%, rgba(10,26,43,0) 55%, rgba(10,26,43,0.5) 85%, rgba(10,26,43,0.75) 100%)',
          }}
        />
      </div>

      {/* (la franja que corría abajo pasó a su propia sección: FlagBand, "el banderín") */}
    </div>
  );
};

// memo: ver sameProps (el padre re-renderiza en cada frame de scroll)
export const CatManifestoStage = React.memo(CatManifestoStageImpl, sameProps);
