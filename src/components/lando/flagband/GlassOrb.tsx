import { isLite, hasWebGL2 } from '../../../lib/deviceProfile';
import { SafeBoundary } from '../../ui/SafeBoundary';
import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer, RoundedBox } from '@react-three/drei';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { WarmUp } from '../../canvas/WarmUp';

// GOTA DE VIDRIO con un microchip dentro ("del circuito al código").
// - La gota es una esfera desplazada por ruido en el vertex shader (MeshPhysicalMaterial
//   con transmisión real: refracta el chip que lleva adentro).
// - Se "arma" con el scroll (de líquido inquieto y chico a gota asentada) y se va al final.
// - Reacciona al mouse: se inclina hacia el cursor y se abomba del lado del puntero.
// - El lienzo NO tiene bucle propio (frameloop "never"): lo avanza el bucle de FlagBand
//   solo mientras la sección se ve y la gota está en escena. Nada de lecturas de layout.

// estado compartido que escribe FlagBand (sin re-render de React)
export type OrbState = {
  t: number; // tiempo (s)
  dt: number;
  a: number; // armado 0..1
  e: number; // salida 0..1
  px: number; // puntero en NDC del lienzo (-1..1, puede salirse)
  py: number;
};

const ACCENT = '#F230D2';

// ruido simplex 3D (Ashima / Stefan Gustavson, dominio público)
const NOISE = /* glsl */ `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z); vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
uniform float uTime; uniform float uAmp; uniform vec3 uPtr; uniform float uBulge;
// desplazamiento de un punto de la esfera unitaria: dos octavas de ruido + abombado hacia el puntero
vec3 dispF(vec3 p){
  vec3 n=normalize(p);
  float d=snoise(n*1.1+vec3(0.0,uTime*0.22,uTime*0.12))*uAmp;
  d+=snoise(n*2.2-vec3(uTime*0.17))*uAmp*0.25;
  d+=uBulge*pow(max(dot(n,uPtr),0.0),5.0);
  return n*(1.0+d);
}
`;

// textura del "die" del chip: pistas magenta sobre fondo oscuro (se dibuja una vez)
function makeDieTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#1a0b22';
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = ACCENT;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  // pistas que salen del centro hacia los bordes, a 90° y 45° (mismo lenguaje que la pista del sitio)
  const rnd = (() => {
    let s = 7;
    return () => ((s = (s * 16807) % 2147483647) / 2147483647);
  })();
  for (let i = 0; i < 26; i++) {
    g.lineWidth = rnd() < 0.3 ? 3 : 1.6;
    g.globalAlpha = 0.5 + rnd() * 0.5;
    const side = i % 4;
    const k = 40 + rnd() * 176;
    let x = 128 + (rnd() - 0.5) * 60;
    let y = 128 + (rnd() - 0.5) * 60;
    g.beginPath();
    g.moveTo(x, y);
    const j = 10 + rnd() * 30;
    if (side === 0) { x += j; y -= j; g.lineTo(x, y); g.lineTo(x, 8); g.lineTo(k, 8); }
    if (side === 1) { x += j; y += j; g.lineTo(x, y); g.lineTo(248, y); }
    if (side === 2) { x -= j; y += j; g.lineTo(x, y); g.lineTo(x, 248); }
    if (side === 3) { x -= j; y -= j; g.lineTo(x, y); g.lineTo(8, y); }
    g.stroke();
    g.beginPath();
    g.arc(x, y, 2.6, 0, Math.PI * 2);
    g.fillStyle = ACCENT;
    g.fill();
  }
  // núcleo
  g.globalAlpha = 1;
  g.fillStyle = '#ECE8F2';
  g.fillRect(104, 104, 48, 48);
  g.fillStyle = ACCENT;
  g.fillRect(112, 112, 32, 32);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// FONDO de la escena: azul noche idéntico al de la página (bordes exactos, el lienzo no
