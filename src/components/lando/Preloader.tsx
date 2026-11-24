import React, { useEffect, useRef, useState } from 'react';
import { appMountTime, endPreloading, loadFonts, loadState, startWarmups, warmupState } from '../../lib/preload';
import { isLite } from '../../lib/deviceProfile';
import { prepareLiquidExit, startLiquidExit } from './liquidExit';

// Copia de lib/assistedScroll.isMobileProfile: importarla desde ahí arrastraría gsap + lenis
// al chunk de entrada (la pantalla de carga debe pintarse sin esperar el código de la página).
const isMobileProfile = () =>
  typeof window !== 'undefined' &&
  !!window.matchMedia &&
  window.matchMedia('(max-width: 1023px), (hover: none) and (pointer: coarse)').matches;

// PANTALLA DE CARGA tipo LETRERO LED (referencia de la usuaria): "cargando..." en minúscula
// hecho de cuadraditos de luz rosa neón sobre negro, y debajo una barra también de
// píxeles: un contorno de 1 píxel que se llena columna a columna con el porcentaje REAL
// (fotogramas 70 % + calentamiento de las secciones 22 % + fuentes 8 %). Los tres puntos se
// encienden uno a uno. El calentamiento (lib/preload.ts: decodificar imágenes, compilar
// shaders, crear texturas) corre aquí, DURANTE la carga, para que después no haya tirones.
// Todo se dibuja en UN canvas (nítido según devicePixelRatio) y solo se redibuja cuando
// cambia el porcentaje o los puntos.
// SALIDA: la capa negra se recoge hacia ARRIBA como un líquido negro espeso y brillante,
// pintado con un shader WebGL (ver liquidExit.ts): gotas que se funden, se estiran, se
// cortan y vuelven a la masa; la tinta del letrero es arrastrada por el flujo. Si no hay
// WebGL2, se usa la versión 2D de abajo (borde ondulado con gotas y menisco rosa).
// Dura al menos MIN_MS y como mucho MAX_MS (y nunca más de WARM_CAP_MS después de que
// los fotogramas estén listos, para que una tarea de calentamiento colgada no la trabe). La portada arranca (endPreloading) cuando el
// líquido ya va subiendo. Mientras está, bloquea rueda / toques / teclas.

const MIN_MS = 2500;
const MAX_MS = 30000;
const LITE_MAX_MS = 6000;
// tope de espera del calentamiento una vez cargados los fotogramas
const WARM_CAP_MS = 12000;
// pesos del porcentaje
const W_FRAMES = 0.7;
const W_WARM = 0.22;
const W_FONTS = 0.08;
const EXIT_MS = 2000;
const EXIT_MS_2D = 1400; // salida de respaldo (canvas 2D)
const EXIT_REDUCED_MS = 450;

const PINK = '#F230D2';
const PINK_CORE = '#ff8fe0';

// ---------- fuente de píxeles 5x8 (fila 7 = descendente de la "g") ----------
const B = '     ';
const GLYPHS: Record<string, string[]> = {
  c: [B, B, ' ####', '#    ', '#    ', '#    ', ' ####', B],
  a: [B, B, ' ### ', '    #', ' ####', '#   #', ' ####', B],
  r: [B, B, '# ## ', '##  #', '#    ', '#    ', '#    ', B],
  g: [B, B, ' ####', '#   #', '#   #', ' ####', '    #', ' ### '],
  n: [B, B, '# ## ', '##  #', '#   #', '#   #', '#   #', B],
  d: ['    #', '    #', ' ####', '#   #', '#   #', '#   #', ' ####', B],
  o: [B, B, ' ### ', '#   #', '#   #', '#   #', ' ### ', B],
  '.': ['  ', '  ', '  ', '  ', '  ', '##', '##', '  '],
  '0': [' ### ', '#   #', '#  ##', '# # #', '##  #', '#   #', ' ### ', B],
  '1': ['  #  ', ' ##  ', '  #  ', '  #  ', '  #  ', '  #  ', ' ### ', B],
  '2': [' ### ', '#   #', '    #', '   # ', '  #  ', ' #   ', '#####', B],
  '3': ['#####', '   # ', '  #  ', '   # ', '    #', '#   #', ' ### ', B],
  '4': ['   # ', '  ## ', ' # # ', '#  # ', '#####', '   # ', '   # ', B],
  '5': ['#####', '#    ', '#### ', '    #', '    #', '#   #', ' ### ', B],
  '6': ['  ## ', ' #   ', '#    ', '#### ', '#   #', '#   #', ' ### ', B],
  '7': ['#####', '    #', '   # ', '  #  ', ' #   ', ' #   ', ' #   ', B],
  '8': [' ### ', '#   #', '#   #', ' ### ', '#   #', '#   #', ' ### ', B],
  '9': [' ### ', '#   #', '#   #', ' ####', '    #', '   # ', ' ##  ', B],
  '%': ['##  #', '##  #', '   # ', '  #  ', ' #   ', '#  ##', '#  ##', B],
};

