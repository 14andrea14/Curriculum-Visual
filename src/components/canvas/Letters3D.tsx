import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import * as THREE from 'three';
import { useMouseClientRef } from '../../hooks/useMouseClientRef';
import { WarmUp } from './WarmUp';
import { useCanvasRectRef } from './useCanvasRect';
import { isPreloading } from '../../lib/preload';

// "PORTAFOLIO" como 10 OBJETOS 3D con volumen y luz propia (no una imagen plana):
// cada letra de burbuja de vidrio (imágenes generadas con Nano Banana a partir de
// las referencias de la usuaria, en public/lettering/letters) se convierte en:
//  1. CUERPO: una pila de capas de la silueta de la letra, detrás de la cara, en
//     el color de la letra oscurecido → al inclinar la escena se ve el GROSOR
//     (los costados), como una letra extruida de verdad;
//  2. CARA: la imagen de vidrio (translúcida, brillos horneados);
//  3. BRILLO VIVO: encima, una capa especular con un mapa de normales derivado
//     de la forma de la letra (cada letra se "infla" como un globo: distancia al
//     borde → cúpula) iluminada por una luz que SIGUE AL CURSOR y por un estudio
//     de luces (HDRI), de modo que los reflejos recorren la superficie cuando
//     mueves el mouse o la letra gira.
// Siguen estando DETRÁS de la figura (que va en otro canvas, encima).
// Reaccionan: entrada con rebote una tras otra; flotan y se bambolean; el
// conjunto se inclina hacia el cursor (paralaje real por las distintas z); la
// letra bajo el cursor (probando el alfa de la imagen) se infla y tiembla; un
// clic en la figura (evento 'hero-react') las hace saltar; al bajar al androide
// (`exit`) salen despedidas.
//
// Las imágenes vienen sobre NEGRO PURO y el fondo de la portada es negro: se les
// extrae un alfa por luminancia (alfa = máx(r,g,b)) y el color se
// "des-premultiplica", así el vidrio conserva su translucidez.

interface Tex {
  color: THREE.DataTexture;
  mask: THREE.DataTexture; // alfa en el canal verde (alphaMap)
  normal: THREE.DataTexture;
  alpha: Uint8Array; // orden de la imagen (fila 0 arriba), para el hover
  tint: THREE.Color; // color medio de la letra
  w: number;
  h: number;
}

function makeTexture(data: Uint8Array, w: number, h: number, srgb: boolean) {
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

// Distancia (aprox. chamfer 3-4) de cada píxel "sólido" al borde más cercano.
function distanceInside(solid: Uint8Array, w: number, h: number): Float32Array {
  const INF = 1e9;
  const d = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) d[i] = solid[i] ? INF : 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!d[i]) continue;
      let v = d[i];
      if (x > 0) v = Math.min(v, d[i - 1] + 3);
      if (y > 0) {
        v = Math.min(v, d[i - w] + 3);
        if (x > 0) v = Math.min(v, d[i - w - 1] + 4);
        if (x < w - 1) v = Math.min(v, d[i - w + 1] + 4);
      }
      d[i] = v;
    }
  for (let y = h - 1; y >= 0; y--)
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (!d[i]) continue;
      let v = d[i];
      if (x < w - 1) v = Math.min(v, d[i + 1] + 3);
      if (y < h - 1) {
        v = Math.min(v, d[i + w] + 3);
        if (x < w - 1) v = Math.min(v, d[i + w + 1] + 4);
        if (x > 0) v = Math.min(v, d[i + w - 1] + 4);
      }
      d[i] = v;
    }
  for (let i = 0; i < w * h; i++) d[i] = d[i] / 3;
  return d;
}

function boxBlur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let s = 0;
      let c = 0;
      for (let k = -r; k <= r; k++) {
        const xx = x + k;
        if (xx >= 0 && xx < w) {
          s += src[y * w + xx];
          c++;
        }
      }
      tmp[y * w + x] = s / c;
    }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let s = 0;
      let c = 0;
      for (let k = -r; k <= r; k++) {
        const yy = y + k;
        if (yy >= 0 && yy < h) {
          s += tmp[yy * w + x];
          c++;
        }
      }
      out[y * w + x] = s / c;
    }
  return out;
}

