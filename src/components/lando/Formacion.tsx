import { isLite, listenMedia } from '../../lib/deviceProfile';
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Key } from './shared';
import { registerStops } from '../../lib/assistedScroll';
import { ACCENT, BONE, DESK, buildSlides } from './formacion/slides';
import { buildBoard, drawBoard, isTwinkling, type BoardField } from './formacion/boardCanvas';
import { Lamp } from './formacion/Lamp';
import { DrawingCard, NoteCard } from './formacion/NoteCard';
import { DRAWINGS } from './formacion/drawings';
import { usePauseOffscreen } from './usePauseOffscreen';
import { ZoomNote } from './formacion/ZoomNote';
import { BOARD_IMG, fitBoardPhoto } from './formacion/boardPhoto';

gsap.registerPlugin(ScrollTrigger);

// FORMACIÓN — tablero de oficina con post-its completos y una lámpara.
// Pedido: "post-its y un ambiente más ordenado, como de oficina"; la luz con
// la que termina la órbita se vuelve una lámpara que ilumina el tablero; las
// notas llegan ya completas (título, institución, detalle), sin numeración, y
// se puede hacer ZOOM en cada una para leerla con calma.
//
// 1) Transición (ligada al scroll y reversible, corta y ordenada):
//    - el punto de luz de arriba al centro es la bombilla: aparece la lámpara
//      colgante alrededor y se enciende con un parpadeo; su cono cálido baña el
//      tablero (Lamp.tsx + charco de luz del canvas).
//    - las luces del cielo encajan en una rejilla y se vuelven chinchetas
//      (formacion/boardCanvas.ts).
//    - las 4 notas se clavan una a una en su sitio del tablero (2×2), cada una
//      con su chincheta; al final aparece el titular.
//    Escritorio: el escenario (100svh) se fija con ScrollTrigger (pin).
//    Pantallas estrechas: sin fijar; cada nota se clava al entrar en pantalla.
// 2) Tablero: hover/foco levanta la nota un poco; clic / Enter / Espacio abre
//    el zoom (ZoomNote.tsx): fondo suave, la nota crece al centro; se cierra
//    con clic fuera, × o Esc.
// 3) prefers-reduced-motion: tablero ya montado y lámpara encendida, zoom con
//    fundido.
//
// Fondo fotográfico (ver docs/prompts-nano/oficina.md): solo se usa si el
// archivo existe (se comprueba cargándolo); si no, tablero procedural. La foto
// trae su propia lámpara negra y su charco de luz: entonces se ocultan la
// pantalla y el cable SVG (queda solo el brillo de la bombilla, alineado con la
// bombilla de la foto, que está en x 50 % / y 15 % de la imagen) y el canvas
// no dibuja chinchetas.
// (BOARD_IMG y el encaje de escritorio viven en formacion/boardPhoto.ts: la órbita
// dibuja la MISMA foto con el MISMO encaje para que el relevo sea invisible)
const PHOTO_BULB_Y = 0.15; // fracción de la altura de la imagen
// Relevo con la órbita: su bombilla queda fija en pantalla a 50 % / 10vh
// mientras esta sección sube, y se apaga en el último ~15 % de ese recorrido.
// La nuestra está en el mismo punto (10vh desde arriba del escenario) y se
// enciende justo en ese tramo: se lee como una sola lámpara.
const BULB_VH = 0.1;

// Curva del viaje a la pizarra: arranca con fuerza (derivada ~1,55: los primeros px, que aún no
// mueven nada porque el escenario de la órbita sigue fijado, pasan en ~0,1 s) y se calma al final
// (asienta el titular). 55 % salida cuadrática + 45 % lineal.
const BOARD_EASE = (t: number) => 0.55 * (1 - (1 - t) * (1 - t)) + 0.45 * t;

// leve inclinación de cada nota clavada (orden, pero hecho a mano)
const TILT = [-1.4, 1.1, 1.3, -1];

