import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { WarmUp } from '../../canvas/WarmUp';
import { optionalImage } from '../contact/useOptionalImage';
import { orbitFrame, type Journey } from './orbitData';

// FONDO ESPACIAL de la sección (un solo lienzo, fijo con sticky detrás de todo):
//  - nebulosa sutil azul noche / magenta + planetas lejanos (shader a pantalla completa)
//  - campo de estrellas con profundidad real (quads instanciados): empiezan como
//    estrellas PIXEL del mundo del juego, se vuelven estrellas reales, se estiran en
//    estelas (salto al hiperespacio) y frenan al llegar a la órbita
//  - estrella fugaz ocasional en reposo
// Todo lo mueve el objeto `journey` (scroll) sin pasar por React.

const DEPTH = 90;
const NEAR = 0.6;

const NEB_VERT = /* glsl */ `
  void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const NEB_FRAG = /* glsl */ `
  uniform vec2 uRes;
  uniform vec2 uCenter;
  uniform vec2 uStage; // x: px desde el borde inferior del lienzo al del escenario · y: alto del escenario (px)
  uniform float uTime;
  uniform float uWarp;
  uniform float uFlash;
  uniform float uPixel;
  uniform float uArrive;
  uniform float uDrift;
  uniform float uTravel;
  uniform vec4 uShoot; // x, y (px búfer), ángulo, t (0..1, <0 = apagada)
  uniform float uShootLen;
  uniform float uPlanets;
  uniform float uMob; // 1 = móvil (planetas reubicados) · 0 = escritorio (sin cambios)
  uniform float uE; // móvil: avance de entrada 0..1 (los planetas bajan más lento que la página: profundidad)
  uniform vec2 uPar; // paralaje (scroll + puntero) en unidades de pantalla
  // imágenes opcionales (public/space/*.webp); si no están, todo es procedural
  uniform sampler2D uNeb;
  uniform float uHasNeb;
  uniform float uNebAspect;
  uniform sampler2D uStarsTex;
  uniform float uHasStars;
  uniform float uStarsAspect;
  uniform sampler2D uPlA;
  uniform float uHasA;
  uniform sampler2D uPlB;
  uniform float uHasB;
  // salida hacia la Formación: el escritorio
  uniform float uDesk; // 0..1 el espacio se vuelve el tono del escritorio
  uniform vec3 uPoint; // punto de luz (x, y px búfer, intensidad)
  uniform vec3 uLamp; // lámpara (x, y px búfer, intensidad)

  const vec3 DESK = vec3(0.0706, 0.0863, 0.1216); // #12161F
  const vec3 WARM = vec3(1.0, 0.86, 0.68);
  const vec3 DEEP = vec3(0.018, 0.04, 0.072);
  const vec3 NIGHT = vec3(0.039, 0.102, 0.169);
  const vec3 MAG = vec3(0.949, 0.188, 0.824);
  const vec3 WHITE = vec3(0.925, 0.91, 0.949);

  float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { s += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
    return s;
  }

  // planeta iluminado desde el núcleo (la "estrella" del sistema)
  vec3 planet(vec3 col, vec2 uv, vec2 c, float R, vec2 sun, float ringK, float amt) {
    vec2 q = (uv - c) / R;
    float d2 = dot(q, q);
    vec2 L2 = normalize(sun - c);
    vec3 L = normalize(vec3(L2, 0.55));
    // atmósfera (fuera del disco, del lado iluminado)
    float dd = sqrt(d2);
    float facing = 0.5 + 0.5 * dot(normalize(q + 1e-4), L2);
    float atm = exp(-max(dd - 1.0, 0.0) * 22.0) * step(1.0, dd) * pow(facing, 2.5);
    col += MAG * atm * 0.22 * amt;
    // anillo (elipse inclinada): la mitad de atrás la tapa el disco
    if (ringK > 0.0) {
      float ca = cos(-0.38), sa = sin(-0.38);
      vec2 rp = mat2(ca, -sa, sa, ca) * q;
      float e = length(rp * vec2(1.0, 3.6));
      float band = smoothstep(0.09, 0.0, abs(e - 1.9)) * 0.6 + smoothstep(0.04, 0.0, abs(e - 2.25)) * 0.35;
      float behind = step(0.0, rp.y) * step(d2, 1.0);
      col += mix(WHITE, MAG, 0.35) * band * (1.0 - behind) * ringK * amt;
    }
    if (d2 < 1.0) {
      float z = sqrt(1.0 - d2);
      vec3 N = vec3(q, z);
      float lam = max(dot(N, L), 0.0);
      // bandas suaves (gigante gaseoso) + terminador
      float bands = 0.5 + 0.5 * sin(q.y * 9.0 + fbm(q * 3.0 + 4.0) * 3.0);
      vec3 body = mix(vec3(0.012, 0.03, 0.055), vec3(0.06, 0.12, 0.2), bands * 0.6);
      vec3 lit = body + (mix(NIGHT * 1.6, MAG * 0.3, 0.3 + 0.2 * bands)) * pow(lam, 2.2) * 0.8;
      float rim = pow(1.0 - z, 3.0) * pow(max(dot(normalize(q), L2), 0.0), 1.5);
      lit += mix(MAG, WHITE, 0.3) * rim * 0.75;
      float edge = smoothstep(1.0, 0.985, sqrt(d2));
      col = mix(col, lit, edge * amt);
    }
    return col;
  }

  // muestreo "cover" de una imagen sobre el escenario, con zoom y paralaje
  vec2 coverUV(vec2 s01, float screenAspect, float imgAspect, float zoom, vec2 off) {
    vec2 q = s01 - 0.5;
    if (screenAspect > imgAspect) q.y *= imgAspect / screenAspect;
    else q.x *= screenAspect / imgAspect;
    return q / zoom + 0.5 + off;
  }
  vec3 screenBlend(vec3 a, vec3 b) { return 1.0 - (1.0 - a) * (1.0 - b); }

  // planeta desde imagen (sobre negro → modo pantalla)
  vec3 planetImg(vec3 col, sampler2D tex, vec2 uv, vec2 c, float h, float amt) {
    vec2 t = (uv - c) / (2.0 * h) + 0.5;
    if (t.x < 0.0 || t.x > 1.0 || t.y < 0.0 || t.y > 1.0) return col;
    vec3 s = texture2D(tex, t).rgb;
    // el disco oscuro también tapa lo que hay detrás (luminancia → oclusión suave)
    float occ = smoothstep(0.0, 0.02, max(s.r, max(s.g, s.b)));
    col *= 1.0 - occ * 0.55 * amt;
    return screenBlend(col, s * amt);
  }

  void main() {
    vec2 frag = gl_FragCoord.xy;
    float S = min(uRes.x, uStage.y);
    vec2 p = (frag - uCenter) / S; // centrado en el punto de fuga
    float r = length(p);
    vec2 uv = (frag - vec2(0.0, uStage.x)) / S; // origen: esquina inferior del escenario
    vec2 s01 = (frag - vec2(0.0, uStage.x)) / vec2(uRes.x, uStage.y);
    float screenAspect = uRes.x / uStage.y;

    // fondo: casi negro azulado, un poco más azul noche hacia el núcleo
    vec3 col = mix(DEEP, NIGHT, 0.55 * exp(-r * 1.6));

    if (uHasNeb > 0.5) {
      // nebulosa fotográfica (imagen): paralaje lento y "aspirada" en el salto
      vec3 img = texture2D(uNeb, coverUV(s01, screenAspect, uNebAspect, 1.1 + 0.4 * uWarp, uPar * 0.008)).rgb;
      col = img * (1.0 - 0.45 * uPixel);
    } else {
      // nebulosa procedural: ruido con deformación de dominio (gas que se pliega),
      // filamentos finos y franjas de polvo oscuro que cortan el brillo
      vec2 np = p * (1.0 - 0.45 * uWarp) + vec2(0.0, uDrift * 0.25) + uPar * 0.06 + uTravel * 0.0015;
      vec2 w = vec2(fbm(np * 1.4 + 3.0 + uTime * 0.005), fbm(np * 1.4 + 8.3 - uTime * 0.004));
      float n1 = fbm(np * 1.6 + w * 1.6 + 3.0);
      float dens = smoothstep(0.38, 0.9, n1);
      float fil = fbm(np * 4.2 + w * 2.2 + 17.0);
      float lanes = smoothstep(0.5, 0.72, fbm(np * 2.6 - w * 1.3 + 31.0));
      float magMask = smoothstep(0.45, 0.8, fbm(np * 1.1 + w * 0.6 + 21.0));
      vec3 gas = mix(vec3(0.05, 0.12, 0.23), MAG * 0.36, magMask);
      gas = mix(gas, vec3(0.62, 0.5, 0.78), pow(dens, 3.0) * 0.22);
      float neb = dens * (0.4 + 0.6 * fil) * (1.0 - lanes * 0.8);
      neb *= mix(0.5, 1.0, smoothstep(0.08, 0.55, r)); // calma alrededor de la órbita
      col += gas * neb * 0.62 * (1.0 - 0.45 * uPixel);
      col *= 1.0 - lanes * dens * 0.4;
      // micro-estrellas lejanas (polvo estelar fijo, con su propio paralaje)
      vec2 sc = (uv + uPar * 0.01) * 230.0;
      vec2 id = floor(sc);
      float h = hash(id);
      if (h > 0.972) {
        vec2 o = vec2(hash(id + 3.1), hash(id + 7.7));
        float d = length(fract(sc) - o) * (S / 230.0);
        float b = (h - 0.972) / 0.028;
        vec3 tint = b > 0.85 ? vec3(0.75, 0.85, 1.0) : (b > 0.7 ? vec3(1.0, 0.9, 0.85) : WHITE);
        col += tint * exp(-d * d * 1.2) * (0.12 + 0.5 * b * b) * (1.0 - uPixel * 0.6);
      }
    }
    // fase pixel (entrada desde el juego): fondo azul noche liso #0A1A2B, igual que el
    // final de la sección anterior, para que no haya corte
    col = mix(col, NIGHT, uPixel);
    if (uHasStars > 0.5) {
      vec3 sl = texture2D(uStarsTex, coverUV(s01, screenAspect, uStarsAspect, 1.05, uPar * 0.009)).rgb;
      col = screenBlend(col, sl * 0.85 * (1.0 - uPixel));
    }

    // hiperespacio: túnel con rayos radiales que fluyen desde el punto de fuga
    float ang = atan(p.y, p.x);
    float rays = pow(noise(vec2(ang * 42.0, uTravel * 0.04)), 5.0) + 0.5 * pow(noise(vec2(ang * 110.0, uTravel * 0.07 + 7.0)), 7.0);
    float tunnel = smoothstep(0.04, 0.7, r);
    col += mix(MAG, WHITE, 0.3) * rays * tunnel * uWarp * 0.42;
    col += MAG * uWarp * 0.18 * smoothstep(0.35, 1.3, r); // viñeta magenta del túnel
    col += mix(WHITE, MAG, 0.3) * uWarp * 0.05 / (r * r * 60.0 + 0.12); // destino: el núcleo

    // planetas (aparecen al llegar)
    if (uPlanets > 0.001) {
      vec2 sunUV = (uCenter - vec2(0.0, uStage.x)) / S;
      float aspect = uRes.x / S;
      float lift = uDrift * 0.05;
      vec2 cA = vec2(aspect * 0.02 - 0.06, -0.33 + lift) + uPar * 0.012;
      vec2 cB = vec2(aspect - 0.17, 0.83 + lift * 1.6) + uPar * 0.006;
      float hA = 0.47 / 0.85;
      float hB = 0.042 / 0.35;
      float rA = 0.47;
      float rB = 0.042;
      if (uMob > 0.5) {
        // móvil: el planeta con anillos (B) a la derecha del título y el planeta A (luna oscura con
        // borde magenta) a la izquierda entre la órbita y las opciones; entran más altos y asientan con el scroll
        float top = uStage.y / S;
        float sink = (1.0 - uE) * 0.32;
        cB = vec2(aspect * 0.8, top - 0.4 + sink);
        cA = vec2(aspect * 0.06, top - 0.98 + sink * 0.6);
        hB = 0.21; rB = 0.1;
        hA = 0.26; rA = 0.21;
      }
      if (uHasA > 0.5) col = planetImg(col, uPlA, uv, cA, hA, uPlanets);
      else col = planet(col, uv, cA, rA, sunUV, 0.0, uPlanets);
      if (uHasB > 0.5) col = planetImg(col, uPlB, uv, cB, hB, uPlanets);
      else col = planet(col, uv, cB, rB, sunUV, 1.0, uPlanets);
    }

    // estrella fugaz
    if (uShoot.w >= 0.0) {
      vec2 dir = vec2(cos(uShoot.z), sin(uShoot.z));
      float travel = uShoot.w * uShootLen * 4.0;
      vec2 head = uShoot.xy + dir * travel;
      vec2 rel = frag - head;
      float along = -dot(rel, dir);
      float across = abs(dot(rel, vec2(-dir.y, dir.x)));
      float tl = uShootLen;
      float tail = step(0.0, along) * (1.0 - smoothstep(0.0, tl, along));
      float w = 1.1 * (uRes.x / 1440.0 + 0.3);
      float a = tail * exp(-across * across / (w * w)) * sin(3.14159 * uShoot.w);
      float headGlow = exp(-dot(rel, rel) / (w * w * 9.0)) * sin(3.14159 * uShoot.w);
      col += mix(MAG, WHITE, 1.0 - along / tl) * a * 0.9 + WHITE * headGlow * 0.9;
    }

    // destello de salida del salto
    col += (WHITE * exp(-r * r * 9.0) * 1.1 + MAG * exp(-r * r * 2.2) * 0.45) * uFlash;
    col = mix(col, WHITE, uFlash * 0.22 * exp(-r * 1.4));

    // ---- salida: el espacio se vuelve la OFICINA de la Formación ----
    // el fondo se apaga al tono del escritorio
    col = mix(col, DESK, uDesk);
    // el núcleo colapsado: un único punto de luz
    if (uPoint.z > 0.001) {
      vec2 dp = (frag - uPoint.xy) / S;
      float d2 = dot(dp, dp);
      col += (WHITE * exp(-d2 * 2600.0) * 1.6 + mix(WARM, MAG, 0.45) * exp(-d2 * 90.0) * 0.4) * uPoint.z;
    }
    // …que se vuelve la LÁMPARA de la pizarra (arriba al centro): foco y halo cálido,
    // nada más; la Formación continúa con su propia lámpara en el mismo lugar
    if (uLamp.z > 0.001) {
      vec2 lr = (frag - uLamp.xy) / S;
      float d2 = dot(lr, lr);
      float bulb = exp(-d2 * 2400.0) * 1.35 + exp(-d2 * 160.0) * 0.22 + exp(-d2 * 30.0) * 0.03;
      col += WARM * bulb * uLamp.z;
    }
    // grano fino (evita bandas en los degradados oscuros)
    col += (hash(frag + fract(uTime)) - 0.5) / 255.0 * 2.0;
    gl_FragColor = vec4(col, 1.0);
  }