// se nota), con un halo magenta y unas pistas finas detrás de la gota. Es opaco a
// propósito: la transmisión de three refracta lo que hay detrás, y con un lienzo
// transparente refractaría un blanco al 50 % (vidrio lechoso). Así se ven el halo y las
// pistas deformados a través de la gota = se lee como vidrio de verdad.
function makeBackdropTexture() {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.fillStyle = '#0A1A2B';
  g.fillRect(0, 0, S, S);
  const rg = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S * 0.42);
  rg.addColorStop(0, 'rgba(242,48,210,0.26)');
  rg.addColorStop(0.45, 'rgba(242,48,210,0.09)');
  rg.addColorStop(1, 'rgba(242,48,210,0)');
  g.fillStyle = rg;
  g.fillRect(0, 0, S, S);
  // pistas finas (se desvanecen hacia los bordes para no marcar el rectángulo)
  const fade = g.createRadialGradient(S / 2, S / 2, S * 0.08, S / 2, S / 2, S * 0.36);
  fade.addColorStop(0, 'rgba(236,232,242,0.4)');
  fade.addColorStop(1, 'rgba(236,232,242,0)');
  g.strokeStyle = fade;
  g.lineWidth = 1.4;
  const lines: number[][] = [
    [0.12, 0.42, 0.4, 0.42, 0.48, 0.34, 0.9, 0.34],
    [0.1, 0.6, 0.36, 0.6, 0.44, 0.68, 0.88, 0.68],
    [0.52, 0.08, 0.52, 0.3, 0.6, 0.38, 0.6, 0.92],
    [0.3, 0.12, 0.3, 0.5, 0.38, 0.58, 0.38, 0.9],
    [0.7, 0.1, 0.7, 0.46, 0.78, 0.54, 0.92, 0.54],
  ];
  for (const l of lines) {
    g.beginPath();
    g.moveTo(l[0] * S, l[1] * S);
    for (let i = 2; i < l.length; i += 2) g.lineTo(l[i] * S, l[i + 1] * S);
    g.stroke();
  }
  // los bordes quedan exactamente en el azul noche
  const edge = g.createRadialGradient(S / 2, S / 2, S * 0.4, S / 2, S / 2, S * 0.5);
  edge.addColorStop(0, 'rgba(10,26,43,0)');
  edge.addColorStop(1, 'rgba(10,26,43,1)');
  g.fillStyle = edge;
  g.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const Backdrop: React.FC = () => {
  const tex = useMemo(() => makeBackdropTexture(), []);
  const { viewport, camera } = useThree();
  useEffect(() => () => tex.dispose(), [tex]);
  // cubre todo el encuadre a z = -3 (con margen)
  const vp = viewport.getCurrentViewport(camera, new THREE.Vector3(0, 0, -3));
  return (
    <>
      <color attach="background" args={['#0A1A2B']} />
      <mesh position={[0, 0, -3]}>
        <planeGeometry args={[vp.width * 1.02, vp.height * 1.02]} />
        <meshBasicMaterial map={tex} toneMapped={false} />
      </mesh>
    </>
  );
};

// patitas del chip: 4 lados x 6, fusionadas en una sola geometría (un solo draw call)
function makePins() {
  const parts: THREE.BufferGeometry[] = [];
  const n = 6;
  for (let s = 0; s < 4; s++) {
    for (let i = 0; i < n; i++) {
      const g = new THREE.BoxGeometry(0.05, 0.035, 0.16);
      const o = -0.3 + (0.6 * i) / (n - 1);
      g.translate(o, 0, 0.5);
      g.rotateY((s * Math.PI) / 2);
      parts.push(g);
    }
  }
  const m = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  return m;
}

