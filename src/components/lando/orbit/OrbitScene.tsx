import React, { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { ORBIT, ORBIT_COLORS, CORE_R, orbitFrame, type Journey, type OrbitPath } from './orbitData';

// Escena 3D de la órbita: núcleo luminoso, 4 anillos inclinados (categorías),
// nodos (tecnologías), pistas tipo circuito núcleo → categoría → tecnología y
// un "cometa" que recorre las órbitas y enciende los caminos al pasar.
// No hay lecturas de layout por cuadro: las etiquetas DOM se mueven escribiendo
// transform/opacity a partir de la proyección de cada nodo.

export type OrbitShared = {
  journey: React.MutableRefObject<Journey>; // viaje del scroll: llegada, circuitos, UI
  focusCat: number; // -1 = ninguno
  focusTech: string | null; // id "cat-idx"
  pointer: { x: number; y: number }; // -1..1 para el paralaje
  reduced: boolean;
  techLabels: (HTMLElement | null)[];
  hubLabels: (HTMLElement | null)[];
  legend: HTMLElement | null; // leyenda + título: aparecen con la UI
  invalidate?: () => void;
};

const ACCENT = new THREE.Color(ORBIT_COLORS.accent);
const WHITE = new THREE.Color(ORBIT_COLORS.white);
const DIM = new THREE.Color('#3a4a62');

// ---------- utilidades ----------
// Curva a partir de una polilínea (parametrizada por longitud de arco) para TubeGeometry
class PolyCurve extends THREE.Curve<THREE.Vector3> {
  pts: THREE.Vector3[];
  acc: number[];
  total: number;
  constructor(pts: THREE.Vector3[]) {
    super();
    this.pts = pts;
    this.acc = [0];
    for (let i = 1; i < pts.length; i++) this.acc.push(this.acc[i - 1] + pts[i].distanceTo(pts[i - 1]));
    this.total = this.acc[this.acc.length - 1];
  }
  getPoint(t: number, target = new THREE.Vector3()) {
    const d = THREE.MathUtils.clamp(t, 0, 1) * this.total;
    let i = 1;
    while (i < this.acc.length - 1 && this.acc[i] < d) i++;
    const a = this.acc[i - 1];
    const span = this.acc[i] - a || 1;
    return target.copy(this.pts[i - 1]).lerp(this.pts[i], (d - a) / span);
  }
}

// textura de halo (degradado radial) compartida por todos los brillos
function makeGlowTexture() {
  const s = 128;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.18, 'rgba(255,255,255,0.55)');
  grd.addColorStop(0.45, 'rgba(255,255,255,0.14)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, s, s);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// destellos de difracción (4 rayos finos) para que el núcleo lea como estrella
function makeSpikeTexture() {
  const s = 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d')!;
  g.globalCompositeOperation = 'lighter';
  g.translate(s / 2, s / 2);
  for (const rot of [0, Math.PI / 2]) {
    g.save();
    g.rotate(rot);
    const grd = g.createLinearGradient(-s / 2, 0, s / 2, 0);
    grd.addColorStop(0, 'rgba(255,255,255,0)');
    grd.addColorStop(0.5, 'rgba(255,255,255,0.9)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.ellipse(0, 0, s / 2, 1.6, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const smooth = (e0: number, e1: number, x: number) => {
  const t = THREE.MathUtils.clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

// ---------- shaders ----------
const PATH_VERT = /* glsl */ `
  varying float vT;
  void main() {
    vT = uv.x;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
// uReveal: hasta dónde está "dibujado" el camino; uEnergy: brillo (foco/atenuado);
// uFlash: destello del cometa. Pulsos que fluyen del núcleo hacia afuera.
const PATH_FRAG = /* glsl */ `
  uniform float uReveal;
  uniform float uEnergy;
  uniform float uFlash;
  uniform float uTime;
  uniform float uSeed;
  uniform vec3 uAccent;
  uniform vec3 uWhite;
  varying float vT;
  void main() {
    float t = vT;
    float drawn = (1.0 - smoothstep(uReveal - 0.015, uReveal, t)) * step(0.001, uReveal);
    float head = exp(-pow((t - uReveal) * 34.0, 2.0)) * step(0.001, uReveal) * (1.0 - step(0.999, uReveal));
    float flow = pow(fract(t * 2.2 - uTime * 0.45 + uSeed), 14.0);
    vec3 ghost = uWhite * 0.09;
    vec3 lit = uAccent * (0.22 + 0.95 * uEnergy) + uWhite * (flow * uEnergy * 0.85 + uFlash * 0.75);
    vec3 col = mix(ghost, lit, drawn) + uWhite * head * 1.4;
    float a = mix(0.55, 0.35 + 0.65 * min(uEnergy, 1.0), drawn) + head;
    vec3 o = col * a;
    gl_FragColor = vec4(o, min(1.0, max(o.r, max(o.g, o.b))));
  }
`;

const CORE_VERT = /* glsl */ `
  varying vec3 vN;
  varying vec3 vV;
  varying vec3 vP;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mv.xyz);
    vP = position;
    gl_Position = projectionMatrix * mv;
  }
`;
// el núcleo es la ESTRELLA del sistema: centro blanco incandescente, granulación
// que hierve despacio, limbo magenta y borde de corona
const CORE_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uPulse;
  uniform vec3 uAccent;
  uniform vec3 uWhite;
  varying vec3 vN;
  varying vec3 vV;
  varying vec3 vP;
  void main() {
    float fres = 1.0 - max(dot(normalize(vN), normalize(vV)), 0.0);
    float facing = 1.0 - fres;
    vec3 p = vP * 7.0;
    float g1 = sin(p.x * 1.9 + uTime * 0.6) * sin(p.y * 2.3 - uTime * 0.5) * sin(p.z * 2.1 + uTime * 0.4);
    float g2 = sin(p.x * 4.7 - uTime * 0.9) * sin(p.y * 5.1 + uTime * 0.7) * sin(p.z * 4.3 - uTime * 0.8);
    float gran = 0.5 + 0.5 * (g1 * 0.65 + g2 * 0.35);
    vec3 col = mix(uAccent * 0.95, mix(uAccent, uWhite, 0.55), pow(facing, 1.3));
    col = mix(col, vec3(1.0, 0.97, 1.0) * 1.2, pow(facing, 3.2) * (0.8 + 0.2 * uPulse));
    col *= 0.8 + 0.32 * gran;
    col += uAccent * pow(fres, 2.0) * 1.1 + uWhite * pow(fres, 6.0) * (0.6 + uPulse);
    gl_FragColor = vec4(col, 1.0);
  }
`;

// planetas (hubs de categoría): iluminados desde la estrella, con terminador y
// atmósfera magenta en el borde
const PLANET_VERT = /* glsl */ `
  varying vec3 vWN;
  varying vec3 vWP;
  varying vec3 vV;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWP = wp.xyz;
    vWN = normalize(mat3(modelMatrix) * normal);
    vV = normalize(cameraPosition - wp.xyz);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;
const PLANET_FRAG = /* glsl */ `
  uniform vec3 uLight;
  uniform float uEnergy;
  uniform float uReveal;
  uniform vec3 uAccent;
  uniform vec3 uWhite;
  varying vec3 vWN;
  varying vec3 vWP;
  varying vec3 vV;
  void main() {
    vec3 N = normalize(vWN);
    vec3 L = normalize(uLight - vWP);
    float lam = max(dot(N, L), 0.0);
    float fres = 1.0 - max(dot(N, normalize(vV)), 0.0);
    vec3 dark = vec3(0.03, 0.06, 0.11);
    vec3 lit = mix(uAccent, uWhite, 0.25 + 0.35 * uEnergy);
    vec3 col = mix(dark, lit, smoothstep(0.0, 0.9, lam) * (0.55 + 0.45 * uEnergy));
    col += uAccent * pow(fres, 2.2) * (0.5 + 0.9 * uEnergy) * (0.35 + 0.65 * lam);
    gl_FragColor = vec4(col * (0.25 + 0.75 * uReveal), 1.0);
  }
`;

const TRAIL_VERT = /* glsl */ `
  attribute float aFade;
  uniform float uSize;
  varying float vFade;
  void main() {
    vFade = aFade;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = uSize * pow(aFade, 1.6) * (10.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;
const TRAIL_FRAG = /* glsl */ `
  uniform vec3 uAccent;
  uniform vec3 uWhite;
  uniform float uAlpha;
  varying float vFade;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float a = smoothstep(1.0, 0.0, d);
    a *= a;
    vec3 col = mix(uAccent, uWhite, pow(vFade, 3.0));
    vec3 o = col * a * vFade * uAlpha;
    gl_FragColor = vec4(o, min(1.0, max(o.r, max(o.g, o.b))));
  }
`;

// ---------- índices ----------
const TECHS = ORBIT.cats.flatMap((c) => c.techs);
const techGlobal = new Map(TECHS.map((t, i) => [t.id, i]));
const PATHS = ORBIT.paths;
const pathOfTech = new Map<string, number>();
const pathOfCat: number[] = [];
PATHS.forEach((p, i) => {
  if (p.tech < 0) pathOfCat[p.cat] = i;
  else pathOfTech.set(`${p.cat}-${p.tech}`, i);
});

const additive = {
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
} as const;

// ---------- escena ----------
export const OrbitScene: React.FC<{ shared: React.MutableRefObject<OrbitShared> }> = ({ shared }) => {
  const { invalidate } = useThree();
  useLayoutEffect(() => {
    shared.current.invalidate = invalidate;
  }, [invalidate, shared]);

  const glow = useMemo(makeGlowTexture, []);
  const spikes = useMemo(makeSpikeTexture, []);
  const spikeSprite = useRef<THREE.Sprite>(null);
  const corona = useRef<THREE.Sprite>(null);
  const root = useRef<THREE.Group>(null);
  // material de cada planeta (hub): uniforms propios
  const planetMats = useMemo(
    () =>
      ORBIT.cats.map(
        () =>
          new THREE.ShaderMaterial({
            vertexShader: PLANET_VERT,
            fragmentShader: PLANET_FRAG,
            uniforms: {
              uLight: { value: new THREE.Vector3() },
              uEnergy: { value: 0.5 },
              uReveal: { value: 0 },
              uAccent: { value: ACCENT },
              uWhite: { value: WHITE },
            },
          })
      ),
    []
  );
  const spins = useRef<(THREE.Group | null)[]>([]);
  const coreMat = useRef<THREE.ShaderMaterial>(null);
  const coreHalo = useRef<THREE.Sprite>(null);

  // geometrías y materiales de los caminos (uno por camino: uniforms propios)
  const paths = useMemo(
    () =>
      PATHS.map((p: OrbitPath, i) => {
        const curve = new PolyCurve(p.points);
        const geo = new THREE.TubeGeometry(curve, Math.max(24, Math.ceil(curve.total * 40)), p.tech < 0 ? 0.013 : 0.009, 5, false);
        const mat = new THREE.ShaderMaterial({
          vertexShader: PATH_VERT,
          fragmentShader: PATH_FRAG,
          uniforms: {
            uReveal: { value: 0 },
            uEnergy: { value: 0.5 },
            uFlash: { value: 0 },
            uTime: { value: 0 },
            uSeed: { value: (i * 0.137) % 1 },
            uAccent: { value: ACCENT },
            uWhite: { value: WHITE },
          },
          ...additive,
          premultipliedAlpha: true,
        });
        return { p, curve, geo, mat };
      }),
    []
  );

  // anillos: círculo fino + polvo orbital
  const rings = useMemo(
    () =>
      ORBIT.cats.map((c, ci) => {
        const pts: THREE.Vector3[] = [];
        for (let i = 0; i <= 160; i++) {
          const a = (i / 160) * Math.PI * 2;
          pts.push(new THREE.Vector3(Math.cos(a) * c.radius, Math.sin(a) * c.radius, 0));
        }
        const geo = new THREE.TubeGeometry(new PolyCurve(pts), 220, 0.006, 4, true);
        const mat = new THREE.MeshBasicMaterial({ color: WHITE.clone(), opacity: 0.2, ...additive });
        // polvo: partículas repartidas alrededor del radio del anillo
        const N = 70 + ci * 26;
        const pos = new Float32Array(N * 3);
        let s = 1234 + ci * 99;
        const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
        for (let i = 0; i < N; i++) {
          const a = rnd() * Math.PI * 2;
          const r = c.radius + (rnd() + rnd() + rnd() - 1.5) * 0.16;
          pos[i * 3] = Math.cos(a) * r;
          pos[i * 3 + 1] = Math.sin(a) * r;
          pos[i * 3 + 2] = (rnd() - 0.5) * 0.08;
        }
        const dgeo = new THREE.BufferGeometry();
        dgeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        const dmat = new THREE.PointsMaterial({ size: 0.05, map: glow, color: WHITE.clone(), opacity: 0.4, sizeAttenuation: true, ...additive });
        return { geo, mat, dgeo, dmat };
      }),
    [glow]
  );

  const coreUniforms = useMemo(
    () => ({ uTime: { value: 0 }, uPulse: { value: 0 }, uAccent: { value: ACCENT }, uWhite: { value: WHITE } }),
    []
  );

  // cáscara de partículas que envuelve el núcleo (corona de la estrella)
  const shell = useRef<THREE.Points>(null);
  const [shellGeo, shellMat] = useMemo(() => {
    const N = 520;
    const pos = new Float32Array(N * 3);
    let s = 777;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < N; i++) {
      // reparto uniforme en la esfera (Fibonacci) con radio levemente variable
      const y = 1 - (2 * (i + 0.5)) / N;
      const r = Math.sqrt(1 - y * y);
      const a = i * 2.399963;
      const R = CORE_R * (1.18 + rnd() * 0.35);
      pos.set([Math.cos(a) * r * R, y * R, Math.sin(a) * r * R], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ size: 0.035, map: glow, color: new THREE.Color('#f7b8ec'), opacity: 0.55, sizeAttenuation: true, ...additive });
    return [geo, mat] as const;
  }, [glow]);

  // nodos (refs a malla y halo)
  const nodeMesh = useRef<(THREE.Mesh | null)[]>([]);
  const nodeHalo = useRef<(THREE.Sprite | null)[]>([]);
  const hubMesh = useRef<(THREE.Mesh | null)[]>([]);
  const hubHalo = useRef<(THREE.Sprite | null)[]>([]);

  // cometa + estela
  const comet = useRef<THREE.Group>(null);
  const TRAIL = 46;
  const trail = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(TRAIL * 3);
    const fade = new Float32Array(TRAIL);
    for (let i = 0; i < TRAIL; i++) fade[i] = 1 - i / TRAIL;
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aFade', new THREE.BufferAttribute(fade, 1));
    const mat = new THREE.ShaderMaterial({
      vertexShader: TRAIL_VERT,
      fragmentShader: TRAIL_FRAG,
      uniforms: { uSize: { value: 30 }, uAccent: { value: ACCENT }, uWhite: { value: WHITE }, uAlpha: { value: 1 } },
      ...additive,
      premultipliedAlpha: true,
    });
    return { geo, mat, pos, filled: false };
  }, []);
  const trailPts = useRef<THREE.Points>(null);

  // estado animado (suavizado) — sin React por cuadro
  const st = useMemo(
    () => ({
      t: 0,
      cat: new Float32Array(4).fill(0.5),
      node: new Float32Array(TECHS.length).fill(0.5),
      path: new Float32Array(PATHS.length).fill(0.5),
      flash: new Float32Array(PATHS.length),
      ping: new Float32Array(TECHS.length),
      side: new Int8Array(TECHS.length),
      hubSide: new Int8Array(4),
      tilt: new THREE.Vector2(),
      cometClock: 0,
      lastAngle: 0,
    }),
    []
  );

  const v = useMemo(() => new THREE.Vector3(), []);
  const vv = useMemo(() => new THREE.Vector3(), []);
  const coreView = useMemo(() => new THREE.Vector3(), []);

  // limpieza de GPU al desmontar
  useLayoutEffect(
    () => () => {
      paths.forEach((x) => (x.geo.dispose(), x.mat.dispose()));
      rings.forEach((r) => (r.geo.dispose(), r.mat.dispose(), r.dgeo.dispose(), r.dmat.dispose()));
      trail.geo.dispose();
      trail.mat.dispose();
      shellGeo.dispose();
      shellMat.dispose();
      glow.dispose();
      spikes.dispose();
      planetMats.forEach((m) => m.dispose());
    },
    [paths, rings, trail, glow, spikes, planetMats, shellGeo, shellMat]
  );

  // recorrido del cometa: vuelta completa al anillo k (desde su hub), baja por
  // su pista al núcleo y sube por la pista del anillo k+1 hasta su hub.
  const LAP = (k: number) => 2.1 * ORBIT.cats[k].radius;
  const LEG = 0.85;
  const cycleLen = ORBIT.cats.reduce((s, _c, k) => s + LAP(k) + LEG * 2, 0);

  // posición del cometa en coords de mundo; devuelve también el tramo activo
  const cometAt = (clock: number, out: THREE.Vector3) => {
    let t = clock % cycleLen;
    for (let k = 0; k < 4; k++) {
      const lap = LAP(k);
      const c = ORBIT.cats[k];
      const sp = spins.current[k];
      if (t < lap) {
        const u = t / lap;
        const a = c.hubAngle + u * Math.PI * 2;
        out.set(Math.cos(a) * c.radius, Math.sin(a) * c.radius, 0);
        if (sp) out.applyMatrix4(sp.matrixWorld);
        return { mode: 0, k, a, path: -1 };
      }
      t -= lap;
      if (t < LEG) {
        const pi = pathOfCat[k];
        paths[pi].curve.getPoint(1 - smooth(0, 1, t / LEG), out);
        if (sp) out.applyMatrix4(sp.matrixWorld);
        return { mode: 1, k, a: 0, path: pi };
      }
      t -= LEG;
      if (t < LEG) {
        const k2 = (k + 1) % 4;
        const pi = pathOfCat[k2];
        paths[pi].curve.getPoint(smooth(0, 1, t / LEG), out);
        const sp2 = spins.current[k2];
        if (sp2) out.applyMatrix4(sp2.matrixWorld);
        return { mode: 2, k: k2, a: 0, path: pi };
      }
      t -= LEG;
    }
    return { mode: -1, k: 0, a: 0, path: -1 };
  };

  useFrame((state, rawDt) => {
    const S = shared.current;
    const reduced = S.reduced;
    const dt = Math.min(rawDt, 0.05);
    const k = reduced ? 1 : 1 - Math.exp(-dt * 6); // factor de suavizado
    if (!reduced) st.t += dt;
    const time = st.t;
    const { size, viewport, camera } = state;

    const J = S.journey.current;
    // encuadre compartido con el fondo (punto de fuga del salto = núcleo)
    const vp = viewport.getCurrentViewport(camera, [0, 0, 0]);
    const fr = orbitFrame(size.width, size.height);
    const wpp = vp.width / size.width; // unidades de mundo por px
    const offX = (fr.cx - size.width / 2) * wpp;
    const offY = -(fr.cy - size.height / 2) * wpp;
    const fit = Math.min(1.25, (fr.availH * wpp) / 6.4, (fr.availW * wpp) / 8.9);
    const g = root.current!;

    // LLEGADA: el sistema viene desde muy lejos (primero es una estrella en el
    // punto de fuga del salto) y frena hasta su sitio, desenrollándose un poco.
    // La profundidad se compensa en x/y para que el núcleo no se mueva en pantalla.
    const arrive = reduced ? 1 : J.arrive;
    const far = Math.pow(1 - arrive, 2) * 200;
    const persp = (11 + far) / 11;
    g.position.set(offX * persp, offY * persp, -far);
    // SALIDA: la órbita se enrolla y colapsa hacia el núcleo hasta ser un punto
    // (el fondo toma ese punto de luz y lo convierte en la lámpara de la oficina)
    const collapse = reduced ? 0 : J.collapse;
    const shrink = Math.pow(1 - collapse, 1.6);
    g.scale.setScalar(fit * Math.max(shrink, 0.0001));
    g.visible = collapse < 0.995;

    // paralaje del puntero (inclina todo el sistema)
    const px = reduced ? 0 : S.pointer.x;
    const py = reduced ? 0 : S.pointer.y;
    st.tilt.x += (py * 0.16 - st.tilt.x) * (reduced ? 1 : 1 - Math.exp(-dt * 3));
    st.tilt.y += (px * 0.28 - st.tilt.y) * (reduced ? 1 : 1 - Math.exp(-dt * 3));
    g.rotation.set(-0.08 + st.tilt.x - (1 - arrive) * 0.5, st.tilt.y, -(1 - arrive) * 1.2 + collapse * collapse * 5);

    // leyenda + título (DOM): entran con la UI
    if (S.legend) {
      const ui = reduced ? 1 : J.ui;
      S.legend.style.opacity = ui.toFixed(3);
      S.legend.style.transform = `translate3d(0,${((1 - ui) * 24).toFixed(1)}px,0)`;
      S.legend.style.pointerEvents = ui > 0.5 ? 'auto' : 'none';
    }

    // giro propio de cada anillo
    ORBIT.cats.forEach((c, ci) => {
      const sp = spins.current[ci];
      if (sp) sp.rotation.z = c.spin * time;
    });
    g.updateMatrixWorld(true);

    // ---- foco: energía objetivo por categoría / nodo / camino ----
    const fc = S.focusCat;
    const ft = S.focusTech;
    const p = reduced ? 1 : J.reveal;
    const uiA = reduced ? 1 : J.ui;
    // categoría e índice de la tecnología en foco (una vez por cuadro)
    const ftCat = ft ? Number(ft.slice(0, ft.indexOf('-'))) : -1;
    const ftIdx = ft ? Number(ft.slice(ft.indexOf('-') + 1)) : -1;
    for (let ci = 0; ci < 4; ci++) {
      const target = fc < 0 ? 0.55 : fc === ci ? 1 : 0.07;
      st.cat[ci] += (target - st.cat[ci]) * k;
    }

    // ---- cometa ----
    let cm = { mode: -1, k: 0, a: 0, path: -1 };
    if (!reduced && comet.current) {
      st.cometClock += dt;
      cm = cometAt(st.cometClock, v);
      comet.current.position.copy(v);
      // estela: desplaza el historial y agrega la posición nueva al frente
      const tp = trail.pos;
      if (!trail.filled) {
        for (let i = 0; i < TRAIL; i++) tp.set([v.x, v.y, v.z], i * 3);
        trail.filled = true;
      }
      tp.copyWithin(3, 0, (TRAIL - 1) * 3);
      tp[0] = v.x;
      tp[1] = v.y;
      tp[2] = v.z;
      (trail.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      comet.current.visible = p > 0.35 && collapse < 0.05;
      if (trailPts.current) trailPts.current.visible = p > 0.35 && collapse < 0.05;
      // al pasar por una tecnología la "enciende" junto con su camino
      if (cm.mode === 0) {
        const c = ORBIT.cats[cm.k];
        for (const t of c.techs) {
          let d = Math.abs(((cm.a - t.angle) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
          d = Math.min(d, Math.PI * 2 - d);
          if (d < 0.09) {
            const gi = techGlobal.get(t.id)!;
            st.ping[gi] = 1;
            st.flash[pathOfTech.get(t.id)!] = 1;
          }
        }
      } else if (cm.path >= 0) st.flash[cm.path] = 1;
    } else if (comet.current) {
      comet.current.visible = false;
      if (trailPts.current) trailPts.current.visible = false;
    }

    // ---- caminos ----
    paths.forEach(({ p: path, mat }, i) => {
      const reveal = smooth(path.revealStart, path.revealStart + path.revealDur, p);
      let target = st.cat[path.cat];
      if (ft && path.cat === ftCat) target = path.tech === ftIdx ? 1.9 : path.tech < 0 ? 1.4 : 0.22;
      st.path[i] += (target - st.path[i]) * k;
      st.flash[i] = Math.max(0, st.flash[i] - dt * 1.4);
      const u = mat.uniforms;
      u.uReveal.value = reveal;
      u.uEnergy.value = st.path[i] + st.flash[i] * 0.6 * Math.min(1, st.cat[path.cat] * 2);
      u.uFlash.value = st.flash[i] * Math.min(1, st.cat[path.cat] * 2);
      u.uTime.value = time;
    });

    // ---- anillos ----
    rings.forEach((r, ci) => {
      const e = st.cat[ci];
      const reveal = smooth(ci * 0.07, ci * 0.07 + 0.3, p);
      r.mat.color.copy(WHITE).lerp(ACCENT, smooth(0.6, 1, e));
      r.mat.opacity = (0.08 + 0.32 * e) * (0.3 + 0.7 * reveal);
      r.dmat.opacity = (0.12 + 0.45 * e) * reveal;
      r.dmat.color.copy(WHITE).lerp(ACCENT, smooth(0.6, 1, e) * 0.7);
    });

    // ---- núcleo ----
    const anyFocus = fc >= 0 ? 1 : 0;
    coreUniforms.uTime.value = time;
    coreUniforms.uPulse.value += (anyFocus * 0.6 + (cm.mode === 1 || cm.mode === 2 ? 0.5 : 0) - coreUniforms.uPulse.value) * k;
    if (shell.current) {
      shell.current.rotation.y = time * 0.12;
      shell.current.rotation.x = Math.sin(time * 0.2) * 0.2;
      shellMat.opacity = 0.25 + 0.4 * p + coreUniforms.uPulse.value * 0.2;
    }
    // de lejos (llegada) la estrella brilla más grande en proporción, como un faro
    const beacon = 1 + (1 - arrive) * 2.2 + collapse * 5; // también al colapsar: queda un punto brillante
    if (coreHalo.current) {
      const s = (3.6 + Math.sin(time * 1.3) * 0.14 + coreUniforms.uPulse.value * 0.5) * beacon;
      coreHalo.current.scale.set(s, s, 1);
      (coreHalo.current.material as THREE.SpriteMaterial).opacity = 0.55 + 0.3 * p;
    }
    if (corona.current) {
      const s = (8.5 + Math.sin(time * 0.7) * 0.3) * beacon;
      corona.current.scale.set(s, s, 1);
    }
    if (spikeSprite.current) {
      const s = (4.6 + Math.sin(time * 2.1) * 0.25 + coreUniforms.uPulse.value * 0.8) * (1 + (1 - arrive) * 3);
      spikeSprite.current.scale.set(s, s, 1);
      const sm = spikeSprite.current.material as THREE.SpriteMaterial;
      sm.rotation = 0.35 + time * 0.03;
      sm.opacity = 0.55 + 0.25 * (1 - arrive);
    }
    // luz de los planetas = posición de la estrella en el mundo
    v.set(0, 0, 0).applyMatrix4(g.matrixWorld);
    planetMats.forEach((m) => m.uniforms.uLight.value.copy(v));

    // ---- nodos + etiquetas proyectadas ----
    const W = size.width;
    const H = size.height;
    coreView.set(0, 0, 0).applyMatrix4(g.matrixWorld).applyMatrix4(camera.matrixWorldInverse);
    const coreDepth = -coreView.z;
    TECHS.forEach((t, gi) => {
      const pi = pathOfTech.get(t.id)!;
      const reveal = smooth(PATHS[pi].revealStart + PATHS[pi].revealDur * 0.7, PATHS[pi].revealStart + PATHS[pi].revealDur, p);
      let target = st.cat[t.cat];
      if (ft) target = ft === t.id ? 1.5 : t.cat === ftCat ? 0.45 : 0.07;
      st.node[gi] += (target - st.node[gi]) * k;
      st.ping[gi] = Math.max(0, st.ping[gi] - dt * 1.6);
      const e = st.node[gi];
      const ping = st.ping[gi] * Math.min(1, st.cat[t.cat] * 2);
      const m = nodeMesh.current[gi];
      if (m) {
        // ocultos hasta encenderse (si no, puntos oscuros sobre el destello)
        m.visible = reveal > 0.02;
        const mat = m.material as THREE.MeshBasicMaterial;
        mat.color.copy(DIM).lerp(WHITE, Math.min(1, reveal * (0.35 + e))).lerp(ACCENT, smooth(0.75, 1.3, e) + ping * 0.6);
        m.scale.setScalar(0.6 + 0.4 * reveal + smooth(1, 1.5, e) * 0.5 + ping * 0.5);
      }
      const h = nodeHalo.current[gi];
      if (h) {
        const s = (0.28 + 0.5 * Math.min(e, 1.5) + ping * 0.6) * reveal;
        h.scale.set(s, s, 1);
        (h.material as THREE.SpriteMaterial).opacity = (0.25 + 0.5 * Math.min(e, 1) + ping * 0.5) * reveal;
      }

      // etiqueta DOM
      const el = S.techLabels[gi];
      const sp = spins.current[t.cat];
      if (!el || !sp) return;
      v.copy(t.local).applyMatrix4(sp.matrixWorld);
      vv.copy(v).applyMatrix4(camera.matrixWorldInverse);
      const front = (coreDepth - -vv.z) / (ORBIT.cats[t.cat].radius * fit); // >0 = delante del núcleo
      v.project(camera);
      const x = (v.x * 0.5 + 0.5) * W;
      const y = (-v.y * 0.5 + 0.5) * H;
      const depthA = 0.1 + 0.9 * smooth(-0.45, 0.4, front);
      const focusA = ft === t.id ? 1 : Math.min(1, 0.2 + e * 1.1);
      const a = uiA * reveal * Math.max(depthA * focusA, ft === t.id || fc === t.cat ? 0.85 : 0);
      el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`;
      el.style.opacity = a.toFixed(3);
      el.style.zIndex = String(Math.round(front * 10) + 20);
      const side = x < W * 0.5 + offX * (W / vp.width) ? -1 : 1;
      if (side !== st.side[gi]) {
        st.side[gi] = side;
        el.dataset.side = side < 0 ? 'l' : 'r';
      }
      el.style.pointerEvents = a > 0.25 ? 'auto' : 'none';
    });

    // hubs (categorías)
    ORBIT.cats.forEach((c, ci) => {
      const e = st.cat[ci];
      const reveal = smooth(PATHS[pathOfCat[ci]].revealStart + 0.15, PATHS[pathOfCat[ci]].revealStart + 0.26, p);
      const m = hubMesh.current[ci];
      if (m) {
        if (m.parent) m.parent.visible = reveal > 0.02;
        m.scale.setScalar((0.5 + 0.5 * reveal) * (0.9 + 0.35 * e));
        const pu = planetMats[ci].uniforms;
        pu.uEnergy.value = Math.min(1.2, e);
        pu.uReveal.value = reveal;
      }
      const h = hubHalo.current[ci];
      if (h) {
        const s = (0.7 + 0.9 * e) * reveal;
        h.scale.set(s, s, 1);
        (h.material as THREE.SpriteMaterial).opacity = (0.3 + 0.5 * e) * reveal;
      }
      const el = S.hubLabels[ci];
      const sp = spins.current[ci];
      if (!el || !sp) return;
      v.copy(c.hub).applyMatrix4(sp.matrixWorld);
      v.project(camera);
      const x = (v.x * 0.5 + 0.5) * W;
      const y = (-v.y * 0.5 + 0.5) * H;
      el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`;
      el.style.opacity = (uiA * reveal * (fc < 0 || fc === ci ? 1 : 0.3)).toFixed(3);
      const btn = el.firstElementChild as HTMLElement | null;
      if (btn) btn.style.pointerEvents = uiA * reveal > 0.3 ? 'auto' : 'none';
      const side = x < W * 0.5 + offX * (W / vp.width) ? -1 : 1;
      if (side !== st.hubSide[ci]) {
        st.hubSide[ci] = side;
        el.dataset.side = side < 0 ? 'l' : 'r';
      }
    });
  });

  return (
    <>
    <group ref={root}>
      {/* núcleo */}
      <mesh>
        <sphereGeometry args={[CORE_R, 64, 48]} />
        <shaderMaterial ref={coreMat} vertexShader={CORE_VERT} fragmentShader={CORE_FRAG} uniforms={coreUniforms} />
      </mesh>
      {/* corona amplia y tenue + halo + destellos de difracción: lee como estrella */}
      <sprite ref={corona} scale={[8.5, 8.5, 1]}>
        <spriteMaterial map={glow} color={ORBIT_COLORS.accent} opacity={0.14} {...additive} />
      </sprite>
      <sprite ref={coreHalo} scale={[3.1, 3.1, 1]}>
        <spriteMaterial map={glow} color={ORBIT_COLORS.accent} opacity={0.5} {...additive} />
      </sprite>
      <sprite ref={spikeSprite} scale={[4.6, 4.6, 1]}>
        <spriteMaterial map={spikes} color="#f7c9f0" opacity={0.6} {...additive} />
      </sprite>
      {/* cáscara de partículas alrededor del núcleo (corona) */}
      <points ref={shell} geometry={shellGeo} material={shellMat} />

      {ORBIT.cats.map((c, ci) => (
        <group key={c.tag} rotation={c.tilt}>
          <group ref={(el) => (spins.current[ci] = el)}>
            <mesh geometry={rings[ci].geo} material={rings[ci].mat} />
            <points geometry={rings[ci].dgeo} material={rings[ci].dmat} />
            {paths
              .filter((x) => x.p.cat === ci)
              .map((x) => (
                <mesh key={x.p.id} geometry={x.geo} material={x.mat} />
              ))}
            {/* hub de la categoría */}
            <group position={c.hub}>
              {/* cada categoría es un PLANETA con su anillo */}
              <mesh ref={(el) => (hubMesh.current[ci] = el)} material={planetMats[ci]}>
                <sphereGeometry args={[0.12, 32, 24]} />
              </mesh>
              <mesh rotation={[1.05, 0.35, 0]}>
                <torusGeometry args={[0.21, 0.007, 6, 64]} />
                <meshBasicMaterial color={ORBIT_COLORS.white} transparent opacity={0.55} toneMapped={false} depthWrite={false} />
              </mesh>
              <sprite ref={(el) => (hubHalo.current[ci] = el)}>
                <spriteMaterial map={glow} color={ORBIT_COLORS.accent} {...additive} />
              </sprite>
            </group>
            {/* tecnologías */}
            {c.techs.map((t) => {
              const gi = techGlobal.get(t.id)!;
              return (
                <group key={t.id} position={t.local}>
                  <mesh ref={(el) => (nodeMesh.current[gi] = el)}>
                    <sphereGeometry args={[0.055, 16, 12]} />
                    <meshBasicMaterial color={ORBIT_COLORS.white} toneMapped={false} />
                  </mesh>
                  <sprite ref={(el) => (nodeHalo.current[gi] = el)}>
                    <spriteMaterial map={glow} color={ORBIT_COLORS.accent} {...additive} />
                  </sprite>
                </group>
              );
            })}
          </group>
        </group>
      ))}

    </group>
      {/* cometa + estela: hermanos del grupo raíz, en coordenadas de MUNDO */}
      <points ref={trailPts} geometry={trail.geo} material={trail.mat} frustumCulled={false} />
      <group ref={comet}>
        <mesh>
          <sphereGeometry args={[0.065, 16, 12]} />
          <meshBasicMaterial color="#ffffff" toneMapped={false} />
        </mesh>
        <sprite scale={[0.75, 0.75, 1]}>
          <spriteMaterial map={glow} color={ORBIT_COLORS.accent} opacity={0.95} {...additive} />
        </sprite>
        <sprite scale={[0.3, 0.3, 1]}>
          <spriteMaterial map={glow} color="#ffffff" opacity={0.9} {...additive} />
        </sprite>
      </group>
    </>
  );
};