function useLetterTextures(url: string): Tex | null {
  const [t, setT] = useState<Tex | null>(null);
  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(img, 0, 0);
      const src = ctx.getImageData(0, 0, w, h).data;
      const color = new Uint8Array(w * h * 4);
      const maskData = new Uint8Array(w * h * 4);
      const alpha = new Uint8Array(w * h);
      const solid = new Uint8Array(w * h);
      let tr = 0;
      let tg = 0;
      let tb = 0;
      let tn = 0;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          const r = src[i];
          const g = src[i + 1];
          const b = src[i + 2];
          const m = Math.max(r, g, b);
          const a = m < 12 ? 0 : Math.min(255, m * 1.35);
          alpha[y * w + x] = a;
          solid[y * w + x] = a > 90 ? 1 : 0;
          const o = ((h - 1 - y) * w + x) * 4; // DataTexture no hace flipY
          if (a > 0) {
            const k = 255 / a;
            color[o] = Math.min(255, r * k);
            color[o + 1] = Math.min(255, g * k);
            color[o + 2] = Math.min(255, b * k);
          }
          color[o + 3] = a;
          maskData[o] = a;
          maskData[o + 1] = a;
          maskData[o + 2] = a;
          maskData[o + 3] = 255;
          if (a > 150) {
            tr += r;
            tg += g;
            tb += b;
            tn++;
          }
        }
      }
      // Relieve: la letra "inflada" — distancia al borde -> perfil de cúpula.
      const dist = distanceInside(solid, w, h);
      const R = Math.max(9, Math.round(h * 0.055));
      let hgt: Float32Array = new Float32Array(w * h);
      for (let i = 0; i < w * h; i++) {
        const tt = Math.min(1, dist[i] / R);
        hgt[i] = Math.sqrt(1 - (1 - tt) * (1 - tt)) * R;
      }
      hgt = boxBlur(boxBlur(hgt, w, h, 2), w, h, 2);
      const normal = new Uint8Array(w * h * 4);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const xm = Math.max(0, x - 1);
          const xp = Math.min(w - 1, x + 1);
          const ym = Math.max(0, y - 1);
          const yp = Math.min(h - 1, y + 1);
          const dx = (hgt[y * w + xp] - hgt[y * w + xm]) * 0.5;
          const dy = (hgt[yp * w + x] - hgt[ym * w + x]) * 0.5; // y de la imagen (hacia abajo)
          // N = (-dh/du, -dh/dv, 1) y v apunta hacia ARRIBA => -dh/dv = +dh/dy_img
          let nx = -dx;
          let ny = dy;
          let nz = 1;
          const len = Math.hypot(nx, ny, nz);
          nx /= len;
          ny /= len;
          nz /= len;
          const o = ((h - 1 - y) * w + x) * 4;
          normal[o] = Math.round((nx * 0.5 + 0.5) * 255);
          normal[o + 1] = Math.round((ny * 0.5 + 0.5) * 255);
          normal[o + 2] = Math.round((nz * 0.5 + 0.5) * 255);
          normal[o + 3] = 255;
        }
      }
      const n = Math.max(1, tn);
      const tint = new THREE.Color().setRGB(tr / n / 255, tg / n / 255, tb / n / 255, THREE.SRGBColorSpace);
      setT({
        color: makeTexture(color, w, h, true),
        mask: makeTexture(maskData, w, h, false),
        normal: makeTexture(normal, w, h, false),
        alpha,
        tint,
        w,
        h,
      });
    };
    img.src = url;
    return () => {
      cancelled = true;
    };
  }, [url]);
  return t;
}

const easeBack = (t: number) => {
  const x = Math.min(1, Math.max(0, t));
  const c1 = 1.7;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};

