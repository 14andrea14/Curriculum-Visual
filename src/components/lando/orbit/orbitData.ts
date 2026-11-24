import * as THREE from 'three';
import { PORTFOLIO_DATA } from '../../../data/portfolioData';

// Geometría de la ÓRBITA de sistemas técnicos (compartida por la escena 3D y
// por las etiquetas DOM que se proyectan encima). Todo se define en el plano
// LOCAL XY de cada anillo; el anillo se inclina (elipse en pantalla) y gira
// sobre su propia normal, así nodos y caminos viajan juntos sin recalcular nada.

export const ORBIT_COLORS = {
  night: '#0A1A2B',
  white: '#ECE8F2',
  accent: '#F230D2',
};

export const CORE_R = 0.55;
const RADII = [1.6, 2.3, 3.0, 3.7];
// inclinación de cada anillo: x aplana el círculo (elipse), z lo gira en pantalla
const TILTS: [number, number, number][] = [
  [1.02, 0.1, -0.34],
  [1.12, -0.12, 0.22],
  [1.06, 0.06, -0.1],
  [1.18, -0.08, 0.36],
];
// velocidad angular propia (rad/s): anillos internos un poco más rápidos
const SPINS = [0.07, -0.05, 0.04, -0.03];
// ángulo del nodo "hub" (la categoría) en cada anillo
const HUB_ANGLE = [0.35, 2.1, 3.9, 4.6];

export type OrbitTech = {
  id: string;
  name: string;
  cat: number;
  index: number;
  angle: number;
  local: THREE.Vector3;
};

export type OrbitPath = {
  id: string;
  cat: number;
  tech: number; // -1 = camino núcleo → categoría
  points: THREE.Vector3[];
  revealStart: number;
  revealDur: number;
};

export type OrbitCategory = {
  index: number;
  title: string;
  tag: string;
  radius: number;
  tilt: THREE.Euler;
  spin: number;
  hubAngle: number;
  hub: THREE.Vector3;
  techs: OrbitTech[];
};

const polar = (r: number, a: number) => new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0);

// arco en el plano local (muestreo denso para el tubo)
function arc(r: number, a0: number, a1: number, out: THREE.Vector3[]) {
  const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / 0.04));
  for (let i = 1; i <= n; i++) out.push(polar(r, a0 + ((a1 - a0) * i) / n));
}

// tramo recto subdividido (para que el degradado del shader avance parejo)
function seg(a: THREE.Vector3, b: THREE.Vector3, out: THREE.Vector3[]) {
  const n = Math.max(2, Math.ceil(a.distanceTo(b) / 0.06));
  for (let i = 1; i <= n; i++) out.push(a.clone().lerp(b, i / n));
}

function build() {
  const cats: OrbitCategory[] = [];
  const paths: OrbitPath[] = [];
  PORTFOLIO_DATA.skillCategories.forEach((c, ci) => {
    const R = RADII[ci];
    const hubA = HUB_ANGLE[ci];
    const n = c.skills.length;
    // tecnologías repartidas alrededor del anillo, dejando aire junto al hub
    const techs: OrbitTech[] = c.skills.map((s, j) => {
      const a = hubA + ((j + 1) * Math.PI * 2) / (n + 1);
      return { id: `${ci}-${j}`, name: s.name, cat: ci, index: j, angle: a, local: polar(R, a) };
    });
    cats.push({
      index: ci,
      title: c.title,
      tag: c.tag,
      radius: R,
      tilt: new THREE.Euler(TILTS[ci][0], TILTS[ci][1], TILTS[ci][2], 'ZYX'),
      spin: SPINS[ci],
      hubAngle: hubA,
      hub: polar(R, hubA),
      techs,
    });

    // 1) núcleo → categoría: pista de placa. Sale radial, gira por un arco a
    //    media distancia (con chaflanes a 45°) y vuelve a salir radial al hub.
    const a0 = hubA - 0.42;
    const rm = CORE_R + (R - CORE_R) * 0.5;
    const pts: THREE.Vector3[] = [polar(CORE_R + 0.04, a0)];
    seg(pts[0], polar(rm - 0.12, a0), pts);
    seg(pts[pts.length - 1], polar(rm, a0 + 0.12 / rm), pts); // chaflán
    arc(rm, a0 + 0.12 / rm, hubA - 0.12 / rm, pts);
    seg(pts[pts.length - 1], polar(rm + 0.12, hubA), pts); // chaflán
    seg(pts[pts.length - 1], polar(R - 0.07, hubA), pts);
    paths.push({ id: `core-${ci}`, cat: ci, tech: -1, points: pts, revealStart: ci * 0.07, revealDur: 0.26 });

    // 2) categoría → cada tecnología: buses paralelos por DENTRO del anillo,
    //    cada uno a su propio radio (como pistas de cobre en paralelo).
    techs.forEach((t, j) => {
      const half = (n + 1) / 2;
      const ccw = j + 1 <= half; // la primera mitad sale por un lado, el resto por el otro
      const lane = ccw ? j + 1 : n - j; // 1 = el bus más cercano al anillo
      const rb = R - 0.075 * lane - 0.04;
      // ángulos sin dar la vuelta: los del segundo lado se recorren hacia atrás
      const target = ccw ? t.angle : t.angle - Math.PI * 2;
      const dir = ccw ? 1 : -1;
      const ch = 0.07; // chaflán
      const p: THREE.Vector3[] = [polar(R - 0.07, hubA)];
      seg(p[0], polar(rb + ch, hubA), p);
      seg(p[p.length - 1], polar(rb, hubA + (dir * ch) / rb), p);
      arc(rb, hubA + (dir * ch) / rb, target - (dir * ch) / rb, p);
      seg(p[p.length - 1], polar(rb + ch, target), p);
      seg(p[p.length - 1], polar(R - 0.045, target), p);
      paths.push({
        id: `tech-${ci}-${j}`,
        cat: ci,
        tech: j,
        points: p,
        revealStart: 0.26 + ci * 0.08 + lane * 0.03,
        revealDur: 0.3,
      });
    });
  });
  return { cats, paths };
}

