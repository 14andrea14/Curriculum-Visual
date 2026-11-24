import React, { useEffect, useRef } from 'react';
import { GlassOrb, type OrbState } from './GlassOrb';

// CAPA EXTRA DE "LO QUE HAGO": llena los vacíos a los lados de la pista mientras la
// corriente baja (P ≈ 0.15–0.56) y se retira antes de que las filas y la foto tomen la
// escena (P > 0.56). Todo sale de su CV.
//
//  · IZQUIERDA — tipografía cinética: su stack, de arriba (circuito) hacia abajo (código).
//    Cada palabra es un "componente" soldado a la pista: cuando la corriente pasa por su
//    altura, una pista magenta sale de la principal, corre por debajo de la palabra
//    (subrayado = patita del componente) y la palabra aparece desde la profundidad
//    (desenfocada → nítida, revelándose desde el lado de la pista). Paralaje con el mouse.
//  · DERECHA — una gota de VIDRIO 3D (r3f, transmisión real) con un microchip dentro, que
//    se arma con el scroll, se inclina hacia el cursor y se abomba del lado del puntero;
//    y tres tarjetas de GLASSMORPHISM con hechos del CV, también conectadas a la pista,
//    que entran con el scroll y se inclinan en 3D con el mouse.
//
// Rendimiento: las medidas se toman solo en measure() (resize / refresh de ScrollTrigger);
// frame() solo escribe estilos y lo llama el rAF de FlagBand (que ya corre solo cuando la
// sección se ve). Cada escritura se omite si el valor no cambió. El lienzo 3D no tiene
// bucle propio: se avanza desde aquí solo cuando la gota está en escena.

const BONE = '#ECE8F2';
const ACCENT = '#F230D2';
const NIGHT = '#0A1A2B';

type Pt = [number, number];
export type ExtrasGeo = {
  W: number;
  H: number;
  vh: number;
  feed: Pt[]; // polilínea de la bajada (coordenadas de la sección)
  yT: number; // línea base de la fila superior (nodo central)
  yEnd: number; // fin de la bajada (escritorio: prolongación hasta casi el pie; angosto: = yT)
  pAtS: (s: number) => number; // P en el que la corriente alcanza la distancia s de la bajada
};
// secTop: borde superior del banderín en la ventana (px); lo calcula FlagBand con el scroll
export type ExtrasApi = { measure: (g: ExtrasGeo) => void; frame: (now: number, P: number, secTop: number) => void };

type Face = 'outline' | 'serif' | 'serif-accent' | 'sans';
// SOLO habilidades técnicas (duras), de hardware (arriba) a software (abajo).
// "U1…U6" son designadores de PCB. sc = escala de la fuente para palabras largas.
const WORDS: { t: string; d: string; f: Face; z: number; x: number; m?: boolean; sc?: number }[] = [
  // paraguas para las placas (ESP32-S3, Arduino… del CV)
  { t: 'Hardware embebido', d: 'U1', f: 'serif-accent', z: 0.8, x: 0.06, m: true },
  { t: 'C++ · Python', d: 'U2', f: 'outline', z: 1.0, x: 0.16, m: true, sc: 0.7 },
  { t: 'n8n', d: 'U3', f: 'outline', z: 1.25, x: 0.42, m: true },
  { t: 'Integración de LLMs', d: 'U4', f: 'serif', z: 0.5, x: 0.04, m: true },
  { t: 'React · Supabase', d: 'U5', f: 'sans', z: 0.9, x: 0.22, m: true },
  { t: 'Docker · Linux', d: 'U6', f: 'serif', z: 0.7, x: 0.12, m: true },
];

// tarjetas de vidrio: lo que construye (no experiencia laboral). Herramientas del CV.
const CARDS: { k: string; t: string; f?: string; steps?: string[] }[] = [
  // (pedido explícito: diseño en lugar de "Desarrollo web", sin repetir React/Supabase)
  { k: 'Diseño', t: 'Diseño creativo', f: 'UX / UI · Diseño 3D' },
  { k: 'De la idea al deploy', t: 'Proyectos desde cero', steps: ['Diseño', 'Desarrollo', 'Despliegue'] },
  { k: 'IA & automatización', t: 'Chats, automatizaciones y bots funcionales', f: 'n8n · LLMs · WhatsApp' },
];

