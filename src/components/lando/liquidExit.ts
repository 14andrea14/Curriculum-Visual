// SALIDA LÍQUIDA de la pantalla de carga (solo la usa Preloader.tsx).
// Un canvas WebGL2 a pantalla completa pinta la capa negra como un líquido espeso y
// brillante (tinta / látex) que se recoge hacia ARRIBA:
// - el borde inferior es un campo implícito (distancia con signo + unión suave "smin"):
//   las gotas se funden con la masa y entre sí de forma orgánica;
// - gotas de anchos, largos, retardos y velocidades distintos; algunas se estiran, el cuello
//   se adelgaza hasta CORTARSE, la gota suelta sigue un poco por inercia y la tensión
//   superficial la chupa de vuelta a la masa (con gotitas satélite);
// - la masa sube con un pequeño rebote (resorte) y al final acelera (ease-in) hasta salir;
// - sombreado de líquido real: normal a partir del gradiente del campo (bisel redondo en el
//   borde), reflejos de dos "softbox" (vetas largas brillantes), borde fresnel rosa neón
//   solo en el menisco, leve tinte rosa translúcido en las partes finas, borde antialias;
// - el letrero LED (copiado como textura del canvas 2D) va "dentro" del líquido: cuando el
//   borde se acerca, la tinta rosa es arrastrada por el flujo, se estira y se amontona
//   brillando en el menisco hasta disolverse.
// El bucle GL solo corre durante la salida; al terminar se libera el contexto.
// Si no hay WebGL2 devuelve null y el Preloader usa la salida 2D de siempre.

const MAXP = 64;
const NOMINAL_S = 2; // la física está afinada para una salida de ~2 s // primitivas (cápsulas desiguales) que admite el shader

const VERT = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
#define MAXP ${MAXP}
uniform vec2 uView;      // ancho y alto en px CSS
uniform float uDpr;      // px de dispositivo por px CSS del canvas GL
uniform float uTime;     // segundos
uniform vec4 uFront;     // (y base, amplitud de la ola, y mínima que alcanza el borde, y máxima)
uniform vec4 uPrimA[MAXP]; // (ax, ay, ra, k de unión)
uniform vec4 uPrimB[MAXP]; // (bx, by, rb, brillo extra)
uniform int uCount;
uniform sampler2D uSign; // letrero LED (premultiplicado, y hacia abajo)
uniform float uInk;      // presencia del letrero 0..1
uniform float uSignScale; // px de textura por px CSS
out vec4 outColor;

const vec3 PINK = vec3(0.949, 0.188, 0.824);

float frontY(float x) {
  float n = x / uView.x;
  float t = uTime;
  return uFront.x + uFront.y * (
      0.50 * sin(n * 8.17 + t * 1.7)
    + 0.30 * sin(n * 19.5 - t * 2.6 + 1.3)
    + 0.20 * sin(n * 45.9 + t * 4.1 + 0.4));
}

float smin(float a, float b, float k) {
  if (k <= 0.0) return min(a, b);
  float h = max(k - abs(a - b), 0.0) / k;
  return min(a, b) - h * h * k * 0.25;
}

// cápsula de radios distintos (iq)
float sdUneven(vec2 p, vec2 pa, vec2 pb, float ra, float rb) {
  p -= pa; pb -= pa;
  float h = dot(pb, pb);
  float b = ra - rb;
  if (h <= b * b + 1e-3) {
    // degenerada: un círculo (el mayor)
    return ra > rb ? length(p) - ra : length(p - pb) - rb;
  }
  vec2 q = vec2(dot(p, vec2(pb.y, -pb.x)), dot(p, pb)) / h;
  q.x = abs(q.x);
  vec2 c = vec2(sqrt(h - b * b), b);
  float k = c.x * q.y - c.y * q.x;
  float m = dot(c, q);
  float n = dot(q, q);
  if (k < 0.0) return sqrt(h * n) - ra;
  if (k > c.x) return sqrt(h * (n + 1.0 - 2.0 * q.y)) - rb;
  return m - ra;
}