export const ORBIT = build();
export const TECH_COUNT = ORBIT.cats.reduce((s, c) => s + c.techs.length, 0);

// ---------- encuadre ----------
// Dónde vive la órbita dentro del escenario fijo (px CSS). La comparten la escena
// 3D (centrado y escala) y el fondo espacial (punto de fuga del salto warp), así
// el túnel de estrellas converge EXACTO en el núcleo al que "llegamos".
export function orbitFrame(W: number, H: number) {
  if (W >= 1024) {
    const L = W >= 1280 ? 410 : 330; // columna izquierda: título + leyenda
    const availW = W - L - 24;
    return { cx: L + availW / 2, cy: H / 2, availW, availH: H };
  }
  // tableta: título arriba, leyenda abajo
  const top = H * 0.22;
  const availH = H * 0.46;
  return { cx: W / 2, cy: top + availH / 2, availW: W - 48, availH };
}

// ---------- viaje (scroll) ----------
// Todo el recorrido de la sección sale de UN progreso de scroll:
//  e = entrada (la sección sube desde abajo, aún sin fijar)
//  q = tramo fijado (sticky) de la sección
// y se reparte en fases: estrellas pixeladas del juego → salto al hiperespacio →
// destello → llegada a la órbita → se encienden los circuitos → reposo.
export type Journey = {
  e: number;
  q: number;
  pixel: number; // 1 = estrellas pixel (mundo del juego) · 0 = estrellas reales
  warp: number; // 0..1 intensidad del hiperespacio (estelas)
  flash: number; // 0..1 destello al salir del salto
  travel: number; // avance acoplado al scroll (reversible)
  arrive: number; // 0..1 la órbita viene desde lejos hasta su sitio
  reveal: number; // 0..1 circuitos encendidos
  title: number; // 0..1 entrada del título
  ui: number; // 0..1 leyenda / etiquetas
  hud: number; // 0..1 lectura del salto
  // salida hacia la Formación (pizarra de post-its): la órbita colapsa en un punto de
  // luz que sube y se vuelve la LÁMPARA de la pizarra (arriba al centro); las estrellas
  // se apagan y el espacio queda en el tono del escritorio (#12161F)
  collapse: number;
  point: number; // intensidad del punto de luz
  pointMove: number; // 0 = en el núcleo · 1 = en la lámpara
  lamp: number;
  desk: number;
  starFade: number;
  handoff: number; // 0..1 el escenario sale de pantalla y la lámpara se queda quieta
  // Escritorio ≥ 1024 px (salida "a la foto del tablero", ver journeyDesktop con lampHand):
  // la órbita colapsa DENTRO de la oscuridad de la oficina, no sobre una pantalla vacía.
  photo: number; // 0..1 opacidad de la foto del tablero (a oscuras)
  bright: number; // 0..1 luz de la habitación: oscuro → parpadeo de encendido → luz plena
  bulb: number; // 0..1 opacidad de la bombilla de la lámpara (con el mismo parpadeo)
};

const ss = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export const JOURNEY_DONE: Journey = {
  e: 1, q: 1, pixel: 0, warp: 0, flash: 0, travel: 0, arrive: 1, reveal: 1, title: 1, ui: 1, hud: 0,
  collapse: 0, point: 0, pointMove: 0, lamp: 0, desk: 0, starFade: 0, handoff: 0,
  photo: 0, bright: 0, bulb: 0,
};

const noExit = (out: Journey) => {
  out.collapse = out.point = out.pointMove = out.lamp = out.desk = out.starFade = 0;
  out.photo = out.bright = out.bulb = 0;
};