`;

const STAR_VERT = /* glsl */ `
  attribute vec4 aStar; // x, y, profundidad 0..1, semilla
  uniform float uTravel;
  uniform float uStretch;
  uniform float uDepth;
  uniform float uNear;
  uniform float uPixel;
  uniform float uTime;
  uniform float uDpr;
  uniform float uWarp;
  uniform vec2 uRes;
  uniform vec2 uCenter;
  uniform vec2 uCam;
  uniform float uFadeOut;
  varying vec2 vP;
  varying float vLen;
  varying float vR;
  varying float vA;
  varying float vSeed;

  void main() {
    float seed = aStar.w;
    float d = uNear + mod(aStar.z * uDepth - uTravel, uDepth);
    vec3 head = vec3(aStar.xy - uCam * (0.35 + 0.65 * seed), -d);
    vec3 tail = head - vec3(0.0, 0.0, uStretch);
    vec4 ch = projectionMatrix * vec4(head, 1.0);
    vec4 ct = projectionMatrix * vec4(tail, 1.0);
    vec2 H = ch.xy / ch.w * 0.5 * uRes + uCenter;
    vec2 T = ct.xy / ct.w * 0.5 * uRes + uCenter;
    vec2 seg = H - T;
    float len = length(seg);
    vec2 dir = len > 0.001 ? seg / len : vec2(1.0, 0.0);
    vec2 nrm = vec2(-dir.y, dir.x);

    // radio: estrellas reales (según distancia) o pixel (cuadros/cruces del juego)
    float rReal = clamp(10.0 / d, 0.6, 2.4) * (0.75 + 0.6 * seed) * uDpr;
    float cell = 2.5 * uDpr;
    float rPix = seed > 0.8 ? cell * 1.5 : (seed > 0.5 ? cell : cell * 0.5);
    float r = mix(rReal * (1.0 + uWarp * 0.25), rPix, uPixel);

    float along = mix(-r, len + r, position.x);
    float across = position.y * r;
    vec2 px = T + dir * along + nrm * across;
    vP = vec2(along, across);
    vLen = len;
    vR = r;
    vSeed = seed;

    // brillo: aparece a lo lejos, titila en reposo, se enciende en el salto
    float fade = smoothstep(uDepth, uDepth * 0.72, d) * smoothstep(uNear, uNear + 1.2, d);
    float tw = 0.62 + 0.38 * sin(uTime * (0.8 + seed * 2.6) + seed * 61.0);
    float twPix = step(0.3, fract(uTime * (0.35 + seed * 0.5) + seed * 7.0)); // parpadeo 8-bit
    float tw2 = mix(tw, mix(1.0, twPix, step(0.8, seed)), uPixel);
    vA = fade * mix(tw2, 1.0, uWarp) * (0.55 + 0.45 * seed) * (1.0 + uWarp * 0.6);
    vA *= 1.0 - uFadeOut;

    gl_Position = vec4(px / uRes * 2.0 - 1.0, 0.0, 1.0);
  }