export const FlagExtrasLite = React.forwardRef<HTMLDivElement>(function FlagExtrasLite(_, ref) {
  return (
    <div ref={ref} className="absolute left-4 right-4 top-[23%] z-[12] mx-auto motion-reduce:left-auto motion-reduce:right-auto max-w-[34rem] border border-white/15 bg-[#0A1A2B]/95 px-4 py-3 text-[#ECE8F2] shadow-[0_6px_24px_#07060B] rounded-2xl motion-reduce:relative motion-reduce:top-auto motion-reduce:mt-6" style={{ visibility: 'hidden', opacity: 0 }}>
      <ul aria-label="Herramientas y habilidades" className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[clamp(0.69rem,3vw,0.9rem)] leading-tight pb-3">
        {WORDS.map(({ t }) => <li key={t}>{t}</li>)}
      </ul>
      <ul className="grid gap-y-2 border-t border-white/15 pt-2.5">
        {CARDS.map(({ k, t, f, steps }) => (
          <li key={t}>
            <span className="block text-[0.64rem] leading-tight text-[#F5A7E9]">{k}</span>
            <span className="block text-[clamp(0.77rem,3.4vw,1rem)] font-semibold leading-tight">{t}</span>
            <span className="block text-[clamp(0.68rem,2.9vw,0.87rem)] leading-snug text-[#ECE8F2]/75">{f ?? steps?.join(' · ')}</span>
          </li>
        ))}
      </ul>
    </div>
  );
});

const CSS = `
.fbx-w { position:absolute; left:0; top:0; white-space:nowrap; line-height:1; will-change:transform,opacity,filter; transform-origin: 100% 60%; }
.fbx-w .fbx-t { display:block; }
.fbx-outline { font-family:"Mona Sans","Inter",sans-serif; font-variation-settings:"wdth" 112, "wght" 850; letter-spacing:-0.02em; color:transparent; -webkit-text-stroke:1.3px ${BONE}; font-size:clamp(2.2rem,4.4vw,5rem); }
.fbx-serif { font-family:"Gloock",Georgia,serif; letter-spacing:-0.02em; color:${BONE}; font-size:clamp(1.5rem,2.6vw,2.9rem); }
.fbx-serif-accent { font-family:"Gloock",Georgia,serif; letter-spacing:-0.02em; color:${ACCENT}; font-size:clamp(1.7rem,3vw,3.3rem); }
.fbx-sans { font-family:"Mona Sans","Inter",sans-serif; font-variation-settings:"wdth" 80, "wght" 800; letter-spacing:-0.01em; text-transform:uppercase; color:${BONE}; font-size:clamp(1.3rem,2.2vw,2.5rem); }
.fbx-d { position:absolute; right:-20px; top:-2px; font:600 12px/1 "JetBrains Mono",monospace; letter-spacing:0.08em; color:${ACCENT}; opacity:0.85; -webkit-text-stroke:0; }

.fbx-card { position:absolute; left:0; top:0; width:clamp(210px,15.5vw,268px); padding:14px 16px 15px; border-radius:18px;
  background: linear-gradient(140deg, rgba(236,232,242,0.16) 0%, rgba(236,232,242,0.05) 45%, rgba(242,48,210,0.07) 100%);
  -webkit-backdrop-filter: blur(16px) saturate(150%); backdrop-filter: blur(16px) saturate(150%);
  border:1px solid rgba(236,232,242,0.2);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.28), inset 0 -1px 0 rgba(242,48,210,0.18), 0 24px 50px -24px rgba(0,0,0,0.75);
  color:${BONE}; overflow:hidden; will-change:transform,opacity; --mx:30%; --my:0%; }
/* brillo especular que sigue al mouse */
.fbx-card::before { content:""; position:absolute; inset:0; border-radius:inherit; pointer-events:none;
  background: radial-gradient(260px circle at var(--mx) var(--my), rgba(255,255,255,0.22), transparent 55%); }
/* grano fino (ruido) para que el vidrio no se vea plástico */
.fbx-card::after { content:""; position:absolute; inset:0; border-radius:inherit; pointer-events:none; opacity:0.13; mix-blend-mode:overlay;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E"); }
.fbx-k { font:600 11.5px/1.2 "JetBrains Mono",monospace; letter-spacing:0.14em; text-transform:uppercase; color:${ACCENT}; }
.fbx-ct { font-family:"Gloock",Georgia,serif; font-size:clamp(1.05rem,1.3vw,1.3rem); line-height:1.1; margin-top:8px; }
.fbx-cf { font-family:"Mona Sans","Inter",sans-serif; font-variation-settings:"wdth" 100, "wght" 550; font-size:11px; letter-spacing:0.02em; margin-top:10px; color:rgba(236,232,242,0.68); }
.fbx-steps { display:flex; align-items:center; gap:4px; row-gap:6px; margin-top:11px; flex-wrap:wrap; }
.fbx-step { font-family:"Mona Sans","Inter",sans-serif; font-variation-settings:"wdth" 100, "wght" 600; font-size:11.5px; padding:3px 7px; border-radius:999px; border:1px solid rgba(236,232,242,0.22); background:rgba(236,232,242,0.06); white-space:nowrap; }
.fbx-arr { color:${ACCENT}; font-size:10px; }
/* haz de luz: la tarjeta se pliega en una línea encendida antes de ser absorbida */
.fbx-beam { position:absolute; inset:0; border-radius:inherit; pointer-events:none; opacity:0;
  background: linear-gradient(90deg, ${ACCENT} 0%, #FFB8F4 45%, ${ACCENT} 100%); }
.fbx-pin { position:absolute; left:-1px; top:50%; width:9px; height:9px; margin-top:-4.5px; border-radius:2px; background:${ACCENT}; box-shadow:0 0 10px ${ACCENT}; }
`;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const ramp = (v: number, a: number, b: number) => clamp01((v - a) / (b - a));
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const easeIO = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