// campo del líquido: < 0 dentro. glint = brillo extra de la primitiva más cercana;
// rad = radio local (las gotas se sombrean como cilindros/esferas de su propio grosor)
float field(vec2 p, out float glint, out float rad) {
  float d = p.y - frontY(p.x);
  glint = 0.0;
  rad = 22.0;
  if (p.y < uFront.z - 40.0) return d; // muy dentro de la masa: nada que unir
  for (int i = 0; i < MAXP; i++) {
    if (i >= uCount) break;
    vec4 A = uPrimA[i];
    vec4 B = uPrimB[i];
    float reach = max(A.z, B.z) + A.w + 2.0;
    if (p.x < min(A.x, B.x) - reach || p.x > max(A.x, B.x) + reach) continue;
    if (p.y < min(A.y, B.y) - reach || p.y > max(A.y, B.y) + reach) continue;
    float dc = sdUneven(p, A.xy, B.xy, A.z, B.z);
    vec2 ab = B.xy - A.xy;
    float hh = clamp(dot(p - A.xy, ab) / max(dot(ab, ab), 1e-3), 0.0, 1.0);
    float wb = clamp(0.5 + 0.5 * (d - dc) / max(A.w, 2.0), 0.0, 1.0);
    rad = mix(rad, max(mix(A.z, B.z, hh), 1.5), wb);
    glint = mix(glint, B.w, wb);
    d = smin(d, dc, A.w);
  }
  return d;
}