`;

const STAR_FRAG = /* glsl */ `
  uniform float uPixel;
  uniform float uWarp;
  varying vec2 vP;
  varying float vLen;
  varying float vR;
  varying float vA;
  varying float vSeed;
  const vec3 MAG = vec3(0.949, 0.188, 0.824);
  const vec3 WHITE = vec3(0.925, 0.91, 0.949);
  const vec3 PINK = vec3(0.97, 0.72, 0.93);

  void main() {
    // estrella real / estela
    float dx = max(max(-vP.x, vP.x - vLen), 0.0);
    float dd = length(vec2(dx, vP.y)) / vR;
    float roundA = exp(-dd * dd * 3.2) * (1.0 - smoothstep(0.75, 1.0, dd));
    float t = vLen > 0.5 ? clamp(vP.x / vLen, 0.0, 1.0) : 1.0;
    float streak = clamp(vLen / (vR * 4.0), 0.0, 1.0);
    roundA *= mix(1.0, 0.08 + 0.92 * t * t, streak);
    // estrella pixel (en la cabeza)
    vec2 g = (vP - vec2(vLen, 0.0)) / vR;
    float sq = step(abs(g.x), 1.0) * step(abs(g.y), 1.0);
    float cr = min(1.0, step(abs(g.x), 0.34) * step(abs(g.y), 1.0) + step(abs(g.y), 0.34) * step(abs(g.x), 1.0));
    float pix = vSeed > 0.8 ? cr : sq;
    float a = mix(roundA, pix, uPixel) * vA;

    // variedad de color real: casi todas blancas, algunas azuladas, cálidas, rosas
    vec3 base = vSeed > 0.93 ? MAG : (vSeed > 0.8 ? PINK : (vSeed > 0.66 ? vec3(0.78, 0.86, 1.0) : (vSeed > 0.56 ? vec3(1.0, 0.92, 0.84) : WHITE)));
    base = mix(base, mix(WHITE, PINK, step(0.6, vSeed)), uPixel * 0.5);
    // en el salto la cola se tiñe de magenta y la cabeza va a blanco
    vec3 col = mix(base, mix(MAG, WHITE, t * t), streak * uWarp);
    gl_FragColor = vec4(col * a, a);
  }