// [letra, proporción ancho/alto de su imagen, alto (fracción del alto de
// pantalla), compresión horizontal (1 = sin deformar), centro y (fracción del
// alto), giro Z (grados), profundidad z]. Letras grandes y alargadas junto a
// otras más bajas y anchas, escalonadas. El ancho sale del alto y la compresión;
// las de cada palabra se reparten sin pisarse en el ala de su lado.
type Spec = [string, number, number, number, number, number, number];
const PORTA_SPEC: Spec[] = [
  ['P', 0.553, 0.58, 1.9, 0.12, 4, 0.3],
  ['O', 0.612, 0.44, 1.5, 0.2, -5, -0.12],
  ['R', 0.614, 0.6, 1.9, 0.1, 3, 0.15],
  ['T', 0.647, 0.46, 1.6, 0.18, -4, -0.2],
  ['A', 0.73, 0.56, 1.9, 0.16, 5, 0.25],
];
const FOLIO_SPEC: Spec[] = [
  ['F', 0.549, 0.6, 1.8, 0.16, -4, -0.25],
  ['O', 0.612, 0.46, 1.5, 0.21, 4, 0.35],
  ['L', 0.522, 0.58, 1.7, 0.11, -5, -0.3],
  ['I', 0.34, 0.6, 1.3, 0.1, 3, 0.12],
  ['O', 0.612, 0.44, 1.5, 0.19, -4, -0.12],
];
const COUNT = PORTA_SPEC.length + FOLIO_SPEC.length;

interface Placed {
  ch: string;
  x: number;
  y: number;
  W: number;
  H: number;
  rot: number;
  z: number;
}

function computeLayout(w: number, h: number): Placed[] {
  const isPortrait = w < h * 0.95;
  if (isPortrait) {
    // En pantallas verticales (móvil y tablet vertical):
    // Las 10 letras de "PORTAFOLIO" se colocan en un arco visible en la parte superior / media-alta,
    // garantizando que la palabra sea 100% visible, legible y enmarque a Alejandra sin quedar tapada.
    const allSpecs: Spec[] = [...PORTA_SPEC, ...FOLIO_SPEC];
    const totalLetters = allSpecs.length;
    const spanW = 0.94 * w;
    const gap = 0.003 * w;
    const availableW = spanW - gap * (totalLetters - 1);
    const letterW = availableW / totalLetters;
    const startX = -spanW / 2 + letterW / 2;
    return allSpecs.map(([ch, r, fh, , , rot, z], i) => {
      const cx = startX + i * (letterW + gap);
      const t = (i - (totalLetters - 1) / 2) / (totalLetters / 2); // -1 a 1
      const arch = (1 - t * t) * 0.04 * h;
      const cy = 0.33 * h + arch;
      const targetH = Math.min(fh * h * 0.48, (letterW / r) * 1.7);
      return {
        ch,
        x: cx,
        y: cy,
        W: letterW * 1.15,
        H: targetH,
        rot: rot * 0.3,
        z: z * 0.2,
      };
    });
  }
  const edge = 0.462 * w;
  const gap = -0.002 * w; // casi pegadas (estilo grafiti), sin pisarse
  const maxSpan = 0.35 * w; // cada ala llega solo hasta el borde de la cabeza: así se ve la esquina de la A y de la F
  const place = (specs: Spec[], fromLeft: boolean): Placed[] => {
    let ws = specs.map(([, r, fh, sq]) => (fh * h * r) / sq);
    const gaps = gap * (specs.length - 1);
    const total = ws.reduce((a, b) => a + b, 0) + gaps;
    const k = total > maxSpan ? (maxSpan - gaps) / (total - gaps) : 1;
    ws = ws.map((x) => x * k);
    const span = ws.reduce((a, b) => a + b, 0) + gaps;
    let cursor = fromLeft ? -edge : edge - span;
    return specs.map(([ch, , fh, , fy, rot, z], i) => {
      const cx = cursor + ws[i] / 2;
      cursor += ws[i] + gap;
      return { ch, x: cx, y: fy * h, W: ws[i], H: fh * h, rot, z };
    });
  };
  return [...place(PORTA_SPEC, true), ...place(FOLIO_SPEC, false)];
}

const SLICES = 8; // capas del cuerpo (grosor)

