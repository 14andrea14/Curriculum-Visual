import { refreshScroll } from '../../lib/refreshScroll';
import { isLite, listenMedia } from '../../lib/deviceProfile';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { MousePointerClick } from 'lucide-react';
import { Key } from './shared';
import { PORTFOLIO_DATA } from '../../data/portfolioData';
import { PlayingCard, CardBack, POKER_CSS } from './poker/PlayingCard';
import { CardDetail } from './poker/CardDetail';
import { ChipStack } from './poker/Chips';
import { FIBERS, GRAIN, POKER, POKER_ASSETS, RANKS, WEAR, WEAVE } from './poker/pokerTheme';
import { POKER_ENTRY_HOLD, POKER_PIN_QUERY } from './poker/pokerEntrance';
import { registerStops } from '../../lib/assistedScroll';
import { optionalImage } from './contact/useOptionalImage';
import { usePauseOffscreen } from './usePauseOffscreen';
import { registerImageWarmup } from './warmup';

gsap.registerPlugin(ScrollTrigger);

// PROYECTOS como una MANO DE PÓKER (ver docs/poker-section-design.md).
// ENTRADA: "Lo que hago" se oscurece en su sitio y la mesa se enciende en el
// mismo encuadre. Las cartas caen DANDO VUELTAS en 3D desde arriba hasta el
// lugar del crupier, mientras la lámpara parpadea y se enciende.
// FIJADA: riffle real · reparto de la escalera real ♦ · volteo de a una · la mano
// queda boca arriba invitando al clic · SALIDA: el As se levanta al centro, se da
// vuelta boca abajo sobre el paño oscuro y queda exactamente como el primer cuadro
// de la sección siguiente (BootTransition), que lo voltea en un cartucho.
// Modos: pin (escritorio) · stack (móvil/tablet) · static (reducir movimiento)
type Mode = 'pin' | 'stack' | 'static';
const Q_REDUCE = '(prefers-reduced-motion: reduce)';
const Q_WIDE = '(min-width: 1024px)';
const readMode = (): Mode => {
  if (typeof window === 'undefined') return 'pin';
  if (window.matchMedia(Q_REDUCE).matches) return 'static';
  return window.matchMedia(POKER_PIN_QUERY).matches ? 'pin' : 'stack';
};

const DECK = 8; // cartas del mazo (solo dorsos)
const DECK_SCALE = 0.45; // el mazo del crupier se ve más chico (está más lejos)
const REST_ROT = [-1.6, 0.9, -0.5, 1.2, -1.1];
const REST_Y = [4, -2, 2, -3, 3];
const FAN_ROT = [-9, -4.5, 0, 4.5, 9];
const FAN_Y = [30, 9, 0, 9, 30];
const ACE = 4; // la carta que se levanta al final (el As: el proyecto premiado)
// fondo del primer cuadro de BootTransition: paño con viñeta (mismo cálculo que su
// canvas: rgb(9,34,25) en el centro → ×0.45 en el borde) + su penumbra de arriba.
const EXIT_BG =
  'linear-gradient(180deg, rgba(0,0,0,.6), rgba(0,0,0,0) 40%), radial-gradient(ellipse 62.5% 62.5% at 50% 45%, rgb(9,34,25), rgb(4,15,11))';
// El relevo usa la misma foto a pantalla completa que la carta sola.
const FELT_PHOTO = optionalImage(isLite() ? '/experience/felt-lite.webp' : '/experience/felt.webp');
const EXIT_BG_FINAL = FELT_PHOTO
  ? `url(${FELT_PHOTO}) center / cover no-repeat`
  : EXIT_BG;

// ---------- layout dentro del paño ----------
// La foto de la mesa (1024×572) va con cover anclada arriba; su baranda de cuero
// termina en y≈108 px de la imagen: de ahí sale el borde superior "seguro" del paño.
// Banda superior: título + mazo; debajo la fila de cartas; abajo pista + fichas.
type Layout = { W: number; H: number; cw: number; gap: number; safeTop: number; deckH: number; rowTop: number; deckCX: number; deckCY: number; chip: number };
function computeLayout(W: number, H: number): Layout {
  const s = Math.max(W / 1024, H / 572);
  const safeTop = 108 * s + 0.03 * H;
  const chip = Math.min(Math.max(W * 0.056, 56), 104);
  const A = safeTop + 0.03 * H;
  let cw = (H * 0.9 - 36 - 1.05 * chip - A) / (1.4 * (1 + DECK_SCALE));
  cw = Math.max(96, Math.min(cw, W * 0.155, 300));
  const deckH = DECK_SCALE * 1.4 * cw;
  return {
    W,
    H,
    cw,
    gap: cw * 0.15,
    safeTop,
    deckH,
    rowTop: safeTop + deckH + 0.03 * H,
    // a la derecha, con lugar para que las mitades del riffle se abran sin salir del paño
    deckCX: W - 0.07 * W - 0.5 * cw,
    deckCY: safeTop + deckH / 2,
    chip,
  };
}