// fracción del pin dedicada a llegar + reposo; el resto es la salida a la oficina
export const PIN_SPLIT = 0.8;

// ── Salida a la FOTO del tablero (escritorio ≥ 1024 px) ────────────────────────
// La salida arranca en el reposo de la órbita (EXIT_START, fracción del pin) y llega
// al final del pin. Un solo viaje: la órbita colapsa mientras la oficina oscura se
// funde alrededor → el punto de luz viaja → aterriza en la bombilla de la foto → la
// lámpara se enciende (parpadeo corto y luz cálida). El último cuadro (x = 1) es el
// MISMO que el primero de la Formación.
export const EXIT_START = 0.72;
// luz de la habitación antes de encender la lámpara (la foto se ve, pero a oscuras)
const ROOM_DIM = 0.32;
// parpadeo de encendido: (t 0..1, avance 0..1 entre apagado y encendido)
const FLICK: [number, number][] = [[0, 0], [0.1, 0.6], [0.22, 0.05], [0.4, 0.85], [0.52, 0.35], [0.75, 1], [1, 1]];
const flick = (t: number) => {
  if (t <= 0) return 0;
  for (let i = 1; i < FLICK.length; i++) {
    if (t <= FLICK[i][0]) {
      const [t0, v0] = FLICK[i - 1];
      const [t1, v1] = FLICK[i];
      return v0 + ((v1 - v0) * (t - t0)) / (t1 - t0);
    }
  }
  return 1;
};

// escritorio / tableta: la órbita forma parte del tramo fijado
export function journeyDesktop(e: number, qAll: number, out: Journey, lampHand = false) {
  const q = Math.min(1, qAll / PIN_SPLIT);
  const x = lampHand
    ? Math.min(1, Math.max(0, (qAll - EXIT_START) / (1 - EXIT_START)))
    : Math.min(1, Math.max(0, (qAll - PIN_SPLIT - 0.02) / (1 - PIN_SPLIT - 0.02)));
  out.e = e;
  out.q = q;
  // El cielo de píxel pertenece al despegue. El fondo que lo releva ya viaja
  // por el vórtice desde que su opacidad empieza a subir.
  out.pixel = 0;
  out.warp = (0.35 + 0.65 * ss(0.0, 0.28, q)) * (1 - ss(0.42, 0.5, q));
  out.flash = ss(0.42, 0.47, q) * (1 - ss(0.47, 0.54, q));
  out.travel = e * 6 + ss(0.0, 0.52, q) * 160;
  // la estrella se acerca despacio durante el salto y "aterriza" tras el destello
  out.arrive = 0.5 * ss(0.02, 0.4, q) + 0.5 * ss(0.4, 0.55, q);
  out.reveal = ss(0.5, 0.8, q);
  out.title = ss(0.5, 0.62, q);
  out.ui = ss(0.56, 0.7, q);
  out.hud = ss(0.03, 0.1, q) * (1 - ss(0.38, 0.45, q));
  // salida
  const hide = 1 - ss(0.0, 0.2, x);
  out.title *= hide;
  out.ui *= hide;
  if (lampHand) {
    out.collapse = ss(0.0, 0.4, x);
    // el espacio se apaga y la foto del tablero (a oscuras) aparece alrededor del colapso
    out.desk = ss(0.14, 0.6, x);
    out.starFade = ss(0.1, 0.55, x);
    out.photo = ss(0.04, 0.34, x);
    // el punto de luz nace en el núcleo, viaja y aterriza en la bombilla; ahí cede ante ella
    out.point = ss(0.3, 0.42, x) * (1 - ss(0.8, 0.88, x));
    out.pointMove = ss(0.4, 0.8, x);
    const f = flick((x - 0.8) / 0.2);
    out.bright = ROOM_DIM + (1 - ROOM_DIM) * f;
    out.bulb = f;
    out.lamp = 0;
    return out;
  }
  out.photo = out.bright = out.bulb = 0;
  out.collapse = ss(0.0, 0.42, x);
  out.point = ss(0.3, 0.42, x) * (1 - ss(0.8, 0.98, x));
  out.pointMove = ss(0.42, 0.85, x);
  out.lamp = ss(0.7, 1.0, x);
  out.desk = ss(0.25, 0.8, x);
  out.starFade = ss(0.3, 0.75, x);
  return out;
}

// móvil: contenido fluye directo y elegante (órbita 2D + opciones)
export function journeyMobile(e: number, q: number, out: Journey) {
  out.e = e;
  out.q = 1;
  out.pixel = 0;
  out.warp = 0;
  out.flash = 0;
  out.travel = e * 6 + 160;
  out.arrive = 1;
  out.reveal = 1;
  // el título se forma con el scroll de entrada (e: borde inferior -> superior de la pantalla)
  out.title = ss(0.1, 0.7, e);
  out.ui = 1;
  out.hud = 0;
  noExit(out);
  return out;
}
