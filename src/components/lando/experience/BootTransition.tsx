import React, { useEffect, useMemo, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { FONT, GAME, seeded } from './utils';
import { CardBackFace, Cartridge, HandheldConsole, SCREEN } from './Console';
import { PixelSpark, PixelStar, PuffCloud, SparkleField } from './PixelArt';
import { createPixelDissolve } from './pixelDissolve';
import { cardGate } from './cardGate';
import { optionalImage } from '../contact/useOptionalImage';
import { assistedGo } from '../../../lib/assistedScroll';

gsap.registerPlugin(ScrollTrigger);

// ============================================================================
// TRANSICIÓN póker -> mundo gamer ("INSERT CARTRIDGE"). Escenario fijado con
// ScrollTrigger (pin + scrub, 100 % reversible al subir):
//  1. Llega una carta más boca abajo sobre el paño verde (mismo dorso que la
//     mesa de póker) y se VOLTEA: del otro lado es un CARTUCHO rosa. Al voltear
//     salta una ráfaga de destellos de píxel.
//  2. El paño se "disuelve" en bloques de píxel (canvas, iris + azar) dejando
//     ver un fondo magenta cuadriculado: salimos de la estética del póker.
//  3. Sube una consola portátil (diseño propio) y el cartucho entra en la
//     ranura con un "clac" (rebote). Se enciende el LED.
//  4. La pantalla prende como un CRT (línea -> abre) con destello blanco, y
//     aparece el título en píxeles + "PRESS START"; el botón A se pulsa.
//  5. Zoom hacia la pantalla hasta que la llena y un segundo barrido de
//     píxeles pinta todo del color del cielo del mundo: al soltar el pin la
//     sección del mundo empieza EXACTAMENTE con ese color (sin costura).
// Solo transform / opacity / clip + 2 canvas de bloques (sin blur).
// ============================================================================

const BURST = 10; // destellos que saltan al voltear
// nubes que vuelan hacia afuera al final (dirección x, y en vw/vh)
const FLY = [
  { x: -62, y: -30, tint: '#FFD9F3' },
  { x: 58, y: -36, tint: '#E6D9FF' },
  { x: -54, y: 38, tint: '#E6D9FF' },
  { x: 64, y: 34, tint: '#FFD9F3' },
  { x: 6, y: 52, tint: '#D6E9FF' },
];

const PIX_HINT: React.CSSProperties = {
  fontFamily: FONT.pixel,
  fontSize: 'clamp(12px, 1.3vw, 18px)',
  letterSpacing: '.08em',
  textTransform: 'uppercase',
  color: '#FFE9FB',
  textShadow: '0 0 10px rgba(242,48,210,.9), 0 2px 0 rgba(0,0,0,.5)',
};

export const BootTransition: React.FC<{ total: number; firstYear: number }> = ({ total, firstYear }) => {
  const stageRef = useRef<HTMLDivElement>(null);
  const feltRef = useRef<HTMLCanvasElement>(null);
  const endRef = useRef<HTMLCanvasElement>(null);

  // tocar la carta abre la compuerta y el scroll asistido sigue solo (voltea, enciende la consola, zoom)
  const openCard = () => {
    cardGate.open = true;
    assistedGo(1);
  };
  // si se intenta bajar sin tocarla, la carta se sacude y la pista late
  useEffect(() => {
    const on = () => {
      const el = stageRef.current?.querySelector<HTMLElement>('.gx-hover');
      if (!el || gsap.isTweening(el)) return;
      gsap.fromTo(el, { rotationZ: 0 }, { rotationZ: 3, duration: 0.07, yoyo: true, repeat: 5, ease: 'sine.inOut', onComplete: () => gsap.set(el, { rotationZ: 0 }) });
    };
    window.addEventListener('assisted-blocked', on);
    return () => window.removeEventListener('assisted-blocked', on);
  }, []);

  const burst = useMemo(() => {
    const r = seeded(77);
    return Array.from({ length: BURST }, (_, i) => {
      const a = (i / BURST) * Math.PI * 2 + r() * 0.5;
      return { a, d: 0.55 + r() * 0.4, s: 0.05 + r() * 0.05, star: i % 3 === 0, c: [GAME.star, '#FFFFFF', GAME.pink][i % 3] };
    });
  }, []);

  const orbit = useMemo(() => {
    const r = seeded(19);
    return Array.from({ length: 10 }, (_, i) => ({
      a: (i / 10) * Math.PI * 2 + r() * 0.3,
      r: 0.66 + r() * 0.14,
      s: 9 + r() * 11,
      d: r() * 2,
      star: i % 4 === 0,
      c: ['#FFFFFF', GAME.pink, GAME.star][i % 3],
    }));
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    const feltC = feltRef.current;
    const endC = endRef.current;
    if (!stage || !feltC || !endC) return;

    // paño (se borra por bloques) y cielo (se pinta por bloques)
    const felt = createPixelDissolve(feltC, {
      mode: 'clear',
      image: optionalImage('/experience/felt.webp'),
      seed: 5,
      iris: 0.55,
      color: (nx, ny) => {
        // paño con viñeta: más oscuro hacia los bordes, como la mesa
        const d = Math.min(1, Math.hypot(nx - 0.5, ny - 0.45) * 1.6);
        const k = 1 - d * 0.55;
        return `rgb(${Math.round(9 * k)}, ${Math.round(34 * k)}, ${Math.round(25 * k)})`;
      },
    });
    const sky = createPixelDissolve(endC, { mode: 'fill', seed: 9, iris: 0.7, color: () => GAME.worldTop });
    const prog = { felt: 0, sky: 0 };
    felt.draw(0);
    sky.draw(0);

    let ctx: gsap.Context | undefined;
    let cancelled = false;
    let timer = 0;
    let cardPin: ScrollTrigger | undefined;
    const syncCardArrival = () => {
      if (!cardPin) return;
      // Espera al relevo del póker usando la misma posición redondeada que la parada asistida.
      const y = window.scrollY;
      stage.classList.toggle('gx-card-arrived', y >= Math.round(cardPin.start) && y < cardPin.end);
    };

    const build = () => {
      if (cancelled) return;
      ctx = gsap.context(() => {
        const q = gsap.utils.selector(stage);
        const consoleWrap = q('.gx-console-wrap')[0] as HTMLElement;
        const U = () => consoleWrap.offsetWidth;
        const vw = () => stage.clientWidth;
        const vh = () => stage.clientHeight;
        // escala para que la PANTALLA llene el viewport
        const S = () => Math.max(vw() / (SCREEN.w * U()), vh() / (SCREEN.h * U())) * 1.06;
        // centro de la pantalla respecto del centro de la consola (en u)
        const SCREEN_CY = SCREEN.y + SCREEN.h / 2 - 0.8;

        gsap.set(q('.gx-flipper'), { transformPerspective: 1600, rotationY: 0 });

        const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
        const tl = gsap.timeline({
          defaults: { ease: 'none' },
          scrollTrigger: {
            trigger: stage,
            start: 'top top',
            end: () => '+=' + (isMobile ? vh() * 1.2 : vh() * 3.1),
            pin: true,
            scrub: true,
            anticipatePin: 1,
            invalidateOnRefresh: true,
            onUpdate: (self) => {
              // la carta se vuelve a bloquear al volver a su posición inicial (subiendo)
              if (self.progress < 0.01) cardGate.open = false;
              // la pista de clic se apaga en cuanto la escena avanza
              const hint = stage.querySelector<HTMLElement>('.gx-clickhint');
              if (hint) hint.style.opacity = String(Math.max(0, 1 - self.progress * 40));
            },
            onLeaveBack: () => {
              cardGate.open = false;
            },
            onRefresh: () => {
              felt.resize();
              sky.resize();
              felt.draw(prog.felt);
              sky.draw(prog.sky);
              syncCardArrival();
            },
          },
        });

        cardPin = tl.scrollTrigger;

        // En móvil el grupo aparece al final del empalme desde la última carta del póker.
        if (isMobile) {
          gsap.set(q('.gx-zoom'), { autoAlpha: 0 });
          gsap
            .timeline({
              defaults: { ease: 'none' },
              scrollTrigger: { trigger: stage, start: 'top 15%', end: 'top top', scrub: true, invalidateOnRefresh: true },
            })
            .fromTo(q('.gx-zoom'), { autoAlpha: 0, scale: 0.9 }, { autoAlpha: 1, scale: 1, ease: 'power2.out' }, 0);
        }

        // 0b) ya fijada: la carta levita y se inclina con profundidad; asoma la cuadrícula
        tl.fromTo(q('.gx-hover'), { y: 0, rotationX: 0 }, { y: () => -U() * 0.06, rotationX: 12, duration: 0.6, ease: 'power2.out' }, 0)
          .to(q('.gx-hover'), { y: 0, rotationX: 0, duration: 0.7, ease: 'power2.inOut' }, 1.0)
          .fromTo(q('.gx-shadow'), { scale: 1, opacity: 1 }, { scale: 0.78, opacity: 0.55, duration: 0.6, ease: 'power2.out' }, 0)
          .to(q('.gx-shadow'), { opacity: 0, duration: 0.6 }, 1.3)
          .fromTo(q('.gx-grid'), { opacity: 0 }, { opacity: 1, duration: 0.5 }, 0.1)
          .to(q('.gx-grid'), { opacity: 0, duration: 0.6 }, 1.6)
          .to(q('.gx-rim'), { opacity: 0, duration: 0.3 }, 0.6)
          // los destellos en órbita se abren y se van al voltear (los reemplaza la ráfaga)
          .to(q('.gx-orbit-wrap'), { scale: 1.9, autoAlpha: 0, duration: 0.6, ease: 'power2.in' }, 0.55);

        // 1) volteo carta -> cartucho
        tl.fromTo(q('.gx-flip'), { rotation: -7, scale: 0.96 }, { rotation: 0, scale: 1.04, duration: 0.8, ease: 'power2.out' }, 0)
          .fromTo(q('.gx-flipper'), { rotationY: 0 }, { rotationY: 180, duration: 1.3, ease: 'power2.inOut' }, 0.15)
          .to(q('.gx-flip'), { scale: 1, duration: 0.6, ease: 'power2.inOut' }, 0.95);
        // ráfaga de destellos al pasar de canto
        q('.gx-burst').forEach((el, i) => {
          const b = burst[i];
          tl.fromTo(
            el,
            { x: 0, y: 0, scale: 0, autoAlpha: 0 },
            {
              keyframes: [
                { scale: 1.2, autoAlpha: 1, x: () => Math.cos(b.a) * b.d * U() * 0.55, y: () => Math.sin(b.a) * b.d * U() * 0.55, duration: 0.45, ease: 'power3.out' },
                { scale: 0, autoAlpha: 0, x: () => Math.cos(b.a) * b.d * U() * 0.9, y: () => Math.sin(b.a) * b.d * U() * 0.9, duration: 0.45, ease: 'power2.in' },
              ],
            },
            0.6 + i * 0.015
          );
        });

        // 2) el paño se disuelve en píxeles
        tl.to(prog, { felt: 1, duration: 1.9, onUpdate: () => felt.draw(prog.felt) }, 0.5);
        tl.fromTo(q('.gx-mag'), { scale: 1.15 }, { scale: 1, duration: 2.2, ease: 'power2.out' }, 0.5);
        tl.fromTo(q('.gx-hud'), { autoAlpha: 0, y: -12 }, { autoAlpha: 1, y: 0, duration: 0.4 }, 1.4);

        // 3) consola sube, el cartucho se acomoda arriba y entra con "clac"
        tl.fromTo(
          q('.gx-console-wrap'),
          { y: () => vh() * 0.5 + U() * 1.7 },
          { y: () => U() * 0.62, duration: 1.4, ease: 'power3.out', immediateRender: true },
          1.6
        );
        tl.fromTo(q('.gx-flip'), { y: 0 }, { y: () => -U() * 0.67, duration: 1.4, ease: 'power3.inOut' }, 1.6);
        tl.to(q('.gx-console-wrap'), { y: 0, duration: 0.9, ease: 'power2.in' }, 3.2);
        tl.to(q('.gx-flip'), { y: () => -U() * 0.53, duration: 0.9, ease: 'power2.in' }, 3.2);
        // rebote del "clac"
        tl.to(q('.gx-console-body'), { scaleY: 0.965, scaleX: 1.02, duration: 0.12, ease: 'power2.out' }, 4.1)
          .to(q('.gx-console-body'), { scaleY: 1, scaleX: 1, duration: 0.45, ease: 'elastic.out(1.1, 0.4)' }, 4.22);
        tl.fromTo(q('.gx-led'), { opacity: 0 }, { opacity: 1, duration: 0.15 }, 4.3);

        // 4) encendido CRT de la pantalla
        tl.fromTo(q('.gx-scr-on'), { scaleX: 0, scaleY: 0.01 }, { scaleX: 1, scaleY: 0.01, duration: 0.35, ease: 'power2.out' }, 4.55)
          .to(q('.gx-scr-on'), { scaleY: 1, duration: 0.4, ease: 'expo.out' }, 4.9)
          .fromTo(q('.gx-flash'), { opacity: 0 }, { opacity: 0.95, duration: 0.08 }, 4.9)
          .to(q('.gx-flash'), { opacity: 0, duration: 0.5, ease: 'power2.out' }, 5.0)
          .fromTo(q('.gx-scr-title > span'), { yPercent: 120, autoAlpha: 0 }, { yPercent: 0, autoAlpha: 1, duration: 0.25, stagger: 0.05, ease: 'steps(3)' }, 5.25)
          .fromTo(q('.gx-scr-star'), { scale: 0 }, { scale: 1, duration: 0.4, stagger: 0.1, ease: 'back.out(3)' }, 5.3)
          .fromTo(q('.gx-scr-sub, .gx-scr-press'), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.2, stagger: 0.25, ease: 'steps(2)' }, 5.9);
        // el botón A se pulsa ("press start")
        tl.to(q('.gx-btn-a'), { y: () => U() * 0.012, scale: 0.94, duration: 0.12 }, 6.6).to(q('.gx-btn-a'), { y: 0, scale: 1, duration: 0.2 }, 6.75);

        // 5) zoom a la pantalla + barrido de píxeles al color del mundo
        tl.fromTo(
          q('.gx-zoom'),
          { scale: 1, y: 0 },
          { scale: () => S(), y: () => -SCREEN_CY * U() * S(), duration: 2.0, ease: 'power3.in' },
          6.9
        );
        tl.to(q('.gx-hud'), { autoAlpha: 0, duration: 0.3 }, 7.0);
        tl.to(prog, { sky: 1, duration: 1.2, onUpdate: () => sky.draw(prog.sky) }, 8.3);
        // las nubes cruzan la cámara (de chicas en el centro a enormes afuera)
        q('.gx-fly').forEach((el, i) => {
          const f = FLY[i];
          tl.fromTo(
            el,
            { x: 0, y: 0, scale: 0.15, autoAlpha: 0 },
            {
              keyframes: [
                { autoAlpha: 1, scale: 0.9, x: () => (f.x * vw()) / 300, y: () => (f.y * vh()) / 300, duration: 0.5, ease: 'power1.in' },
                { autoAlpha: 0, scale: 3.2, x: () => (f.x * vw()) / 100, y: () => (f.y * vh()) / 100, duration: 0.7, ease: 'power2.in' },
              ],
            },
            8.0 + i * 0.12
          );
        });
        tl.to({}, { duration: 0.3 }); // respiro antes de soltar
      }, stage);
      ScrollTrigger.sort();
      ScrollTrigger.refresh();
    };

    // Igual que la mesa de póker: se arma después de las fuentes + un momento,
    // cuando los pins anteriores (portada, póker) ya agregaron su espacio.
    const fontsReady = document.fonts?.ready ?? Promise.resolve();
    const delay = new Promise<void>((res) => {
      timer = window.setTimeout(res, 1100);
    });
    Promise.all([fontsReady, delay]).then(build, build);

    const onResize = () => {
      felt.resize();
      sky.resize();
      felt.draw(prog.felt);
      sky.draw(prog.sky);
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', syncCardArrival, { passive: true });

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', syncCardArrival);
      ctx?.revert();
      stage.classList.remove('gx-card-arrived');
      felt.destroy();
      sky.destroy();
    };
  }, [burst]);

  const PIX: React.CSSProperties = { fontFamily: FONT.pixel };

  return (
    <div
      ref={stageRef}
      id="boot-transition-stage"
      className="relative h-screen w-full overflow-hidden select-none"
      style={{ ['--u' as string]: 'min(43vh, 78vw)', background: GAME.felt } as React.CSSProperties}
    >
      {/* fondo magenta del "mundo juego" (debajo del paño) */}
      <div
        className="gx-mag absolute inset-0"
        style={{ background: `radial-gradient(120% 90% at 50% 45%, #FF7AD9 0%, ${GAME.magenta} 38%, #A3168F 78%, #5E0A55 100%)` }}
      >
        <div className="absolute inset-0 gx-checker" style={{ backgroundSize: 'clamp(40px, 6vw, 84px) clamp(40px, 6vw, 84px)' }} />
        <SparkleField count={26} seed={31} minSize={10} maxSize={24} />
      </div>
      {/* paño de póker que se borra por bloques */}
      <canvas ref={feltRef} className="absolute inset-0 w-full h-full pointer-events-none" style={{ imageRendering: 'pixelated' }} />
      {/* cuadrícula de píxeles que asoma en el paño antes de la disolvencia */}
      <div
        className="gx-grid absolute inset-0 pointer-events-none"
        style={{
          opacity: 0,
          backgroundImage: 'linear-gradient(rgba(242,48,210,.38) 1px, transparent 1px), linear-gradient(90deg, rgba(242,48,210,.38) 1px, transparent 1px)',
          backgroundSize: 'calc(100% / 26) calc(100% / 26)',
          backgroundPosition: '50% 50%',
          WebkitMaskImage: 'radial-gradient(ellipse 40% 46% at 50% 50%, #000 0%, rgba(0,0,0,.45) 55%, transparent 100%)',
          maskImage: 'radial-gradient(ellipse 40% 46% at 50% 50%, #000 0%, rgba(0,0,0,.45) 55%, transparent 100%)',
        }}
      />
      {/* HUD */}
      <div className="gx-hud absolute top-5 left-5 right-5 md:top-8 md:left-10 md:right-10 flex justify-between text-white" style={{ ...PIX, fontSize: 'clamp(9px, 1vw, 12px)', opacity: 0 }}>
        <span>
          1P <span style={{ color: GAME.star }}>★</span> ALEJANDRA
        </span>
        <span className="hidden sm:inline">NIVEL · EXPERIENCIA</span>
      </div>
      {/* grupo que hace el zoom a la pantalla */}
      <div className="gx-zoom absolute inset-0 will-change-transform z-30 pointer-events-none" style={{ transformOrigin: '50% 50%' }}>
        <div className="absolute left-1/2 top-1/2 w-0 h-0">
          {/* sombra de la carta sobre el paño (se achica cuando la carta levita) */}
          <div
            className="gx-shadow absolute rounded-[50%]"
            style={{ left: 'calc(var(--u) * -0.48)', top: 'calc(var(--u) * 0.5)', width: 'calc(var(--u) * 0.96)', height: 'calc(var(--u) * 0.22)', background: 'radial-gradient(closest-side, rgba(0,0,0,.6), rgba(0,0,0,0))' }}
          />
          {/* pista de clic: aparece con la carta sola y se apaga al avanzar */}
          <div
            aria-hidden
            className="gx-clickhint absolute pointer-events-none flex items-center justify-center gap-2 whitespace-nowrap"
            style={{ left: 'calc(var(--u) * -0.7)', width: 'calc(var(--u) * 1.4)', top: 'calc(var(--u) * 0.72)', ...PIX_HINT }}
          >
            <div className="gx-hint-entry">
              <div className="gx-hintglow flex items-center justify-center gap-2">
                <span className="gx-tapicon" style={{ display: 'inline-block' }}>☝</span>
                <span>Toca la carta</span>
              </div>
            </div>
          </div>
          {/* destellos que orbitan despacio alrededor de la carta */}
          <div className="gx-orbit-wrap absolute left-0 top-0 w-0 h-0">
            <div className="gx-orbit absolute left-0 top-0 w-0 h-0">
              {orbit.map((o, i) => (
                <span
                  key={i}
                  className="gx-star-entry absolute"
                  style={{
                    left: `calc(var(--u) * ${(Math.cos(o.a) * o.r).toFixed(3)} - ${o.s / 2}px)`,
                    top: `calc(var(--u) * ${(Math.sin(o.a) * o.r).toFixed(3)} - ${o.s / 2}px)`,
                    width: o.s,
                    height: o.s,
                    ['--gx-entry-delay' as string]: `${i * 55}ms`,
                  }}
                >
                  <span className="gx-twinkle block h-full w-full" style={{ animationDelay: `${-o.d}s` }}>
                    {o.star ? <PixelStar color={o.c} shade={null} style={{ width: '100%', height: '100%' }} /> : <PixelSpark color={o.c} style={{ width: '100%', height: '100%' }} />}
                  </span>
                </span>
              ))}
            </div>
          </div>
          {/* carta / cartucho (detrás de la consola: entra en la ranura) */}
          <div
            className="gx-flip absolute will-change-transform z-20 pointer-events-auto cursor-pointer"
            role="button"
            tabIndex={0}
            aria-label="Tocar la carta para revelarla y continuar"
            onClick={openCard}
            onKeyDown={(e) => {
              if (e.key === 'Enter') openCard();
            }}
            style={{ left: 'calc(var(--u) * -0.4)', top: 'calc(var(--u) * -0.56)', width: 'calc(var(--u) * 0.8)', height: 'calc(var(--u) * 1.12)', transform: 'rotate(-7deg)' }}
          >
            <div className="gx-hover relative w-full h-full" style={{ transformStyle: 'preserve-3d' }}>
            <div className="gx-flipper relative w-full h-full" style={{ transformStyle: 'preserve-3d' }}>
              <div className="absolute inset-0" style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', fontSize: 'calc(var(--u) / 100)' }}>
                <CardBackFace />
                {/* luz de contorno magenta (gira con la carta; late con opacidad) */}
                <div className="gx-rim absolute inset-0 pointer-events-none">
                  <div
                    className="gx-pulse absolute inset-0"
                    style={{
                      borderRadius: '6%/4.3%',
                      boxShadow: '0 0 0 2px rgba(255,142,219,.9), 0 0 calc(var(--u) * 0.06) calc(var(--u) * 0.012) rgba(242,48,210,.75), 0 0 calc(var(--u) * 0.22) calc(var(--u) * 0.03) rgba(242,48,210,.35)',
                    }}
                  />
                </div>
              </div>
              <div
                className="absolute left-0 right-0"
                style={{
                  top: 'calc(var(--u) * 0.11)',
                  height: 'calc(var(--u) * 0.9)',
                  transform: 'rotateY(180deg)',
                  backfaceVisibility: 'hidden',
                  WebkitBackfaceVisibility: 'hidden',
                  filter: 'drop-shadow(0 calc(var(--u) * 0.03) 0 rgba(80,0,60,.35))',
                }}
              >
                <Cartridge total={total} firstYear={firstYear} />
              </div>
            </div>
            </div>
          </div>
          {/* destellos del volteo */}
          {burst.map((b, i) => (
            <span
              key={i}
              className="gx-burst absolute"
              style={{ left: `calc(var(--u) * ${-b.s / 2})`, top: `calc(var(--u) * ${-b.s / 2})`, width: `calc(var(--u) * ${b.s})`, height: `calc(var(--u) * ${b.s})`, opacity: 0 }}
            >
              {b.star ? <PixelStar color={b.c} shade={null} style={{ width: '100%', height: '100%' }} /> : <PixelSpark color={b.c} style={{ width: '100%', height: '100%' }} />}
            </span>
          ))}
          {/* consola */}
          <div
            className="gx-console-wrap absolute will-change-transform"
            style={{ left: 'calc(var(--u) * -0.5)', top: 'calc(var(--u) * -0.8)', width: 'var(--u)', transform: 'translateY(200vh)' }}
          >
            <div className="gx-console-body" style={{ transformOrigin: '50% 100%' }}>
              <HandheldConsole />
            </div>
          </div>
        </div>
      </div>

      {/* barrido final: bloques del color del cielo del mundo */}
      <canvas ref={endRef} className="absolute inset-0 w-full h-full z-40 pointer-events-none" style={{ imageRendering: 'pixelated' }} />
      {/* nubes que pasan "a través de la cámara" al entrar al mundo */}
      <div className="absolute inset-0 z-50 pointer-events-none">
        {FLY.map((f, i) => (
          <div key={i} className="gx-fly absolute left-1/2 top-1/2" style={{ width: 'min(46vw, 560px)', marginLeft: 'calc(min(46vw, 560px) / -2)', marginTop: 'calc(min(46vw, 560px) * -0.25)', opacity: 0 }}>
            <PuffCloud className="w-full" tint={f.tint} />
          </div>
        ))}
      </div>
    </div>
  );
};
