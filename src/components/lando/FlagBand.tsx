import { refreshScroll } from '../../lib/refreshScroll';
import { isLite } from '../../lib/deviceProfile';
import React, { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { CircuitBg } from './shared';
import { FlagExtras, FlagExtrasLite, type ExtrasApi } from './flagband/FlagExtras';
import { registerStops } from '../../lib/assistedScroll';
import { registerWarmup } from '../../lib/preload';
import { registerPaintWarmup } from './warmup';
import { POKER_ENTRY_HOLD, POKER_PIN_QUERY } from './poker/pokerEntrance';

gsap.registerPlugin(ScrollTrigger);

// EL BANDERÍN (referencia: "Message from Lando" de landonorris.com) + SU ENTRADA:
// "LA CORRIENTE" (ligada a su frase "Del circuito al código").
//
// Banderín: rótulo chico centrado arriba; debajo DOS filas de texto GIGANTE que corren
// en sentidos opuestos —arriba la serif de acento (magenta), abajo la sans pesada blanco
// roto— y una foto vertical al centro, por delante. Contenido 100 % del CV.
//
// Entrada (todo scrubbeado por el scroll y reversible; un solo progreso P de 0 a 1):
//   0.00-0.45  el manifiesto se aleja (el texto escala y se apaga, solo transform/opacity)
//   0.02-0.17  la línea de horizonte del manifiesto se vuelve PISTA: dos pulsos corren
//              desde los extremos hacia el centro y la dejan encendida
//   0.17-0.56  en el centro la corriente dobla hacia abajo y viaja como pista de circuito
//              (tramos a 90°/45° con vías/pads) cruzando hacia el banderín; al pasar junto
//              al rótulo "LO QUE HAGO" este se enciende como un componente (tipeo + parpadeo)
//   0.50       el banderín queda fijado (pin de 100vh) para que la coreografía tenga lugar
//   0.56-0.70  en el nodo central se abre un iris circular que revela la foto
//   0.55-0.80  la pista se DIVIDE en dos: las líneas base de las dos filas; cada fila se
//              enciende a medida que pasa la corriente (máscara desde el centro hacia
//              afuera + destello en el frente que se apaga a su color normal)
//   0.70-0.92  la firma "Alejandra" se dibuja sola (stroke-dashoffset)
//   0.86-1.00  las pistas se asientan (bajan de intensidad)
// Rendimiento: solo transform / opacity / clip-path / stroke-dashoffset. Las medidas de
// layout se toman SOLO al cambiar de tamaño o en el refresh de ScrollTrigger; por frame
// solo se escriben estilos. El rAF corre únicamente mientras la sección está a la vista.
// Con prefers-reduced-motion: sin pin, todo en su estado final y un fundido simple.

const NIGHT = '#0A1A2B';
const BONE = '#ECE8F2';
const ACCENT = '#F230D2';

const DOES = ['Desarrollo web', 'Agentes de IA', 'Automatización', 'Diseño', 'Electrónica', 'Robótica educativa'];
const LABEL = 'Lo que hago';
// fila inferior: HABILIDADES BLANDAS, solo las que el CV respalda:
//  - liderazgo: "liderazgo técnico" (SOSNET) y "capacidad para liderar proyectos" (perfil)
//  - trabajo en equipo: "Trabajo en equipo bajo metodología SCRUM" (First-switch)
//  - resolución de conflictos / gestión de equipos: curso "Habilidades Supervisorias"
//  - perfil analítico, orientada a resultados, trabajo bajo presión: perfil profesional
//  - creatividad e innovación: Primer Lugar en Creatividad e Innovación, ExpoCILARA 2025
const SOFT = [
  'Liderazgo',
  'Trabajo en equipo',
  'Resolución de conflictos',
  'Perfil analítico',
  'Gestión de equipos',
  'Orientada a resultados',
  'Creatividad e innovación',
  'Trabajo bajo presión',
];
// largo del trazo de la firma (stroke-dasharray); la fuente de grafiti tiene contornos largos
const SIGN_DASH = 3600;
const FALLBACK_POSE = '/hero-still/cover.webp';
const SIGN_X = 300;
const SIGN_Y = 150;
// atributos comunes a todas las capas de la firma (textLength fija el ancho con cualquier fuente)
const SIGN_TEXT = { textAnchor: 'middle', fontSize: 150, textLength: 520, lengthAdjust: 'spacingAndGlyphs' } as const;
const SIGN_DEPTH = ['#1F0420', '#2E0630', '#410A42', '#560E54', '#6E1468', '#87197D'];
// fuente "street" de la firma (Google Fonts), se pide una sola vez

// cuánto empuja el scroll (px recorridos de punta a punta de la sección) y la deriva (px/s)
const PUSH = 720;
const DRIFT = 72; // (antes 26: la dueña pidió filas más rápidas y legibles)
// alto extra (px) por encima de la línea de horizonte en el lienzo superior
const UP_PAD = 30;

const CSS = `
.fb-serif { font-family: "Gloock", Georgia, serif; font-weight: 400; letter-spacing: -0.02em; }
.fb-sans { font-family: "Mona Sans", "Inter", sans-serif; font-weight: 850; font-variation-settings: "wdth" 80, "wght" 850; letter-spacing: -0.025em; }
.fb-row { font-size: clamp(2.8rem, 6.6vw, 8rem); line-height: 0.9; }
.fb-label { font-family: "Mona Sans", "Inter", sans-serif; font-variation-settings: "wdth" 100, "wght" 650; letter-spacing: 0.32em; }

/* foto: vertical, centrada, por delante de las filas */
.fb-photo { width: clamp(280px, 33vw, 600px); aspect-ratio: 4 / 5.1; } /* más grande (pedido explícito) */
@media (max-width: 640px) {
  /* En celular ajustamos proporciones para no sofocar la pantalla ni desbordar la firma ni las filas */
  .fb-photo { width: clamp(200px, 58vw, 260px); }
  .fb-row { font-size: clamp(1.75rem, 7.5vw, 2.6rem); }
}

/* firma: el nombre aparece completo junto a la foto */
.fb-sign text { font-family: "Sedgwick Ave Display", "Permanent Marker", "Caveat", cursive; font-weight: 400; }
.fb-sign .fb-stroke { stroke-dasharray: ${SIGN_DASH}; stroke-dashoffset: 0; fill: transparent; }
.fb-sign .fb-fill { opacity: 0; }

/* figura recortada sin tarjeta: bordes que se funden (por si el recorte toca los lados) */
.fb-fig-mask {
  -webkit-mask-image: linear-gradient(to right, transparent 0%, #000 10%, #000 90%, transparent 100%), linear-gradient(to bottom, #000 74%, transparent 99%);
  -webkit-mask-composite: source-in;
  mask-image: linear-gradient(to right, transparent 0%, #000 10%, #000 90%, transparent 100%), linear-gradient(to bottom, #000 74%, transparent 99%);
  mask-composite: intersect;
}
.fb-pose { position: absolute; inset: 0; background-repeat: no-repeat; transition: opacity 320ms ease; }

/* movimiento reducido: estado final con un fundido simple */
.fb-rm { opacity: 0; transition: opacity 700ms ease; }
.fb-rm.fb-in { opacity: 1; }
`;

// ---------- geometría de las pistas (en px; y = 0 es el borde superior del banderín) ----------
type Pt = [number, number];
// 'tail': prolongación de la bajada por DEBAJO del nodo central (solo escritorio) para que
// palabras y tarjetas usen todo el alto de la pantalla; se apaga cuando salen.
type Route = 'hzL' | 'hzR' | 'feed' | 'tail' | 'topL' | 'topR' | 'stub' | 'botL' | 'botR';
const ROUTES: Route[] = ['hzL', 'hzR', 'feed', 'tail', 'stub', 'topL', 'topR', 'botL', 'botR'];
const N_PADS = 9;

// ---------- ritmo del scroll ----------
// El banderín sube 100vh y luego queda fijo PIN_VH. El progreso de la coreografía
// P ya no es lineal con el scroll: tiene una MESETA dentro del pin en la que palabras,
// tarjetas y gota ya están completas y quietas, para leerlas sin tener que frenar a mitad
// de un movimiento. En celulares acortamos PIN_VH a 1.3 para que no haya que hacer tanto scroll (pedido explícito).
const getPinVh = () => (typeof window !== 'undefined' && window.innerWidth < 768 ? 1.3 : 2.5);

const getPace = (pinVh: number): [number, number][] => {
  if (pinVh < 2.0) {
    // En celular: recorrido ágil hacia la foto y firma de Alejandra
    return [
      [0, 0],
      [0.6, 0.4],     // entra rápido la corriente
      [0.85, 0.53],   // entran las habilidades técnicas
      [1.1, 0.54],    // meseta breve
      [1.6, 0.74],    // transición a filas y foto
      [1 + pinVh, 1], // foto asentada y firma
    ];
  }
  return [
    [0, 0],
    [1, 0.4],
    [1.3, 0.53],
    [1.8, 0.54],
    [3.0, 0.74],
    [1 + pinVh, 1],
  ];
};

const paceP = (s: number, pinVh: number = 2.5) => {
  const pace = getPace(pinVh);
  for (let i = 1; i < pace.length; i++) {
    const [s0, p0] = pace[i - 1];
    const [s1, p1] = pace[i];
    if (s <= s1) return p0 + (p1 - p0) * clamp01((s - s0) / (s1 - s0));
  }
  return 1;
};
// la corriente baja (bajada + prolongación) entre estos P
const DESC0 = 0.17;
const DESC1 = 0.46;
// TRASPASO a filas + foto: entre HAND0 y HAND1 palabras, tarjetas y gota son absorbidas
// por la pista hasta el nodo central (ver FlagExtras); en HAND1 el nodo estalla y salen
// las dos filas a tamaño completo mientras el iris revela la foto.
const HAND0 = 0.54;
const HAND1 = 0.655;
const easeOut3 = (t: number) => 1 - Math.pow(1 - t, 3);

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const ramp = (v: number, a: number, b: number) => clamp01((v - a) / (b - a));
const easeIO = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const easeOut = (t: number) => 1 - (1 - t) * (1 - t);
const segLen = (a: Pt, b: Pt) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const polyLen = (p: Pt[]) => p.reduce((s, q, i) => (i ? s + segLen(p[i - 1], q) : 0), 0);
const polyD = (p: Pt[]) => p.map((q, i) => `${i ? 'L' : 'M'}${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join(' ');
// punto a la distancia s del inicio de la polilínea
const pointAt = (p: Pt[], s: number): Pt => {
  let acc = 0;
  for (let i = 1; i < p.length; i++) {
    const l = segLen(p[i - 1], p[i]);
    if (acc + l >= s || i === p.length - 1) {
      const k = l ? clamp01((s - acc) / l) : 0;
      return [p[i - 1][0] + (p[i][0] - p[i - 1][0]) * k, p[i - 1][1] + (p[i][1] - p[i - 1][1]) * k];
    }
    acc += l;
  }
  return p[0];
};

// Progreso de cada tramo de pista según P (la "partitura" de la corriente)
// fk = fracción del largo total de la bajada que es 'feed' (1 si no hay prolongación)
const routeT = (r: Route, P: number, fk = 1) => {
  switch (r) {
    case 'hzL':
    case 'hzR':
      return easeIO(ramp(P, 0.02, 0.17));
    case 'feed':
    case 'tail': {
      // un solo recorrido suavizado a lo largo de bajada + prolongación
      const u = easeIO(ramp(P, DESC0, DESC1));
      if (r === 'feed') return fk >= 1 ? u : Math.min(1, u / fk);
      // en el traspaso la corriente de la prolongación VUELVE al nodo (se recoge hacia arriba)
      return fk >= 1 ? 0 : clamp01((u - fk) / (1 - fk)) * (1 - easeIO(ramp(P, HAND1 - 0.03, HAND1)));
    }
    case 'stub':
      return ramp(P, HAND1 - 0.004, HAND1 + 0.012);
    case 'topL':
    case 'topR':
      // estallido: las líneas base salen disparadas del nodo hacia los bordes
      return easeOut(ramp(P, HAND1, HAND1 + 0.06));
    default:
      return easeOut(ramp(P, HAND1 + 0.01, HAND1 + 0.07));
  }
};

// Las pistas se dibujan en DOS lienzos SVG con el mismo sistema de coordenadas: uno por
// encima del banderín (sobre el manifiesto, hasta la línea de horizonte) y otro dentro
// del banderín. Cada lienzo recorta lo suyo, así el trazado es continuo en la costura.
const Traces: React.FC = () => (
  <>
    {ROUTES.map((r) => (
      <g key={r}>
        {/* pista sin corriente (casi invisible) */}
        <path data-b={r} fill="none" stroke={BONE} strokeOpacity="0.13" strokeWidth="1" />
        {/* halo de la pista encendida (trazo ancho y tenue, sin filtros) */}
        <path data-g={r} fill="none" stroke={ACCENT} strokeOpacity="0.16" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
        {/* pista encendida */}
        <path data-l={r} fill="none" stroke={ACCENT} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        {/* cabeza del pulso: tramo corto blanco caliente + punto */}
        <path data-h={r} fill="none" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" opacity="0" />
        <circle data-o={r} r="11" fill={ACCENT} opacity="0" />
        <circle data-d={r} r="2.8" fill="#FFFFFF" opacity="0" />
      </g>
    ))}
    {/* vías / pads en los quiebres de la pista (se encienden al pasar la corriente) */}
    {Array.from({ length: N_PADS }, (_, i) => (
      <circle key={i} data-pad={i} r="3.4" fill={NIGHT} stroke={BONE} strokeOpacity="0.3" strokeWidth="1" />
    ))}
    {/* nodo central: anillo que se expande cuando llega la corriente */}
    <circle data-ring="" r="0" fill="none" stroke={ACCENT} strokeWidth="1.5" opacity="0" />
  </>
);

// separador entre frases: un rombo pequeño, en el acento en ambas filas
const Sep: React.FC = () => (
  <span aria-hidden className="inline-block px-[0.9vw] text-[0.3em] translate-y-[-0.35em]" style={{ color: ACCENT }}>
    ✦
  </span>
);

type RowProps = {
  items: string[];
  serif?: boolean;
  flashColor: string;
  litRef: React.RefObject<HTMLDivElement>;
  flashRef: React.RefObject<HTMLDivElement>;
  rowRef: React.RefObject<HTMLDivElement>;
  flashRowRef: React.RefObject<HTMLDivElement>;
};

// Una fila gigante: la tira "encendida" (recortada desde el centro hacia afuera) y una
// copia del destello por encima, recortada a dos bandas finas que siguen los frentes de
// la corriente. Ambas tiras se mueven igual (mismo transform).
const Row: React.FC<RowProps> = ({ items, serif, flashColor, litRef, flashRef, rowRef, flashRowRef }) => {
  // una "tira" con todas las frases; se repite 3 veces para que el bucle no deje huecos
  const strip = (k: number) => (
    <div key={k} className="flex shrink-0 items-center">
      {items.map((t, i) => (
        <React.Fragment key={i}>
          <span className="whitespace-nowrap px-[1.1vw]">{t}</span>
          <Sep />
        </React.Fragment>
      ))}
    </div>
  );
  const cls = `fb-row flex w-max uppercase ${serif ? 'fb-serif' : 'fb-sans'}`;
  return (
    <div className="relative overflow-hidden" aria-hidden>
      <div ref={litRef} style={{ opacity: 0 }}>
        <div ref={rowRef} className={cls} style={{ color: serif ? ACCENT : BONE, willChange: 'transform', transform: 'translate3d(0,0,0)' }}>
          {[0, 1, 2].map(strip)}
        </div>
      </div>
      <div ref={flashRef} className="absolute inset-0" style={{ opacity: 0 }}>
        <div ref={flashRowRef} className={cls} style={{ color: flashColor, willChange: 'transform', transform: 'translate3d(0,0,0)' }}>
          {[0, 1, 2].map(strip)}
        </div>
      </div>
    </div>
  );
};

// poses decodificadas (se guardan para que el navegador no las descarte)
const posesKeep: HTMLImageElement[] = [];

// módulo positivo (el empuje del scroll puede volver hacia atrás)
const mod = (n: number, m: number) => ((n % m) + m) % m;

export const FlagBand: React.FC = () => {
  const liteDetailsRef = useRef<HTMLDivElement>(null);
  const extrasRef = useRef<ExtrasApi | null>(null);

  const wrapRef = useRef<HTMLDivElement>(null);
  const upRef = useRef<HTMLDivElement>(null);
  const upSvgRef = useRef<SVGSVGElement>(null);
  const secSvgRef = useRef<SVGSVGElement>(null);
  const secRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const dashLRef = useRef<HTMLSpanElement>(null);
  const dashRRef = useRef<HTMLSpanElement>(null);
  const r1 = useRef<HTMLDivElement>(null);
  const r1f = useRef<HTMLDivElement>(null);
  const lit1 = useRef<HTMLDivElement>(null);
  const fl1 = useRef<HTMLDivElement>(null);
  const r2 = useRef<HTMLDivElement>(null);
  const r2f = useRef<HTMLDivElement>(null);
  const lit2 = useRef<HTMLDivElement>(null);
  const fl2 = useRef<HTMLDivElement>(null);
  const figRef = useRef<HTMLElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLDivElement>(null);
  const signStrokeRef = useRef<SVGTextElement>(null);
  const signFillRef = useRef<SVGGElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const posesRef = useRef<HTMLDivElement>(null);
  // poses recortadas (fondo transparente) de public/poses/poses.json; sin manifiesto,
  // se usa el retrato de la portada
  const [poses, setPoses] = React.useState<string[]>(() => [isLite() ? '/poses/pose-1.webp' : FALLBACK_POSE]);
  const poseIdx = useRef(0);

  // manifiesto de poses: ["pose-1.webp", ...]. Si falta (o el servidor devuelve el
  // index.html del SPA en su lugar), se queda el retrato de respaldo. Las poses se
  // precargan para que el cambio con el mouse no parpadee.
  useEffect(() => {
    if (isLite()) return;
    let alive = true;
    // calentamiento de efectos de pintura de las secciones de abajo (detrás de la carga)
    const offPaint = registerPaintWarmup();
    let finish: () => void = () => {};
    const posesDone = new Promise<void>((r) => (finish = r));
    const offPoses = registerWarmup('flag-poses', () => posesDone);
    fetch('/poses/poses.json', { cache: 'no-cache' })
      .then((r) => (r.ok ? r.text() : ''))
      .then((txt) => {
        let list: unknown;
        try {
          list = JSON.parse(txt);
        } catch {
          return;
        }
        // admite ["a.webp", ...] o { "poses": [...] }
        if (list && !Array.isArray(list) && typeof list === 'object') list = (list as { poses?: unknown }).poses;
        if (!Array.isArray(list)) return;
        const srcs = list
          .map((f) => (typeof f === 'string' ? f : f && typeof f === 'object' ? ((f as { src?: string; file?: string }).src ?? (f as { file?: string }).file) : undefined))
          .filter((f): f is string => typeof f === 'string' && f.length > 0)
          .map((f) => (f.startsWith('/') ? f : `/poses/${f}`));
        if (!alive || !srcs.length) return;
        // precarga + verificación: solo se usan las poses que de verdad decodifican (un
        // servidor puede responder 200 con HTML para un archivo que no conoce)
        return Promise.all(
          srcs.map(
            (src) =>
              new Promise<string | null>((res) => {
                const im = new Image();
                im.decoding = 'async';
                posesKeep.push(im);
                // decodificada de antemano: el cambio de pose con el mouse no tiene que decodificar
                im.onload = () => (im.decode ? im.decode().then(() => res(im.naturalWidth > 0 ? src : null), () => res(im.naturalWidth > 0 ? src : null)) : res(im.naturalWidth > 0 ? src : null));
                im.onerror = () => res(null);
                im.src = src;
              })
          )
        ).then((ok) => {
          const good = ok.filter((x): x is string => !!x);
          if (!alive || !good.length) return;
          poseIdx.current = 0;
          setPoses(good);
        });
      })
      .catch(() => {})
      .then(() => finish());
    return () => {
      alive = false;
      offPaint();
      offPoses();
      finish();
    };
  }, []);

  // muestra la pose i (fundido de 150 ms vía CSS); sin re-render de React
  const showPose = (i: number) => {
    const host = posesRef.current;
    if (!host || i === poseIdx.current) return;
    const kids = host.children;
    if (i >= kids.length) return;
    (kids[poseIdx.current] as HTMLElement | undefined)?.style.setProperty('opacity', '0');
    (kids[i] as HTMLElement).style.opacity = '1';
    poseIdx.current = i;
  };
  // Cada vez que el mouse ENTRA en la figura (o se toca / hace clic) pasa a la SIGUIENTE
  // pose y SE QUEDA así (pedido explícito: que se note que son distintas e ir rotando, no
  // que vuelva sola al salir). Un pequeño "latido" de escala marca el cambio.
  const nextPose = () => {
    const host = posesRef.current;
    const n = host?.children.length ?? 1;
    if (!host || n < 2) return;
    showPose((poseIdx.current + 1) % n);
    host.animate?.(
      [{ transform: 'scale(1)' }, { transform: 'scale(1.035)' }, { transform: 'scale(1)' }],
      { duration: 420, easing: 'cubic-bezier(0.3,1.4,0.5,1)' }
    );
  };

  useEffect(() => {
    const wrap = wrapRef.current;
    const up = upRef.current;
    const upSvg = upSvgRef.current;
    const secSvg = secSvgRef.current;
    const sec = secRef.current;
    const stage = stageRef.current;
    const label = labelRef.current;
    const a = r1.current;
    const af = r1f.current;
    const b = r2.current;
    const bf = r2f.current;
    const l1 = lit1.current;
    const f1 = fl1.current;
    const l2 = lit2.current;
    const f2 = fl2.current;
    const fig = figRef.current;
    const box = boxRef.current;
    const img = imgRef.current;
    const sStroke = signStrokeRef.current;
    const sFill = signFillRef.current;
    if (!wrap || !up || !upSvg || !secSvg || !sec || !stage || !label || !a || !af || !b || !bf || !l1 || !f1 || !l2 || !f2 || !fig || !box || !img || !sStroke || !sFill)
      return;

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const chars = Array.from(label.querySelectorAll<HTMLSpanElement>('[data-ch]'));
    const dashL = dashLRef.current;
    const dashR = dashRRef.current;

    // elementos de las pistas en AMBOS lienzos (mismo atributo => mismo estado)
    const q = (sel: string) => Array.from(wrap.querySelectorAll<SVGElement>(sel));
    const els = Object.fromEntries(
      ROUTES.map((r) => [
        r,
        {
          base: q(`[data-b="${r}"]`),
          glow: q(`[data-g="${r}"]`),
          lit: q(`[data-l="${r}"]`),
          head: q(`[data-h="${r}"]`),
          halo: q(`[data-o="${r}"]`),
          dot: q(`[data-d="${r}"]`),
        },
      ])
    ) as Record<Route, Record<'base' | 'glow' | 'lit' | 'head' | 'halo' | 'dot', SVGElement[]>>;
    const pads = Array.from({ length: N_PADS }, (_, i) => q(`[data-pad="${i}"]`));
    const rings = q('[data-ring]');
    // Escritura con caché por elemento: setAttribute con el MISMO valor igual invalida el
    // estilo del nodo (medido: los ~40 círculos de las pistas se recalculaban en cada cuadro
    // de la coreografía aunque su valor no cambiara). Solo se toca el DOM si el valor cambió.
    const attrCache = new WeakMap<Element, Map<string, string>>();
    const setAttrC = (el: Element, name: string, v: string) => {
      let m = attrCache.get(el);
      if (!m) attrCache.set(el, (m = new Map()));
      if (m.get(name) === v) return;
      m.set(name, v);
      el.setAttribute(name, v);
    };
    const setAll = (list: SVGElement[], name: string, v: string) => {
      for (const el of list) setAttrC(el, name, v);
    };

    // ---------- medidas (solo en montaje / resize / refresh) ----------
    let wa = 1;
    let wb = 1;
    const geo = {
      W: 1,
      G: 160, // distancia del horizonte del manifiesto al borde superior del banderín
      routes: {} as Record<Route, { p: Pt[]; L: number }>,
      pads: [] as { at: Route; s: number; x: number; y: number; big?: boolean; hide?: boolean }[],
      fk: 1, // fracción de la bajada total que es 'feed' (el resto es la prolongación)
      labelS0: 0,
      labelS1: 1,
      yT: 0,
      figBaseTop: 0,
      boxW: 1,
      boxH: 1,
      horizonY: 0, // y del horizonte dentro del escenario del manifiesto (origen de la escala)
      signLift: 0, // cuánto se sube la firma para que su trazo más bajo (la "j") no se recorte
    };
    let recede: HTMLElement[] = [];
    // estado del bucle (declarado antes de crear los ScrollTrigger: su onRefresh puede
    // dispararse en el mismo create)
    let P = reduce ? 1 : 0; // progreso MOSTRADO (suavizado hacia Pt cada cuadro)
    let Pt = P; // progreso objetivo, según el scroll
    let p = 0; // progreso de la sección (para el empuje de las filas y el paralaje de la foto)
    let lastP = -1;
    let secTop = 0; // borde superior real del banderín en la ventana (px), según el scroll
    let shA = reduce ? 1 : 0; // disparo de la fila superior (0..1)
    let shB = reduce ? 1 : 0; // disparo de la fila inferior (0..1)
    let drift = 0;
    let last = 0;
    let raf = 0;
    let on = false;

    const measure = () => {
      wa = Math.max(1, a.scrollWidth / 3);
      wb = Math.max(1, b.scrollWidth / 3);

      const vh = window.innerHeight;
      const anchor = document.getElementById('manifiesto');
      const H = anchor?.offsetHeight || vh;
      // el fondo del manifiesto es "-inset-6" (24 px de más por lado) y su horizonte está al
      // 80.5 % de ese fondo: desde el horizonte hasta el borde inferior quedan G px
      geo.horizonY = 0.805 * (H + 48) - 24;
      geo.G = H - geo.horizonY;
      const W = sec.clientWidth || window.innerWidth;
      const Hs = sec.clientHeight || vh;
      geo.W = W;

      const sr = sec.getBoundingClientRect();
      const lr = label.getBoundingClientRect();
      const ra = l1.parentElement!.getBoundingClientRect();
      const rb = l2.parentElement!.getBoundingClientRect();
      const st = stage.getBoundingClientRect();
      const ly0 = lr.top - sr.top;
      const ly1 = lr.bottom - sr.top;
      const cx = W / 2;
      const hy = -geo.G;
      // línea base: el borde inferior de cada fila (las filas van muy apretadas)
      const yT = ra.bottom - sr.top - 2;
      const yB = rb.bottom - sr.top - 2;
      geo.yT = yT;

      // la bajada esquiva el rótulo por la izquierda con dos quiebres a 45°
      let J = lr.width / 2 + 30;
      const room = ly0 - 10 - (hy + 22); // lugar vertical para el primer quiebre
      if (J > room) J = Math.max(20, room);
      const feed: Pt[] = [
        [cx, hy],
        [cx, hy + 22],
        [cx - J, hy + 22 + J],
        [cx - J, ly1 + 16],
        [cx, ly1 + 16 + J],
        [cx, yT],
      ];
      // escritorio: la bajada sigue de largo por debajo del nodo central hasta casi el pie
      // de la pantalla; así palabras y tarjetas se reparten en TODO el alto (centradas) en
      // vez de amontonarse en la parte de arriba. En pantallas angostas no hay prolongación.
      const yEnd = W >= 900 ? Math.max(yB + 40, Hs * 0.9) : yT;
      const mk = (p: Pt[]) => ({ p, L: Math.max(1, polyLen(p)) });
      geo.routes = {
        hzL: mk([[W * 0.08, hy], [cx, hy]]),
        hzR: mk([[W * 0.92, hy], [cx, hy]]),
        feed: mk(feed),
        tail: mk([[cx, yT], [cx, yEnd]]),
        stub: mk([[cx, yT], [cx, yB]]),
        topL: mk([[cx, yT], [-8, yT]]),
        topR: mk([[cx, yT], [W + 8, yT]]),
        botL: mk([[cx, yB], [-8, yB]]),
        botR: mk([[cx, yB], [W + 8, yB]]),
      };
      // distancia recorrida sobre la bajada hasta cada quiebre
      const cum: number[] = [0];
      for (let i = 1; i < feed.length; i++) cum.push(cum[i - 1] + segLen(feed[i - 1], feed[i]));
      geo.pads = [
        { at: 'hzL', s: 0, x: W * 0.08, y: hy },
        { at: 'hzR', s: 0, x: W * 0.92, y: hy },
        { at: 'feed', s: 0, x: cx, y: hy, big: true },
        { at: 'feed', s: cum[2], x: feed[2][0], y: feed[2][1] },
        { at: 'feed', s: cum[3], x: feed[3][0], y: feed[3][1] },
        { at: 'feed', s: cum[4], x: feed[4][0], y: feed[4][1] },
        { at: 'feed', s: cum[5], x: cx, y: yT, big: true },
        { at: 'stub', s: segLen([cx, yT], [cx, yB]), x: cx, y: yB },
        { at: 'tail', s: yEnd - yT, x: cx, y: yEnd, hide: yEnd <= yT },
      ];
      const tailL = yEnd > yT ? yEnd - yT : 0;
      geo.fk = geo.routes.feed.L / (geo.routes.feed.L + tailL);
      // tramo de la bajada que pasa junto al rótulo (de su borde superior al inferior)
      geo.labelS0 = cum[2] + Math.max(0, ly0 - feed[2][1]);
      geo.labelS1 = cum[2] + Math.max(0, ly1 - feed[2][1]);

      // foto: posición base (sin el paralaje). El <figure> va centrado con translate(-50%,-50%)
      geo.boxW = fig.offsetWidth;
      geo.boxH = fig.offsetHeight;
      geo.figBaseTop = st.top - sr.top + st.height / 2 - geo.boxH / 2;

      // firma: si su parte más baja (el rabo de la "j") quedaría por debajo del borde del
      // banderín (que recorta con overflow:hidden), se sube lo justo. Medida en unidades del
      // SVG (getBBox no incluye transformaciones) + margen por la rotación, el paralaje de la
      // foto y los saltos de las letras con el mouse.
      const signSvg = fig.querySelector<SVGSVGElement>('svg.fb-sign');
      if (signSvg) {
        let bottomU = 200;
        try {
          const bb = sStroke.getBBox();
          if (bb.height > 0) bottomU = bb.y + bb.height;
        } catch {
          /* sin layout todavía: se usa el valor por defecto */
        }
        const sw = geo.boxW * 1.28;
        const k = sw / 600;
        const svgTop = geo.boxH * 1.1 - 220 * k; // bottom: -10 % del alto de la figura
        const lowest = geo.figBaseTop + svgTop + bottomU * k + sw * 0.5 * Math.sin((7 * Math.PI) / 180) * 0.5 + 35 + 26;
        geo.signLift = Math.max(0, lowest - Hs);
        signSvg.style.transform = `translate3d(0, ${(-geo.signLift).toFixed(1)}px, 0) rotate(-7deg)`;
      }

      // lienzos: el superior cubre desde un poco arriba del horizonte hasta el banderín
      const upH = geo.G + UP_PAD;
      up.style.height = `${upH}px`;
      upSvg.setAttribute('viewBox', `0 ${(-upH).toFixed(1)} ${W} ${upH.toFixed(1)}`);
      secSvg.setAttribute('viewBox', `0 0 ${W} ${Hs}`);
      for (const r of ROUTES) {
        const { p, L } = geo.routes[r];
        const d = polyD(p);
        for (const k of ['base', 'glow', 'lit', 'head'] as const) setAll(els[r][k], 'd', d);
        setAll(els[r].glow, 'stroke-dasharray', `${L} ${L + 2}`);
        setAll(els[r].lit, 'stroke-dasharray', `${L} ${L + 2}`);
      }
      geo.pads.forEach((pd, i) => {
        setAll(pads[i], 'cx', pd.x.toFixed(1));
        setAll(pads[i], 'cy', pd.y.toFixed(1));
        setAll(pads[i], 'r', pd.big ? '5' : '3.4');
      });
      setAll(rings, 'cx', cx.toFixed(1));
      setAll(rings, 'cy', yT.toFixed(1));

      // texto del manifiesto: se aleja hacia el centro del horizonte
      recede = Array.from(document.querySelectorAll<HTMLElement>('[data-recede]'));
      for (const el of recede) el.style.transformOrigin = `50% ${geo.horizonY.toFixed(1)}px`;
      lastP = -1; // forzar repintado de las pistas con la geometría nueva

      // capa extra (palabras, tarjetas de vidrio, gota 3D): se cuelga de la misma bajada
      const totL = geo.routes.feed.L + tailL;
      extrasRef.current?.measure({
        W,
        H: Hs,
        vh,
        // bajada + prolongación (sigue siendo monótona en y)
        feed: yEnd > yT ? [...feed, [cx, yEnd]] : feed,
        yT,
        yEnd,
        // P en el que la corriente alcanza la distancia s (inversa de routeT('feed'/'tail'))
        pAtS: (s) => {
          const t = clamp01(s / totL);
          const u = t < 0.5 ? Math.sqrt(t / 2) : 1 - Math.sqrt(2 * (1 - t)) / 2;
          return DESC0 + u * (DESC1 - DESC0);
        },
      });
    };

    // ---------- progreso maestro y pin ----------
    const triggers: ScrollTrigger[] = [];

    if (!reduce) {
      const pokerHandoff = window.matchMedia(POKER_PIN_QUERY);
      // el banderín queda fijo getPinVh() para que la coreografía tenga lugar, con una
      // meseta de lectura en el medio. En escritorio sigue fijo mientras se apaga la escena.
      triggers.push(
        ScrollTrigger.create({
          trigger: sec,
          start: 'top top',
          end: () => `+=${window.innerHeight * (getPinVh() + (pokerHandoff.matches ? POKER_ENTRY_HOLD : 0))}`,
          pin: true,
          pinSpacing: true,
          anticipatePin: 1,
          invalidateOnRefresh: true,
        })
      );
      // P: desde que el banderín asoma por abajo (= termina el pin de la portada) hasta que
      // foto y firma quedan completas (100vh de llegada + pinVh fijo). El disparador es el envoltorio
      // (no se fija), así sus posiciones no dependen del pin. P sigue el ritmo de PACE.
      const onProg = (s: ScrollTrigger) => {
        const curPin = getPinVh();
        const sv = s.progress * (1 + curPin); // scroll recorrido, en vh
        Pt = paceP(sv, curPin);
        // fuera de la vista se salta directo; a la vista lo alcanza el bucle
        if (!on) P = Pt;
        secTop = Math.max(0, window.innerHeight * (1 - sv));
        kick();
      };
      triggers.push(
        ScrollTrigger.create({
          trigger: wrap,
          start: 'top bottom',
          end: () => `+=${window.innerHeight * (1 + getPinVh())}`,
          invalidateOnRefresh: true,
          onUpdate: onProg,
          onRefresh: onProg,
        })
      );
    }
    triggers.push(
      ScrollTrigger.create({
        trigger: sec,
        start: 'top bottom',
        end: 'bottom top',
        onUpdate: (s) => {
          p = s.progress;
        },
        onRefresh: (s) => {
          p = s.progress;
        },
      })
    );

    measure();
    let measureRaf = 0;
    let disposed = false;
    const queueMeasure = () => {
      if (disposed || measureRaf) return;
      measureRaf = requestAnimationFrame(() => {
        measureRaf = 0;
        measure();
      });
    };
    const ro = new ResizeObserver(queueMeasure);
    ro.observe(a);
    ro.observe(b);
    ro.observe(sec);
    document.fonts?.ready.then(queueMeasure).catch(() => {});
    ScrollTrigger.addEventListener('refresh', queueMeasure);

    // ---------- pintado de la corriente (solo cuando P cambia) ----------
    let recedeK = -1;
    const paintCurrent = () => {
      const details = liteDetailsRef.current;
      if (details) {
        // El bloque está entero durante la parada de lectura y cede el paso a la foto.
        const alpha = reduce ? 1 : ramp(P, 0.19, 0.44) * (1 - ramp(P, 0.55, HAND1 - 0.01));
        details.style.opacity = alpha.toFixed(3);
        details.style.visibility = alpha > 0.01 ? 'visible' : 'hidden';
      }
      // defensivo: no se pinta hasta que measure() armó TODAS las rutas (p. ej. tras un
      // recambio en caliente o si un refresh llega antes de la primera medida)
      if (!ROUTES.every((r) => geo.routes[r]) || geo.pads.some((pd) => !geo.routes[pd.at])) {
        lastP = -1;
        return;
      }
      const settle = 1 - 0.62 * ramp(P, 0.86, 1);
      const ghost = reduce ? 1 : ramp(P, 0, 0.03); // las pistas apagadas aparecen al salir del manifiesto

      // la prolongación se apaga cuando ya se recogió (no queda en la escena final)
      const tailFade = 1 - ramp(P, HAND1 - 0.01, HAND1 + 0.03);
      for (const r of ROUTES) {
        const { p: pts, L } = geo.routes[r];
        const t = reduce ? 1 : routeT(r, P, geo.fk);
        const s = t * L;
        const e = els[r];
        const fade = r === 'tail' ? tailFade : 1;
        setAll(e.base, 'opacity', (ghost * fade).toFixed(3));
        const litOff = (L - s).toFixed(2);
        setAll(e.lit, 'stroke-dashoffset', litOff);
        setAll(e.glow, 'stroke-dashoffset', litOff);
        setAll(e.lit, 'opacity', (t > 0 ? settle * fade : 0).toFixed(3));
        setAll(e.glow, 'opacity', (t > 0 ? settle * fade : 0).toFixed(3));
        // cabeza: visible solo mientras la corriente recorre el tramo
        const hv = reduce ? 0 : Math.min(1, t * 25, (1 - t) * 25);
        const hl = Math.min(70, L);
        setAll(e.head, 'stroke-dasharray', `${hl} ${L + hl + 10}`);
        setAll(e.head, 'stroke-dashoffset', (hl - s).toFixed(2));
        setAll(e.head, 'opacity', hv.toFixed(3));
        const [hx, hy] = pointAt(pts, s);
        const hxs = hx.toFixed(1);
        const hys = hy.toFixed(1);
        setAll(e.dot, 'cx', hxs);
        setAll(e.dot, 'cy', hys);
        setAll(e.halo, 'cx', hxs);
        setAll(e.halo, 'cy', hys);
        setAll(e.dot, 'opacity', hv.toFixed(3));
        setAll(e.halo, 'opacity', (hv * 0.3).toFixed(3));
      }

      // vías: se encienden cuando la corriente las alcanza
      geo.pads.forEach((pd, i) => {
        const { L } = geo.routes[pd.at];
        const on = reduce || routeT(pd.at, P, geo.fk) * L >= pd.s - 0.5;
        const visible = !pd.hide && ghost > 0 && !(pd.at === 'feed' && pd.s === 0 && !on && P < 0.01);
        const fade = pd.at === 'tail' ? tailFade : 1;
        setAll(pads[i], 'fill', on ? ACCENT : NIGHT);
        setAll(pads[i], 'stroke', on ? ACCENT : BONE);
        setAll(pads[i], 'opacity', visible ? ((on ? settle : ghost) * fade).toFixed(3) : '0');
      });

      // nodo central: cuando todo fue absorbido, ESTALLA (onda expansiva + pad que se infla)
      const ring = reduce ? 0 : ramp(P, HAND1 - 0.004, HAND1 + 0.05);
      setAll(rings, 'r', (6 + easeOut3(ring) * Math.max(140, geo.W * 0.16)).toFixed(1));
      setAll(rings, 'stroke-width', (1.2 + 5 * (1 - ring)).toFixed(2));
      setAll(rings, 'opacity', (ring > 0 && ring < 1 ? (1 - ring) * (1 - ring) * 0.95 : 0).toFixed(3));
      const pop = reduce ? 0 : Math.sin(Math.PI * ramp(P, HAND1 - 0.012, HAND1 + 0.02));
      if (pads[6]) setAll(pads[6], 'r', (5 + 7 * pop).toFixed(1));

      // rótulo: se enciende como un componente al pasar la corriente a su lado
      const feedS = (reduce ? 1 : routeT('feed', P, geo.fk)) * geo.routes.feed.L;
      const typing = reduce ? 1 : ramp(feedS, geo.labelS0 - 30, geo.labelS1 + 90);
      const n = chars.length;
      chars.forEach((ch, i) => {
        const k = typing * (n + 1.5) - i; // cuánto hace que se encendió este carácter
        let o = 0;
        if (k > 0) o = k < 0.25 ? 0.85 : k < 0.5 ? 0.2 : k < 0.8 ? 1 : k < 1.05 ? 0.35 : 1;
        ch.style.opacity = String(o);
        ch.style.color = k > 0 && k < 1.5 ? ACCENT : '';
      });
      if (dashL) dashL.style.transform = `scaleX(${ramp(typing, 0, 0.35).toFixed(3)})`;
      if (dashR) dashR.style.transform = `scaleX(${ramp(typing, 0.65, 1).toFixed(3)})`;

      // filas: salen del estallido A TAMAÑO COMPLETO, disparadas de costado en sentidos
      // opuestos (arriba hacia la izquierda, abajo hacia la derecha) y frenan hasta su deriva
      // normal; nunca se ven palabras recortadas. El corrimiento se suma a la deriva en el
      // bucle (con módulo, así la cinta nunca deja huecos). Entran "al rojo" (copia del
      // destello encima) y se enfrían a su color.
      shA = reduce ? 1 : ramp(P, HAND1, HAND1 + 0.065);
      shB = reduce ? 1 : ramp(P, HAND1 + 0.01, HAND1 + 0.075);
      const rowPaint = (lit: HTMLDivElement, flash: HTMLDivElement, t: number) => {
        lit.style.opacity = easeIO(ramp(t, 0, 0.35)).toFixed(3);
        flash.style.opacity = reduce || t <= 0 || t >= 1 ? '0' : (ramp(t, 0, 0.12) * (1 - ramp(t, 0.25, 0.85))).toFixed(3);
      };
      rowPaint(l1, f1, shA);
      rowPaint(l2, f2, shB);

      // foto: iris circular desde el nodo central
      // arranca cuando la onda del estallido ya se abrió y crece rápido detrás de ella
      // (así nunca se ve una "bolita" de foto en el nodo)
      const iris = reduce ? 1 : ramp(P, HAND1 + 0.006, HAND1 + 0.085);
      if (iris >= 1) box.style.clipPath = 'none';
      else {
        const ty = reduce ? 0 : (p - 0.5) * -70;
        const oy = geo.yT - (geo.figBaseTop + ty);
        // se abre como un PÁRPADO desde la línea de las filas: primero una ranura ancha y
        // finita, después crece en alto (nunca se ve un disco chico de foto en el nodo)
        const D = Math.hypot(geo.boxW, geo.boxH);
        const rx = D * (0.35 + 0.65 * easeOut3(iris));
        const ry = D * iris * iris;
        box.style.clipPath = `ellipse(${rx.toFixed(1)}px ${ry.toFixed(1)}px at 50% ${oy.toFixed(1)}px)`;
      }

      // halo magenta detrás de la figura: aparece con el iris
      if (glowRef.current) glowRef.current.style.opacity = (iris * 0.9).toFixed(3);

      // firma (estilo grafiti): el nombre aparece apenas sale la imagen (pedido explícito:
      // "tanto para telefono como para vista de escritorio debe aparecer el nombre apenas salga la imagen, no es una animacion de despues")
      sStroke.style.strokeDashoffset = '0';
      sStroke.style.opacity = iris.toFixed(3);
      sFill.style.opacity = iris.toFixed(3);
      sFill.style.transform = `translate3d(0, ${(6 * (1 - iris)).toFixed(2)}px, 0)`;

      // el manifiesto se aleja (solo mientras hay algo que mover)
      const k = reduce ? 0 : smoothstep(ramp(P, 0, 0.45));
      if (k !== recedeK) {
        recedeK = k;
        for (const el of recede) {
          if (k <= 0) {
            el.style.transform = '';
            el.style.opacity = '';
          } else {
            el.style.transform = `translate3d(0, ${(-k * 3).toFixed(2)}vh, 0) scale(${(1 - 0.1 * k).toFixed(4)})`;
            el.style.opacity = (1 - 0.7 * k).toFixed(3);
          }
        }
      }
    };

    // ---------- bucle (deriva de las filas + corriente); solo mientras se ve ----------
    const paint = (now: number) => {
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now;
      if (!reduce) drift += dt * DRIFT;

      // las cintas corren SOLAS y siempre al mismo ritmo (pedido explícito: no se detienen ni
      // dependen del scroll)
      const d = reduce ? wa * 0.18 : drift;
      // disparo del estallido: corrimiento extra que frena (easeOut) hasta 0
      const kA = easeOut3(shA);
      const kB = easeOut3(shB);
      const offA = (1 - kA) * geo.W * 0.9;
      const offB = (1 - kB) * geo.W * 0.9;
      const xa = -mod(d - offA, wa); // arriba: hacia la izquierda
      const xb = -wb + mod((reduce ? wb * 0.4 : drift) - offB, wb); // abajo: hacia la derecha
      // inclinación por velocidad mientras frenan
      const skA = shA > 0 && shA < 1 ? 10 * (1 - kA) : 0;
      const skB = shB > 0 && shB < 1 ? -10 * (1 - kB) : 0;
      const ta = `translate3d(${xa.toFixed(2)}px,0,0)${skA ? ` skewX(${skA.toFixed(2)}deg)` : ''}`;
      const tb = `translate3d(${xb.toFixed(2)}px,0,0)${skB ? ` skewX(${skB.toFixed(2)}deg)` : ''}`;
      a.style.transform = ta;
      af.style.transform = ta;
      b.style.transform = tb;
      bf.style.transform = tb;

      if (!reduce) {
        // foto: sube un poco más lenta que la página y la imagen se "asienta" (zoom suave)
        const k = p - 0.5;
        fig.style.transform = `translate3d(-50%, calc(-50% + ${(k * -70).toFixed(2)}px), 0)`;
        img.style.transform = `scale(${(1.1 - 0.1 * Math.min(1, Math.max(0, p * 1.6))).toFixed(4)})`;
      }
      // suavizado del progreso: aunque la rueda dé un tirón, la coreografía recorre todos
      // los estados intermedios (nunca un salto de un cuadro)
      if (P !== Pt) {
        const kk = dt > 0 ? 1 - Math.exp(-dt * 6) : 1;
        P += (Pt - P) * kk;
        if (Math.abs(Pt - P) < 0.0002) P = Pt;
      }
      if (P !== lastP) {
        lastP = P;
        paintCurrent();
      }
      // palabras / tarjetas / gota: cada cuadro (paralaje del mouse), escrituras con caché
      if (!reduce) extrasRef.current?.frame(now, P, secTop);
      if (!reduce && !isLite()) signFrame(dt, P);
    };

    // ---------- firma que reacciona al mouse ----------
    // Cada letra es un resorte: se inclina y "salta" hacia el cursor cuando está cerca, y
    // tiembla con la velocidad del mouse. La extrusión y la sombra se corren en sentido
    // contrario al cursor, como si el cursor fuera una luz. Se escriben atributos SVG
    // (rotate / dy por letra, x / y por capa) solo mientras los resortes se mueven.
    const signLayers = Array.from(fig.querySelectorAll<SVGTextElement>('.fb-sign text[data-sk]')).map((el) => ({
      el,
      k: Number(el.dataset.sk || 0),
      bx: Number(el.dataset.bx || 0),
      by: Number(el.dataset.by || 0),
    }));
    const NL = 'Alejandra'.length;
    const rot = new Float32Array(NL);
    const rotV = new Float32Array(NL);
    const lift = new Float32Array(NL);
    const liftV = new Float32Array(NL);
    const light = { x: 1.5, y: 1.9 }; // desplazamiento de la extrusión por capa
    const ptr = { x: -9999, y: -9999, vx: 0, vy: 0, lx: -9999, ly: -9999 };
    const onPtr = (e: PointerEvent) => {
      ptr.x = e.clientX;
      ptr.y = e.clientY;
    };
    if (!isLite()) window.addEventListener('pointermove', onPtr, { passive: true });
    let signAwake = true;
    const signFrame = (dt: number, P: number) => {
      if (dt <= 0) return;
      const vis = reduce ? 1 : ramp(P, HAND1 + 0.006, HAND1 + 0.085);
      // velocidad del mouse (px/s) para el temblor
      if (ptr.lx > -9000) {
        ptr.vx = (ptr.x - ptr.lx) / dt;
        ptr.vy = (ptr.y - ptr.ly) / dt;
      }
      const moved = ptr.x !== ptr.lx || ptr.y !== ptr.ly;
      ptr.lx = ptr.x;
      ptr.ly = ptr.y;
      if (vis <= 0 || (!moved && !signAwake)) return;
      // caja de la firma en la ventana, derivada de medidas cacheadas (sin leer layout):
      // la firma ocupa ~128 % del ancho de la figura, centrada, sobre su borde inferior
      // (secTop: borde real del banderín, lo calcula el ScrollTrigger de P)
      const ty = (p - 0.5) * -70;
      const sw = geo.boxW * 1.28;
      const sx0 = geo.W / 2 - sw / 2;
      const scy = secTop + geo.figBaseTop + ty + geo.boxH * 0.97 - geo.signLift;
      const dxC = ptr.x - geo.W / 2;
      const dyC = ptr.y - scy;
      const distC = Math.hypot(dxC, dyC);
      const near = clamp01(1 - distC / Math.max(260, sw * 1.1)); // 0 lejos … 1 encima
      const speed = Math.min(2500, Math.hypot(ptr.vx, ptr.vy));
      let energy = 0;
      for (let i = 0; i < NL; i++) {
        const gx = sx0 + sw * ((i + 0.5) / NL);
        const ddx = ptr.x - gx;
        const ddy = ptr.y - scy;
        const f = Math.exp(-(ddx * ddx + ddy * ddy) / (2 * 140 * 140)); // influencia de esta letra
        // se inclina hacia el cursor y se levanta hacia él
        const tRot = Math.max(-1, Math.min(1, ddx / 120)) * 16 * f;
        const tLift = Math.max(-1, Math.min(1, ddy / 90)) * 10 * f;
        // temblor: impulso proporcional a la velocidad del mouse cerca de la letra
        if (moved) rotV[i] += (ptr.vx / 2500) * 140 * f * (i % 2 ? 1 : -1);
        // resorte amortiguado (k = 170, c = 11)
        rotV[i] += ((tRot - rot[i]) * 170 - rotV[i] * 11) * dt;
        rot[i] += rotV[i] * dt;
        liftV[i] += ((tLift - lift[i]) * 170 - liftV[i] * 11) * dt;
        lift[i] += liftV[i] * dt;
        energy += Math.abs(rotV[i]) + Math.abs(liftV[i]) + Math.abs(tRot - rot[i]) + Math.abs(tLift - lift[i]);
      }
      // luz: la extrusión se aleja del cursor (largo fijo ~2.4 por capa)
      let lx = 1.5;
      let ly = 1.9;
      if (near > 0 && distC > 1) {
        lx = 1.5 * (1 - near) + (-dxC / distC) * 2.4 * near;
        ly = 1.9 * (1 - near) + (-dyC / distC) * 2.4 * near;
      }
      const kl = 1 - Math.exp(-dt * 8);
      light.x += (lx - light.x) * kl;
      light.y += (ly - light.y) * kl;
      energy += Math.abs(lx - light.x) + Math.abs(ly - light.y);
      signAwake = energy > 0.02 || speed > 1;
      // atributos por letra: rotate es absoluto por glifo; dy es relativo al anterior
      const rs = Array.from(rot, (v) => v.toFixed(2)).join(' ');
      let prev = 0;
      const ds = Array.from(lift, (v) => {
        const d = -v - prev;
        prev = -v;
        return d.toFixed(2);
      }).join(' ');
      for (const L of signLayers) {
        setAttrC(L.el, 'rotate', rs);
        setAttrC(L.el, 'dy', ds);
        if (L.k) {
          setAttrC(L.el, 'x', (SIGN_X + L.bx + L.k * light.x).toFixed(2));
          setAttrC(L.el, 'y', (SIGN_Y + L.by + L.k * light.y).toFixed(2));
        }
      }
    };

    const tick = (now: number) => {
      raf = 0;
      paint(now);
      if (on) raf = requestAnimationFrame(tick);
    };
    // fuera de la vista, un cambio de P (p. ej. volver al manifiesto) pinta UN cuadro
    function kick() {
      // (flecha diferida: tick se declara más abajo y kick puede llamarse antes)
      if (!raf) raf = requestAnimationFrame((t) => tick(t));
    }

    const io = new IntersectionObserver(
      ([e]) => {
        on = e.isIntersecting;
        if (on) {
          last = 0;
          kick();
          if (reduce) sec.classList.add('fb-in');
        }
      },
      { rootMargin: '120px 0px' }
    );
    io.observe(wrap);

    // primer pintado inmediato (sin esperar al IO) para que no haya salto
    paint(performance.now());
    refreshScroll();

    // ---------- scroll asistido (motor central: src/lib/assistedScroll.ts) ----------
    // Un gesto viaja a la siguiente parada a un ritmo fijo. Las paradas son momentos en que la
    // escena queda EN REPOSO y legible.
    //  - lectura: tarjetas y palabras completas (dentro de la meseta del ritmo, P ~ 0.54)
    //  - final: foto abierta + firma, antes del relevo a la mesa
    // Medidas en "vh de scroll" (sv) desde que el banderín asoma: el pin empieza en sv = 1 y
    // la foto queda completa en sv = 1 + getPinVh(). Los valores salen de los ScrollTrigger vivos.
    let unregisterStops: (() => void) | undefined;
    if (!reduce) {
      const pinST = triggers[0];
      const progST = triggers[1];
      // sv -> posición absoluta de scroll
      const svY = (sv: number) => (progST ? progST.start + sv * window.innerHeight : null);
      // El diseño corto (pin 1.3) solo existe bajo 768 px; entre 768 y 1023 px el perfil es
      // "móvil" pero el pin es el largo, por eso hay dos juegos de paradas y cada uno se
      // activa según el ancho (devolver null la desactiva).
      const corto = () => window.innerWidth < 768;
      // Curva de la entrada: rápida mientras el manifiesto sale y que FRENA cuando las líneas, el orbe y las
      // tarjetas se están formando (antes se comprimían en el último tramo y parecía que aparecían de golpe).
      const entradaLenta = (t: number) => 0.5 * (3 * t * t - 2 * t * t * t) + 0.5 * (1 - (1 - t) * (1 - t));
      unregisterStops = registerStops('flag', [
        // --- diseño corto (celulares) ---
        {
          id: 'flag-read-sm',
          y: () => (corto() ? svY(0.98) : null),
          desktop: 4.4,
          mobile: 4.0,
          easing: entradaLenta,
        },
        {
          id: 'flag-final-sm',
          y: () => (corto() && pinST ? pinST.end : null),
          desktop: 2.8,
          mobile: 2.4,
        },
        // --- diseño largo (escritorio y tabletas) ---
        {
          id: 'flag-read',
          // entrada a la sección: más lenta para que las líneas y las tarjetas se vayan formando
          y: () => (!corto() ? svY(1.55) : null),
          desktop: 6.0,
          mobile: 4.8,
          // al subir hacia la portada (único tramo asistido hacia arriba en escritorio): más ágil
          upDesktop: 2.6,
          easing: entradaLenta,
        },
        {
          id: 'flag-final',
          y: () => (!corto() && pinST ? pinST.start + window.innerHeight * getPinVh() : null),
          desktop: 3.2,
          mobile: 2.8,
        },
      ]);
    }

    return () => {
      unregisterStops?.();
      io.disconnect();
      window.removeEventListener('pointermove', onPtr);
      disposed = true;
      cancelAnimationFrame(measureRaf);
      ro.disconnect();
      ScrollTrigger.removeEventListener('refresh', queueMeasure);
      triggers.forEach((t) => t.kill());
      if (raf) cancelAnimationFrame(raf);
      for (const el of recede) {
        el.style.transform = '';
        el.style.opacity = '';
      }
    };
  }, []);

  return (
    <div ref={wrapRef} className="relative z-30">
      {/* ancla para enlaces o referencias a "lo que hago" */}
      <div id="lo-que-hago" className="absolute top-0 pointer-events-none" />
      {/* lienzo SUPERIOR: va por encima del final del manifiesto, desde su línea de
          horizonte hasta el borde del banderín. Un degradado al mismo azul noche funde la
          costura (sin corte recto ni banda más clara). */}
      <div ref={upRef} aria-hidden className="absolute inset-x-0 bottom-full pointer-events-none" style={{ height: 'calc(19.5vh + 15px)' }}>
        <div
          className="absolute inset-x-0 bottom-0"
          style={{ height: '62%', background: `linear-gradient(to bottom, rgba(10,26,43,0) 0%, ${NIGHT} 100%)` }}
        />
        <svg ref={upSvgRef} className="absolute inset-0 w-full h-full overflow-hidden" preserveAspectRatio="none">
          <Traces />
        </svg>
      </div>

      <section
        ref={secRef}
        id="banderin"
        data-nav-theme="dark"
        className={`relative overflow-hidden pointer-events-auto flex flex-col ${
          typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'fb-rm' : ''
        }`}
        style={{ minHeight: '100svh', background: NIGHT, color: BONE }}
      >
        <style>{CSS}</style>

        {/* filtro duotono: sombras azul noche → medios ciruela → luces blanco roto con toque magenta */}
        <svg aria-hidden width="0" height="0" className="absolute">
          <filter id="fb-duotone" colorInterpolationFilters="sRGB">
            <feColorMatrix type="saturate" values="0" />
            <feComponentTransfer>
              <feFuncR type="table" tableValues="0.039 0.19 0.66 0.98" />
              <feFuncG type="table" tableValues="0.102 0.15 0.50 0.95" />
              <feFuncB type="table" tableValues="0.169 0.30 0.68 0.97" />
            </feComponentTransfer>
          </filter>
        </svg>

        {/* pistas de circuito desvanecidas arriba y abajo: continuidad con las secciones vecinas */}
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, #000 25%, #000 75%, transparent 100%)',
            maskImage: 'linear-gradient(to bottom, transparent 0%, #000 25%, #000 75%, transparent 100%)',
          }}
        >
          <CircuitBg seed={31} count={26} stroke={BONE} opacity={0.04} />
        </div>

        <h2 className="sr-only">
          Lo que hago: {DOES.join(', ')}. Habilidades: {SOFT.join(', ')}.
        </h2>

        {/* rótulo chico arriba (como "MESSAGE FROM LANDO"): se enciende carácter a carácter */}
        <p
          aria-hidden
          className="fb-label relative z-20 pt-[11vh] md:pt-[13vh] text-center uppercase text-[0.72rem] md:text-[0.8rem] flex items-center justify-center"
          style={{ color: `${BONE}B3` }}
        >
          <span ref={labelRef} className="inline-flex items-center gap-3">
            <span ref={dashLRef} className="inline-block w-6 h-px" style={{ background: ACCENT, transformOrigin: '100% 50%', transform: 'scaleX(0)' }} />
            <span>
              {LABEL.split('').map((c, i) => (
                <span key={i} data-ch="" style={{ opacity: 0 }}>
                  {c === ' ' ? ' ' : c}
                </span>
              ))}
            </span>
            <span ref={dashRRef} className="inline-block w-6 h-px" style={{ background: ACCENT, transformOrigin: '0% 50%', transform: 'scaleX(0)' }} />
          </span>
        </p>

        {isLite() && <FlagExtrasLite ref={liteDetailsRef} />}

        {/* escenario: filas gigantes + pistas + foto por delante */}
        <div ref={stageRef} className="relative flex-1 flex flex-col justify-center py-[10vh] md:py-[8vh]">
          <div className="relative z-0 flex flex-col">
            <Row items={DOES} serif flashColor={BONE} litRef={lit1} flashRef={fl1} rowRef={r1} flashRowRef={r1f} />
            <Row items={SOFT} flashColor={ACCENT} litRef={lit2} flashRef={fl2} rowRef={r2} flashRowRef={r2f} />
          </div>

          <figure
            ref={figRef}
            className="fb-photo absolute z-10 left-1/2 top-1/2 m-0"
            style={{ transform: 'translate3d(-50%,-50%,0)', willChange: 'transform' }}
            onPointerEnter={(e) => e.pointerType === 'mouse' && nextPose()}
            onClick={nextPose}
          >
            {/* halo magenta suave detrás de la figura (sin tarjeta: la figura flota sobre la noche) */}
            <div
              ref={glowRef}
              aria-hidden
              className="absolute pointer-events-none"
              style={{
                inset: '-14% -30% -4% -30%',
                background: 'radial-gradient(48% 46% at 50% 46%, rgba(242,48,210,0.34) 0%, rgba(242,48,210,0.12) 45%, transparent 72%)',
                opacity: 0,
              }}
            />
            <div ref={boxRef} className="absolute inset-0 overflow-hidden" style={{ clipPath: 'circle(0px at 50% 50%)' }}>
              <div
                ref={imgRef}
                role="img"
                aria-label="Retrato de Alejandra Arismendi"
                className="fb-fig-mask absolute inset-0"
                style={{
                  filter: 'brightness(1.28) contrast(1.1) url(#fb-duotone)',
                  transform: 'scale(1.1)',
                  transformOrigin: '50% 40%',
                  willChange: 'transform',
                }}
              >
                {/* una capa por pose; el mouse sobre la figura elige cuál se ve (fundido 150 ms).
                    background-image (no <img>) porque en pruebas headless el <img> no arrancaba a cargar */}
                <div ref={posesRef} className="absolute inset-0">
                  {poses.map((src, i) => (
                    <div
                      key={src}
                      className="fb-pose"
                      style={{
                        backgroundImage: `url(${src})`,
                        // el retrato de respaldo es apaisado: se encuadra la cara; las poses nuevas se ajustan completas
                        backgroundSize: src === FALLBACK_POSE ? 'auto 104%' : 'contain',
                        backgroundPosition: src === FALLBACK_POSE ? '57% 0%' : '50% 100%',
                        opacity: i === 0 ? 1 : 0,
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* firma estilo grafiti: contorno blanco roto que se dibuja con el scroll; luego
                relleno magenta con brillo, extrusión en capas y sombra (efecto 3D de spray) */}
            <svg
              aria-hidden
              className="fb-sign absolute pointer-events-none overflow-visible"
              viewBox="0 0 600 220"
              style={{ left: '-14%', bottom: '-10%', width: '128%', transform: 'rotate(-7deg)' }}
            >
              <defs>
                <linearGradient id="fb-sign-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#FF9BEF" />
                  <stop offset="0.42" stopColor={ACCENT} />
                  <stop offset="1" stopColor="#B0129A" />
                </linearGradient>
                <filter id="fb-sign-shadow" x="-10%" y="-30%" width="120%" height="160%">
                  <feGaussianBlur stdDeviation="6" />
                </filter>
              </defs>
              <g ref={signFillRef} className="fb-fill">
                {/* sombra proyectada */}
                <text data-sk="6.5" x={SIGN_X + 9} y={SIGN_Y + 14} {...SIGN_TEXT} fill="#000" fillOpacity="0.55" filter="url(#fb-sign-shadow)">
                  Alejandra
                </text>
                {/* extrusión: copias desplazadas de oscuro (atrás) a ciruela (adelante) */}
                {SIGN_DEPTH.map((c, i) => {
                  const k = SIGN_DEPTH.length - i;
                  return (
                    <text key={i} data-sk={k} x={SIGN_X + k * 1.5} y={SIGN_Y + k * 1.9} {...SIGN_TEXT} fill={c} stroke={c} strokeWidth="5" strokeLinejoin="round">
                      Alejandra
                    </text>
                  );
                })}
                {/* contorno grueso oscuro (estructura del grafiti) + relleno con degradé */}
                <text data-sk="0" x={SIGN_X} y={SIGN_Y} {...SIGN_TEXT} fill="none" stroke="#2A0626" strokeWidth="7" strokeLinejoin="round">
                  Alejandra
                </text>
                <text data-sk="0" x={SIGN_X} y={SIGN_Y} {...SIGN_TEXT} fill="url(#fb-sign-fill)">
                  Alejandra
                </text>
                {/* brillo blanco roto arriba a la izquierda de cada trazo */}
                <text data-sk="0" data-bx="-1.6" data-by="-2" x={SIGN_X - 1.6} y={SIGN_Y - 2} {...SIGN_TEXT} fill="none" stroke={BONE} strokeOpacity="0.55" strokeWidth="1.1">
                  Alejandra
                </text>
              </g>
              <text
                ref={signStrokeRef}
                data-sk="0"
                className="fb-stroke"
                x={SIGN_X}
                y={SIGN_Y}
                {...SIGN_TEXT}
                stroke={BONE}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                Alejandra
              </text>
            </svg>
          </figure>
        </div>

        {/* lienzo de las pistas DENTRO del banderín: entre las filas y la foto */}
        <svg ref={secSvgRef} aria-hidden className="absolute inset-0 w-full h-full z-[5] pointer-events-none" preserveAspectRatio="none">
          <Traces />
        </svg>

        {/* vacíos laterales mientras baja la corriente: stack (izq.), gota de vidrio 3D y
            tarjetas de vidrio (der.). Se retiran antes de que entren filas y foto. */}
        {!isLite() && <FlagExtras apiRef={extrasRef} />}

        {/* Transición suave hacia la mesa de póker para evitar corte brusco en móvil */}
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-36 md:h-48 pointer-events-none z-30"
          style={{
            background: 'linear-gradient(to bottom, rgba(10,26,43,0) 0%, rgba(7,6,11,0.65) 55%, #07060B 100%)',
          }}
        />
      </section>
    </div>
  );
};

// suavizado tipo smoothstep
function smoothstep(t: number) {
  return t * t * (3 - 2 * t);
}