export const WorkTrack: React.FC = () => {
  const { projects } = PORTFOLIO_DATA;
  const hand = projects.slice(0, 5);
  const section = useRef<HTMLElement>(null);
  usePauseOffscreen(section);
  // imágenes de la mesa decodificadas detrás de la carga (no a mitad del scroll)
  useEffect(
    () => registerImageWarmup('poker-img', [POKER_ASSETS.felt, POKER_ASSETS.cardBack, POKER_ASSETS.chips, ...(FELT_PHOTO ? [FELT_PHOTO] : [])]),
    [],
  );
  const [mode, setMode] = useState<Mode>(readMode);
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia(Q_WIDE).matches);
  const [lay, setLay] = useState<Layout>(() =>
    computeLayout(typeof window !== 'undefined' ? window.innerWidth : 1440, typeof window !== 'undefined' ? window.innerHeight : 900),
  );
  const [open, setOpen] = useState<number | null>(null);
  // datos del pin (escritorio) para las paradas del scroll asistido: el ScrollTrigger, la
  // duracion total de la linea de tiempo y el instante (en unidades de la timeline) de cada reposo
  const pinInfo = useRef<{ st: ScrollTrigger; total: number; at: Record<string, number> } | null>(null);
  const [stopsKey, setStopsKey] = useState(0);
  const close = useCallback(() => setOpen(null), []);

  useEffect(() => {
    const mqs = [POKER_PIN_QUERY, Q_REDUCE, Q_WIDE].map((q) => window.matchMedia(q));
    const on = () => {
      setMode(readMode());
      setWide(window.matchMedia(Q_WIDE).matches);
    };
    const offMedia = mqs.map((m) => listenMedia(m, on));
    // el layout se recalcula antes del refresh de ScrollTrigger (que espera ~200 ms)
    const onResize = () => setLay(computeLayout(window.innerWidth, window.innerHeight));
    window.addEventListener('resize', onResize);
    return () => {
      offMedia.forEach((off) => off());
      window.removeEventListener('resize', onResize);
    };
  }, []);

  // caída de cada carta (fija: el scroll es reversible). x/y = desde dónde cae (en
  // fracción de pantalla, relativo al mazo); rx/ry/rz = vueltas en 3D
  const fall = useMemo(
    () =>
      Array.from({ length: DECK }, (_, i) => {
        const k = (i * 0.618) % 1;
        return {
          x: -0.78 + k * 0.72, // se reparten a lo ancho (el mazo está a la derecha)
          y: -(0.85 + ((i * 37) % 9) * 0.045),
          rx: (i % 2 ? 1 : -1) * (38 + ((i * 23) % 22)),
          ry: (i % 3 ? -1 : 1) * (30 + ((i * 41) % 24)),
          rz: (i % 2 ? -1 : 1) * (160 + ((i * 59) % 200)),
        };
      }),
    [],
  );

  // ---------------- animación ----------------
  // Se crea DESPUÉS de las fuentes + 900 ms: la portada fija ~440 % de pantalla al
  // montar y ScrollTrigger tiene que medir este pin sumando esa distancia.
  useEffect(() => {
    if (mode === 'static') return;
    const sec = section.current;
    if (!sec) return;
    let ctx: gsap.Context | undefined;
    let cancelled = false;
    let timer = 0;

    const lite = isLite();
    const flipCard = (timeline: gsap.core.Timeline, card: Element | null, faceUp: boolean, at: number, duration: number) => {
      if (lite) {
        const front = card?.querySelector('.pk-front');
        if (front) timeline.to(front, { autoAlpha: faceUp ? 1 : 0, duration, ease: 'power2.inOut' }, at);
      } else {
        timeline.to(card, { rotationY: faceUp ? 180 : 360, duration, ease: 'power2.inOut' }, at);
      }
    };

    const buildPin = () => {
      const q = gsap.utils.selector(sec);
      const deals = q('.pk-deal');
      const flips = q('.pk-flip');
      const sweeps = q('.pk-sweep');
      const slots = q('.pk-slot');
      const falls = q('.pk-fall');
      const riffles = q('.pk-riffle');
      const anchor = q('.pk-deck-anchor')[0] as HTMLElement;
      const deckMove = q('.pk-deck-move')[0];
      const c = (el: Element) => {
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      };
      const cw = () => anchor.offsetWidth;
      const vw = () => window.innerWidth;
      const vh = () => window.innerHeight;
      // tamaño de la carta del primer cuadro de BootTransition: 0.8·u × 1.12·u, escala 0.96
      const U = () => Math.min(vh() * 0.43, vw() * 0.78);

      gsap.set(deckMove, { scale: DECK_SCALE });
      if (!lite) gsap.set(flips, { rotationY: 0, transformPerspective: 1500 });
      gsap.set(sweeps, { rotation: 14, xPercent: 0 });
      // cada carta que cae tiene SU propia perspectiva (no comparten espacio 3D:
      // nunca se cortan entre sí; se apilan por orden)
      if (!lite) gsap.set(falls, { transformPerspective: 700 });
      const half = DECK / 2;
      const bottomHalf = riffles.slice(0, half);
      const topHalf = riffles.slice(half);
      gsap.set(topHalf, { transformOrigin: '100% 100%' });
      gsap.set(bottomHalf, { transformOrigin: '0% 100%' });

      // --- 1) ENTRADA. El escenario empieza encuadrado arriba mientras la sección
      // todavía está debajo. Al llegar al pin, ambas posiciones coinciden.
      const intro = gsap.timeline({ defaults: { ease: 'none' }, paused: true });
      const stage = q('.pk-stage')[0];
      const veil = q('.pk-veil')[0];
      const setStageY = gsap.quickSetter(stage, 'y', 'px');
      gsap.set(stage, { y: 0 });
      let pinStart: number | undefined;
      let stageY = 0;
      const syncIntro = () => {
        // Antes del pin, su inicio corresponde al borde superior de la sección.
        const top = pinStart === undefined ? sec.getBoundingClientRect().top : pinStart - window.scrollY;
        const travel = vh() * (1 + POKER_ENTRY_HOLD);
        const p = Math.min(1, Math.max(0, 1 - top / travel));
        if (p !== intro.progress()) intro.progress(p);
        const nextY = p > 0 && p < 1 ? -top : 0;
        if (nextY !== stageY) {
          setStageY(nextY);
          stageY = nextY;
        }
      };
      // Se actualiza con cualquier scroll de la página, sin medir layout por cuadro.
      ScrollTrigger.create({
        start: 0,
        end: 'max',
        onUpdate: syncIntro,
        onRefresh: () => {
          // recalcula los valores que dependen del tamaño de pantalla
          const p = intro.progress();
          intro.progress(0).invalidate().progress(p);
          syncIntro();
        },
      });
      intro.fromTo(stage, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.24, ease: 'power1.out' }, 0);
      intro
        .fromTo(veil, { '--r': '-30vmax' }, { '--r': '3vmax', duration: 0.035 }, 0.5)
        .to(veil, { '--r': '-30vmax', duration: 0.03 })
        .to(veil, { '--r': '9vmax', duration: 0.035 })
        .to(veil, { '--r': '-12vmax', duration: 0.03 })
        .to(veil, { '--r': '120vmax', duration: 0.37, ease: 'power2.in' });
      // las cartas caen girando en 3D, aleteando, y aterrizan apiladas en el mazo
      // desde arriba del encuadre. Al volver a subir, el scrub las oculta de nuevo.
      gsap.set(falls, { autoAlpha: 0 });
      falls.forEach((f, i) => {
        const d = fall[i];
        const t = 0.06 + i * 0.065;
        const dur = 0.5;
        intro.set(f, { autoAlpha: 1 }, t);
        intro.fromTo(
          f,
          { x: () => (d.x * vw()) / DECK_SCALE, y: () => (d.y * vh()) / DECK_SCALE },
          { x: 0, y: 0, duration: dur, ease: 'power2.out' },
          t,
        );
        intro.fromTo(f, { rotation: d.rz }, { rotation: 0, duration: dur, ease: 'power3.out' }, t);
        intro.fromTo(
          f,
          { rotationX: lite ? 0 : d.rx, rotationY: lite ? 0 : d.ry },
          {
            keyframes: [
              { rotationX: lite ? 0 : -d.rx * 0.55, rotationY: lite ? 0 : -d.ry * 0.5, duration: dur * 0.45, ease: 'sine.inOut' },
              { rotationX: lite ? 0 : d.rx * 0.18, rotationY: lite ? 0 : d.ry * 0.15, duration: dur * 0.3, ease: 'sine.inOut' },
              { rotationX: 0, rotationY: 0, duration: dur * 0.25, ease: 'power2.out' },
            ],
          },
          t,
        );
      });
      intro.fromTo(q('.pk-cone'), { opacity: 0 }, { opacity: 1, duration: 0.3, ease: 'power2.out' }, 0.6);
      intro.fromTo(q('.pk-felt'), { scale: 1.12 }, { scale: 1, duration: 1, ease: 'power1.out' }, 0);
      // barrido de luz del crupier sobre el paño cuando prende la lámpara
      intro.fromTo(q('.pk-lightsweep'), { xPercent: -120, opacity: 0 }, { xPercent: 260, opacity: 1, duration: 0.3, ease: 'power1.inOut' }, 0.7);
      intro.fromTo(q('.pk-chips'), { y: -18, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.12, stagger: 0.03, ease: 'power2.out' }, 0.84);
      // el título recién cuando la mesa ya está iluminada (nunca "fantasma" abajo)
      intro.fromTo(q('.pk-head'), { y: 24, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.12, ease: 'power3.out' }, 0.88);
      intro.fromTo(q('.pk-line'), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.12, ease: 'power2.out' }, 0.85);

      // --- 2) LA MANO (fijada)
      const tl = gsap.timeline({ defaults: { ease: 'none' } });

      // 2a) RIFFLE real: corte, curva en abanico, intercalado de a una, puente
      tl.to(topHalf, { x: () => -cw() * 0.5, y: -6, rotation: -4, duration: 0.26, ease: 'power2.out', stagger: 0.012 }, 0.1);
      tl.to(bottomHalf, { x: () => cw() * 0.5, y: -2, rotation: 4, duration: 0.26, ease: 'power2.out', stagger: 0.012 }, 0.1);
      tl.to(topHalf, { rotation: (i: number) => -6 - i * 1.8, y: (i: number) => -8 - i * 2, duration: 0.14, ease: 'sine.out' }, 0.38);
      tl.to(bottomHalf, { rotation: (i: number) => 6 + i * 1.8, y: (i: number) => -4 - i * 2, duration: 0.14, ease: 'sine.out' }, 0.38);
      const order: Element[] = [];
      for (let i = 0; i < half; i++) order.push(bottomHalf[i], topHalf[i]);
      order.forEach((card, k) => {
        const t = 0.58 + k * 0.045;
        tl.set(card.parentElement, { zIndex: 10 + k }, t);
        tl.to(card, { x: (k % 2 ? -1 : 1) * 3, y: -k * 0.6, rotation: (k % 2 ? -1 : 1) * 1.4, duration: 0.1, ease: 'power2.in' }, t);
      });
      tl.to(order, { y: -10, duration: 0.08, stagger: 0.018, yoyo: true, repeat: 1, ease: 'sine.inOut' }, 1.08);
      tl.to(riffles, { x: 0, y: 0, rotation: 0, duration: 0.1, ease: 'power2.out' }, 1.42);

      // 2b) REPARTO: de izquierda a derecha, cada carta a SU lugar
      const T_DEAL = 1.6;
      deals.forEach((d, i) => {
        const t = T_DEAL + i * 0.26;
        tl.set(d, { autoAlpha: 1 }, t);
        tl.fromTo(
          d,
          { x: () => c(anchor).x - c(slots[i]).x, y: () => c(anchor).y - c(slots[i]).y, scale: DECK_SCALE, rotation: -18 + i * 3 },
          { x: 0, y: REST_Y[i], scale: 1, rotation: REST_ROT[i], duration: 0.5, ease: 'power3.out', immediateRender: true },
          t,
        );
      });

      // 2c) VOLTEO de a una
      const T_F = T_DEAL + 4 * 0.26 + 0.75;
      flips.forEach((f, i) => {
        const t = T_F + i * 0.72;
        tl.set(slots[i], { zIndex: 5 }, t);
        tl.to(deals[i], { y: REST_Y[i] - 18, scale: 1.06, rotation: 0, duration: 0.24, ease: 'power2.out' }, t);
        flipCard(tl, f, true, t + 0.06, 0.5);
        tl.fromTo(sweeps[i], { xPercent: 0 }, { xPercent: 420, duration: 0.42, ease: 'power1.inOut' }, t + 0.36);
        tl.to(deals[i], { y: REST_Y[i], scale: 1, rotation: REST_ROT[i], duration: 0.3, ease: 'power2.inOut' }, t + 0.46);
        tl.set(slots[i], { zIndex: 1 }, t + 0.8);
      });
      const T_END = T_F + 5 * 0.72;
      tl.fromTo(q('.pk-hint'), { y: 14, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.3, ease: 'power2.out' }, T_END - 0.3);

      // 2d) SALIDA: la mano queda un rato para hacer clic; después se levanta el As
      // (con scroll asistido la mano ya descansa en su parada: la espera solo cubre el scroll libre)
      const T_X = T_END + 0.6;
      tl.to(q('.pk-hint, .pk-head, .pk-deck-anchor, .pk-chips, .pk-line'), { autoAlpha: 0, duration: 0.45 }, T_X);
      deals.forEach((d, i) => {
        if (i !== ACE) tl.to(d, { autoAlpha: 0, y: REST_Y[i] + 26, scale: 0.94, duration: 0.45, ease: 'power2.in' }, T_X + Math.abs(i - 2) * 0.04);
      });
      tl.fromTo(q('.pk-exitbg'), { opacity: 0 }, { opacity: 1, duration: 0.8, ease: 'power1.inOut' }, T_X + 0.1);
      tl.set(slots[ACE], { zIndex: 10 }, T_X);
      tl.to(
        deals[ACE],
        {
          x: () => c(sec).x - c(slots[ACE]).x,
          y: () => c(sec).y - c(slots[ACE]).y,
          scale: () => (0.8 * U() * 0.96) / cw(),
          rotation: -7,
          duration: 0.9,
          ease: 'power2.inOut',
        },
        T_X + 0.15,
      );
      // se da vuelta: queda boca abajo, como la primera carta de la sección siguiente
      flipCard(tl, flips[ACE], false, T_X + 0.75, 0.6);
      tl.to({}, { duration: 0.35 });

      const TOTAL = tl.duration();
      const pinST = ScrollTrigger.create({
        trigger: sec,
        start: 'top top',
        end: () => '+=' + vh() * (TOTAL / 2.65),
        pin: true,
        scrub: true,
        animation: tl,
        invalidateOnRefresh: true,
        onRefresh: (self) => {
          pinStart = self.start;
          syncIntro();
        },
        anticipatePin: 1,
        // invitación a hacer clic solo mientras la mano está boca arriba y quieta
        onUpdate: (self) => {
          const t = self.progress * TOTAL;
          sec.classList.toggle('pk-ready', t >= T_END && t < T_X);
        },
      });

      pinStart = pinST.start;
      syncIntro();

      // paradas del scroll asistido: instantes (en unidades de la timeline) donde la escena
      // queda quieta y legible. El avance de cada tramo se mide en pantallas (t / 2.65).
      pinInfo.current = {
        st: pinST,
        total: TOTAL,
        at: {
          riffle: 1.55, // mazo cortado e intercalado, otra vez apilado
          dealt: T_DEAL + 4 * 0.26 + 0.55, // las cinco cartas repartidas, boca abajo
          // cada carta recien volteada y asentada (justo antes de que la siguiente empiece a levantarse)
          card0: T_F + 0 * 0.72 + 0.72,
          card1: T_F + 1 * 0.72 + 0.72,
          card2: T_F + 2 * 0.72 + 0.72,
          card3: T_F + 3 * 0.72 + 0.72,
          card4: T_F + 4 * 0.72 + 0.8, // la mano completa, boca arriba, con la invitacion al clic
        },
      };
      setStopsKey((k) => k + 1);

      // 2e) RELEVO: al soltarse el pin la sección sube, pero su último cuadro (paño
      // oscuro + As boca abajo) queda QUIETO en pantalla (se corre lo mismo que el
      // scroll) tapando a la sección siguiente mientras sube por debajo; cuando ésta
      // llega arriba, su primer cuadro es idéntico y el nuestro se oculta: relevo invisible.
      const still = [q('.pk-exitbg')[0], slots[ACE]];
      gsap.fromTo(
        still,
        { y: 0 },
        {
          y: () => vh(),
          ease: 'none',
          scrollTrigger: {
            trigger: sec,
            start: () => pinST.end,
            end: () => pinST.end + vh(),
            scrub: true,
            invalidateOnRefresh: true,
            onLeave: () => gsap.set(still, { visibility: 'hidden' }),
            onEnterBack: () => gsap.set(still, { visibility: 'visible' }),
          },
        },
      );

      ScrollTrigger.sort();
      refreshScroll();
    };

    const buildStack = () => {
      const q = gsap.utils.selector(sec);
      gsap.fromTo(q('.pk-dark'), { opacity: 1 }, { opacity: 0, ease: 'none', scrollTrigger: { trigger: sec, start: 'top 85%', end: 'top 25%', scrub: true } });
      q('.pk-slot').forEach((slot) => {
        const flip = slot.querySelector('.pk-flip');
        const sweep = slot.querySelector('.pk-sweep');
        if (!lite) gsap.set(flip, { rotationY: 0, transformPerspective: 1300 });
        gsap.set(sweep, { rotation: 14 });
        const timeline = gsap.timeline({ scrollTrigger: { trigger: slot, start: 'top 78%', end: 'top 30%', scrub: true } });
        flipCard(timeline, flip, true, 0, 1);
        timeline.fromTo(sweep, { xPercent: 0 }, { xPercent: 420, duration: 0.6 }, 0.6);
      });
      refreshScroll();
    };

    const create = () => {
      if (cancelled) return;
      ctx = gsap.context(mode === 'pin' ? buildPin : buildStack, sec);
    };
    const fontsReady = document.fonts?.ready ?? Promise.resolve();
    const delay = new Promise<void>((res) => {
      timer = window.setTimeout(res, 900);
    });
    Promise.all([fontsReady, delay]).then(create, create);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      ctx?.revert();
      sec.classList.remove('pk-ready');
      pinInfo.current = null;
    };
  }, [mode, fall]);


  // ---------------- scroll asistido: paradas de la mesa ----------------
  // Un gesto (rueda, deslizar, tecla) viaja a la siguiente parada con la duracion fija de
  // abajo. Escritorio: el tramo se mide en pantallas de scroll (t / 2.65 del pin) y se
  // busca ~1.2-1.4 s por pantalla; las revelaciones de a una carta son mas pausadas.
  // En el layout apilado, el título encadena el recorrido por las cinco cartas.
  useEffect(() => {
    if (mode === 'static') return;
    const sec = section.current;
    if (!sec) return;
    if (mode === 'pin') {
      // posicion absoluta de un instante t de la timeline dentro del pin (null si aun no existe)
      const at = (k: string) => () => {
        const info = pinInfo.current;
        if (!info) return null;
        const t = k === 'end' ? info.total : info.at[k];
        return info.st.start + (t / info.total) * (info.st.end - info.st.start);
      };
      const start = () => pinInfo.current?.st.start ?? null;
      // (en tablet horizontal el perfil es movil pero el layout es el de escritorio: tiempos algo mas cortos)
      return registerStops('poker', [
        // la mesa encendida con el titulo: es la entrada de cartas cayendo en la oscuridad
        { id: 'poker-table', y: start, desktop: 3.6, mobile: 3.0, chain: true, skipUp: true },
        // la mano completa boca arriba (aqui se puede hacer clic en las cartas)
        // (desde la mesa vacia): mezcla, reparto y volteo de las 5 cartas corren solos y se detiene aqui
        { id: 'poker-hand', y: at('card4'), desktop: 8.0, mobile: 6.5, upDesktop: 6.8, upMobile: 5.5, easing: (t: number) => { const v = 1 / 0.92; return t < 0.08 ? (v * t * t) / 0.16 : t > 0.92 ? 1 - (v * (1 - t) * (1 - t)) / 0.16 : v * (t - 0.04); } /* velocidad casi constante: la mezcla y el reparto se aprecian parejos */ },
        // (el As se levanta y se da vuelta boca abajo DENTRO del viaje hacia la carta sola: la parada siguiente es exp-card)
      ]);
    }
    const lastCardRevealed = () => {
      const card = sec.querySelector<HTMLElement>('#poker-last-card');
      if (!card) return null;
      const { top, height } = card.getBoundingClientRect();
      // El volteo termina cuando la carta alcanza el 30 % de la ventana.
      const inset = Math.min(window.innerHeight * 0.3, Math.max(16, (window.innerHeight - height) / 2));
      return Math.ceil(top + window.scrollY - inset);
    };
    return registerStops('poker', [
      // titulo + pista, con la mesa ya encendida (entra desde la banda anterior)
      { id: 'poker-m-title', y: () => sec.getBoundingClientRect().top + window.scrollY, desktop: 3.2, mobile: 2.4, chain: true, skipUp: true },
      { id: 'poker-m-hand', y: lastCardRevealed, desktop: 6.5, mobile: 6.5, upMobile: 5.5 },
    ]);
  }, [mode, stopsKey]);

  const pin = mode === 'pin';
  const row = pin || (mode === 'static' && wide);
  const { cw, gap, safeTop, deckH, rowTop, deckCX, deckCY, chip, H, W } = lay;
  const px = (n: number) => `${Math.round(n * 10) / 10}px`;
  const chipBottom = H * 0.045;
  const FEATHER = 'linear-gradient(to bottom, transparent 0, #000 16vh)';
  const TABLE_BG = `linear-gradient(${POKER.night} 0, ${POKER.night} 16vh, transparent 16vh)`;

  return (
    // contenedor de bloque (ScrollTrigger no reserva el espacio del pin si el padre es
    // flex). z-31: el escenario cubre a FlagBand (z-30) durante el relevo.
    <div className="block w-full relative z-[31]">
      <style>{POKER_CSS}</style>
      <section
        id="experience"
        ref={section}
        data-nav-theme="dark"
        className={`relative text-white pointer-events-auto ${mode === 'static' ? 'pk-ready' : ''}`}
        style={
          {
            // arriba, el mismo azul noche con el que termina "Lo que hago" (sin costura);
            // la mesa encima trae su borde superior difuminado
            background: pin ? undefined : row ? TABLE_BG : `linear-gradient(${POKER.night} 0, ${POKER.felt} 16vh)`,
            overflowX: 'clip',
            overflowY: 'visible',
            height: row ? '100vh' : undefined,
            ['--cw' as string]: row ? px(cw) : 'min(84vw, 380px)',
          } as React.CSSProperties
        }
      >
        <div className={pin ? 'pk-stage relative h-full' : 'contents'} style={pin ? { background: TABLE_BG, opacity: 0 } : undefined}>

        {/* ---------- la mesa (borde superior difuminado) ---------- */}
        <div
          aria-hidden
          className={`pk-table absolute inset-x-0 top-0 overflow-hidden ${row ? 'bottom-0' : 'h-[100vh]'} pointer-events-none`}
          style={{
            WebkitMaskImage: row ? FEATHER : 'linear-gradient(to bottom, transparent 0, #000 16vh, #000 55%, transparent)',
            maskImage: row ? FEATHER : 'linear-gradient(to bottom, transparent 0, #000 16vh, #000 55%, transparent)',
          }}
        >
          {/* paño: foto + desgaste + tejido + pelo + grano (escalan juntos) */}
          <div className="pk-felt absolute inset-0" style={{ background: POKER.felt }}>
            <div className="absolute inset-0" style={{ backgroundImage: `url(${POKER_ASSETS.felt})`, backgroundSize: 'cover', backgroundPosition: '50% 0%' }} />
            <div className="absolute inset-0" style={{ background: WEAR }} />
            <div className="absolute inset-0" style={{ backgroundImage: WEAVE }} />
            <div className="absolute inset-0" style={{ backgroundImage: FIBERS, backgroundSize: '320px 320px', opacity: 0.16 }} />
            <div className="absolute inset-0" style={{ backgroundImage: GRAIN, opacity: 0.3 }} />
          </div>
          {/* caída de luz de la lámpara + bruma del cono */}
          <div
            className="pk-cone absolute inset-0"
            style={{
              background:
                'radial-gradient(ellipse 42% 55% at 50% 50%, rgba(255,232,196,.10), rgba(255,232,196,0) 70%), radial-gradient(ellipse 30% 50% at 50% 0%, rgba(255,236,206,.10), rgba(255,236,206,0) 70%)',
            }}
          />
          {/* barrido de luz (una sola pasada al encenderse la lámpara) */}
          {pin && (
            <div
              className="pk-lightsweep absolute top-0 bottom-0 left-0 w-[45%]"
              style={{ opacity: 0, background: 'linear-gradient(100deg, rgba(255,236,206,0) 20%, rgba(255,236,206,.07) 50%, rgba(255,236,206,0) 80%)' }}
            />
          )}
          {/* viñeta + borde inferior oscuro */}
          <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 80% 78% at 50% 48%, rgba(0,0,0,0) 52%, rgba(0,0,0,.62) 100%)' }} />
          {row && <div className="absolute inset-x-0 bottom-0 h-[9vh]" style={{ background: 'linear-gradient(rgba(2,7,6,0), rgba(2,7,6,.85))' }} />}
          {/* la mesa "apagada" al llegar */}
          <div className="pk-dark absolute inset-0" style={{ background: '#07060B', opacity: mode === 'stack' ? 1 : 0 }} />
        </div>

        {!pin && (
          /* En móvil: degradé superior para fundir con la sección FlagBand */
          <div
            aria-hidden
            className="absolute inset-x-0 top-0 h-44 z-[2] pointer-events-none"
            style={{ background: 'linear-gradient(to bottom, #07060B 0%, rgba(7,6,11,0.85) 45%, rgba(7,6,11,0) 100%)' }}
          />
        )}
        {/* velo de oscuridad de la entrada: cubre toda la pantalla y se abre como un
            círculo de luz desde el centro de la mesa */}
        {pin && (
          <div
            aria-hidden
            className="pk-veil absolute inset-x-0 top-0 h-[100vh] z-[2] pointer-events-none"
            style={
              {
                ['--r' as string]: '-30vmax',
                background: 'radial-gradient(circle at 50% 54%, rgba(7,6,11,0) 0, rgba(7,6,11,0) var(--r), #07060B calc(var(--r) + 30vmax))',
              } as React.CSSProperties
            }
          />
        )}
        {/* La foto del relevo cubre el borde y el velo de entrada antes de soltar el pin. */}
        {pin && (
          <div
            aria-hidden
            className="pk-exitbg absolute inset-0 z-[2] pointer-events-none"
            style={{ opacity: 0, background: EXIT_BG_FINAL }}
          />
        )}

        {/* fichas: pocas y buenas, apoyadas en el paño cerca del borde de abajo */}
        {row && (
          <div aria-hidden className="absolute inset-0 z-[2] pointer-events-none">
            <div className="pk-chips absolute inset-0">
              {/* las de atrás (más arriba en pantalla) se pintan primero */}
              <ChipStack count={5} size={chip} spin={-24} seed={2} style={{ left: px(W * 0.065 + chip * 1.02), bottom: px(chipBottom + chip * 0.2) }} />
              <ChipStack count={8} size={chip} spin={9} seed={1} style={{ left: px(W * 0.065), bottom: px(chipBottom) }} />
            </div>
            <div className="pk-chips absolute inset-0">
              <ChipStack count={3} size={chip} spin={31} seed={5} style={{ right: px(W * 0.065 + chip * 1.02), bottom: px(chipBottom + chip * 0.14) }} />
              <ChipStack count={6} size={chip} spin={-12} seed={3} style={{ right: px(W * 0.065), bottom: px(chipBottom) }} />
            </div>
          </div>
        )}

        <div className={`relative z-[3] ${row ? 'h-full' : 'px-5 sm:px-10 pt-36 pb-56'}`}>
          {/* ---------- título (sin subtítulo) ---------- */}
          <div
            className={`pk-head ${row ? 'absolute flex items-center' : 'mb-8 sm:mb-12'}`}
            style={row ? { left: '6vw', top: px(safeTop), height: px(deckH), maxWidth: px(deckCX - 0.75 * cw - W * 0.06 - 24) } : undefined}
          >
            <h2
              className="font-poster uppercase leading-[0.9] whitespace-nowrap"
              style={{ fontSize: row ? px(Math.min(W * 0.044, deckH * 0.62, 96)) : 'clamp(3rem, 15vw, 6rem)', whiteSpace: row ? 'nowrap' : 'normal' }}
            >
              Cinco cartas, <Key color={POKER.magenta}>cero faroles</Key>
            </h2>
          </div>

          {/* En móvil: la pista se muestra antes de las cartas para invitar al toque */}
          {!row && mode === 'stack' && (
            <div className="mb-10 flex justify-center pointer-events-none">
              <p
                className="pk-pulse inline-flex items-center gap-2.5 rounded-full px-5 py-2.5 text-base sm:text-lg font-medium text-center"
                style={{ color: POKER.paper, background: 'rgba(3,10,8,.78)', boxShadow: `0 0 0 1.5px rgba(242,48,210,.7), 0 0 24px rgba(242,48,210,.3)`, fontFamily: '"Mona Sans", sans-serif' }}
              >
                <span className="pk-tap" style={{ color: POKER.magenta }}>
                  <MousePointerClick className="w-5 h-5" strokeWidth={1.75} />
                </span>
                <span>
                  Toca <Key color={POKER.magenta}>una carta</Key> para ver la jugada completa
                </span>
              </p>
            </div>
          )}

          {/* ---------- mazo del crupier, sobre el paño ---------- */}
          {pin && (
            <div
              className="pk-deck-anchor absolute pointer-events-none"
              style={{ width: px(cw), height: px(cw * 1.4), left: px(deckCX - cw / 2), top: px(deckCY - cw * 0.7) }}
              aria-hidden
            >
              {/* sin preserve-3d: cada carta se dibuja en su propio plano */}
              <div className="pk-deck-move absolute inset-0">
                {Array.from({ length: DECK }, (_, i) => (
                  <div key={i} className="pk-fall absolute w-full h-full" style={{ left: i * 0.5, top: -i * 1.1, zIndex: i }}>
                    <div className="pk-riffle absolute inset-0">
                      <CardBack />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ---------- la mano ---------- */}
          <div className={row ? 'absolute left-0 right-0' : ''} style={row ? { top: px(rowTop) } : undefined}>
            {/* línea de apuestas impresa en el paño, alrededor de las cartas comunitarias */}
            {row && (
              <div
                aria-hidden
                className="pk-line absolute left-1/2 -translate-x-1/2 pointer-events-none"
                style={{
                  top: px(-cw * 0.14),
                  width: px(5 * cw + 4 * gap + cw * 0.3),
                  height: px(cw * 1.4 + cw * 0.28),
                  border: '1px solid rgba(236,232,242,.10)',
                  borderRadius: px(cw * 0.2),
                  boxShadow: 'inset 0 0 0 5px rgba(0,0,0,0), inset 0 0 0 6px rgba(236,232,242,.045)',
                }}
              />
            )}
            <div className={row ? 'relative flex justify-center' : 'flex flex-col items-center gap-14'} style={row ? { gap: px(gap) } : undefined}>
              {hand.map((p, i) => (
                <PlayingCard
                  key={p.id}
                  id={i === hand.length - 1 ? 'poker-last-card' : undefined}
                  p={p}
                  rank={RANKS[i]}
                  index={i}
                  faceUp={mode === 'static'}
                  hidden={pin}
                  tilt={mode !== 'static'}
                  slotStyle={mode === 'static' && row ? { transform: `translateY(${FAN_Y[i]}px) rotate(${FAN_ROT[i]}deg)`, margin: `0 ${px(-gap * 0.4)}` } : undefined}
                  onOpen={() => setOpen(i)}
                />
              ))}
            </div>
          </div>

          {/* ---------- pista: las cartas se pueden abrir (solo escritorio, en móvil va arriba) ---------- */}
          {row && (
            <div
              className="pk-hint absolute left-0 right-0 flex justify-center pointer-events-none"
              style={{ top: px(rowTop + cw * 1.4 + cw * 0.14 + H * 0.022), ...(pin ? { opacity: 0, visibility: 'hidden' } : {}) }}
            >
              <p
                className="pk-pulse inline-flex items-center gap-3 rounded-full px-6 py-3 text-lg sm:text-xl font-medium"
                style={{ color: POKER.paper, background: 'rgba(3,10,8,.62)', boxShadow: `0 0 0 1.5px rgba(242,48,210,.7), 0 0 30px rgba(242,48,210,.28)`, fontFamily: '"Mona Sans", sans-serif' }}
              >
                <span className="pk-tap" style={{ color: POKER.magenta }}>
                  <MousePointerClick className="w-6 h-6" strokeWidth={1.75} />
                </span>
                <span>
                  Haz clic en <Key color={POKER.magenta}>una carta</Key> para ver la jugada completa
                </span>
              </p>
            </div>
          )}
        </div>

        {/* En móvil: degradé inferior para fundir suavemente con la sección siguiente (BootTransition) */}
        {!pin && (
          <div
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-40 z-[2] pointer-events-none"
            style={{ background: 'linear-gradient(to bottom, rgba(7,6,11,0) 0%, rgba(7,6,11,0.85) 55%, #07060B 100%)' }}
          />
        )}
        </div>
      </section>
      {open !== null && <CardDetail p={hand[open]} rank={RANKS[open]} onClose={close} />}
    </div>
  );
};