// entorno que se refleja en el líquido (R en espacio de pantalla, y hacia abajo)
vec3 env(vec3 R, vec2 p) {
  vec3 c = vec3(0.0);
  // softbox principal arriba-izquierda (blanco frío)
  vec2 k = R.xy - vec2(-0.40, -0.50);
  c += vec3(1.0, 0.97, 1.0) * 22.0 * smoothstep(0.30, 0.14, abs(k.x)) * smoothstep(0.22, 0.06, abs(k.y));
  // tira vertical a la derecha: vetas largas en los costados de las gotas
  vec2 s = R.xy - vec2(0.50, -0.05);
  c += vec3(0.92, 0.95, 1.0) * 16.0 * smoothstep(0.09, 0.03, abs(s.x)) * smoothstep(0.8, 0.3, abs(s.y));
  // segunda tira, más tenue, a la izquierda (doble veta en los cilindros)
  vec2 s2 = R.xy - vec2(-0.62, 0.05);
  c += vec3(0.9, 0.85, 1.0) * 7.0 * smoothstep(0.07, 0.02, abs(s2.x)) * smoothstep(0.7, 0.3, abs(s2.y));
  // tira horizontal "de piso": línea brillante metida en el menisco
  float fl = smoothstep(0.10, 0.03, abs(R.y - 0.42));
  c += vec3(1.0, 0.92, 1.0) * 6.0 * fl * (0.45 + 0.55 * sin(p.x * 0.013 + uTime * 0.9) * sin(p.x * 0.0041 - 0.7));
  // rebote rosa neón desde abajo (lo que brilla debajo): da el borde fresnel rosa
  float bounce = smoothstep(0.55, 0.98, R.y);
  float var = 0.55 + 0.45 * sin(p.x * 0.006 - uTime * 1.3) * sin(p.x * 0.017 + 2.0);
  var *= var;
  c += PINK * 1.5 * bounce * var;
  // cielo muy tenue
  c += vec3(0.06, 0.04, 0.08) * smoothstep(0.1, -0.9, R.y);
  return c;
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, uDpr * uView.y - gl_FragCoord.y) / uDpr; // px CSS, y hacia abajo
  float glint, rad;
  float d = field(p, glint, rad);
  // gradiente del campo (diferencias de pantalla: barato y suave a este tamaño)
  vec2 g = vec2(dFdx(d), -dFdy(d)) * uDpr;
  float gl = length(g);
  vec2 n2 = gl > 1e-4 ? g / gl : vec2(0.0, 1.0);
  float aa = 0.75 / uDpr; // ~1,5 px de dispositivo de transición (el campo es casi una distancia)

  // ---- fuera del líquido: solo un halo rosa muy fino pegado al menisco ----
  float cover = smoothstep(aa, -aa, d);
  float halo = exp(-max(d, 0.0) / 5.0) * (1.0 - cover) * smoothstep(0.1, 0.9, n2.y) * 0.13;

  // ---- normal: bisel redondo (cuarto de círculo) de ancho R en el borde ----
  float Rm = min(22.0, rad * 1.05);
  float t = clamp(-d / Rm, 0.0, 1.0);
  float s1 = 1.0 - t;
  // en la cresta de las gotas finas el gradiente se anula: allí se aplana (sin pliegue)
  float slope = s1 / max(sqrt(1.0 - s1 * s1), 0.12) * smoothstep(0.15, 0.7, gl);
  vec3 N = normalize(vec3(n2 * slope, 1.0));
  // ondulación aceitosa muy suave en la superficie, que fluye hacia arriba
  float fy = p.y - uFront.x * 0.55;
  vec2 rip = vec2(
    cos(p.x * 0.010 + fy * 0.004 + uTime * 1.1) + 0.6 * cos(p.x * 0.023 - fy * 0.011 + uTime * 0.7),
    cos(fy * 0.012 - p.x * 0.003 - uTime * 1.6) + 0.5 * cos(fy * 0.027 + p.x * 0.008 + 1.7));
  N = normalize(N + vec3(rip * 0.02, 0.0));

  vec3 V = vec3(0.0, 0.0, 1.0);
  vec3 R = reflect(-V, N);
  float NoV = clamp(N.z, 0.0, 1.0);
  float F = 0.04 + 0.96 * pow(1.0 - NoV, 5.0);
  vec3 col = vec3(0.006, 0.004, 0.008); // negro con un pelo de calidez
  col += env(R, p) * F * (1.0 + glint);
  // tinte rosa translúcido donde el líquido es fino (cerca del borde)
  float thin = exp(-max(-d, 0.0) / 3.5);
  col += PINK * 0.08 * thin * cover;

  col = 1.0 - exp(-col * 1.1); // tono: los reflejos fuertes se saturan suave a blanco

  // ---- tinta del letrero arrastrada por el flujo hacia el menisco ----
  if (uInk > 0.0) {
    float dist = max(-d, 0.0);
    float sz = clamp(uView.x / 1400.0, 0.45, 1.0);    // en móvil el letrero es chico: menos arrastre
    float pull = 70.0 * sz * exp(-dist / (90.0 * sz)); // cuánto se arrastra (px)
    vec2 dir = n2;                                    // hacia el borde más cercano
    vec3 ink = vec3(0.0);
    float wsum = 0.0;
    // cuanto más arrastrada, más se corre y se desenfoca (mipmaps del letrero)
    float lod = log2(1.0 + pull * 0.09 * uSignScale);
    for (int j = 0; j < 6; j++) {
      float fj = float(j) / 5.0;
      vec2 sp = p + dir * pull * (0.25 + 0.75 * fj);  // estela (motion blur del arrastre)
      float w = 1.0 - 0.6 * fj;
      ink += textureLod(uSign, sp / uView, lod * (0.6 + 0.4 * fj)).rgb * w;
      wsum += w;
    }
    ink /= wsum;
    // la tinta que ya quedó "fuera" del líquido se disuelve; lo amontonado brilla más
    float outside = max(pull - dist, 0.0);
    float fade = exp(-outside / (26.0 * sz));
    float boost = 1.0 + 1.6 * exp(-dist / (40.0 * sz));
    col += ink * fade * boost * uInk * (1.0 - 0.6 * F);
  }

  vec3 rgb = col * cover + PINK * halo;
  outColor = vec4(rgb, cover + halo * 0.25);
}`;

// -------- gotas (cálculo en JS, el shader solo evalúa el campo) --------

type Drip = {
  fx: number; // x como fracción del ancho
  r0: number; // radio del cuello en la raíz (px CSS)
  tip: number; // radio de la punta
  len: number; // largo máximo (fracción del alto)
  delay: number; // retardo (fracción de la salida)
  span: number; // duración de su vida (fracción de la salida)
  snap: number; // 0 = no se corta; si no, momento del corte (fracción de su vida)
  glint: number;
  sx: number; // corrimiento lateral de la gota suelta
};

const rand = (() => {
  let s = (Math.random() * 2 ** 31) | 0 || 1;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
})();

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a: number, b: number, v: number) => {
  const x = clamp01((v - a) / (b - a));
  return x * x * (3 - 2 * x);
};

const makeDrips = (W: number) => {
  const n = Math.max(5, Math.min(13, Math.round(W / 125)));
  const sc = Math.max(0.65, Math.min(1.15, W / 1500));
  const out: Drip[] = [];
  for (let i = 0; i < n; i++) {
    const fat = Math.pow(rand(), 1.6);
    const r0 = (6 + 17 * fat) * sc;
    const len = 0.05 + 0.22 * Math.pow(rand(), 1.3) + 0.1 * fat;
    out.push({
      fx: (i + 0.5 + (rand() - 0.5) * 0.9) / n,
      r0,
      tip: r0 * (1.15 + 0.45 * rand()),
      len,
      delay: rand() * 0.2,
      span: 0.45 + 0.25 * rand(),
      snap: len > 0.13 && rand() < 0.6 ? 0.62 + 0.2 * rand() : 0,
      glint: rand() * 0.6,
      sx: (rand() - 0.5) * 6,
    });
  }
  return out;
};

// posición base del borde (fracción del alto) según el avance u: sube con un rebote de
// resorte, se queda "pensando" y al final acelera hacia afuera
const frontFrac = (u: number) => {
  const a = clamp01(u / 0.55);
  const spring = 1 - Math.exp(-5.5 * a) * Math.cos(8.5 * a);
  const b = clamp01((u - 0.42) / 0.58);
  return 1.06 - 0.46 * spring - 0.07 * u - 0.8 * Math.pow(b, 2.3);
};

export type LiquidExit = { stop: () => void };

// contexto + shader compilado (compilar cuesta ~200 ms en algunos equipos: se hace antes,
// durante la pausa en 100 %, para que la salida arranque sin tirón)
const createGL = () => {
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none';
  const gl = canvas.getContext('webgl2', { premultipliedAlpha: true, alpha: true, antialias: false, depth: false, stencil: false });
  if (!gl) return null;

  const compile = (type: number, src: string) => {
    const sh = gl.createShader(type)!;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.warn('[liquidExit]', gl.getShaderInfoLog(sh));
      return null;
    }
    return sh;
  };
  const vs = compile(gl.VERTEX_SHADER, VERT);
  const fs = compile(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return null;
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.warn('[liquidExit]', gl.getProgramInfoLog(prog));
    return null;
  }
  gl.useProgram(prog);
  // cuadro de calentamiento: fuerza a terminar la compilación en el driver
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.flush();
  return { canvas, gl, prog, vs, fs };
};

let prepared: ReturnType<typeof createGL> | undefined;

/** Prepara el contexto WebGL y compila el shader de antemano. */
export const prepareLiquidExit = () => {
  if (prepared === undefined) prepared = createGL();
};

export const startLiquidExit = (opts: {
  host: HTMLElement;
  sign: HTMLCanvasElement;
  duration: number;
  onFirstFrame: () => void;
  onDone: () => void;
}): LiquidExit | null => {
  const { host, sign, duration, onFirstFrame, onDone } = opts;
  const ready = prepared ?? createGL();
  prepared = undefined;
  if (!ready) return null;
  const { canvas, gl, prog, vs, fs } = ready;

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(prog, 'aPos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  // letrero como textura (premultiplicada, sin voltear: fila 0 = arriba)
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sign);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const U = (n: string) => gl.getUniformLocation(prog, n);
  const uView = U('uView');
  const uDpr = U('uDpr');
  const uTime = U('uTime');
  const uFront = U('uFront');
  const uPrimA = U('uPrimA');
  const uPrimB = U('uPrimB');
  const uCount = U('uCount');
  const uInk = U('uInk');
  gl.uniform1i(U('uSign'), 0);
  const uSignScale = U('uSignScale');
  gl.disable(gl.BLEND);

  let W = 0;
  let H = 0;
  let dpr = 1;
  const resize = () => {
    W = window.innerWidth;
    H = window.innerHeight;
    dpr = Math.min(1.5, window.devicePixelRatio || 1);
    // tope de píxeles para mantener 60 fps en GPUs integradas
    const maxPx = 2.4e6;
    if (W * H * dpr * dpr > maxPx) dpr = Math.sqrt(maxPx / (W * H));
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
  };
  resize();
  window.addEventListener('resize', resize);

  const drips = makeDrips(W);
  const A = new Float32Array(MAXP * 4);
  const Bv = new Float32Array(MAXP * 4);

  // mismo borde que el shader (para colgar las gotas de él)
  const frontAt = (x: number, base: number, amp: number, time: number) => {
    const n = x / W;
    return base + amp * (0.5 * Math.sin(n * 8.17 + time * 1.7) + 0.3 * Math.sin(n * 19.5 - time * 2.6 + 1.3) + 0.2 * Math.sin(n * 45.9 + time * 4.1 + 0.4));
  };

  let raf = 0;
  let first = true;
  let stopped = false;
  let lost = false;
  const onLost = (e: Event) => {
    e.preventDefault();
    lost = true;
  };
  canvas.addEventListener('webglcontextlost', onLost);
  host.appendChild(canvas);
  let t0 = -1;

  const frame = () => {
    if (stopped) return;
    if (lost) {
      finish();
      return;
    }
    // el reloj arranca en el primer cuadro (después de subir la textura)
    if (t0 < 0) t0 = performance.now();
    const tms = performance.now() - t0;
    const u = clamp01(tms / duration);
    const time = u * NOMINAL_S; // reloj de la física (independiente de la cámara lenta)
    const base = frontFrac(u) * H;
    const amp = H * 0.032 * Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.15)), 0.7);
    // al final todo lo que cuelga se recoge (para que nada quede en pantalla)
    const endPull = 1 - smooth(0.78, 0.97, u);

    let c = 0;
    let minY = Infinity;
    let maxY = -Infinity;
    const push = (ax: number, ay: number, ra: number, k: number, bx: number, by: number, rb: number, glint: number) => {
      if (c >= MAXP || (ra < 0.25 && rb < 0.25)) return;
      A.set([ax, ay, ra, k], c * 4);
      Bv.set([bx, by, rb, glint], c * 4);
      minY = Math.min(minY, ay - ra, by - rb);
      maxY = Math.max(maxY, ay + ra, by + rb);
      c++;
    };

    for (const dp of drips) {
      const x = dp.fx * W;
      const root = frontAt(x, base, amp, time);
      const v = (u - dp.delay) / dp.span; // vida de la gota
      if (v <= 0) continue;
      const Lmax = dp.len * H * Math.min(1, 0.5 + (W / H) * 0.4);
      const sway = Math.sin(time * 2.3 + dp.fx * 40) * dp.r0 * 0.15;
      if (!dp.snap) {
        // crece (el borde sube y la gota se queda colgando por viscosidad) y la chupa
        const up = 1 - Math.pow(1 - clamp01(v / 0.7), 2.4);
        const down = Math.pow(clamp01((v - 0.68) / 0.5), 2);
        const L = Lmax * up * (1 - down) * endPull;
        const rn = dp.r0 * (1 - 0.25 * up) * (0.45 + 0.55 * (1 - down));
        const tip = dp.tip * (1 - 0.25 * up) * (0.5 + 0.5 * (1 - down)) * (0.3 + 0.7 * endPull);
        if (L < 1) continue;
        // cuello: más ancho en la raíz (hombro viscoso lo da la unión suave)
        push(x, root - 8, rn * 1.7, 30 * (dp.r0 / 12), x + sway, root + L - tip, rn, dp.glint);
        // bulbo de la punta, un poco estirado hacia abajo
        push(x + sway, root + L - tip * 1.25, tip * 0.92, tip * 0.9, x + sway, root + L - tip, tip, dp.glint);
        continue;
      }
      // ---- gota que se corta ----
      const vs = dp.snap;
      const grow = (vv: number) => 1 - Math.pow(1 - clamp01(vv / (vs + 0.05)), 1.8);
      if (v < vs) {
        const g = grow(v);
        const L = Lmax * g * endPull;
        const q = v / vs;
        // el cuello se adelgaza cada vez más rápido hasta cortarse
        const rn = dp.r0 * Math.pow(Math.max(0, 1 - q * q * q * q), 0.5) * (0.7 + 0.3 * (1 - g));
        const tip = dp.tip * (1 + 0.15 * q);
        if (L < 1) continue;
        push(x, root - 8, Math.max(rn * 1.7, dp.r0 * 0.8), 30 * (dp.r0 / 12), x, root + L - tip * 1.3, rn, dp.glint);
        // la punta pesa: bulbo un poco más ancho que el cuello (unión suave que se apaga con el cuello)
        push(x, root + L - tip * 1.1, tip * 0.85, tip * 1.1 * Math.max(0.15, rn / dp.r0), x, root + L - tip, tip, dp.glint);
      } else {
        // corte: tiempo desde el corte (s)
        const ts = (v - vs) * dp.span * NOMINAL_S;
        const gs = grow(vs);
        const rootS = root; // la raíz sigue subiendo con la masa
        // el muñón del cuello rebota hacia arriba (retroceso elástico)
        const Ls = Lmax * gs * endPull;
        const rec = Math.exp(-ts * 7) * Math.cos(ts * 22);
        const stub = Ls * 0.45 * Math.max(0, rec) + dp.r0 * 0.6 * Math.exp(-ts * 3);
        if (stub > 1) push(x, rootS - 6, dp.r0 * 0.9, 18 * (dp.r0 / 10), x, rootS + stub, dp.r0 * 0.35 * Math.exp(-ts * 2), dp.glint);
        // gota suelta: por inercia se queda un instante (la masa sigue subiendo) y la tensión
        // superficial la chupa de vuelta, cada vez más rápido; se alarga como lágrima al subir
        const off0 = Ls - dp.tip; // distancia raíz → centro de la gota al cortarse
        const offAt = (tt: number) => (off0 + 0.22 * H * tt) * Math.exp(-Math.pow(tt * 3.1, 1.7));
        const off = offAt(ts) * endPull;
        const vRel = (offAt(ts + 0.02) - offAt(ts)) / 0.02; // px/s (negativa = sube hacia la masa)
        const stretch = Math.min(1.8, Math.max(0, -vRel / H) * 0.9);
        const r = dp.tip * (1 - 0.12 * Math.min(1, ts * 2));
        const xb = x + dp.sx * Math.min(ts, 0.4) * 8;
        const yb = root + off;
        if (off > r * 0.2) {
          // cola hacia arriba según la velocidad (la unión suave la funde al llegar)
          push(xb, yb - r * (0.35 + stretch), r * (0.6 - 0.2 * Math.min(1, stretch)), r * 1.5, xb, yb, r, 0.6 + dp.glint);
        }
        // gotita satélite (del hilo que se rompió), vuelve antes
        const offSat = (off0 * 0.62 + 0.1 * H * ts) * Math.exp(-Math.pow(ts * 4.2, 1.7)) * endPull;
        const rsat = dp.r0 * 0.45;
        if (offSat > rsat) push(x + dp.sx * 2, root + offSat, rsat, rsat * 1.3, x + dp.sx * 2, root + offSat, rsat, 0.8);
      }
    }

    // borde mínimo/máximo de la ola (el shader se salta el bucle muy dentro de la masa)
    const frontMin = base - amp * 1.05;
    gl.uniform2f(uView, W, H);
    gl.uniform1f(uDpr, dpr);
    gl.uniform1f(uTime, time);
    gl.uniform4f(uFront, base, amp, Math.min(frontMin, c ? minY : frontMin), Math.max(maxY, base + amp));
    gl.uniform4fv(uPrimA, A);
    gl.uniform4fv(uPrimB, Bv);
    gl.uniform1i(uCount, c);
    gl.uniform1f(uSignScale, sign.width / Math.max(1, W));
    gl.uniform1f(uInk, 1 - smooth(0.55, 0.9, u));
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (first) {
      first = false;
      onFirstFrame();
    }
    if (tms < duration) raf = requestAnimationFrame(frame);
    else finish();
  };

  const cleanup = () => {
    stopped = true;
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
    canvas.removeEventListener('webglcontextlost', onLost);
    if (!lost) {
      gl.deleteTexture(tex);
      gl.deleteBuffer(buf);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
    canvas.remove();
  };
  const finish = () => {
    if (stopped) return;
    cleanup();
    onDone();
  };

  raf = requestAnimationFrame(frame);
  return { stop: cleanup };
};
