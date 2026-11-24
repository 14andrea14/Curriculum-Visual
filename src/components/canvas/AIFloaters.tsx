import React, { useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import * as THREE from 'three';
import { WarmUp } from './WarmUp';
import { useMouseClientRef } from '../../hooks/useMouseClientRef';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import { AI_LOGO_PATHS } from './aiLogoPaths';
import { useCanvasRectRef } from './useCanvasRect';

// LOGOS OFICIALES EN 3D: cada logo es su trazo vectorial real (Simple Icons) extruido con
// un bisel suave, centrado y normalizado a ~2 unidades. Así los detalles son los del logo.
function makeLogo(key: string, opts: { depth: number; bevel: number; colors?: 'gemini' }): THREE.BufferGeometry {
  const data = new SVGLoader().parse(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="${AI_LOGO_PATHS[key]}"/></svg>`);
  const shapes: THREE.Shape[] = [];
  data.paths.forEach((p) => shapes.push(...SVGLoader.createShapes(p)));
  const g = new THREE.ExtrudeGeometry(shapes, {
    depth: opts.depth,
    bevelEnabled: true,
    bevelThickness: opts.bevel,
    bevelSize: opts.bevel * 0.7,
    bevelSegments: 10,
    curveSegments: 48,
  });
  g.rotateX(Math.PI); // el SVG tiene la Y hacia abajo
  g.computeBoundingBox();
  const bb = g.boundingBox!;
  const c = new THREE.Vector3();
  bb.getCenter(c);
  g.translate(-c.x, -c.y, -c.z);
  const k = 2 / Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y);
  g.scale(k, k, k);
  g.computeVertexNormals();
  if (opts.colors === 'gemini') {
    const pos = g.attributes.position as THREE.BufferAttribute;
    const cols = new Float32Array(pos.count * 3);
    const red = new THREE.Color('#f4484a');
    const yel = new THREE.Color('#f5c518');
    const grn = new THREE.Color('#19b765');
    const blu = new THREE.Color('#3b82f6');
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const wr = Math.max(0, y) ** 1.3;
      const wy = Math.max(0, -x) ** 1.3;
      const wg = Math.max(0, -y) ** 1.3;
      const wb = Math.max(0, x) ** 1.3 + 0.45;
      const sum = wr + wy + wg + wb;
      cols[i * 3] = (red.r * wr + yel.r * wy + grn.r * wg + blu.r * wb) / sum;
      cols[i * 3 + 1] = (red.g * wr + yel.g * wy + grn.g * wg + blu.g * wb) / sum;
      cols[i * 3 + 2] = (red.b * wr + yel.b * wy + grn.b * wg + blu.b * wb) / sum;
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  }
  return g;
}

// Piezas 3D de IA (Claude, ChatGPT, Gemini, DeepSeek, Ollama, n8n) que viven ALREDEDOR del texto de la zona IA,
// cada una con su propia animación:
//  - Claude: gira sin parar y "respira" (pulso de escala);
//  - ChatGPT: da vueltas como una moneda (eje Y) y flota;
//  - Gemini: destella (pulsos breves de escala) como una chispa junto a la palabra "IA".
// Entradas distintas: Claude aparece en espiral, ChatGPT cae con rebote, Gemini "titila".
// Interacción con el texto: al pasar el cursor por la etiqueta de cada herramienta (o por
// la palabra "IA", que activa las tres) la pieza salta, gira rápido y brilla. Además se
// inclinan hacia el cursor.

//  - DeepSeek: la ballena "nada" (balanceo, ondulación y cabeceo);
//  - Ollama: la llama asiente y da pequeños rebotes;
//  - n8n: los nodos laten por turnos y la pieza rota lento.

// Las claves nuevas son opcionales para no romper a quien solo define las tres originales.
export type AIFocus = { claude: number; gpt: number; gemini: number; deepseek?: number; ollama?: number; n8n?: number };

const ROUND = (depth: number, bevel: number, seg = 12): THREE.ExtrudeGeometryOptions => ({
  depth,
  bevelEnabled: true,
  bevelThickness: bevel,
  bevelSize: bevel * 0.92,
  bevelSegments: Math.max(seg, 16),
  curveSegments: 64,
});

function makeClaude(): THREE.BufferGeometry[] {
  const rays = [1, 0.84, 0.96, 0.74, 1.02, 0.88, 0.8, 0.98, 0.76, 0.92, 0.86];
  return rays.map((len, i) => {
    const w = 0.08;
    const sh = new THREE.Shape();
    sh.moveTo(-w, 0.1);
    sh.lineTo(-w, len - 0.1);
    sh.absarc(0, len - 0.1, w, Math.PI, 0, true);
    sh.lineTo(w, 0.1);
    sh.absarc(0, 0.1, w, 0, Math.PI, true);
    const g = new THREE.ExtrudeGeometry(sh, ROUND(0.02, 0.08));
    g.translate(0, 0, -0.01);
    g.rotateZ((i / rays.length) * Math.PI * 2 + 0.15);
    return g;
  });
}

function makeOpenAI(): THREE.BufferGeometry[] {
  const rr = (s: THREE.Shape | THREE.Path, x: number, y: number, w: number, h: number, r: number) => {
    s.moveTo(x + r, y);
    s.lineTo(x + w - r, y);
    s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
    s.lineTo(x + w, y + h - r);
    s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
    s.lineTo(x + r, y + h);
    s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
    s.lineTo(x, y + r);
    s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
  };
  const out: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) {
    const sh = new THREE.Shape();
    rr(sh, -0.5, -0.15, 1.0, 0.3, 0.15);
    const hole = new THREE.Path();
    rr(hole, -0.41, -0.06, 0.82, 0.12, 0.06);
    sh.holes.push(hole);
    const g = new THREE.ExtrudeGeometry(sh, ROUND(0.02, 0.045, 10));
    g.translate(0.16, 0.36, -0.01 + (i % 2) * 0.05);
    g.rotateZ((i / 6) * Math.PI * 2);
    out.push(g);
  }
  return out;
}

function makeGemini(): THREE.BufferGeometry {
  const sh = new THREE.Shape();
  const k = 0.12;
  sh.moveTo(0, 0.98);
  sh.quadraticCurveTo(k, k, 0.98, 0);
  sh.quadraticCurveTo(k, -k, 0, -0.98);
  sh.quadraticCurveTo(-k, -k, -0.98, 0);
  sh.quadraticCurveTo(-k, k, 0, 0.98);
  const g = new THREE.ExtrudeGeometry(sh, ROUND(0.04, 0.12, 14));
  g.translate(0, 0, -0.02);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const cols = new Float32Array(pos.count * 3);
  const red = new THREE.Color('#f4484a');
  const yel = new THREE.Color('#f5c518');
  const grn = new THREE.Color('#19b765');
  const blu = new THREE.Color('#3b82f6');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const wr = Math.max(0, y) ** 1.3;
    const wy = Math.max(0, -x) ** 1.3;
    const wg = Math.max(0, -y) ** 1.3;
    const wb = Math.max(0, x) ** 1.3 + 0.45;
    const sum = wr + wy + wg + wb;
    cols[i * 3] = (red.r * wr + yel.r * wy + grn.r * wg + blu.r * wb) / sum;
    cols[i * 3 + 1] = (red.g * wr + yel.g * wy + grn.g * wg + blu.g * wb) / sum;
    cols[i * 3 + 2] = (red.b * wr + yel.b * wy + grn.b * wg + blu.b * wb) / sum;
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  return g;
}

// Ballena de DeepSeek: cuerpo de perfil (cabeza a la izquierda) con cola alzada + ojo.
function makeDeepSeek(): { body: THREE.BufferGeometry; eye: THREE.BufferGeometry } {
  const sh = new THREE.Shape();
  sh.moveTo(-0.95, 0.05);
  sh.bezierCurveTo(-0.9, 0.55, -0.2, 0.62, 0.25, 0.35); // lomo
  sh.bezierCurveTo(0.45, 0.22, 0.56, 0.18, 0.64, 0.28); // pedúnculo
  sh.bezierCurveTo(0.7, 0.48, 0.8, 0.66, 0.98, 0.72); // aleta superior
  sh.bezierCurveTo(0.92, 0.5, 0.88, 0.36, 0.9, 0.22);
  sh.bezierCurveTo(0.96, 0.12, 1.0, 0.0, 0.98, -0.12); // aleta inferior
  sh.bezierCurveTo(0.85, -0.04, 0.74, 0.0, 0.64, 0.04);
  sh.bezierCurveTo(0.5, -0.4, 0.0, -0.6, -0.45, -0.5); // vientre
  sh.bezierCurveTo(-0.8, -0.42, -0.98, -0.2, -0.95, 0.05);
  const body = new THREE.ExtrudeGeometry(sh, ROUND(0.06, 0.1, 12));
  body.translate(0, 0, -0.03);
  const eye = new THREE.CapsuleGeometry(0.05, 0.06, 6, 14);
  eye.translate(-0.58, 0.12, 0.13);
  return { body, eye };
}

// Cabeza de llama de Ollama: silueta con dos orejas, hocico y ojos en relieve.
function makeOllama(): { head: THREE.BufferGeometry; muzzle: THREE.BufferGeometry; eyes: THREE.BufferGeometry[] } {
  const sh = new THREE.Shape();
  sh.moveTo(-0.5, -0.9);
  sh.bezierCurveTo(-0.7, -0.3, -0.68, 0.2, -0.5, 0.42); // mejilla izquierda
  sh.lineTo(-0.52, 0.8);
  sh.absarc(-0.38, 0.8, 0.14, Math.PI, 0, true); // oreja izquierda
  sh.lineTo(-0.24, 0.5);
  sh.quadraticCurveTo(0, 0.6, 0.24, 0.5); // coronilla
  sh.lineTo(0.24, 0.8);
  sh.absarc(0.38, 0.8, 0.14, Math.PI, 0, true); // oreja derecha
  sh.lineTo(0.5, 0.42);
  sh.bezierCurveTo(0.68, 0.2, 0.7, -0.3, 0.5, -0.9); // mejilla derecha
  sh.quadraticCurveTo(0, -1.0, -0.5, -0.9);
  const head = new THREE.ExtrudeGeometry(sh, ROUND(0.06, 0.1, 12));
  head.translate(0, 0, -0.03);
  const ms = new THREE.Shape();
  ms.absellipse(0, -0.32, 0.3, 0.22, 0, Math.PI * 2, false, 0);
  const muzzle = new THREE.ExtrudeGeometry(ms, ROUND(0.02, 0.06, 10));
  muzzle.translate(0, 0, 0.1);
  const eyes = [-0.22, 0.22].map((x) => {
    const g = new THREE.CapsuleGeometry(0.05, 0.08, 6, 14);
    g.translate(x, 0.12, 0.13);
    return g;
  });
  return { head, muzzle, eyes };
}

// Ícono de n8n: nodos (anillos) unidos por barras redondeadas. Cada nodo queda centrado
// en su origen para poder latir escalando su propia malla.
const N8N_NODES: [number, number][] = [
  [-0.78, 0],
  [-0.08, 0],
  [0.68, 0.42],
  [0.68, -0.42],
];
function makeN8n(): { node: THREE.BufferGeometry; bars: THREE.BufferGeometry[] } {
  const ring = new THREE.Shape();
  ring.absarc(0, 0, 0.22, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absarc(0, 0, 0.1, 0, Math.PI * 2, true);
  ring.holes.push(hole);
  const node = new THREE.ExtrudeGeometry(ring, ROUND(0.05, 0.06, 10));
  node.translate(0, 0, -0.025);
  const bar = (a: [number, number], b: [number, number]) => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const L = Math.hypot(dx, dy) - 0.36; // sin pisar los anillos
    const w = 0.045;
    const sh = new THREE.Shape();
    sh.moveTo(-L / 2, -w);
    sh.lineTo(L / 2, -w);
    sh.absarc(L / 2, 0, w, -Math.PI / 2, Math.PI / 2, false);
    sh.lineTo(-L / 2, w);
    sh.absarc(-L / 2, 0, w, Math.PI / 2, Math.PI * 1.5, false);
    const g = new THREE.ExtrudeGeometry(sh, ROUND(0.03, 0.04, 8));
    g.translate(0, 0, -0.015);
    g.rotateZ(Math.atan2(dy, dx));
    g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0);
    return g;
  };
  const [A, B, C, D] = N8N_NODES;
  return { node, bars: [bar(A, B), bar(B, C), bar(B, D)] };
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const easeOutBack = (x: number) => 1 + 2.4 * Math.pow(x - 1, 3) + 1.4 * Math.pow(x - 1, 2);
const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);

type Kind = 'claude' | 'gpt' | 'gemini' | 'deepseek' | 'ollama' | 'n8n';

// Cada pieza ORBITA alrededor del texto (elipse inclinada propia, velocidad y sentido
// propios). Con la profundidad (z de la órbita) se agranda y se ve nítida al pasar por
// delante del texto, y se achica y atenúa al pasar por detrás. Encima: su animación propia
// (Claude gira y respira, ChatGPT vuelta de moneda, Gemini destella), el foco desde las
// etiquetas (salto + giro rápido + brillo) y el cursor (la órbita se desvía hacia él y la
// pieza se inclina).
interface Orbit {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  tilt: number;
  speed: number;
  phase: number;
}

const Piece: React.FC<{
  kind: Kind;
  orbit: Orbit;
  size: number;
  delay: number;
  activeRef: React.MutableRefObject<boolean>;
  startRef: React.MutableRefObject<number>;
  cursorRef: React.MutableRefObject<{ x: number; y: number }>;
  focusRef: React.MutableRefObject<AIFocus>;
  children: React.ReactNode;
}> = ({ kind, orbit, size, delay, activeRef, startRef, cursorRef, focusRef, children }) => {
  const outer = useRef<THREE.Group>(null);
  const inner = useRef<THREE.Group>(null);
  const st = useRef({ p: 0, ang: orbit.phase, spin: 0, hop: 0, hopV: 0, focus: 0, flip: 0, pull: new THREE.Vector2() });
  useFrame((state, dtRaw) => {
    const o = outer.current;
    const n = inner.current;
    if (!o || !n) return;
    const dt = Math.min(dtRaw, 1 / 30);
    const t = state.clock.elapsedTime;
    const S = st.current;
    if (activeRef.current) S.p = clamp01((t - startRef.current - delay) / 1.4);
    else S.p = Math.max(0, S.p - dt * 2.5);
    const p = S.p;
    const want = focusRef.current[kind] ?? 0;
    const prevFocus = S.focus;
    S.focus = THREE.MathUtils.damp(S.focus, want, 10, dt);
    if (want > 0.5 && prevFocus < 0.5) S.hopV = size * 3;
    S.hopV -= size * 16 * dt;
    S.hop = Math.max(0, S.hop + S.hopV * dt);
    if (S.hop === 0 && S.hopV < 0) S.hopV = 0;
    // órbita (se frena con el foco para poder verla de cerca)
    S.ang += dt * orbit.speed; // anillo parejo: nunca se alcanzan entre sí
    const e = easeOutCubic(p); // entrada: la órbita se abre desde el centro del texto
    const ox = Math.cos(S.ang) * orbit.rx * e;
    const oy = Math.sin(S.ang) * orbit.ry * e;
    const depth = Math.sin(S.ang); // >0 delante del texto, <0 detrás
    const x0 = orbit.cx + ox * Math.cos(orbit.tilt) - oy * Math.sin(orbit.tilt);
    const y0 = orbit.cy + ox * Math.sin(orbit.tilt) + oy * Math.cos(orbit.tilt) * 0.55;
    // el cursor atrae la pieza un poco (y la inclina)
    const dx = cursorRef.current.x - x0;
    const dy = cursorRef.current.y - y0;
    const near = Math.exp(-(dx * dx + dy * dy) / (size * size * 14));
    S.pull.x = THREE.MathUtils.damp(S.pull.x, dx * 0.08 * near, 5, dt);
    S.pull.y = THREE.MathUtils.damp(S.pull.y, dy * 0.08 * near, 5, dt);
    const front = 0.5 + 0.5 * depth;
    let sc = easeOutBack(p) * (0.62 + 0.38 * front);
    if (kind === 'claude') {
      S.spin += dt * (0.7 + S.focus * 7);
      sc *= 1 + Math.sin(t * 2.2) * 0.05;
      n.rotation.set(0, 0, S.spin);
    } else if (kind === 'gpt') {
      S.flip += dt * (1.1 + S.focus * 9);
      n.rotation.set(0.15, S.flip, Math.sin(t * 0.7) * 0.1);
    } else if (kind === 'deepseek') {
      // nado: balanceo en Z, ondulación lateral y cabeceo suave
      S.spin += dt * S.focus * 6;
      n.rotation.set(Math.sin(t * 1.3) * 0.15, Math.sin(t * 1.6 + 0.5) * 0.35 + S.spin, Math.sin(t * 2.2) * 0.14);
      n.position.set(0, Math.sin(t * 2.2 + 1) * 0.08, 0);
    } else if (kind === 'ollama') {
      // asiente y rebota (más fuerte con el foco)
      const amp = 1 + S.focus * 1.5;
      S.spin += dt * S.focus * 7;
      n.rotation.set(Math.max(0, Math.sin(t * 2)) * 0.28 * amp, Math.sin(t * 0.8) * 0.2 + S.spin, 0);
      n.position.set(0, Math.abs(Math.sin(t * 2.4)) * 0.12 * amp, 0);
    } else if (kind === 'n8n') {
      // rotación lenta + nodos que laten por turnos
      S.spin += dt * (0.35 + S.focus * 6);
      n.rotation.set(0.1, Math.sin(t * 0.5) * 0.3, S.spin);
      n.children.forEach((c) => {
        const idx = c.userData.node as number | undefined;
        if (idx !== undefined) c.scale.setScalar(1 + 0.2 * Math.max(0, Math.sin(t * 3 - idx * 1.3)) + 0.1 * S.focus);
      });
    } else {
      const tw = Math.max(0, Math.sin(t * 2.6) - 0.85) * 6.6;
      sc *= 1 + 0.2 * tw + 0.3 * S.focus;
      n.rotation.set(0, Math.sin(t * 0.9) * 0.5, Math.sin(t * 0.6) * 0.25 + S.spin);
      S.spin += dt * S.focus * 6;
    }
    o.position.set(x0 + S.pull.x, y0 + S.pull.y + S.hop, depth * size * 1.2);
    o.rotation.y = THREE.MathUtils.damp(o.rotation.y, THREE.MathUtils.clamp(dx / (size * 4), -0.6, 0.6) * (0.3 + near), 6, dt);
    o.rotation.x = THREE.MathUtils.damp(o.rotation.x, -THREE.MathUtils.clamp(dy / (size * 4), -0.5, 0.5) * (0.3 + near), 6, dt);
    o.scale.setScalar(Math.max(0.0001, size * sc * (1 + S.focus * 0.2)));
    // detrás del texto: más tenue
    const op = 1; // sin transparencia (pedido explícito): solo orbitan
    n.traverse((m) => {
      const mesh = m as THREE.Mesh;
      if (mesh.isMesh) {
        const mat = mesh.material as THREE.MeshPhysicalMaterial;
        mat.transparent = true;
        mat.opacity = op;
        if (!mat.userData.finish) {
          mat.userData.finish = true;
          mat.iridescence = 0.35;
          mat.iridescenceIOR = 1.4;
          mat.clearcoat = Math.max(mat.clearcoat ?? 0, 0.8);
          mat.clearcoatRoughness = 0.08;
          mat.needsUpdate = true;
        }
      }
    });
  });
  return (
    <group ref={outer}>
      <group ref={inner}>{children}</group>
    </group>
  );
};

// memo: la escena solo recibe refs; así el re-render del padre (cada frame de scroll)
// no reconcilia los 6 logos ni el <Environment>.
const Scene = React.memo<{ activeRef: React.MutableRefObject<boolean>; focusRef: React.MutableRefObject<AIFocus> }>(function Scene({ activeRef, focusRef }) {
  const { viewport, camera, gl } = useThree();
  const mouse = useMouseClientRef();
  // rectángulo del lienzo en caché (sin forzar layout en cada cuadro, ver useCanvasRect)
  const canvasRect = useCanvasRectRef(gl.domElement);
  const cursorRef = useRef({ x: 99, y: 99 });
  const startRef = useRef(0);
  const wasActive = useRef(false);
  const ray = useMemo(() => new THREE.Raycaster(), []);
  const ndc = useMemo(() => new THREE.Vector2(), []);
  const logos = useMemo(
    () => ({
      claude: makeLogo('claude', { depth: 0.9, bevel: 0.22 }),
      gpt: makeLogo('gpt', { depth: 0.9, bevel: 0.2 }),
      gemini: makeLogo('gemini', { depth: 1.1, bevel: 0.35, colors: 'gemini' }),
      deepseek: makeLogo('deepseek', { depth: 0.9, bevel: 0.2 }),
      ollama: makeLogo('ollama', { depth: 0.8, bevel: 0.14 }),
      n8n: makeLogo('n8n', { depth: 0.9, bevel: 0.2 }),
    }),
    []
  );
  useFrame((state) => {
    if (activeRef.current && !wasActive.current) startRef.current = state.clock.elapsedTime;
    wasActive.current = activeRef.current;
    const rc = canvasRect.current;
    ndc.set(((mouse.current.x - rc.left) / rc.width) * 2 - 1, -(((mouse.current.y - rc.top) / rc.height) * 2 - 1));
    ray.setFromCamera(ndc, camera);
    const tt = -ray.ray.origin.z / ray.ray.direction.z;
    cursorRef.current.x = ray.ray.origin.x + ray.ray.direction.x * tt;
    cursorRef.current.y = ray.ray.origin.y + ray.ray.direction.y * tt;
  });
  const w = viewport.width;
  const h = viewport.height;
  // centro de las órbitas = centro del bloque de texto (fracciones del lienzo)
  // el lienzo está centrado en el texto: el anillo gira alrededor del título
  const cx = 0;
  const cy = 0;
  // piezas algo más chicas para que quepan las seis
  const s = Math.min(w, h) * 0.1;
  // UN SOLO ANILLO para las seis (carrusel): misma elipse, misma velocidad y fases cada 60°,
  // así nunca se chocan y orbitan solas alrededor del título
  const RING = { cx, cy, rx: w * 0.37, ry: h * 0.36, tilt: -0.1, speed: 0.3 };
  const common = { activeRef, startRef, cursorRef, focusRef };
  // fases repartidas cada 60°, con velocidades, sentidos y radios distintos
  const F = Math.PI / 3;
  return (
    <>
      <Environment resolution={128}>
        <Lightformer form="rect" intensity={4} color="#ffffff" position={[0, 5, 3]} scale={[12, 3, 1]} />
        <Lightformer form="rect" intensity={2.2} color="#ffffff" position={[6, 0, 3]} scale={[2, 10, 1]} />
        <Lightformer form="circle" intensity={1.6} color="#ff8ee0" position={[-4, -3, 4]} scale={4} />
        <Lightformer form="circle" intensity={1.2} color="#9fe8ff" position={[4, -4, 4]} scale={3} />
      </Environment>
      <ambientLight intensity={0.45} />
      <directionalLight position={[2, 4, 6]} intensity={1.3} />
      <Piece kind="claude" orbit={{ ...RING, phase: F * 0 }} size={s} delay={0} {...common}>
        <mesh geometry={logos.claude}><meshPhysicalMaterial color="#D97757" roughness={0.28} clearcoat={1} clearcoatRoughness={0.06} envMapIntensity={1.2} sheen={0.5} sheenColor="#ffd6c6" /></mesh>
      </Piece>
      <Piece kind="gpt" orbit={{ ...RING, phase: F * 1 }} size={s} delay={0.15} {...common}>
        <mesh geometry={logos.gpt}><meshPhysicalMaterial color="#f5f2fa" roughness={0.28} clearcoat={1} clearcoatRoughness={0.06} envMapIntensity={1.2} metalness={0.2} /></mesh>
      </Piece>
      <Piece kind="gemini" orbit={{ ...RING, phase: F * 2 }} size={s * 0.95} delay={0.3} {...common}>
        <mesh geometry={logos.gemini}>
          <meshPhysicalMaterial vertexColors roughness={0.25} clearcoat={0.9} clearcoatRoughness={0.08} envMapIntensity={0.5} emissive="#ffffff" emissiveIntensity={0.06} toneMapped={false} />
        </mesh>
      </Piece>
      <Piece kind="deepseek" orbit={{ ...RING, phase: F * 3 }} size={s} delay={0.45} {...common}>
        <mesh geometry={logos.deepseek}><meshPhysicalMaterial color="#4D6BFE" roughness={0.28} clearcoat={1} clearcoatRoughness={0.06} envMapIntensity={1.2} /></mesh>
      </Piece>
      <Piece kind="ollama" orbit={{ ...RING, phase: F * 4 }} size={s} delay={0.6} {...common}>
        <mesh geometry={logos.ollama}><meshPhysicalMaterial color="#f5f2fa" roughness={0.28} clearcoat={1} clearcoatRoughness={0.06} envMapIntensity={1.2} metalness={0.2} /></mesh>
      </Piece>
      <Piece kind="n8n" orbit={{ ...RING, phase: F * 5 }} size={s} delay={0.75} {...common}>
        <mesh geometry={logos.n8n}><meshPhysicalMaterial color="#EA4B71" roughness={0.28} clearcoat={1} clearcoatRoughness={0.06} envMapIntensity={1.2} /></mesh>
      </Piece>
    </>
  );
});

type FloatersProps = {
  active: boolean;
  focusRef: React.MutableRefObject<AIFocus>;
  className?: string;
  style?: React.CSSProperties;
};

// el padre pasa un `style` nuevo en cada render: se compara por contenido (superficial)
const sameStyle = (a?: React.CSSProperties, b?: React.CSSProperties) => {
  if (a === b) return true;
  if (!a || !b) return false;
  const ka = Object.keys(a) as (keyof React.CSSProperties)[];
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => Object.is(a[k], b[k]));
};
const sameFloaters = (a: FloatersProps, b: FloatersProps) =>
  a.active === b.active && a.focusRef === b.focusRef && a.className === b.className && sameStyle(a.style, b.style);

const AIFloatersImpl: React.FC<FloatersProps> = ({ active, focusRef, className = '', style }) => {
  const activeRef = useRef(active);
  activeRef.current = active;
  const [live, setLive] = React.useState(active);
  React.useEffect(() => {
    if (active) {
      setLive(true);
      return;
    }
    const id = window.setTimeout(() => setLive(false), 900);
    return () => window.clearTimeout(id);
  }, [active]);
  return (
    <div className={`pointer-events-none ${className}`} style={style}>
      <Canvas frameloop={live ? 'always' : 'never'} dpr={[1, 1.5]} camera={{ position: [0, 0, 12], fov: 30 }} gl={{ alpha: true, antialias: true }}>
        <Scene activeRef={activeRef} focusRef={focusRef} />
        {/* compila todo por adelantado (sin trabón al aparecer la zona IA) */}
        <WarmUp delay={1500} />
      </Canvas>
    </div>
  );
};

export const AIFloaters = React.memo(AIFloatersImpl, sameFloaters);