// punto de la bajada a la altura y (la bajada es monótona en y) y su distancia recorrida
function traceAtY(feed: Pt[], y: number): { x: number; s: number } {
  let acc = 0;
  for (let i = 1; i < feed.length; i++) {
    const [x0, y0] = feed[i - 1];
    const [x1, y1] = feed[i];
    const l = Math.hypot(x1 - x0, y1 - y0);
    if (y <= y1 && y1 > y0) {
      const k = clamp01((y - y0) / (y1 - y0));
      return { x: x0 + (x1 - x0) * k, s: acc + l * k };
    }
    acc += l;
  }
  const last = feed[feed.length - 1];
  return { x: last[0], s: acc };
}

// escritor con caché: solo toca el DOM si el valor cambió
const setStyle = (el: HTMLElement | SVGElement, cache: Map<string, string>, k: string, v: string) => {
  if (cache.get(k) === v) return;
  cache.set(k, v);
  if (k.startsWith('--')) el.style.setProperty(k, v);
  else (el.style as unknown as Record<string, string>)[k] = v;
};
// caché de atributos POR ELEMENTO (pistas, uniones y pads comparten nombres de atributo)
const attrCache = new WeakMap<Element, Map<string, string>>();
const setAttr = (el: Element, k: string, v: string) => {
  let cache = attrCache.get(el);
  if (!cache) attrCache.set(el, (cache = new Map()));
  if (cache.get(k) === v) return;
  cache.set(k, v);
  el.setAttribute(k, v);
};
const clearAttrCache = (...els: (Element | undefined)[]) => els.forEach((e) => e && attrCache.delete(e));

type Pin = {
  el: HTMLElement;
  card: boolean;
  z: number;
  i: number;
  // medidas (measure)
  left: number;
  top: number;
  w: number;
  h: number;
  y: number; // altura de la patita (sección)
  xt: number; // x de la pista principal a esa altura
  P0: number; // P en que la corriente llega a la patita
  // estado
  c: Map<string, string>;
  ord: number; // orden de salida
  elW: number; // ancho de la caja (sin el designador)
  beam?: HTMLElement;
  right: boolean; // palabra a la DERECHA de la pista (solo en pantallas angostas)
  lead?: SVGPathElement;
  ghost?: SVGPathElement;
  jn?: SVGCircleElement;
  end?: SVGCircleElement;
};