`;

type Props = {
  journey: React.MutableRefObject<Journey>;
  reduced: boolean;
  mobile: boolean;
  // alto (px CSS) del escenario fijado; el lienzo es más alto (se extiende debajo
  // y se desvanece) así que el encuadre se calcula con este alto, no con el del lienzo
  stageH: React.MutableRefObject<number>;
  // el punto de luz final y la bombilla los dibuja el DOM (SystemsGrid) POR ENCIMA de la
  // foto del tablero: aquí no se pintan (el fondo solo se apaga al tono del escritorio)
  domPoint?: boolean;
};

const StarSpace: React.FC<Props> = ({ journey, reduced, mobile, stageH, domPoint }) => {
  const { invalidate } = useThree();

  const nebUniforms = useMemo(
    () => ({
      uRes: { value: new THREE.Vector2(1, 1) },
      uCenter: { value: new THREE.Vector2() },
      uStage: { value: new THREE.Vector2(0, 1) },
      uTime: { value: 0 },
      uWarp: { value: 0 },
      uFlash: { value: 0 },
      uPixel: { value: 1 },
      uArrive: { value: 0 },
      uDrift: { value: 0 },
      uTravel: { value: 0 },
      uShoot: { value: new THREE.Vector4(0, 0, 0, -1) },
      uShootLen: { value: 160 },
      uPlanets: { value: 0 },
      uMob: { value: mobile ? 1 : 0 },
      uE: { value: 0 },
      uPar: { value: new THREE.Vector2() },
      uNeb: { value: null as THREE.Texture | null },
      uHasNeb: { value: 0 },
      uNebAspect: { value: 16 / 9 },
      uStarsTex: { value: null as THREE.Texture | null },
      uHasStars: { value: 0 },
      uStarsAspect: { value: 16 / 9 },
      uPlA: { value: null as THREE.Texture | null },
      uHasA: { value: 0 },
      uPlB: { value: null as THREE.Texture | null },
      uHasB: { value: 0 },
      uDesk: { value: 0 },
      uPoint: { value: new THREE.Vector3() },
      uLamp: { value: new THREE.Vector3() },
    }),
    []
  );

  // imágenes opcionales (Nano Banana, ver docs/prompts-nano/espacio.md): si el
  // archivo existe se usa; si no (404), sigue el aspecto procedural
  useEffect(() => {
    const loader = new THREE.TextureLoader();
    const made: THREE.Texture[] = [];
    let alive = true;
    const load = (url: string, tex: 'uNeb' | 'uStarsTex' | 'uPlA' | 'uPlB', flag: 'uHasNeb' | 'uHasStars' | 'uHasA' | 'uHasB', aspect?: 'uNebAspect' | 'uStarsAspect') =>
      loader.load(
        url,
        (t) => {
          made.push(t);
          if (!alive) return t.dispose();
          t.colorSpace = THREE.NoColorSpace; // valores crudos: el shader escribe sin conversión
          t.minFilter = THREE.LinearMipmapLinearFilter;
          t.anisotropy = 4;
          t.needsUpdate = true;
          nebUniforms[tex].value = t;
          nebUniforms[flag].value = 1;
          const img = t.image as { width?: number; height?: number } | undefined;
          if (aspect && img?.width && img.height) nebUniforms[aspect].value = img.width / img.height;
          invalidate();
        },
        undefined,
        () => {}
      );
    // (solo se piden las imágenes que existen en /public/space: sin 404 en consola)
    if (optionalImage('/space/nebula.webp')) load('/space/nebula.webp', 'uNeb', 'uHasNeb', 'uNebAspect');
    if (optionalImage('/space/stars.webp')) load('/space/stars.webp', 'uStarsTex', 'uHasStars', 'uStarsAspect');
    if (optionalImage('/space/planet-a.webp')) load('/space/planet-a.webp', 'uPlA', 'uHasA');
    if (optionalImage('/space/planet-b.webp')) load('/space/planet-b.webp', 'uPlB', 'uHasB');
    return () => {
      alive = false;
      made.forEach((t) => t.dispose());
    };
  }, [nebUniforms, invalidate, mobile]);

  const [starGeo, starMat] = useMemo(() => {
    const N = mobile ? 1100 : 2100;
    const g = new THREE.InstancedBufferGeometry();
    // quad base: x = 0 (cola) → 1 (cabeza), y = -1..1 (ancho)
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, -1, 0, 1, -1, 0, 1, 1, 0, 0, 1, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    const a = new Float32Array(N * 4);
    let s = 4242;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < N; i++) {
      // disco con hueco en el centro (si no, quedan estrellas "clavadas" en el punto de fuga)
      const ang = rnd() * Math.PI * 2;
      const rad = 1.4 + Math.sqrt(rnd()) * 62;
      a[i * 4] = Math.cos(ang) * rad;
      a[i * 4 + 1] = Math.sin(ang) * rad * 0.75;
      a[i * 4 + 2] = rnd();
      a[i * 4 + 3] = rnd();
    }
    g.setAttribute('aStar', new THREE.InstancedBufferAttribute(a, 4));
    g.instanceCount = N;
    const m = new THREE.ShaderMaterial({
      vertexShader: STAR_VERT,
      fragmentShader: STAR_FRAG,
      uniforms: {
        uTravel: { value: 0 },
        uStretch: { value: 0 },
        uDepth: { value: DEPTH },
        uNear: { value: NEAR },
        uPixel: { value: 1 },
        uTime: { value: 0 },
        uDpr: { value: 1 },
        uWarp: { value: 0 },
        uRes: { value: new THREE.Vector2(1, 1) },
        uCenter: { value: new THREE.Vector2() },
        uCam: { value: new THREE.Vector2() },
        uFadeOut: { value: 0 },
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      premultipliedAlpha: true,
    });
    return [g, m] as const;
  }, [mobile]);

  useLayoutEffect(() => () => (starGeo.dispose(), starMat.dispose()), [starGeo, starMat]);

  // puntero (paralaje suave de las capas)
  const pointer = useRef({ x: 0, y: 0 });
  useEffect(() => {
    if (reduced || mobile) return;
    const on = (e: PointerEvent) => {
      pointer.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.current.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener('pointermove', on, { passive: true });
    return () => window.removeEventListener('pointermove', on);
  }, [reduced, mobile]);

  // en modo reducido: un cuadro nuevo cuando cambia el tamaño
  useEffect(() => {
    if (reduced) invalidate();
  });

  const st = useMemo(
    () => ({ t: 0, travel: 0, cam: new THREE.Vector2(), shootT: -1, nextShoot: 4, shootDur: 1 }),
    []
  );

  useFrame((state, rawDt) => {
    const J = journey.current;
    const dt = Math.min(rawDt, 0.05);
    const { size, gl } = state;
    const dpr = gl.getPixelRatio();
    const W = size.width;
    const H = size.height;
    if (!reduced) st.t += dt;

    // punto de fuga = núcleo de la órbita (escritorio) o centro (móvil)
    const SH = Math.min(H, stageH.current || H);
    const f = mobile ? { cx: W / 2, cy: SH * 0.45 } : orbitFrame(W, SH);
    const cx = f.cx * dpr;
    const cy = (H - f.cy) * dpr;

    // avance: deriva en el tiempo (más rápida en el salto) + avance atado al scroll
    const speed = reduced ? 0 : 0.35 + J.warp * J.warp * 48;
    st.travel += speed * dt;
    const travel = st.travel + J.travel;

    // paralaje: puntero + scroll (las capas cercanas se mueven más)
    const drift = J.q * 3 + J.e * 1.5;
    const tx = pointer.current.x * 0.9;
    const ty = -pointer.current.y * 0.6 - drift;
    const kk = reduced ? 1 : 1 - Math.exp(-dt * 2.5);
    st.cam.x += (tx - st.cam.x) * kk;
    st.cam.y += (ty - st.cam.y) * kk;

    const su = starMat.uniforms;
    su.uTravel.value = travel;
    su.uStretch.value = Math.pow(J.warp, 1.6) * 26;
    su.uPixel.value = J.pixel;
    su.uWarp.value = J.warp;
    su.uTime.value = st.t;
    su.uDpr.value = dpr;
    su.uRes.value.set(W * dpr, H * dpr);
    su.uCenter.value.set(cx, cy);
    su.uCam.value.copy(st.cam);
    su.uFadeOut.value = J.starFade;

    // estrella fugaz: solo en reposo (ni pixel ni salto)
    const calm = J.warp < 0.02 && J.pixel < 0.2 && J.desk < 0.05 && !reduced;
    if (st.shootT >= 0) {
      st.shootT += dt / st.shootDur;
      if (st.shootT > 1) {
        st.shootT = -1;
        st.nextShoot = 5 + Math.random() * 7;
      }
    } else if (calm) {
      st.nextShoot -= dt;
      if (st.nextShoot <= 0) {
        st.shootT = 0;
        st.shootDur = 0.9 + Math.random() * 0.5;
        const leftToRight = Math.random() < 0.5;
        const sx = (leftToRight ? 0.1 + Math.random() * 0.35 : 0.55 + Math.random() * 0.35) * W * dpr;
        const sy = (H - SH + (0.72 + Math.random() * 0.22) * SH) * dpr;
        const angle = leftToRight ? -0.32 - Math.random() * 0.25 : Math.PI + 0.32 + Math.random() * 0.25;
        nebUniforms.uShoot.value.set(sx, sy, angle, 0);
        nebUniforms.uShootLen.value = (110 + Math.random() * 90) * dpr;
      }
    }
    nebUniforms.uShoot.value.w = st.shootT;

    const nu = nebUniforms;
    nu.uRes.value.set(W * dpr, H * dpr);
    nu.uCenter.value.set(cx, cy);
    nu.uStage.value.set((H - SH) * dpr, SH * dpr);
    nu.uTime.value = st.t;
    nu.uWarp.value = J.warp;
    nu.uFlash.value = J.flash;
    nu.uPixel.value = J.pixel;
    nu.uArrive.value = J.arrive;
    nu.uDrift.value = drift;
    nu.uTravel.value = travel;
    // móvil: los planetas se encienden con el scroll de entrada (J.e); escritorio: al llegar la órbita
    nu.uE.value = J.e;
    nu.uPlanets.value = mobile
      ? Math.min(1, Math.max(0, (J.e - 0.12) / 0.55))
      : Math.max(0, (J.arrive - 0.82) / 0.18) * (1 - J.flash) * (1 - J.desk);
    nu.uPar.value.set(st.cam.x, st.cam.y + drift);
    nu.uDesk.value = J.desk;
    // el punto de luz nace en el núcleo y sube a la lámpara (arriba, al centro)
    const lx = W * 0.5 * dpr;
    // al soltarse el pin el escenario sube, pero la lámpara baja dentro de él lo mismo:
    // en pantalla queda QUIETA (arriba al centro) mientras entra la pizarra
    const ly = (H - SH * 0.1 - J.handoff * SH) * dpr;
    const m = J.pointMove * J.pointMove * (3 - 2 * J.pointMove);
    nu.uPoint.value.set(cx + (lx - cx) * m, cy + (ly - cy) * m + Math.sin(m * Math.PI) * 40 * dpr, domPoint ? 0 : J.point);
    // relevo: la luz se apaga justo cuando llega la lámpara de la pizarra al mismo sitio
    const hand = Math.min(1, Math.max(0, (J.handoff - 0.8) / 0.15));
    nu.uLamp.value.set(lx, ly, domPoint ? 0 : J.lamp * (1 - hand * hand * (3 - 2 * hand)));
  });

  return (
    <>
      <mesh frustumCulled={false} renderOrder={-1}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3]} />
        </bufferGeometry>
        <shaderMaterial vertexShader={NEB_VERT} fragmentShader={NEB_FRAG} uniforms={nebUniforms} depthTest={false} depthWrite={false} />
      </mesh>
      <mesh geometry={starGeo} material={starMat} frustumCulled={false} renderOrder={1} />
    </>
  );
};

// Lienzo del espacio: vive DENTRO del escenario fijado (pin) y se extiende
// `extendVh` por debajo, desvaneciéndose, para que al soltarse el pin el cielo no
// termine en un corte recto. Solo dibuja mientras se ve.
export const SpaceBackdrop: React.FC<Omit<Props, 'stageH'> & { extendVh?: number; paused?: boolean }> = ({
  extendVh = 0, paused = false, ...props
}) => {
  const wrap = useRef<HTMLDivElement>(null);
  const stageH = useRef(0);
  const [live, setLive] = useState(false);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setLive(e.isIntersecting), { rootMargin: '200px 0px' });
    io.observe(el);
    // alto del escenario (el padre) sin leer el layout en cada cuadro
    const parent = el.parentElement;
    const ro = parent ? new ResizeObserver(([e]) => (stageH.current = e.contentRect.height)) : null;
    if (parent && ro) {
      stageH.current = parent.clientHeight;
      ro.observe(parent);
    }
    return () => {
      io.disconnect();
      ro?.disconnect();
    };
  }, []);

  const fade = props.mobile
    ? // móvil: rampa larga arriba (el cielo de la salida se funde en la nebulosa) y abajo
      // (la nebulosa se apaga en el azul noche del cierre): sin cortes rectos
      'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.3) 9vh, rgba(0,0,0,0.75) 20vh, #000 30vh, #000 calc(100% - 22vh), transparent 100%)'
    : (extendVh > 0
        ? `linear-gradient(to bottom, #000 calc(100% - ${extendVh}vh), transparent 100%)`
        : undefined);
  return (
    <div
      ref={wrap}
      className="absolute left-0 right-0 top-0 pointer-events-none"
      style={{ height: `calc(100% + ${extendVh}vh)`, WebkitMaskImage: fade, maskImage: fade }}
      aria-hidden
    >
      <Canvas
        className="!absolute inset-0"
        style={{ pointerEvents: 'none' }}
        resize={{ offsetSize: true, scroll: false }}
        frameloop={live && !paused ? (props.reduced ? 'demand' : 'always') : 'never'}
        dpr={[1, props.mobile ? 1.5 : 1.25]}
        camera={{ position: [0, 0, 0], fov: 60, near: 0.1, far: 200 }}
        gl={{ alpha: false, antialias: false, powerPreference: 'high-performance' }}
      >
        <StarSpace {...props} stageH={stageH} />
        <WarmUp delay={1500} />
      </Canvas>
    </div>
  );
};