const css = `
.fm-sans { font-family: "Mona Sans", "Inter", sans-serif; font-weight: 850; font-variation-settings: "wdth" 82, "wght" 850; letter-spacing: -0.015em; }
.fm-serif { font-family: "Gloock", Georgia, serif; font-weight: 400; letter-spacing: -0.01em; }
.fm-hand { font-family: "Caveat", "Segoe Print", cursive; font-weight: 700; letter-spacing: 0; }
.fm-slot { will-change: transform, opacity; }
/* sombras de "esquinas levantadas" bajo el papel */
.fm-lift { position: absolute; inset: 0; pointer-events: none; }
.fm-lift::before, .fm-lift::after { content: ""; position: absolute; bottom: 0.7em; width: 46%; height: 22%; box-shadow: 0 1.1em 1em rgba(0,0,0,0.55); }
.fm-lift::before { left: 0.6em; transform: rotate(-3deg); }
.fm-lift::after { right: 0.6em; transform: rotate(4.5deg); box-shadow: 0 1.4em 1.1em rgba(0,0,0,0.6); }
.fm-shell { position: relative; border-radius: 2px 2px 3px 3px;
  box-shadow: 0 1px 1px rgba(0,0,0,0.25), 0 0.8em 1.6em -0.9em rgba(0,0,0,0.55); }
/* franja adhesiva arriba + esquina inferior derecha curvada */
.fm-paper { position: absolute; inset: 0; pointer-events: none; border-radius: inherit;
  background:
    linear-gradient(180deg, rgba(10,26,43,0.06) 0, rgba(10,26,43,0.0) 12%),
    radial-gradient(120% 90% at 100% 100%, rgba(10,26,43,0.15) 0, rgba(10,26,43,0) 30%),
    linear-gradient(170deg, rgba(255,255,255,0.35) 0, rgba(255,255,255,0) 40%); }
/* hover / foco: la nota se levanta un poco (sin tocar el transform del intro) */
.fm-note { display: block; width: 100%; text-align: left; cursor: zoom-in; border-radius: 3px;
  transition: transform .45s cubic-bezier(.2,.8,.2,1), filter .45s; }
.fm-note:hover, .fm-note:focus-visible { transform: translateY(-0.5em) rotate(-0.6deg) scale(1.012); filter: brightness(1.03); }
.fm-note:active { transform: translateY(-0.2em) scale(0.995); }
.fm-focus:focus-visible, .fm-note:focus-visible { outline: 2px solid ${ACCENT}; outline-offset: 6px; }
/* Dibujos (post-its con ilustración, solo escritorio): quedan clavados en el hueco de la
   izquierda. La línea de tiempo anima .fm-extra (caída + giro) y la sombra de .fm-art-img;
   encima, solo con transform: vaivén lento de reposo (.fm-sway) y meneo al pasar el cursor
   (.fm-art). La sombra es un drop-shadow que sigue el contorno del recorte. */
.fm-extra { position: absolute; will-change: transform, opacity; }
.fm-art { display: block; width: 100%; cursor: zoom-in; transform-origin: 50% 4%; border-radius: 2px; }
.fm-art:hover, .fm-art:focus-visible { animation: fm-wiggle .75s ease-in-out; }
.fm-sway { transform-origin: 50% 3%; will-change: transform; animation: fm-sway var(--fm-d, 7s) ease-in-out var(--fm-dl, 0s) infinite alternate; }
.fm-art-img { filter: drop-shadow(0 0.22em 0.4em rgba(0,0,0,0.5)); }
.fm-art-zoom { filter: drop-shadow(0 0.7em 1.4em rgba(0,0,0,0.55)); }
@keyframes fm-sway { from { transform: rotate(-1.7deg); } to { transform: rotate(2.1deg); } }
@keyframes fm-wiggle { 0%, 100% { transform: rotate(0); } 18% { transform: rotate(-6deg); } 40% { transform: rotate(5deg); } 62% { transform: rotate(-3deg); } 82% { transform: rotate(1.5deg); } }
@media (prefers-reduced-motion: reduce) {
  .fm-note { transition: none; }
  .fm-note:hover, .fm-note:focus-visible { transform: none; }
  .fm-sway { animation: none; }
  .fm-art:hover, .fm-art:focus-visible { animation: none; }
}
`;

function useMedia(query: string) {
  const [m, setM] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(query).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const on = () => setM(mq.matches);
    on();
    return listenMedia(mq, on);
  }, [query]);
  return m;
}