export const FlagExtras: React.FC<{ apiRef: React.MutableRefObject<ExtrasApi | null> }> = ({ apiRef }) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const orbBoxRef = useRef<HTMLDivElement>(null);
  const orbState = useRef<OrbState>({ t: 0, dt: 0, a: 0, e: 0, px: 0, py: 0 });
  const advRef = useRef<((t: number) => void) | null>(null);
  const reduce = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // escritorio: lienzo 3D + tarjetas; móvil: solo algunas palabras (sin 3D)
  const [wide] = React.useState(() => typeof window === 'undefined' || window.innerWidth >= 900);

  useEffect(() => {
    const root = rootRef.current;
    const svg = svgRef.current;
    if (!root || !svg || reduce) {
      apiRef.current = null;
      return;
    }
    const orbBox = orbBoxRef.current;
    const pins: Pin[] = [];
    root.querySelectorAll<HTMLElement>('[data-pin]').forEach((el) => {
      const card = el.dataset.pin === 'card';
      pins.push({ el, card, z: Number(el.dataset.z || 1), i: pins.length, left: 0, top: 0, w: 1, h: 1, y: 0, xt: 0, P0: 0.3, c: new Map(), ord: 0, right: false, elW: 1, beam: el.querySelector<HTMLElement>('.fbx-beam') ?? undefined });
    });
    // pistas de cada patita (fantasma + encendida + uniones)
    const NS = 'http://www.w3.org/2000/svg';
    svg.innerHTML = '';
    for (const p of pins) {
      const ghost = document.createElementNS(NS, 'path');
      ghost.setAttribute('fill', 'none');
      ghost.setAttribute('stroke', BONE);
      ghost.setAttribute('stroke-opacity', '0.12');
      ghost.setAttribute('stroke-width', '1');
      const lead = document.createElementNS(NS, 'path');
      lead.setAttribute('fill', 'none');
      lead.setAttribute('stroke', ACCENT);
      lead.setAttribute('stroke-width', '1.5');
      lead.setAttribute('stroke-linecap', 'round');
      lead.setAttribute('stroke-linejoin', 'round');
      lead.setAttribute('pathLength', '1');
      lead.setAttribute('stroke-dasharray', '1 1');
      lead.setAttribute('stroke-dashoffset', '1');
      const jn = document.createElementNS(NS, 'circle');
      jn.setAttribute('r', '3.4');
      jn.setAttribute('fill', ACCENT);
      const end = document.createElementNS(NS, 'circle');
      end.setAttribute('r', '2.4');
      end.setAttribute('fill', NIGHT);
      end.setAttribute('stroke', ACCENT);
      end.setAttribute('stroke-width', '1.2');
      svg.append(ghost, lead, jn, end);
      Object.assign(p, { ghost, lead, jn, end });
    }

    let W = 1;
    let H = 1;
    let vh = 1;
    let orb = { left: 0, top: 0, size: 1 };
    let nodeY = 0; // nodo central (donde todo es absorbido y de donde salen las filas)
    // mouse (crudo y suavizado)
    const mouse = { x: window.innerWidth * 0.5, y: window.innerHeight * 0.5, sx: window.innerWidth * 0.5, sy: window.innerHeight * 0.5 };
    const onMove = (e: PointerEvent) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
    };
    window.addEventListener('pointermove', onMove, { passive: true });

    const measure = (g: ExtrasGeo) => {
      W = g.W;
      H = g.H;
      vh = g.vh;
      nodeY = g.yT;
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      const words = pins.filter((p) => !p.card);
      const cards = pins.filter((p) => p.card);
      // franja vertical disponible. Escritorio: casi todo el alto de la pantalla, centrada
      // (la bajada se prolonga hasta g.yEnd), así no queda una banda vacía abajo.
      // En pantallas angostas se arranca debajo del rótulo "LO QUE HAGO" y se termina
      // poco antes de la fila superior (como antes).
      const y0 = W < 900 ? H * 0.155 : Math.max(48, H * 0.1);
      const y1 = W < 900 ? g.yT - 26 : g.yEnd - 36;
      const span = Math.max(80, y1 - y0);
      // alturas reales: las palabras se apilan con el mismo aire entre cajas (sin solapes)
      words.forEach((p) => {
        p.elW = p.el.offsetWidth;
        p.w = p.elW + 24; // + designador
        p.h = p.el.offsetHeight;
      });
      const sumH = words.reduce((acc, p) => acc + p.h + 12, 0);
      const gapY = Math.max(4, (span - sumH) / Math.max(1, words.length));
      let cursorY = y0 + gapY * 0.5;
      words.forEach((p, k) => {
        const top = cursorY;
        cursorY += p.h + 12 + gapY;
        const base = top + p.h * 0.82; // línea base aproximada
        const tr = traceAtY(g.feed, base + 7);
        // la pista puede ir en diagonal: se toma la x más cercana en todo el alto de la caja
        const trTop = traceAtY(g.feed, top);
        const xNear = Math.min(tr.x, trTop.x);
        const xFar = Math.max(tr.x, trTop.x);
        // en pantallas angostas las palabras se alternan a ambos lados de la pista
        const gap = W < 900 ? 34 : 70;
        // angosto: se alternan lados, pero si un lado no tiene lugar se usa el otro
        const roomL = xNear - gap - 10;
        const roomR = W - xFar - gap - 22;
        p.right = W < 900 && ((k % 2 === 1 && roomR >= p.w) || roomL < p.w) && roomR >= roomL;
        const fx = Number(p.el.dataset.x || 0);
        let left: number;
        if (!p.right) {
          const zoneR = xNear - gap; // la palabra termina antes de la pista
          const zoneL = W * 0.035;
          left = zoneL + fx * Math.max(0, zoneR - zoneL - p.w);
          if (left + p.w > zoneR) left = Math.max(zoneL * 0.5, zoneR - p.w);
        } else {
          left = Math.min(xFar + gap, W - p.w - 22);
        }
        p.left = left;
        p.el.style.transformOrigin = p.right ? '0% 60%' : '100% 60%';
        p.top = top;
        p.y = base + 7;
        p.xt = tr.x;
        // todas terminan de entrar al comienzo del pin (P ≈ 0.53) y quedan quietas durante
        // la meseta de lectura (ver PACE en FlagBand)
        p.P0 = Math.min(0.445, g.pAtS(tr.s));
        p.ord = k; // salen en cascada, de arriba hacia abajo
      });
      // tarjetas: a la derecha de la pista, escalonadas
      // web (arriba, izq. de la gota) → desde cero (medio, encima del borde de la gota) → bots (abajo, der.)
      const cx = [0.585, 0.615, 0.79];
      const cy = [0.22, 0.62, 0.88];
      cards.forEach((p, k) => {
        p.w = p.el.offsetWidth;
        p.elW = p.w;
        p.h = p.el.offsetHeight;
        // se pliega y se encoge hacia su patita (borde izquierdo, del lado de la pista)
        p.el.style.transformOrigin = '0% 50%';
        const mid = y0 + span * cy[k];
        p.left = Math.min(W * cx[k], W - p.w - 28);
        p.top = mid - p.h / 2;
        p.y = mid;
        const tr = traceAtY(g.feed, mid);
        p.xt = tr.x;
        p.P0 = Math.min(0.445, g.pAtS(tr.s));
        p.ord = 2 - k; // salen primero las de abajo (las alcanzan antes las filas)
      });
      // la gota: a la derecha, entre las tarjetas
      if (orbBox) {
        const size = Math.min(W * 0.4, span * 1.35, 680);
        orb = { left: W * 0.805 - size / 2, top: y0 + span * 0.45 - size / 2, size }; // entre la 1.ª y la 3.ª tarjeta
        orbBox.style.left = `${orb.left.toFixed(1)}px`;
        orbBox.style.top = `${orb.top.toFixed(1)}px`;
        orbBox.style.width = `${size.toFixed(1)}px`;
        orbBox.style.height = `${size.toFixed(1)}px`;
      }
      for (const p of pins) {
        p.c.clear();
        clearAttrCache(p.lead, p.ghost, p.jn, p.end);
        p.el.style.left = `${p.left.toFixed(1)}px`;
        p.el.style.top = `${p.top.toFixed(1)}px`;
      }
      lastFrameP = -1;
    };

    let last = 0;
    let lastFrameP = -1;
    let frameN = 0;
    let orbOn = false;
    const orbCache = new Map<string, string>();

    const frame = (now: number, P: number, secTop: number) => {
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
      last = now;
      frameN++;
      // mouse suavizado (sin lecturas de layout)
      const km = 1 - Math.exp(-dt * 7);
      const mdx = mouse.x - mouse.sx;
      const mdy = mouse.y - mouse.sy;
      mouse.sx += mdx * km;
      mouse.sy += mdy * km;
      const moving = Math.abs(mdx) + Math.abs(mdy) > 0.4;
      if (!moving && P === lastFrameP && !orbOn) return;
      const pChanged = P !== lastFrameP;
      lastFrameP = P;

      const nx = (mouse.sx / W) * 2 - 1;
      const ny = ((mouse.sy - secTop) / H) * 2 - 1;

      for (const p of pins) {
        const c = p.c;
        const lead = ramp(P, p.P0 - 0.006, p.P0 + 0.035);
        const k = easeOut(ramp(P, p.P0 + 0.012, p.P0 + 0.085));
        // SALIDA (traspaso a filas + foto): la corriente "vuelve al bus". Las palabras son
        // deslizadas por su patita hasta la pista principal mientras se achican de forma
        // UNIFORME y se apagan (la letra nunca se deforma); las tarjetas se encienden como
        // luz y viajan por su cable hasta la pista. Tarjetas primero, palabras en cascada,
        // con tramos largos y escalonados (≈ 6vh de scroll por cada 0.01 de P) para que cada
        // paso se lea; todo termina antes del estallido (P 0.655, ver HAND1 en FlagBand).
        const out = p.card
          ? ramp(P, 0.545 + p.ord * 0.012, 0.585 + p.ord * 0.012)
          : ramp(P, 0.565 + p.ord * 0.008, 0.6 + p.ord * 0.008);
        const eo = easeIO(out);
        const vis = k * (1 - ramp(out, p.card ? 0.55 : 0.45, 1));
        // paralaje / inclinación con el mouse (se apaga durante la salida)
        let dx = nx * p.z * 16 * (1 - eo);
        let dy = ny * p.z * 9 * (1 - eo);
        let tf: string;
        let shift = 0; // corrimiento hacia la pista durante la salida
        let sc = 1; // escala uniforme de salida
        if (!p.card) {
          const sg = p.right ? -1 : 1; // las de la derecha entran y salen en espejo
          dx += sg * -70 * (1 - k);
          // el extremo del lado de la pista se desliza hasta la pista (el origen de la
          // transformación está en ese extremo, así se achica "hacia" el cable)
          shift = p.right ? (p.xt + 14 - p.left) * eo : (p.xt - 14 - (p.left + p.elW)) * eo;
          sc = 1 - 0.62 * eo;
          tf = `perspective(700px) translate3d(${(dx + shift).toFixed(1)}px,${dy.toFixed(1)}px,0) rotateY(${(sg * -38 * (1 - k)).toFixed(2)}deg) scale(${((0.86 + 0.14 * k) * sc).toFixed(4)})`;
          const blur = (1 - k) * 9;
          setStyle(
            p.el,
            c,
            'filter',
            blur > 0.15 ? `blur(${blur.toFixed(2)}px)` : eo > 0.01 ? `drop-shadow(0 0 ${(10 * eo).toFixed(1)}px ${ACCENT})` : 'none'
          );
          // se revela desde el lado de la pista (derecha) hacia la izquierda
          const cut = (100 * (1 - k)).toFixed(2);
          setStyle(p.el, c, 'clipPath', k >= 1 ? 'none' : p.right ? `inset(-30% ${cut}% -30% -40%)` : `inset(-30% -40% -30% ${cut}%)`);
        } else {
          // tarjetas: entran girando desde la derecha y se inclinan hacia el cursor
          const ccx = p.left + p.w / 2;
          const ccy = secTop + p.top + p.h / 2;
          const lx = Math.max(-1, Math.min(1, (mouse.sx - ccx) / 420));
          const ly = Math.max(-1, Math.min(1, (mouse.sy - ccy) / 320));
          // salida: se endereza, se enciende como luz (haz magenta encima) y viaja por su
          // cable hasta la pista achicándose de forma uniforme (origen en su borde izquierdo)
          const still = 1 - eo;
          dx = nx * p.z * 10 * still + 60 * (1 - k);
          dy = ny * p.z * 7 * still + 40 * (1 - k);
          shift = (p.xt + 2 - p.left) * eo;
          sc = 1 - 0.72 * eo;
          const ry = (lx * 12 - 28 * (1 - k)) * still;
          const rx = (-ly * 10 + 10 * (1 - k)) * still;
          tf = `perspective(900px) translate3d(${(dx + shift).toFixed(1)}px,${dy.toFixed(1)}px,0) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) scale(${((0.9 + 0.1 * k) * sc).toFixed(4)})`;
          if (p.beam) setStyle(p.beam, c, 'opacity', (0.8 * easeIO(ramp(out, 0.12, 0.6))).toFixed(3));
          setStyle(p.el, c, '--mx', `${(50 + lx * 50).toFixed(1)}%`);
          setStyle(p.el, c, '--my', `${(50 + ly * 50).toFixed(1)}%`);
        }
        if (vis <= 0.001) {
          setStyle(p.el, c, 'visibility', 'hidden');
        } else {
          setStyle(p.el, c, 'visibility', 'visible');
          setStyle(p.el, c, 'transform', tf);
        }
        setStyle(p.el, c, 'opacity', vis.toFixed(3));

        // pista de la patita: sale de la principal y corre por debajo de la palabra
        const yb = p.y;
        let d: string;
        if (!p.card) {
          // near = extremo de la palabra del lado de la pista; far = el otro (pad final).
          // En la salida el cable se recoge junto con la palabra hacia la pista.
          const near0 = p.right ? p.left - 14 : p.left + p.w - 10;
          const kink0 = p.right ? near0 - 22 : near0 + 22;
          const kink = kink0 + (p.xt - kink0) * eo;
          const near = p.right ? Math.max(near0 + dx + shift, kink) : Math.min(near0 + dx + shift, kink);
          // borde opuesto de la palabra ya achicada
          const far = p.right ? p.left + dx + shift + p.w * sc : p.left + p.elW + dx + shift - p.elW * sc;
          d = `M${p.xt.toFixed(1)} ${yb.toFixed(1)} H${kink.toFixed(1)} L${near.toFixed(1)} ${(yb + dy).toFixed(1)} H${far.toFixed(1)}`;
          if (p.end) {
            setAttr(p.end, 'cx', far.toFixed(1));
            setAttr(p.end, 'cy', (yb + dy).toFixed(1));
          }
        } else {
          const xC = p.left + dx + shift + 2;
          d = `M${p.xt.toFixed(1)} ${yb.toFixed(1)} H${Math.max(p.xt, xC - 30).toFixed(1)} L${xC.toFixed(1)} ${(yb + dy).toFixed(1)}`;
          if (p.end) setAttr(p.end, 'r', '0');
        }
        if (p.lead && p.ghost && p.jn) {
          setAttr(p.lead, 'd', d);
          setAttr(p.ghost, 'd', d);
          setAttr(p.lead, 'stroke-dashoffset', (1 - lead).toFixed(4));
          // el cable sigue encendido mientras transporta la palabra/tarjeta; se apaga al final
          const lo = (1 - ramp(out, 0.85, 1)).toFixed(3);
          setAttr(p.lead, 'opacity', lead > 0 ? lo : '0');
          setAttr(p.ghost, 'opacity', (ramp(P, 0.1, 0.2) * (1 - eo)).toFixed(3));
          setAttr(p.jn, 'cx', p.xt.toFixed(1));
          setAttr(p.jn, 'cy', yb.toFixed(1));
          setAttr(p.jn, 'opacity', lead > 0 ? lo : '0');
          if (p.end) setAttr(p.end, 'opacity', (k * (1 - ramp(out, 0.85, 1))).toFixed(3));
        }
      }

      // gota de vidrio
      if (orbBox) {
        const s = orbState.current;
        const a = easeOut(ramp(P, 0.17, 0.44));
        // salida: la gota se encoge y es absorbida por el nodo central
        const e = easeIO(ramp(P, 0.575, 0.627));
        const op = ramp(P, 0.13, 0.2) * (1 - ramp(P, 0.608, 0.628));
        const ox = (W / 2 - (orb.left + orb.size / 2)) * e;
        const oy = (nodeY - (orb.top + orb.size / 2)) * e;
        setStyle(orbBox, orbCache, 'transform', e > 0 ? `translate3d(${ox.toFixed(1)}px,${oy.toFixed(1)}px,0) scale(${(1 - 0.92 * e).toFixed(4)})` : 'none');
        setStyle(orbBox, orbCache, 'opacity', op.toFixed(3));
        setStyle(orbBox, orbCache, 'visibility', op > 0.001 ? 'visible' : 'hidden');
        orbOn = op > 0.001;
        if (orbOn) {
          s.t += dt;
          s.dt = dt;
          s.a = a;
          s.e = e;
          s.px = ((mouse.sx - orb.left) / orb.size) * 2 - 1;
          s.py = -(((mouse.sy - secTop - orb.top) / orb.size) * 2 - 1);
          // a ritmo completo si algo cambia; en reposo, un cuadro de cada dos (giro lento)
          if (advRef.current && (pChanged || moving || frameN % 2 === 0)) advRef.current(now);
        }
      }
    };

    apiRef.current = { measure, frame };
    return () => {
      apiRef.current = null;
      window.removeEventListener('pointermove', onMove);
    };
  }, [apiRef, reduce]);

  if (reduce) return null;
  const words = wide ? WORDS : WORDS.filter((w) => w.m);
  return (
    <div ref={rootRef} aria-hidden className="absolute inset-0 pointer-events-none" style={{ zIndex: 6 }}>
      <style>{CSS}</style>
      {wide && (
        <div ref={orbBoxRef} className="absolute" style={{ left: '60%', top: '5%', width: 400, height: 400, opacity: 0, visibility: 'hidden', zIndex: 0 }}>
          <GlassOrb st={orbState} advRef={advRef} />
        </div>
      )}
      <svg ref={svgRef} className="absolute inset-0 w-full h-full" preserveAspectRatio="none" style={{ zIndex: 1 }} />
      {words.map((w) => (
        <div
          key={w.t}
          data-pin="word"
          data-z={w.z}
          data-x={w.x}
          className={`fbx-w fbx-${w.f}`}
          style={{ opacity: 0, visibility: 'hidden', zIndex: 2, fontSize: wide ? (w.sc ? `calc(${w.sc} * clamp(2.2rem,4.4vw,5rem))` : undefined) : '1rem' }}
        >
          <span className="fbx-t">{w.t}</span>
          <span className="fbx-d">{w.d}</span>
        </div>
      ))}
      {wide &&
        CARDS.map((c, i) => (
          <div key={c.t} data-pin="card" data-z={0.6 + i * 0.25} className="fbx-card" style={{ opacity: 0, visibility: 'hidden', zIndex: 3 }}>
            <span className="fbx-pin" />
            <span className="fbx-beam" />
            <div className="fbx-k">{c.k}</div>
            <div className="fbx-ct">{c.t}</div>
            {c.f && <div className="fbx-cf">{c.f}</div>}
            {c.steps && (
              <div className="fbx-steps">
                {c.steps.map((st, j) => (
                  <React.Fragment key={st}>
                    {j > 0 && <span className="fbx-arr">→</span>}
                    <span className="fbx-step">{st}</span>
                  </React.Fragment>
                ))}
              </div>
            )}
          </div>
        ))}
    </div>
  );
};