type Px = [number, number]; // [columna, fila] en celdas

// píxeles encendidos de un texto a partir de (col0, row0); devuelve también el ancho
const textPixels = (str: string, col0 = 0, row0 = 0) => {
  const out: Px[] = [];
  let col = col0;
  for (const ch of str) {
    const g = GLYPHS[ch];
    if (!g) continue;
    g.forEach((row, r) => {
      for (let c = 0; c < row.length; c++) if (row[c] === '#') out.push([col + c, row0 + r]);
    });
    col += g[0].length + 1;
  }
  return { px: out, width: col - col0 - 1 };
};

// ---------- maqueta del letrero (en celdas) ----------
const WORD = textPixels('cargando'); // sin los puntos
const DOTS = [0, 1, 2].map((i) => textPixels('.', WORD.width + 1 + i * 3).px);
const COLS = WORD.width + 1 + 3 * 3 - 1; // 56 columnas
const TEXT_ROWS = 8;
const BAR_ROW = 11; // contorno: filas 11..17 (relleno 13..15)
const BAR_ROWS = 7;
const FILL_COLS = COLS - 4;
const PCT_ROW = BAR_ROW + BAR_ROWS + 2;
const PCT_SCALE = 0.5; // el porcentaje va en la misma letra, a media escala
const ROWS = PCT_ROW + 7 * PCT_SCALE;

const BAR_OUTLINE: Px[] = [];
for (let c = 0; c < COLS; c++) BAR_OUTLINE.push([c, BAR_ROW], [c, BAR_ROW + BAR_ROWS - 1]);
for (let r = BAR_ROW + 1; r < BAR_ROW + BAR_ROWS - 1; r++) BAR_OUTLINE.push([0, r], [COLS - 1, r]);

// LEDs apagados (la grilla tenue del letrero): toda la caja del texto + interior de la barra
const LIT_TEXT = new Set([...WORD.px, ...DOTS.flat()].map(([c, r]) => `${c},${r}`));
const OFF_TEXT: Px[] = [];
for (let r = 0; r < TEXT_ROWS; r++) for (let c = 0; c < COLS; c++) if (!LIT_TEXT.has(`${c},${r}`)) OFF_TEXT.push([c, r]);