// Estado físico de cada letra (juego con el cursor): desplazamiento, giro y sus velocidades.
interface Phys {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  ry: number;
  rz: number;
  wx: number;
  wy: number;
  wz: number;
  glow: number; // 0..1: cuánto "se enciende" por cercanía del cursor
}
const newPhys = (): Phys => ({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, rz: 0, wx: 0, wy: 0, wz: 0, glow: 0 });

const Letter: React.FC<{
  index: number;
  cfg: Placed;
  entryRef: React.MutableRefObject<number>;
  exitRef: React.MutableRefObject<number>;
  pulseRef: React.MutableRefObject<number>;
  startRef: React.MutableRefObject<number>;
  register: (i: number, m: THREE.Mesh | null, tex: Tex | null) => void;
  hoverRef: React.MutableRefObject<number[]>;
  physRef: React.MutableRefObject<Phys[]>;
}> = ({ index, cfg, entryRef, exitRef, pulseRef, startRef, register, hoverRef, physRef }) => {
  const { ch, x: fx, y: fy, W, H, rot: rz, z: fz } = cfg;
  const { viewport } = useThree();
  const t = useLetterTextures(`/lettering/letters/${ch}.png`);
  const groupRef = useRef<THREE.Group>(null);
  const frontRef = useRef<THREE.Mesh>(null);

  const D = Math.max(0.5, W * 0.5); // grosor del cuerpo (unidades de mundo)

  const mats = useMemo(() => {
    if (!t) return null;
    const slices = Array.from({ length: SLICES }, (_, k) => {
      const f = k / (SLICES - 1);
      const col = t.tint.clone().multiplyScalar(0.62 - 0.46 * f);
      return new THREE.MeshBasicMaterial({
        color: col,
        alphaMap: t.mask,
        alphaTest: 0.4,
        transparent: true,
        toneMapped: false,
      });
    });
    const front = new THREE.MeshBasicMaterial({ map: t.color, transparent: true, depthWrite: false, toneMapped: false });
    const spec = new THREE.MeshPhysicalMaterial({
      color: 0x000000,
      roughness: 0.16,
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
      normalMap: t.normal,
      normalScale: new THREE.Vector2(1.5, 1.5),
      alphaMap: t.mask,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      envMapIntensity: 2.4,
      toneMapped: false,
    });
    return { slices, front, spec };
  }, [t]);

  useEffect(() => {
    register(index, frontRef.current, t);
    return () => register(index, null, null);
  }, [t, index, register, mats]);

  useFrame((state) => {
    const g = groupRef.current;
    if (!g || !t || !mats) return;
    const time = state.clock.elapsedTime;
    // la entrada (rebote) arranca cuando se va la pantalla de carga, no detrás de ella.
    // Se mide con un reloj monótono (no state.clock): r3f reinicia su reloj cada vez
    // que el lienzo pasa de frameloop "never" a "always" (al volver del androide), y
    // con el reloj reiniciado `since` quedaba negativo → letras a escala 0 en la portada.
    const now = performance.now() / 1000;
    if (startRef.current < 0 && !isPreloading()) startRef.current = now;
    const since = startRef.current < 0 ? 0 : now - startRef.current;
    const entry = entryRef.current;
    const exit = exitRef.current;
    // 0..1: cuánto avanzó la reacción (sonrisa) de la figura. Las letras se desplazan
    // hacia la figura (PORTA a la derecha, FOLIO a la izquierda) y se echan hacia atrás a la vez que ella se acerca a cámara.
    const pulse = pulseRef.current;
    const hv = hoverRef.current[index];
    const isMob = typeof window !== 'undefined' && window.innerWidth < 768;
    const gate = isMob ? 1 : Math.min(1, Math.max(0, (entry - 0.2) / 0.1));
    const intro = isMob ? Math.max(0.65, easeBack((since - 0.25 - index * 0.08) / 0.8)) : easeBack((since - 0.25 - index * 0.08) / 0.8) * gate;
    const dir = fx < 0 ? -1 : 1;
    const odd = index % 2 ? 1 : -1;
    const bob = Math.sin(time * 0.9 + index * 1.7) * 0.012 * viewport.height;

    g.position.set(
      fx * (1 + exit * 0.9) + dir * (1 - Math.min(1, intro)) * 0.1 * viewport.width + -dir * pulse * 0.1 * viewport.width,
      fy + bob + (1 - Math.min(1, intro)) * 0.5 * viewport.height + pulse * 0.025 * viewport.height * odd + exit * odd * 0.35 * viewport.height,
      fz + exit * 4 - pulse * 1.8
    );
    // juego con el cursor: desplazamiento físico (resortes) encima de la pose base
    const ph = physRef.current[index];
    g.position.x += ph.x;
    g.position.y += ph.y;
    g.position.z += ph.z;
    // la letra cercana al cursor se "enciende" (más brillo y reflejos)
    g.scale.setScalar(Math.max(0.0001, Math.max(0, intro) * (1 + hv * 0.1) * (1 - exit * 0.35)));
    g.rotation.z = THREE.MathUtils.degToRad(rz) + Math.sin(time * 0.6 + index) * 0.035 + hv * Math.sin(time * 12) * 0.04 + exit * dir * 1.4;
    g.rotation.y = Math.sin(time * 0.5 + index * 2.1) * 0.2 + hv * Math.sin(time * 7) * 0.3 + exit * dir * 1.2 + dir * pulse * 0.5;
    g.rotation.x = Math.cos(time * 0.45 + index) * 0.06;
    g.rotation.x += ph.rx;
    g.rotation.y += ph.ry;
    g.rotation.z += ph.rz;
    // la letra cercana al cursor se "enciende" (más brillo y reflejos)
    mats.front.color.setScalar(1 + ph.glow * 0.9);
    mats.spec.envMapIntensity = 2.4 + ph.glow * 2.2;
    const op = Math.max(0, 1 - exit * 1.1);
    mats.slices.forEach((m) => (m.opacity = op));
    mats.front.opacity = op;
    mats.spec.opacity = op;
  });

  if (!t || !mats) return null;
  return (
    <group ref={groupRef}>
      {mats.slices.map((m, k) => (
        <mesh key={k} position={[0, 0, -0.03 - (k / (SLICES - 1)) * D]} material={m} renderOrder={0}>
          <planeGeometry args={[W, H]} />
        </mesh>
      ))}
      <mesh ref={frontRef} material={mats.front} renderOrder={1}>
        <planeGeometry args={[W, H]} />
      </mesh>
      <mesh position={[0, 0, 0.02]} material={mats.spec} renderOrder={2}>
        <planeGeometry args={[W, H]} />
      </mesh>
    </group>
  );
};