const Orb: React.FC<{ st: React.MutableRefObject<OrbState> }> = ({ st }) => {
  const group = useRef<THREE.Group>(null);
  const blob = useRef<THREE.Mesh>(null);
  const chip = useRef<THREE.Group>(null);
  const { viewport } = useThree();

  const uniforms = useMemo(
    () => ({ uTime: { value: 0 }, uAmp: { value: 0.12 }, uPtr: { value: new THREE.Vector3(0, 0, 1) }, uBulge: { value: 0 } }),
    []
  );
  const geo = useMemo(() => new THREE.IcosahedronGeometry(1, 20), []);
  const mat = useMemo(() => {
    const m = new THREE.MeshPhysicalMaterial({
      color: '#ffffff',
      transmission: 1,
      thickness: 0.7,
      roughness: 0.04,
      ior: 1.33,
      dispersion: 0.35,
      iridescence: 0.45,
      iridescenceIOR: 1.35,
      iridescenceThicknessRange: [220, 480],
      clearcoat: 1,
      clearcoatRoughness: 0.04,
      specularIntensity: 1,
      envMapIntensity: 1.45,
      attenuationColor: new THREE.Color('#FBE6F7'),
      attenuationDistance: 6,
    });
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, uniforms);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>\n${NOISE}`)
        // normal recalculada por diferencias finitas sobre la superficie desplazada
        .replace(
          '#include <beginnormal_vertex>',
          `vec3 dp = dispF(position);
           vec3 tg = normalize(cross(normal, abs(normal.y) < 0.99 ? vec3(0.0,1.0,0.0) : vec3(1.0,0.0,0.0)));
           vec3 bt = normalize(cross(normal, tg));
           vec3 d1 = dispF(position + tg*0.012) - dp;
           vec3 d2 = dispF(position + bt*0.012) - dp;
           vec3 objectNormal = normalize(cross(d1, d2));
           if (dot(objectNormal, normal) < 0.0) objectNormal = -objectNormal;`
        )
        .replace('#include <begin_vertex>', 'vec3 transformed = dp;');
    };
    return m;
  }, [uniforms]);
  const die = useMemo(() => makeDieTexture(), []);
  const pins = useMemo(() => makePins(), []);
  useEffect(
    () => () => {
      geo.dispose();
      mat.dispose();
      die.dispose();
      pins.dispose();
    },
    [geo, mat, die, pins]
  );

  const ring = useRef<THREE.Mesh>(null);
  const tmpQ = useMemo(() => new THREE.Quaternion(), []);
  const tmpV = useMemo(() => new THREE.Vector3(), []);
  const sm = useRef({ rx: 0, ry: 0, bulge: 0, spin: 0 });

  useFrame(() => {
    const g = group.current;
    const b = blob.current;
    const c = chip.current;
    if (!g || !b || !c) return;
    const s = st.current;
    const S = sm.current;
    const dt = Math.min(0.05, s.dt);
    const a = s.a;
    // armado: de líquido chico e inquieto a gota asentada (con un leve rebote)
    const back = a <= 0 ? 0 : 1 + 2.2 * Math.pow(a - 1, 3) + 1.2 * Math.pow(a - 1, 2);
    const scale = Math.max(0.001, (0.18 + 0.82 * back) * (1 - 0.65 * s.e));
    g.scale.setScalar(scale);
    g.position.y = s.e * 1.3 + Math.sin(s.t * 0.8) * 0.05;
    uniforms.uTime.value = s.t;
    uniforms.uAmp.value = 0.06 + 0.16 * (1 - a) + 0.04 * s.e;

    // puntero en el plano de la gota (unidades de mundo)
    const wx = (s.px * viewport.width) / 2;
    const wy = (s.py * viewport.height) / 2 - g.position.y;
    const dist = Math.hypot(wx, wy);
    // inclinación hacia el cursor (amortiguada)
    const k = 1 - Math.exp(-dt * 4);
    S.ry += (THREE.MathUtils.clamp(wx * 0.35, -0.7, 0.7) - S.ry) * k;
    S.rx += (THREE.MathUtils.clamp(-wy * 0.35, -0.6, 0.6) - S.rx) * k;
    g.rotation.set(S.rx, S.ry, 0);
    // abombado del lado del puntero: más fuerte cuanto más cerca
    const near = THREE.MathUtils.smoothstep(2.4 - dist, 0, 1.6);
    S.bulge += (near * 0.3 - S.bulge) * (1 - Math.exp(-dt * 6));
    uniforms.uBulge.value = S.bulge;
    // giro propio lento de la gota (su ruido "fluye") y del chip
    S.spin += dt * (0.18 + 1.6 * (1 - a));
    b.rotation.set(S.spin * 0.6, S.spin, 0);
    // dirección del puntero en espacio local de la gota
    tmpV.set(wx, wy, 1.4).normalize();
    b.updateMatrixWorld();
    b.getWorldQuaternion(tmpQ).invert();
    tmpV.applyQuaternion(tmpQ);
    // la gota está escalada por el grupo: el puntero se expresa sin escala (solo dirección)
    uniforms.uPtr.value.copy(tmpV);
    if (ring.current) {
      ring.current.rotation.set(1.15 + Math.sin(s.t * 0.4) * 0.08, 0.35, s.t * 0.25);
      ring.current.scale.setScalar(0.6 + 0.4 * THREE.MathUtils.smoothstep(a, 0.4, 1));
    }
    c.rotation.set(0.55 + Math.sin(s.t * 0.5) * 0.12, s.t * 0.35, 0.18);
    c.scale.setScalar(0.62 * (0.3 + 0.7 * THREE.MathUtils.smoothstep(a, 0.25, 0.9)));
  });

  return (
    <group ref={group}>
      <mesh ref={blob} geometry={geo} material={mat} />
      {/* órbita fina: se ve afuera y, refractada, a través de la gota */}
      <mesh ref={ring}>
        <torusGeometry args={[1.42, 0.011, 8, 160]} />
        <meshBasicMaterial color={ACCENT} toneMapped={false} />
      </mesh>
      <group ref={chip}>
        <RoundedBox args={[0.8, 0.12, 0.8]} radius={0.035} smoothness={3}>
          <meshPhysicalMaterial color="#120818" metalness={0.5} roughness={0.35} clearcoat={1} clearcoatRoughness={0.1} />
        </RoundedBox>
        <mesh position={[0, 0.0625, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.68, 0.68]} />
          <meshBasicMaterial map={die} toneMapped={false} />
        </mesh>
        <mesh geometry={pins}>
          <meshStandardMaterial color="#d9d2e6" metalness={1} roughness={0.25} />
        </mesh>
      </group>
    </group>
  );
};

// entrega el "advance" del lienzo hacia afuera (FlagBand lo llama desde su propio rAF)
const Bridge: React.FC<{ advRef: React.MutableRefObject<((t: number) => void) | null> }> = ({ advRef }) => {
  const { advance, gl } = useThree();
  useEffect(() => {
    // la refracción se calcula a 3/4 de resolución: casi igual de nítida y bastante más barata
    gl.transmissionResolutionScale = 0.75;
    advRef.current = (t: number) => advance(t);
    return () => {
      advRef.current = null;
    };
  }, [advance, advRef, gl]);
  return null;
};

export const GlassOrb = React.memo<{
  st: React.MutableRefObject<OrbState>;
  advRef: React.MutableRefObject<((t: number) => void) | null>;
}>(function GlassOrb({ st, advRef }) {
  const fallback = <div className="absolute inset-[24%] rounded-full border border-[#F230D2]/40 bg-[#0A1A2B]/70" />;
  if (isLite() || !hasWebGL2()) return fallback;
  return (
    <SafeBoundary fallback={fallback}>
    <Canvas
      frameloop="never"
      // tamaño por offsetWidth (no por getBoundingClientRect): el contenedor se achica con
      // scale() al salir y, medido con transform, el lienzo se redimensionaba (setSize =
      // realocar el buffer, ~cientos de ms) en cada cuadro del traspaso
      resize={{ offsetSize: true, scroll: false }}
      dpr={[1, 1.5]}
      camera={{ position: [0, 0, 7.4], fov: 30 }}
      gl={{ alpha: false, antialias: true, powerPreference: 'high-performance' }}
      style={{ pointerEvents: 'none' }}
    >
      <Environment resolution={256}>
        <Lightformer form="rect" intensity={4.5} color="#ffffff" position={[0, 5, 2]} scale={[10, 2.5, 1]} />
        <Lightformer form="rect" intensity={2.6} color="#ECE8F2" position={[5, 0.5, 2]} scale={[1.4, 8, 1]} />
        <Lightformer form="circle" intensity={3} color={ACCENT} position={[-4, -2.5, 3]} scale={3} />
        <Lightformer form="ring" intensity={2.4} color={ACCENT} position={[2.5, -3.5, -2]} scale={3} />
        <Lightformer form="rect" intensity={1.2} color="#ffffff" position={[-5, 2, -3]} scale={[2, 6, 1]} />
      </Environment>
      <Backdrop />
      <ambientLight intensity={0.35} />
      <directionalLight position={[3, 4, 5]} intensity={1.4} />
      <pointLight position={[0, 0, 0]} intensity={3} distance={2.2} color={ACCENT} />
      <Orb st={st} />
      <Bridge advRef={advRef} />
      <WarmUp delay={1800} />
    </Canvas>
    </SafeBoundary>
  );
});