// azar determinista por píxel (para la dispersión de salida)
const rnd = (i: number, k: number) => {
  const s = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

// ---------- borde del líquido ----------
// gotas: posición (0..1 del ancho), ancho (fracción del ancho), largo máx (fracción del alto), retardo
const DRIPS = [
  [0.07, 0.008, 0.2, 0.05],
  [0.19, 0.012, 0.3, 0.0],
  [0.33, 0.006, 0.16, 0.12],
  [0.47, 0.011, 0.34, 0.03],
  [0.58, 0.006, 0.14, 0.15],
  [0.71, 0.013, 0.27, 0.06],
  [0.86, 0.008, 0.22, 0.1],
  [0.95, 0.01, 0.12, 0.02],
] as const;

const easeInOut = (t: number) => 0.5 - 0.5 * Math.cos(Math.PI * t); // seno: arranca antes que la cúbica
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

// alto del borde inferior del líquido en x, para el avance u (0..1)
const edgeY = (x: number, W: number, H: number, u: number, time: number) => {
  const e = easeInOut(u);
  // parte desde abajo de la pantalla y termina por encima del borde superior
  const base = H * 1.03 + (-0.1 * H - H * 1.03) * e;
  const n = x / W;
  const amp = H * 0.035 * Math.sin(Math.PI * u);
  let y = base + amp * (0.6 * Math.sin(n * Math.PI * 2.6 + time * 2.1) + 0.4 * Math.sin(n * Math.PI * 6.2 - time * 3.3 + 1.7));
  // en pantallas angostas (móvil) van la mitad de gotas y algo más cortas
  const narrow = W < 700;
  const lenScale = Math.min(1, 0.45 + (W / H) * 0.5);
  for (let i = 0; i < DRIPS.length; i++) {
    if (narrow && i % 2) continue;
    const [cx, w, len, delay] = DRIPS[i];
    const uu = clamp01((u - delay) / (0.88 - delay));
    // se estira (el borde sube y la gota se queda colgando) y después la chupa hacia arriba
    const L = len * lenScale * H * Math.pow(Math.sin(Math.PI * Math.pow(uu, 0.75)), 1.4);
    if (L < 0.5) continue;
    const r = Math.min(L, Math.max(7, w * W)); // radio de la punta redonda
    const d = Math.abs(x - cx * W);
    // punta redonda (media circunferencia) + paredes casi verticales que se abren en un
    // hombro cóncavo y viscoso (cola exponencial) hacia el borde principal
    y += d < r ? L - r + Math.sqrt(r * r - d * d) : (L - r) * Math.exp(-(d - r) / (r * 0.85));
  }
  return y;
};

export const Preloader: React.FC = () => {
  const [pct, setPct] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [gone, setGone] = useState(false);
  const [unmount, setUnmount] = useState(false);
  const shown = useRef(0);
  const target = useRef(0);
  const fontsOk = useRef(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // estado de dibujo (fuera de React: se pinta directo en el canvas)
  const view = useRef({ pct: 0, dots: 0, exit: -1, time: 0 });
  const drawRef = useRef<() => void>(() => {});
  // aviso SOLO en celular/tablet: la experiencia completa está pensada para computadora
  const [mobileHint] = useState(() => isMobileProfile());

  // bloquear interacción mientras carga (fase de captura: antes que Lenis y el Hero)
  useEffect(() => {
    if (gone) return;
    const stop = (e: Event) => {
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    const keys = (e: KeyboardEvent) => {
      if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', ' ', 'Home', 'End'].includes(e.key)) stop(e);
    };
    const opts = { capture: true, passive: false } as AddEventListenerOptions;
    window.addEventListener('wheel', stop, opts);
    window.addEventListener('touchmove', stop, opts);
    window.addEventListener('keydown', keys, opts);
    return () => {
      window.removeEventListener('wheel', stop, opts);
      window.removeEventListener('touchmove', stop, opts);
      window.removeEventListener('keydown', keys, opts);
    };
  }, [gone]);

  // ---------- canvas: tamaño + función de dibujo ----------
  useEffect(() => {
    if (unmount) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx0 = canvas.getContext('2d');
    if (!ctx0) return;
    const ctx: CanvasRenderingContext2D = ctx0;
    let W = 0;
    let H = 0;
    let dpr = 1;

    const setup = () => {
      W = window.innerWidth;
      H = window.innerHeight;
      dpr = Math.min(isLite() ? 1.25 : 2, window.devicePixelRatio || 1);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      draw();
    };

    const draw = () => {
      const { pct: p, dots, exit, time } = view.current;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      // celda del letrero: entra en ~86 % del ancho (móvil) y como mucho 15 px
      const cell = Math.max(3, Math.min(15, (W * 0.86) / COLS, (H * 0.6) / ROWS));
      const ox = Math.round((W - COLS * cell) / 2);
      const oy = Math.round((H - ROWS * cell) / 2);
      const led = cell * 0.8; // hueco entre LEDs

      // ---- salida: el líquido negro (clip para los píxeles) ----
      if (exit >= 0) {
        const step = Math.max(3, W / 480);
        const pts: number[] = [];
        for (let x = 0; x <= W + step; x += step) pts.push(Math.min(x, W), edgeY(Math.min(x, W), W, H, exit, time));
        ctx.beginPath();
        ctx.moveTo(0, -2);
        ctx.lineTo(W, -2);
        for (let i = pts.length - 2; i >= 0; i -= 2) ctx.lineTo(pts[i], pts[i + 1]);
        ctx.closePath();
        ctx.fillStyle = '#000';
        ctx.fill();
        ctx.save();
        ctx.clip();
        drawSign(true);
        ctx.restore();
        // menisco: halo ancho tenue + filo rosa + hilo claro (sin filtros de blur)
        ctx.beginPath();
        for (let i = 0; i < pts.length; i += 2) {
          if (i) ctx.lineTo(pts[i], pts[i + 1]);
          else ctx.moveTo(pts[i], pts[i + 1]);
        }
        ctx.lineJoin = 'round';
        ctx.strokeStyle = 'rgba(242,48,210,0.22)';
        ctx.lineWidth = 9;
        ctx.stroke();
        ctx.strokeStyle = PINK;
        ctx.lineWidth = 2.4;
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,214,245,0.85)';
        ctx.lineWidth = 0.9;
        ctx.stroke();
        return;
      }
      drawSign(false);

      function drawSign(exiting: boolean) {
        // LEDs apagados (solo mientras carga)
        if (!exiting) {
          ctx.beginPath();
          for (const [c, r] of OFF_TEXT) ctx.rect(ox + c * cell, oy + r * cell, led, led);
          for (let c = 2; c < COLS - 2; c++)
            for (let r = BAR_ROW + 2; r < BAR_ROW + 5; r++) ctx.rect(ox + c * cell, oy + r * cell, led, led);
          ctx.fillStyle = 'rgba(242,48,210,0.07)';
          ctx.fill();
        }
        // LEDs encendidos (texto + puntos + contorno + relleno + porcentaje)
        const lit: [number, number, number][] = []; // x, y, tamaño
        const add = (c: number, r: number, sc = 1) => lit.push([ox + c * cell, oy + r * cell, led * sc]);
        for (const [c, r] of WORD.px) add(c, r);
        for (let i = 0; i < dots; i++) for (const [c, r] of DOTS[i]) add(c, r);
        for (const [c, r] of BAR_OUTLINE) add(c, r);
        const fill = Math.round((p / 100) * FILL_COLS);
        for (let c = 0; c < fill; c++) for (let r = 0; r < 3; r++) add(2 + c, BAR_ROW + 2 + r);
        const label = textPixels(`${p}%`);
        const pc0 = (COLS - label.width * PCT_SCALE) / 2;
        for (const [c, r] of label.px) add(pc0 + c * PCT_SCALE, PCT_ROW + r * PCT_SCALE, PCT_SCALE);

        // al salir, cada LED "siente" el borde del líquido que se le acerca desde abajo:
        // se suelta, sube (la succión) y se apaga; el borde termina tragándolo (clip).
        // 4 grupos de opacidad para seguir pintando con pocas llamadas.
        const GROUPS = exiting ? 4 : 1;
        const groups: number[][] = Array.from({ length: GROUPS }, () => []);
        const reach = H * 0.42;
        lit.forEach(([x, y, s], i) => {
          let px = x;
          let py = y;
          let g = 0;
          if (exiting) {
            const gap = edgeY(x, W, H, exit, time) - y;
            const q = clamp01(1 - gap / reach); // 0 lejos, 1 cuando el borde lo alcanza
            const k = q * q * q;
            px += (rnd(i, 1) - 0.5) * cell * 3 * k;
            py -= k * reach * (0.35 + 0.5 * rnd(i, 2));
            g = Math.min(GROUPS - 1, Math.floor(q * GROUPS));
          }
          groups[g].push(px, py, s);
        });
        groups.forEach((arr, g) => {
          if (!arr.length) return;
          ctx.globalAlpha = 1 - g / GROUPS;
          // pasada 1: cuerpo rosa con resplandor (una sola sombra para todo el trazado)
          ctx.beginPath();
          for (let i = 0; i < arr.length; i += 3) ctx.rect(arr[i], arr[i + 1], arr[i + 2], arr[i + 2]);
          ctx.fillStyle = PINK;
          ctx.shadowColor = PINK;
          ctx.shadowBlur = cell * 1.3 * dpr;
          ctx.fill();
          ctx.shadowBlur = 0;
          // pasada 2: núcleo claro del LED
          ctx.beginPath();
          for (let i = 0; i < arr.length; i += 3) {
            const s = arr[i + 2];
            ctx.rect(arr[i] + s * 0.2, arr[i + 1] + s * 0.2, s * 0.6, s * 0.6);
          }
          ctx.fillStyle = PINK_CORE;
          ctx.fill();
        });
        ctx.globalAlpha = 1;
      }
    };

    drawRef.current = draw;
    setup();
    window.addEventListener('resize', setup);
    return () => {
      window.removeEventListener('resize', setup);
      drawRef.current = () => {};
      canvas.width = canvas.height = 1;
    };
  }, [unmount]);

  // ---------- progreso real ----------
  useEffect(() => {
    const t0 = performance.now();
    const lite = isLite();
    loadFonts().then(() => (fontsOk.current = true), () => (fontsOk.current = true));
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    let done = false;
    let framesDoneAt = -1; // instante (ms desde t0) en que los fotogramas quedaron completos
    let warmStarted = false;
    let exitTimer = 0;
    let revealTimer = 0;
    let liteExpired = false;
    const finish = () => {
      if (done) return;
      done = true;
      cancelAnimationFrame(raf);
      view.current.pct = 100;
      view.current.dots = 3;
      setPct(100);
      drawRef.current();
      if (!lite && !reduce) prepareLiquidExit();
      exitTimer = window.setTimeout(() => {
        setLeaving(true);
        revealTimer = window.setTimeout(() => {
          endPreloading();
          setGone(true);
        }, reduce ? 0 : lite ? EXIT_MS_2D * 0.5 : EXIT_MS * 0.5);
      }, lite ? 0 : 250);
    };
    const deadline = lite ? window.setTimeout(() => {
      liteExpired = true;
      if (document.querySelector('#root main')) finish();
    }, LITE_MAX_MS) : 0;
    const safety = lite ? window.setTimeout(finish, MAX_MS) : 0;
    const tick = () => {
      // Esta pantalla se pinta ANTES de bajar el código de la página (main.tsx hace import() de App):
      // 'raw' cuenta desde que el letrero aparece (puntos, tiempo mínimo, avance inicial) y 'now'
      // desde que la página se monta (marcas de tiempo de la carga real: fotogramas, tope, calentamiento),
      // que es lo que medía antes porque entonces ambas cosas arrancaban a la vez.
      const raw = performance.now() - t0;
      const am = appMountTime();
      const now = am == null ? 0 : performance.now() - am;
      const { loaded, total } = loadState();
      // sin datos todavía, avanza lento hasta 15 %
      const frames = total > 0 ? loaded / total : Math.min(0.15, raw / 8000);
      // fotogramas completos (con un margen de 1.5 s para que se registren todas las secuencias)
      if (framesDoneAt < 0 && total > 0 && loaded >= total && now > 1500) framesDoneAt = now;
      // el calentamiento arranca con los fotogramas a medias (la red sigue ocupada, la CPU no);
      // las tareas que se registren más tarde se recogen en cada vuelta (startWarmups es idempotente)
      if (!warmStarted && (frames >= 0.5 || now > 4000)) warmStarted = true;
      if (warmStarted && !lite) startWarmups();
      const w = warmupState();
      // sin ninguna tarea registrada, el calentamiento cuenta como hecho al terminar los fotogramas
      const warm = w.total > 0 ? w.done / w.total : framesDoneAt >= 0 ? 1 : 0;
      // (las sumas de decimales no dan exactamente 1: se redondea para que 100 % sea alcanzable)
      const sum = frames * W_FRAMES + warm * W_WARM + (fontsOk.current ? W_FONTS : 0);
      const real = sum > 0.9999 ? 1 : sum;
      // nunca pasa el tiempo mínimo: el contador no llega a 100 antes de MIN_MS
      const cap = Math.min(1, raw / MIN_MS);
      const stuck = framesDoneAt >= 0 && now - framesDoneAt > WARM_CAP_MS;
      // (si el código de la página no llegara a montarse nunca, raw evita que la carga quede eterna)
      if (lite && document.querySelector('#root main') &&
          (liteExpired || (raw >= MIN_MS && loaded > 0 && fontsOk.current))) {
        finish();
        return;
      }
      const wanted = lite
        ? Math.min(0.96, cap * (0.5 + (loaded > 0 ? 0.38 : 0) + (fontsOk.current ? 0.08 : 0)))
        : now > MAX_MS || stuck || raw > MAX_MS + 20000 ? 1 : Math.min(real, cap);
      // monótono: si llegan tareas nuevas el total crece, pero el porcentaje no retrocede
      target.current = Math.max(target.current, wanted);
      shown.current += (target.current - shown.current) * (reduce ? 1 : 0.08);
      if (target.current >= 1 && shown.current > 0.995) shown.current = 1;
      const p = Math.floor(shown.current * 100);
      setPct(p);
      // puntos suspensivos: se encienden de a uno (fijos en 3 con movimiento reducido)
      const dots = reduce ? 3 : Math.floor(raw / 380) % 4;
      const v = view.current;
      if (v.pct !== p || v.dots !== dots) {
        v.pct = p;
        v.dots = dots;
        drawRef.current();
      }
      if (shown.current >= 1) {
        finish();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(deadline);
      window.clearTimeout(safety);
      window.clearTimeout(exitTimer);
      window.clearTimeout(revealTimer);
    };
  }, []);

  // ---------- salida: el líquido se recoge hacia arriba ----------
  useEffect(() => {
    if (!leaving) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    let raf = 0;
    let unmountId = 0;
    const done = (ms: number) => {
      window.clearTimeout(unmountId);
      unmountId = window.setTimeout(() => setUnmount(true), ms);
    };
    const fade = (ms: number) => {
      if (!wrap) return;
      wrap.style.transition = `opacity ${ms}ms ease`;
      wrap.style.opacity = '0';
    };
    if (reduce) {
      // movimiento reducido: fundido simple
      fade(EXIT_REDUCED_MS);
      done(EXIT_REDUCED_MS + 100);
      return () => window.clearTimeout(unmountId);
    }
    // 1) líquido WebGL (liquidExit.ts); el letrero 2D se le pasa como textura
    const liquid =
      !isLite() && wrap && canvas
        ? startLiquidExit({
            host: wrap,
            sign: canvas,
            duration: EXIT_MS,
            onFirstFrame: () => {
              // en el mismo cuadro: fuera el fondo negro y el letrero 2D
              wrap.style.background = 'transparent';
              canvas.style.visibility = 'hidden';
            },
            onDone: () => done(0),
          })
        : null;
    if (liquid) {
      // red de seguridad (contexto GL perdido, pestaña en segundo plano...): fundido y fuera
      const safety = window.setTimeout(() => {
        fade(300);
        done(350);
      }, EXIT_MS + 1500);
      return () => {
        liquid.stop();
        window.clearTimeout(safety);
        window.clearTimeout(unmountId);
      };
    }
    // 2) respaldo 2D
    const ms = EXIT_MS_2D;
    const t0 = performance.now();
    const frame = () => {
      const t = performance.now() - t0;
      const v = view.current;
      v.exit = clamp01(t / ms);
      v.time = t / 1000;
      drawRef.current();
      // el fondo negro del contenedor se apaga en el mismo cuadro en que el canvas pinta el líquido
      if (wrap) wrap.style.background = 'transparent';
      if (t < ms) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    done(ms + 100);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(unmountId);
    };
  }, [leaving]);

  if (unmount) return null;

  return (
    <div
      ref={wrapRef}
      role="status"
      aria-live="polite"
      aria-label={`Cargando ${pct}%`}
      className="fixed inset-0 z-[300]"
      style={{ background: '#000', pointerEvents: leaving ? 'none' : 'auto' }}
    >
      <canvas ref={canvasRef} aria-hidden className="absolute inset-0 block h-full w-full" />
      {mobileHint && (
        <p
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 'max(7vh, calc(env(safe-area-inset-bottom) + 28px))',
            margin: 0,
            padding: '0 28px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 10,
            textAlign: 'center',
            fontFamily: '"JetBrains Mono", ui-monospace, monospace',
            fontSize: 12,
            lineHeight: 1.55,
            letterSpacing: '0.08em',
            color: 'rgba(236,232,242,0.78)',
            opacity: leaving ? 0 : 1,
            transition: 'opacity 300ms ease',
            pointerEvents: 'none',
          }}
        >
          <svg width="26" height="22" viewBox="0 0 26 22" fill="none" aria-hidden="true" style={{ filter: 'drop-shadow(0 0 6px rgba(242,48,210,0.7))' }}>
            <rect x="1.5" y="1.5" width="23" height="14" rx="2" stroke="#F230D2" strokeWidth="1.6" />
            <path d="M8 20.5h10M13 15.5v5" stroke="#F230D2" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <span>
            Para la experiencia completa,
            <br />
            ábrelo en una <span style={{ color: '#F230D2' }}>computadora</span>
          </span>
        </p>
      )}
    </div>
  );
};