export const Formacion: React.FC = () => {
  const slides = useMemo(() => buildSlides(), []);
  const reduced = useMedia('(prefers-reduced-motion: reduce)');
  const wide = useMedia('(min-width: 1024px)');
  // escritorio con animación: la órbita desemboca aquí sin tramo vacío (ver margen del <section>)
  const handoff = wide && !reduced;

  // nota abierta en el zoom: una de las 4 notas ('note') o uno de los dibujos ('art')
  const [zoom, setZoom] = useState<{ kind: 'note' | 'art'; i: number } | null>(null);

  const sectionRef = useRef<HTMLElement>(null);
  // el vaivén de reposo de los dibujos se pausa cuando la sección no está en pantalla
  usePauseOffscreen(sectionRef);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const slotRefs = useRef<(HTMLDivElement | null)[]>([]);
  const noteRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const artRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const progRef = useRef(0); // progreso de la transición (lo lee el canvas)
  // ScrollTriggers de escritorio (los lee el scroll asistido para saber dónde parar)
  const trigRef = useRef<{ pin: ScrollTrigger | null; tl: ScrollTrigger | null }>({ pin: null, tl: null });
  // foto de fondo: tamaño natural si cargó, null si no existe
  const [photo, setPhoto] = useState<{ w: number; h: number } | null>(null);
  const [imgBox, setImgBox] = useState<React.CSSProperties | null>(null);
  // la foto solo se usa en escritorio (la vista móvil se trabaja aparte)
  const usePhoto = !!photo && wide;

  useEffect(() => {
    if (!BOARD_IMG) return;
    let alive = true;
    const im = new Image();
    im.onload = () => alive && setPhoto({ w: im.naturalWidth, h: im.naturalHeight });
    im.onerror = () => alive && setPhoto(null);
    im.src = BOARD_IMG;
    return () => {
      alive = false;
    };
  }, []);

  // encaje de la foto: cubre el escenario anclada arriba al centro, pero
  // desplazada para que SU bombilla (15 % de la imagen) quede a 10vh, donde
  // está la de la órbita. En pantallas estrechas solo cubre la parte de arriba
  // (se funde con el escritorio por abajo).
  useLayoutEffect(() => {
    const st = stageRef.current;
    if (!photo || !usePhoto || !st) return;
    const fit = () => {
      const cw = st.offsetWidth;
      const vh = window.innerHeight;
      if (window.innerWidth >= 1024) {
        // escritorio: encaje compartido con la órbita (bombilla EXACTA a 50 % / 10vh)
        setImgBox(fitBoardPhoto(photo, cw, st.offsetHeight, vh));
        return;
      }
      const boxH = window.innerWidth >= 1024 ? st.offsetHeight : Math.min(st.offsetHeight, vh * 1.3);
      const target = BULB_VH * vh;
      // alto limitado: d = 0.15·(boxH + d) − target  →  d = (0.15·boxH − target)/0.85
      const dH = Math.max(0, (PHOTO_BULB_Y * boxH - target) / (1 - PHOTO_BULB_Y));
      const sc = Math.max(cw / photo.w, (boxH + dH) / photo.h);
      const h = photo.h * sc;
      const w = photo.w * sc;
      const d = Math.max(0, PHOTO_BULB_Y * h - target);
      setImgBox({ position: 'absolute', left: (cw - w) / 2, top: -d, width: w, height: h, maxWidth: 'none' });
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [photo, usePhoto]);

  // ---------- Canvas: cielo → tablero con chinchetas ----------
  useEffect(() => {
    const cv = canvasRef.current;
    const st = stageRef.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !st || !ctx) return;
    const hasPhoto = usePhoto;
    let field: BoardField | null = null;
    let dpr = 1;
    let raf = 0;
    let visible = false;
    let lastP = -1;
    let lastT = 0;
    let lastW = 0;
    let lastH = 0;
    const releaseTexture = () => {
      const texture = field?.texture;
      if (texture) texture.width = texture.height = 1;
    };
    const resize = () => {
      const w = st.offsetWidth;
      const h = st.offsetHeight;
      if (w === lastW && h === lastH && field) return;
      lastW = w;
      lastH = h;
      // en pantallas estrechas el lienzo es alto: limitar la densidad
      dpr = Math.min(window.devicePixelRatio || 1, isLite() || h > 1600 ? 1.25 : 2);
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      releaseTexture();
      field = buildBoard(w, h, dpr, !hasPhoto);
      lastP = -1;
      if (!raf) frame(performance.now());
    };
    const frame = (t: number) => {
      raf = 0;
      if (!field) return;
      const progress = reduced ? 1 : progRef.current;
      // La foto trae sus chinchetas. Tras apagarse las luces, el lienzo queda fijo.
      const p = hasPhoto ? Math.min(progress, 0.4) : progress;
      // redibuja si cambió el progreso, o ~30 fps mientras las luces titilan
      if (p !== lastP || (!isLite() && isTwinkling(p) && t - lastT > 33)) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawBoard(ctx, field, p, t, { bulbY: BULB_VH * window.innerHeight, vh: window.innerHeight, photo: hasPhoto });
        lastP = p;
        lastT = t;
      }
      if (visible) raf = requestAnimationFrame(frame);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(st);
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible && !raf) raf = requestAnimationFrame(frame);
    });
    io.observe(st);
    resize();
    return () => {
      ro.disconnect();
      io.disconnect();
      cancelAnimationFrame(raf);
      releaseTexture();
      field = null;
      cv.width = cv.height = 1;
    };
  }, [reduced, usePhoto]);

  // ---------- Transición (scrub) ----------
  useLayoutEffect(() => {
    const st = stageRef.current;
    if (!st) return;
    const slots = slotRefs.current.filter(Boolean) as HTMLDivElement[];
    const pins = slots.map((s) => s.querySelector('.fm-pin'));

    if (reduced) {
      progRef.current = 1;
      // dibujos quietos, solo con su inclinación
      st.querySelectorAll<HTMLElement>('.fm-extra').forEach((e, i) => { e.style.transform = `rotate(${DRAWINGS[i]?.tilt ?? 0}deg)`; });
      return;
    }

    const ctx = gsap.context(() => {
      const wideNow = window.innerWidth >= 1024;
      // estados iniciales: lámpara apagada y bombilla invisible (aún brilla la
      // de la órbita en ese mismo punto)
      // Escritorio: la escena EMPIEZA con la lámpara ya encendida y la foto a plena luz
      // (es el último cuadro de la órbita, que se encendió en SystemsGrid); aquí solo
      // se clavan las notas. Pantallas estrechas: la secuencia de siempre.
      const lit = wideNow ? 1 : 0;
      gsap.set('.fm-lamp-body path, .fm-lamp-body line, .fm-lamp-body rect', { opacity: lit });
      gsap.set('.fm-lamp-cone', { opacity: lit });
      gsap.set('.fm-lamp-bulb', { opacity: lit, transformOrigin: '50% 50%' });
      gsap.set(['.fm-i-eyebrow'], { opacity: 0, y: 16 });
      gsap.set('.fm-i-title', { yPercent: 108 });
      const hasImg = !!st.querySelector('.fm-boardimg');
      if (hasImg) gsap.set('.fm-boardimg', { opacity: lit });
      const drop = (i: number) => ({ y: -170, scale: 1.08, rotation: i % 2 ? 7 : -7, opacity: 0 });
      slots.forEach((s, i) => gsap.set(s, drop(i)));
      gsap.set(pins, { scale: 0, opacity: 0 });
      // dibujos (solo escritorio): llegan tras las 4 notas
      const extras = wideNow ? Array.from(st.querySelectorAll<HTMLElement>('.fm-extra')) : [];
      const xPins = extras.map((e) => e.querySelector('.fm-xpin'));
      const xImgs = extras.map((e) => e.querySelector('.fm-art-img'));
      // Pose de caída SIN opacity: la opacidad la lleva SOLO el fundido de abajo. Si este fromTo
      // también la declarara (opacity: 0 en su "desde"), cada refresh de ScrollTrigger (p. ej. al
      // abrir el zoom: Lenis se detiene, la barra de scroll desaparece y el ancho cambia) volvería
      // a renderizar la línea de tiempo de golpe: el fundido acaba en 1 y justo después este
      // tween, al reiniciarse, reaplicaría opacity 0 sin que nada lo devuelva a 1 -> los dibujos
      // desaparecían de la pizarra (las notas no, porque su opacity va en un solo tween).
      const xDrop = (i: number) => ({ y: -90, rotation: DRAWINGS[i].tilt + (i % 2 ? 15 : -15), scale: 1.12, transformOrigin: '50% 6%' });
      const SHADOW_FAR = 'drop-shadow(0px 1.6em 1.1em rgba(0,0,0,0.22))';
      const SHADOW_NEAR = 'drop-shadow(0px 0.22em 0.4em rgba(0,0,0,0.5))';
      extras.forEach((e, i) => gsap.set(e, { ...xDrop(i), opacity: 0 }));
      gsap.set(xPins, { scale: 0, opacity: 0 });
      gsap.set(xImgs, { filter: SHADOW_FAR });

      // relevo de la bombilla: se enciende mientras la de la órbita se apaga
      // (la parte de arriba de esta sección pasa de 15vh a 0)
      // Mientras dura, la lámpara se desplaza para que la bombilla quede FIJA en
      // pantalla a 10vh, justo encima de la de la órbita (una sola luz).
      const holdBulb = () => {
        const top = st.getBoundingClientRect().top;
        gsap.set('.fm-lamp', { y: -Math.max(0, top) });
      };
      // (solo pantallas estrechas: en escritorio la bombilla ya llega encendida)
      if (!wideNow)
        ScrollTrigger.create({
          trigger: st,
          start: 'top 15%',
          end: 'top top',
          scrub: true,
          animation: gsap.fromTo('.fm-lamp-bulb', { opacity: 0 }, { opacity: 1, ease: 'none', paused: true }),
          onUpdate: holdBulb,
          onEnter: holdBulb,
          onLeave: () => gsap.set('.fm-lamp', { y: 0 }),
          onEnterBack: holdBulb,
        });

      // tiempos (fracciones de la línea de tiempo). Escritorio: empieza con la
      // parte de arriba de la sección al 60 % de la pantalla, así el relevo de
      // la bombilla ocurre en ~0.27–0.36 y la lámpara se arma justo después.
      // Escritorio: la línea de tiempo empieza en la lámpara ya encendida (0) y solo
      // contiene el clavado de las 4 notas (una tras otra, a un ritmo que se aprecie)
      // y el titular.
      // (escritorio: la primera nota arranca YA, en el instante en que la lámpara termina de
      // encenderse; nada de espera con el tablero iluminado y vacío)
      const T = wideNow
        ? { body: 0, cone: 0, img: 0, notes: 0, title: 0.83 }
        : { body: 0.62, cone: 0.72, img: 0.66, notes: 0, title: 0.76 };
      const NOTE_GAP = 0.15; // separación entre notas (fracción de la línea de tiempo)
      const XTIMES = [0.65, 0.745]; // llegada de cada dibujo (tras las 4 notas)

      const tl = gsap.timeline({ paused: true, defaults: { ease: 'none' } });
      if (!wideNow) {
        // la lámpara se arma alrededor de la bombilla y se enciende con parpadeo
        tl.to('.fm-lamp-body path, .fm-lamp-body line, .fm-lamp-body rect', { opacity: 1, duration: 0.08, stagger: 0.012 }, T.body);
        tl.to('.fm-lamp-cone', { keyframes: [{ opacity: 0.7, duration: 0.02 }, { opacity: 0.12, duration: 0.025 }, { opacity: 1, duration: 0.06 }] }, T.cone);
        tl.to('.fm-lamp-bulb', { keyframes: [{ scale: 1.25, duration: 0.02 }, { scale: 0.9, duration: 0.025 }, { scale: 1, duration: 0.05 }] }, T.cone);
        if (hasImg) tl.to('.fm-boardimg', { opacity: 1, duration: 0.14 }, T.img);
      }

      if (wideNow) {
        // las notas se clavan una a una
        slots.forEach((s, i) => {
          const t0 = T.notes + i * NOTE_GAP;
          tl.fromTo(
            s,
            drop(i),
            { y: 0, scale: 1, rotation: 0, opacity: 1, duration: 0.2, ease: 'back.out(1.3)', immediateRender: false },
            t0,
          );
          tl.fromTo(pins[i], { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.05, ease: 'back.out(3)', immediateRender: false }, t0 + 0.16);
        });
        // dibujos: "pin-pop" (caída desde un poco más arriba, giro con rebote, la sombra se
        // asienta y la chincheta salta al final). Reversible con el scroll como las notas.
        extras.forEach((e, i) => {
          const t0 = XTIMES[i] ?? XTIMES[XTIMES.length - 1];
          tl.fromTo(e, { opacity: 0 }, { opacity: 1, duration: 0.03, ease: 'none', immediateRender: false }, t0);
          tl.fromTo(
            e,
            xDrop(i),
            { y: 0, rotation: DRAWINGS[i].tilt, scale: 1, duration: 0.2, ease: 'back.out(2.4)', immediateRender: false },
            t0,
          );
          tl.fromTo(xImgs[i], { filter: SHADOW_FAR }, { filter: SHADOW_NEAR, duration: 0.2, ease: 'power2.out', immediateRender: false }, t0);
          tl.fromTo(xPins[i], { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.05, ease: 'back.out(3)', immediateRender: false }, t0 + 0.15);
        });
      }
      tl.fromTo('.fm-i-eyebrow', { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.06, ease: 'power2.out', immediateRender: false }, T.title);
      tl.fromTo('.fm-i-title', { yPercent: 108 }, { yPercent: 0, duration: 0.09, ease: 'expo.out', immediateRender: false }, T.title + 0.02);
      tl.to({}, { duration: 0.001 }, 0.999); // duración total = 1
      tl.eventCallback('onUpdate', () => {
        progRef.current = tl.progress();
      });

      if (wideNow) {
        // escritorio: fijar el escenario mientras se arma el tablero. Si es más
        // alto que la pantalla se fija alineado por abajo.
        const extra = () => Math.max(0, st.offsetHeight - window.innerHeight);
        const pinST = ScrollTrigger.create({
          trigger: st,
          start: () => `top+=${extra()} top`,
          end: () => `+=${window.innerHeight * 1.05}`,
          pin: true,
          pinSpacing: true,
          anticipatePin: 1,
          invalidateOnRefresh: true,
        });
        const tlST = ScrollTrigger.create({
          trigger: st,
          // arranca justo cuando el escenario queda fijado = último cuadro de la órbita
          // (el margen negativo de la sección lo pone ahí, ver `handoff` abajo)
          start: () => pinST.start,
          end: () => pinST.end,
          animation: tl,
          scrub: 0.25, // poco desfase: las notas responden al instante
          invalidateOnRefresh: true,
        });
        trigRef.current = { pin: pinST, tl: tlST };
      } else {
        // pantallas estrechas: sin fijar. La lámpara se arma tras el relevo y el
        // titular aparece mientras todavía se ve (el titular está pegado al borde
        // de arriba, así que la línea de tiempo va de 45 % a 0 % de la pantalla:
        // con el escenario ya arriba el titular se habría salido de vista).
        // Cada nota se clava al entrar.
        const tlST = ScrollTrigger.create({ trigger: st, start: 'top 45%', end: 'top top', animation: tl, scrub: 0.6, invalidateOnRefresh: true });
        trigRef.current = { pin: null, tl: tlST };
        slots.forEach((s, i) => {
          const one = gsap.timeline({ paused: true });
          one.fromTo(s, drop(i), { y: 0, scale: 1, rotation: 0, opacity: 1, duration: 1, ease: 'back.out(1.3)', immediateRender: false });
          one.fromTo(pins[i], { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.35, ease: 'back.out(3)', immediateRender: false }, 0.8);
          ScrollTrigger.create({ trigger: s, start: 'top 95%', end: 'top 62%', animation: one, scrub: 0.5 });
        });
      }
    }, sectionRef);
    return () => {
      trigRef.current = { pin: null, tl: null };
      ctx.revert();
    };
  }, [reduced, wide, usePhoto]);

  // ---------- Scroll asistido: puntos de reposo ----------
  // Un gesto (rueda, deslizamiento, tecla) viaja de reposo en reposo a un ritmo
  // fijo (src/lib/assistedScroll.ts). Los tiempos de escritorio y de móvil/tablet
  // son distintos. La posición se calcula en vivo en cada gesto.
  useEffect(() => {
    const st = stageRef.current;
    if (!st) return;
    const top = (el: Element | null | undefined) => (el ? el.getBoundingClientRect().top + window.scrollY : null);

    // sin animación (movimiento reducido): una sola parada al inicio de la sección
    if (reduced) {
      return registerStops('formacion', [{ id: 'formacion-static', y: () => top(st), desktop: 1.6, mobile: 1.2 }]);
    }

    if (wide) {
      // Escritorio (fijado). La lámpara se enciende al final de la órbita (parada
      // 'skills-lamp', con `chain`): ese cuadro ES el inicio de esta línea de tiempo.
      // Aquí queda una sola parada: las 4 notas clavándose solas una tras otra y el
      // titular (fin del fijado). Un solo gesto desde la órbita llega hasta aquí, y al
      // subir el tablero vacío queda en reposo en 'skills-lamp'. La línea de tiempo corre de `tl.start`
      // (= inicio del fijado) a `tl.end` (= fin del fijado).
      const at = (f: number) => {
        const t = trigRef.current.tl;
        return t ? t.start + (t.end - t.start) * f : null;
      };
      return registerStops('formacion', [
        // 1 = las 4 notas + los dibujos clavados y el titular completo (fin del fijado). Bajando
        // son 4.4 s (el ritmo con el que se aprecia el clavado); subiendo, el viaje termina
        // en la lámpara encendida con el tablero vacío. La curva casi lineal arranca con
        // velocidad: la primera nota sale en cuanto empieza el viaje (con la suave de siempre
        // tardaba ~0,7 s en moverse el primer 4 %).
        { id: 'formacion-board', y: () => at(1), desktop: 4.4, mobile: 3.0, upDesktop: 5.4, easing: BOARD_EASE },
      ]);
    }

    // Pantallas estrechas (sin fijar): primero la lámpara + titular (fin de la
    // línea de tiempo: el escenario llega arriba y la primera nota ya está
    // clavada y a la vista) y luego una parada por cada nota restante, centrada.
    const centered = (i: number) => {
      const li = slotRefs.current[i]?.parentElement;
      if (!li) return null;
      const r = li.getBoundingClientRect();
      return r.top + window.scrollY + r.height / 2 - window.innerHeight / 2;
    };
    return registerStops('formacion', [
      { id: 'formacion-m-lamp', y: () => trigRef.current.tl?.end ?? top(st), desktop: 2.4, mobile: 2.6 },
      ...[1, 2, 3].map((i) => ({ id: `formacion-m-nota${i + 1}`, y: () => centered(i), desktop: 1.8, mobile: 1.8 })),
    ]);
  }, [reduced, wide]);

  const open = (i: number) => {
    const s = slotRefs.current[i];
    // no abrir una nota que aún no está clavada
    if (s && Number(gsap.getProperty(s, 'opacity')) < 0.9) return;
    setZoom({ kind: 'note', i });
  };
  const openArt = (i: number) => {
    const el = artRefs.current[i]?.closest('.fm-extra');
    if (el && Number(gsap.getProperty(el, 'opacity')) < 0.9) return;
    setZoom({ kind: 'art', i });
  };

  return (
    <section
      id="formacion"
      ref={sectionRef}
      data-nav-theme="dark"
      className="relative pointer-events-auto"
      // overflow: clip recorta las notas en vuelo (sin crear contenedor de scroll)
      // Escritorio: margen negativo = la altura del escenario de la órbita. Así el primer
      // cuadro de esta sección cae EXACTO donde estaba el escenario fijado de la órbita
      // (sin tramo vacío de "salida" entre las dos) y el relevo es invisible.
      style={{ background: DESK, color: BONE, overflow: 'clip', marginTop: handoff ? 'calc(-1 * max(100svh, 600px))' : undefined, isolation: handoff ? 'isolate' : undefined }}
    >
      <style>{css}</style>
      <div ref={stageRef} className="relative lg:min-h-[100svh] overflow-hidden">
        {/* cielo → tablero con chinchetas (+ charco de luz de la lámpara) */}
        <canvas ref={canvasRef} aria-hidden className="absolute inset-0 w-full h-full pointer-events-none" />
        {BOARD_IMG && usePhoto && (
          <img
            decoding="async" src={BOARD_IMG}
            alt=""
            aria-hidden
            className="fm-boardimg pointer-events-none select-none"
            style={{
              // se monta ya en el mismo render en que se detecta la foto (así la
              // línea de tiempo la encuentra); el encaje exacto llega justo después
              ...(imgBox ?? { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: '50% 0' }),
              opacity: reduced || handoff ? 1 : 0,
              // borde superior liso (relevo con la órbita) y, en móvil, fundido por abajo
              WebkitMaskImage: wide ? "linear-gradient(#0000 0, #000 9vh)" : "linear-gradient(#0000 0, #000 9vh, #000 70%, #0000 100%)",
              maskImage: wide ? "linear-gradient(#0000 0, #000 9vh)" : "linear-gradient(#0000 0, #000 9vh, #000 70%, #0000 100%)",
            }}
          />
        )}
        <Lamp className="z-[5]" photo={usePhoto} bulbVh={BULB_VH} />

        <div className="relative z-10 max-w-[1400px] mx-auto px-5 sm:px-10 pt-36 pb-20 lg:pt-[clamp(120px,15vh,150px)] lg:pb-14 lg:min-h-[100svh] grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] gap-12 lg:gap-14 items-center">
          {/* ---- titular ---- */}
          <div className="relative z-20">
            <p className="fm-i-eyebrow font-mono text-xs tracking-[0.3em] mb-5" style={{ color: ACCENT }}>
              TRAYECTORIA ACADÉMICA
            </p>
            <h2 className="font-poster uppercase leading-[0.86] text-[19vw] sm:text-[12vw] lg:text-[min(6vw,7rem)]">
              <span className="block pb-[0.04em]" style={{ clipPath: "inset(-0.2em -1em 0 -0.3em)" }}>
                <span className="fm-i-title block">
                  FORMA<Key color={ACCENT}>ción</Key>
                </span>
              </span>
            </h2>
            <p className="fm-i-eyebrow mt-6 max-w-[22rem] text-[14px] leading-relaxed" style={{ color: 'rgba(236,232,242,0.62)' }}>
              Toca una nota para verla de cerca.
            </p>
            {/* dibujos a mano en el hueco libre: uno sobre el titular, otro bajo la frase */}
            {wide &&
              DRAWINGS.map((a, i) => (
                <div
                  key={a.id}
                  className="fm-extra z-0"
                  style={{
                    width: `${a.widthEm}em`,
                    fontSize: 'clamp(9.5px,min(1.32vh,0.84vw),13px)',
                    ...(i === 0 ? { left: '5%', bottom: 'calc(100% + 3.4vh)' } : { left: '27%', top: 'calc(100% + 3.2vh)' }),
                  }}
                >
                  <button
                    ref={(el) => (artRefs.current[i] = el)}
                    type="button"
                    className="fm-art"
                    aria-haspopup="dialog"
                    aria-label={`${a.label}: ver de cerca`}
                    onClick={() => openArt(i)}
                  >
                    <div className="fm-sway" style={{ ['--fm-d' as string]: `${a.sway.dur}s`, ['--fm-dl' as string]: `${a.sway.delay}s` }}>
                      <DrawingCard art={a} />
                    </div>
                  </button>
                </div>
              ))}
          </div>

          {/* ---- tablero: notas completas, ordenadas ---- */}
          <ul
            aria-label="Formación académica, distinción y certificaciones"
            className="grid grid-cols-1 sm:grid-cols-2 gap-x-[clamp(20px,2.4vw,40px)] gap-y-[clamp(28px,4vh,44px)] items-start max-w-[440px] sm:max-w-[860px] mx-auto w-full text-[13px] sm:text-[12px] lg:text-[clamp(9.5px,min(1.32vh,0.84vw),13px)]"
          >
            {slides.map((s, i) => (
              <li key={s.id}>
                <div ref={(el) => (slotRefs.current[i] = el)} className="fm-slot">
                  <div style={{ transform: `rotate(${TILT[i % TILT.length]}deg)` }}>
                    <button
                      ref={(el) => (noteRefs.current[i] = el)}
                      type="button"
                      className="fm-note"
                      aria-haspopup="dialog"
                      aria-label={`${s.label}: ver de cerca`}
                      onClick={() => open(i)}
                    >
                      <NoteCard slide={s} />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {zoom !== null && (zoom.kind === 'art' ? artRefs.current[zoom.i] : noteRefs.current[zoom.i]) && (
        <ZoomNote
          key={`${zoom.kind}${zoom.i}`}
          slide={zoom.kind === 'note' ? slides[zoom.i] : undefined}
          art={zoom.kind === 'art' ? DRAWINGS[zoom.i] : undefined}
          source={(zoom.kind === 'art' ? artRefs.current[zoom.i] : noteRefs.current[zoom.i])!}
          rotation={zoom.kind === 'art' ? DRAWINGS[zoom.i].tilt : TILT[zoom.i % TILT.length]}
          reduced={reduced}
          onClose={() => setZoom(null)}
        />
      )}
    </section>
  );
};

export default Formacion;