const SMILE_P = 0.61; // fotograma de la sonrisa (mismo valor que HeroSection)
const Scene: React.FC<{
  entryRef: React.MutableRefObject<number>;
  exitRef: React.MutableRefObject<number>;
  reactRef?: React.MutableRefObject<number | null>;
}> = ({ entryRef, exitRef, reactRef }) => {
  const { gl, camera, viewport } = useThree();
  const isMobile = useMemo(() => typeof window !== 'undefined' && window.innerWidth < 768, []);
  // prefers-reduced-motion: sin física del cursor ni inclinación de la escena (movimiento Tier 1)
  const reduced = useMemo(() => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches, []);
  const mouse = useMouseClientRef();
  // rectángulo del lienzo en caché (sin forzar layout en cada cuadro, ver useCanvasRect)
  const canvasRect = useCanvasRectRef(gl.domElement);
  // consulta de medios creada una vez (.matches sigue vivo); antes se creaba en cada cuadro
  const coarseMq = useMemo(() => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(pointer: coarse)') : null), []);
  const sceneGroup = useRef<THREE.Group>(null);
  const lightRef = useRef<THREE.PointLight>(null);
  const layout = useMemo(() => computeLayout(viewport.width, viewport.height), [viewport.width, viewport.height]);
  const meshes = useRef<(THREE.Mesh | null)[]>(Array.from({ length: COUNT }, () => null));
  const texes = useRef<(Tex | null)[]>(Array.from({ length: COUNT }, () => null));
  const hoverRef = useRef<number[]>(Array.from({ length: COUNT }, () => 0));
  const physRef = useRef<Phys[]>(Array.from({ length: COUNT }, newPhys));
  const cursorRef = useRef({ x: 0, y: 0, vx: 0, vy: 0, init: false });
  const pulseRef = useRef(0);
  const startRef = useRef(-1);
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const ndc = useMemo(() => new THREE.Vector2(), []);

  const register = useMemo(
    () => (i: number, m: THREE.Mesh | null, tex: Tex | null) => {
      meshes.current[i] = m;
      texes.current[i] = tex;
    },
    []
  );

  useFrame((state, dt) => {
    // la reacción de las letras va atada al avance de la sonrisa (mismo reloj)
    const rv = reactRef?.current;
    const rTarget = rv == null ? 0 : Math.min(1, Math.max(0, (1 - rv) / (1 - SMILE_P)));
    pulseRef.current = THREE.MathUtils.damp(pulseRef.current, rTarget, 14, dt);
    const rect = canvasRect.current;
    const isTouch = !!coarseMq?.matches;
    let mx = 0;
    let my = 0;
    if (mouse.current.x > -1e3 && rect.width && rect.height) {
      mx = ((mouse.current.x - rect.left) / rect.width) * 2 - 1;
      my = -(((mouse.current.y - rect.top) / rect.height) * 2 - 1);
    } else if (isTouch) {
      // En dispositivos táctiles sin mouse activo: oscilación suave automática con Math.sin
      const time = state.clock.getElapsedTime();
      mx = Math.sin(time * 0.9) * 0.35;
      my = Math.cos(time * 0.7) * 0.22;
    }
    ndc.set(Math.max(-1, Math.min(1, mx)), Math.max(-1, Math.min(1, my)));

    // ---- Juego con el cursor (física) ----
    // El cursor es un "empujador": las letras cercanas salen despedidas según la
    // velocidad del barrido, giran sobre sí mismas, se echan hacia atrás y
    // vuelven con resorte (rebotan). Las vecinas de la misma palabra se arrastran
    // entre sí (ola). Todo en unidades de mundo.
    if (!reduced) {
      const dtp = Math.min(dt, 1 / 30);
      raycaster.setFromCamera(ndc, camera);
      const ray = raycaster.ray;
      const tPlane = -ray.origin.z / ray.direction.z;
      const cx = ray.origin.x + ray.direction.x * tPlane;
      const cy = ray.origin.y + ray.direction.y * tPlane;
      const cur = cursorRef.current;
      if (!cur.init) {
        cur.x = cx;
        cur.y = cy;
        cur.init = true;
      }
      const rawVx = (cx - cur.x) / Math.max(dtp, 1e-3);
      const rawVy = (cy - cur.y) / Math.max(dtp, 1e-3);
      cur.vx = THREE.MathUtils.damp(cur.vx, rawVx, 14, dtp);
      cur.vy = THREE.MathUtils.damp(cur.vy, rawVy, 14, dtp);
      cur.x = cx;
      cur.y = cy;
      const speed = Math.min(40, Math.hypot(cur.vx, cur.vy));
      const R = 0.17 * viewport.width;
      const ph = physRef.current;
      for (let i = 0; i < COUNT; i++) {
        const p = ph[i];
        const L = layout[i];
        const dx = L.x + p.x - cx;
        const dy = L.y + p.y - cy;
        const dist = Math.hypot(dx, dy) + 1e-4;
        const f = Math.exp(-(dist * dist) / (R * R));
        const nx = dx / dist;
        const ny = dy / dist;
        p.glow = THREE.MathUtils.damp(p.glow, Math.min(1, f * (0.55 + speed * 0.08)), 9, dtp);
        const push = (speed * 0.9 + 0.6) * f;
        p.vx += nx * push * dtp * 9;
        p.vy += ny * push * dtp * 9;
        p.vz -= f * (speed * 0.5 + 0.3) * dtp * 8;
        p.wz += (-ny * cur.vx + nx * cur.vy) * f * dtp * 0.9;
        p.wy += cur.vx * f * dtp * 0.8;
        p.wx += -cur.vy * f * dtp * 0.6;
        // arrastre entre vecinas de la misma palabra
        const first = i < PORTA_SPEC.length ? 0 : PORTA_SPEC.length;
        const last = i < PORTA_SPEC.length ? PORTA_SPEC.length - 1 : COUNT - 1;
        const a = ph[Math.max(first, i - 1)];
        const b = ph[Math.min(last, i + 1)];
        p.vx += ((a.x + b.x) * 0.5 - p.x) * 6 * dtp;
        p.vy += ((a.y + b.y) * 0.5 - p.y) * 6 * dtp;
      }
      for (let i = 0; i < COUNT; i++) {
        const p = ph[i];
        // resortes (rebote) con amortiguación
        p.vx += (-38 * p.x - 5.2 * p.vx) * dtp;
        p.vy += (-38 * p.y - 5.2 * p.vy) * dtp;
        p.vz += (-30 * p.z - 4.6 * p.vz) * dtp;
        p.wx += (-30 * p.rx - 4 * p.wx) * dtp;
        p.wy += (-30 * p.ry - 4 * p.wy) * dtp;
        p.wz += (-26 * p.rz - 3.6 * p.wz) * dtp;
        p.x = THREE.MathUtils.clamp(p.x + p.vx * dtp, -1.8, 1.8);
        p.y = THREE.MathUtils.clamp(p.y + p.vy * dtp, -1.8, 1.8);
        p.z = THREE.MathUtils.clamp(p.z + p.vz * dtp, -2.2, 1);
        p.rx = THREE.MathUtils.clamp(p.rx + p.wx * dtp, -1.1, 1.1);
        p.ry = THREE.MathUtils.clamp(p.ry + p.wy * dtp, -1.3, 1.3);
        p.rz = THREE.MathUtils.clamp(p.rz + p.wz * dtp, -1.1, 1.1);
      }
    }

    // profundidad: la escena entera se inclina hacia el cursor — las letras, a
    // distinta z y con grosor, se desplazan unas respecto de otras y se ven sus
    // costados
    const g = sceneGroup.current;
    if (g) {
      g.rotation.y = THREE.MathUtils.damp(g.rotation.y, reduced ? 0 : ndc.x * 0.2, 3, dt);
      g.rotation.x = THREE.MathUtils.damp(g.rotation.x, reduced ? 0 : -ndc.y * 0.12, 3, dt);
    }
    // luz que sigue al cursor: los brillos recorren la superficie de las letras
    const L = lightRef.current;
    if (L) {
      L.position.x = THREE.MathUtils.damp(L.position.x, ndc.x * viewport.width * 0.55, 6, dt);
      L.position.y = THREE.MathUtils.damp(L.position.y, ndc.y * viewport.height * 0.55, 6, dt);
    }

    // hover por forma: se prueba el alfa de la imagen bajo el cursor; solo
    // cuenta la letra más cercana a la cámara que esté realmente "sólida" ahí
    raycaster.setFromCamera(ndc, camera);
    const hovered = Array.from({ length: COUNT }, () => false);
    let bestDist = Infinity;
    let bestIdx = -1;
    meshes.current.forEach((m, i) => {
      const tex = texes.current[i];
      if (!m || !tex) return;
      const hit = raycaster.intersectObject(m, false)[0];
      if (!hit?.uv) return;
      const px = Math.min(tex.w - 1, Math.max(0, Math.floor(hit.uv.x * tex.w)));
      const py = Math.min(tex.h - 1, Math.max(0, Math.floor((1 - hit.uv.y) * tex.h)));
      if (tex.alpha[py * tex.w + px] > 70 && hit.distance < bestDist) {
        bestDist = hit.distance;
        bestIdx = i;
      }
    });
    if (bestIdx >= 0) hovered[bestIdx] = true;
    hoverRef.current = hoverRef.current.map((v, i) => THREE.MathUtils.damp(v, hovered[i] ? 1 : 0, 8, dt));
  });

  return (
    <>
      {/* Estudio de luz: paneles blancos (brillos largos de "globo") y toques de
          color que tiñen el borde del vidrio. */}
      <Environment resolution={256}>
        <Lightformer form="rect" intensity={5} color="#ffffff" position={[0, 6, 3]} scale={[16, 3, 1]} />
        <Lightformer form="rect" intensity={3.5} color="#ffffff" position={[9, 0, 3]} scale={[2.5, 12, 1]} />
        <Lightformer form="rect" intensity={3.5} color="#ffffff" position={[-9, 0, 3]} scale={[2.5, 12, 1]} />
        <Lightformer form="circle" intensity={2.6} color="#9fe8ff" position={[0, -6, 4]} scale={5} />
        <Lightformer form="circle" intensity={2} color="#ff7ad9" position={[5, -3, 5]} scale={3} />
      </Environment>
      <pointLight ref={lightRef} position={[0, 0, 4]} intensity={70} distance={0} decay={2} color="#ffffff" />
      {/* En celulares el layout retrato ya calcula el ancho exacto con spanW = 0.94 * w */}
      <group ref={sceneGroup} scale={viewport.width < viewport.height * 0.95 ? 1 : (isMobile ? 0.65 : 1)}>
        {layout.map((cfg, i) => (
          <Letter
            key={i}
            index={i}
            cfg={cfg}
            entryRef={entryRef}
            exitRef={exitRef}
            pulseRef={pulseRef}
            startRef={startRef}
            register={register}
            hoverRef={hoverRef}
            physRef={physRef}
          />
        ))}
      </group>
      {/* precalentado (shaders, entorno) cuando las 10 letras ya tienen textura y malla */}
      <WarmUp delay={0} ready={() => texes.current.every(Boolean)} />
    </>
  );
};

type Letters3DProps = {
  entry: number;
  exit: number;
  active: boolean;
  // Si tiene valor (0-1), es el fotograma de la reacción de la figura (ver
  // frameOverrideRef en HeroSection): las letras acompañan ese movimiento.
  reactRef?: React.MutableRefObject<number | null>;
  className?: string;
  style?: React.CSSProperties;
};

// memo con `style` comparado por contenido (el padre suele pasar un objeto nuevo por render)
const sameStyle = (a?: React.CSSProperties, b?: React.CSSProperties) => {
  if (a === b) return true;
  if (!a || !b) return false;
  const ka = Object.keys(a) as (keyof React.CSSProperties)[];
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => Object.is(a[k], b[k]));
};
const sameLetters = (a: Letters3DProps, b: Letters3DProps) =>
  a.entry === b.entry &&
  a.exit === b.exit &&
  a.active === b.active &&
  a.reactRef === b.reactRef &&
  a.className === b.className &&
  sameStyle(a.style, b.style);

const Letters3DImpl: React.FC<Letters3DProps> = ({ entry, exit, active, reactRef, className = '', style }) => {
  const entryRef = useRef(entry);
  entryRef.current = entry;
  const exitRef = useRef(exit);
  exitRef.current = exit;
  const isMobile = useMemo(() => typeof window !== 'undefined' && window.innerWidth < 768, []);
  // Detrás de la pantalla de carga las letras todavía no entran (su rebote arranca al
  // terminar la carga) y no se ven: no se dibuja cuadro a cuadro. Así el primer dibujo
  // no compila los shaders de golpe en el hilo principal (~1 s congelando la carga);
  // los prepara WarmUp en paralelo.
  const [loading, setLoading] = useState(isPreloading);
  useEffect(() => {
    if (!isPreloading()) {
      setLoading(false);
      return;
    }
    const done = () => setLoading(false);
    window.addEventListener('preloader-done', done, { once: true });
    return () => window.removeEventListener('preloader-done', done);
  }, []);
  return (
    <div className={`pointer-events-none ${className}`} style={style}>
      <Canvas
        frameloop={active && !loading ? 'always' : 'never'}
        dpr={isMobile ? [1, 1.5] : [1, 2]}
        camera={{ position: [0, 0, 14], fov: 30 }}
        gl={{ alpha: true, antialias: true, toneMapping: THREE.NoToneMapping }}
      >
        <Suspense fallback={null}>
          <Scene entryRef={entryRef} exitRef={exitRef} reactRef={reactRef} />
        </Suspense>
      </Canvas>
    </div>
  );
};

export const Letters3D = React.memo(Letters3DImpl, sameLetters);
