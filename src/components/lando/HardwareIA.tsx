import { refreshScroll } from '../../lib/refreshScroll';
import { isLite } from '../../lib/deviceProfile';
import React, { useEffect, useMemo, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { registerStops, type Stop } from '../../lib/assistedScroll';
import { PORTFOLIO_DATA } from '../../data/portfolioData';
import { FONT, GAME, parsePeriod, seeded, useReducedMotion } from './experience/utils';
import { gameCss } from './experience/gameCss';
import { BootTransition } from './experience/BootTransition';
import { cardGate } from './experience/cardGate';
import { LevelMap } from './experience/LevelMap';
import { WarpOut } from './experience/WarpOut';
import { PixelStar, PuffCloud, SparkleField } from './experience/PixelArt';
import { usePauseOffscreen } from './usePauseOffscreen';
import { registerImageWarmup } from './warmup';
import { optionalImage } from './contact/useOptionalImage';

gsap.registerPlugin(ScrollTrigger);

// ============================================================================
// EXPERIENCIA LABORAL como un JUEGO (se conserva el nombre HardwareIA para no
// tocar App.tsx). Ambientación inspirada en los juegos de Nintendo que le
// gustan a Alejandra —consola portátil, plástico rosa "inflado", píxeles,
// estrellas, nubes pastel, selección de niveles— pero con diseño 100 %
// ORIGINAL: sin personajes, logos, sprites, sonidos ni marcas de terceros.
//
// Recorrido:
//  1. BootTransition: la última carta del póker se voltea y es un cartucho;
//     entra en una consola, la pantalla se enciende y hacemos zoom dentro
//     (pin + scrub, reversible).
//  2. Mundo pastel: cabecera "EXPERIENCIA" + mapa de niveles (un puesto del CV
//     = un nivel). Orden cronológico: el nivel 1 es el primer trabajo y el
//     último es el actual ("JUGANDO"). Para invertirlo, cambiar CHRONO_ASC.
//  3. WarpOut: la estrella-cursor sale disparada, el cielo se hace de noche y
//     las estrellas de píxel suben como el arranque de un salto; termina en
//     #0A1A2B liso para que SystemsGrid (el universo) continúe sin costura.
// Sin botones: todo se recorre con el scroll.
// prefers-reduced-motion: sin transición fijada ni animaciones (todo visible).
// Contenido: SOLO el CV (portfolioData.experiences).
// ============================================================================
const CHRONO_ASC = true;

export const HardwareIA: React.FC = () => {
  const { experiences, profile } = PORTFOLIO_DATA;
  const reduced = useReducedMotion();
  const worldRef = useRef<HTMLDivElement>(null);
  const secRef = useRef<HTMLElement>(null);
  // los titileos / polvo / nubes infinitos se pausan cuando su elemento sale de la vista
  usePauseOffscreen(secRef);
  // el paño grande (2560x1440) del barrido de píxeles y el dorso del cartucho, ya decodificados
  useEffect(() => {
    const felt = optionalImage(isLite() ? '/experience/felt-lite.webp' : '/experience/felt.webp');
    return registerImageWarmup('exp-img', ['/poker/card-back.webp', ...(felt ? [felt] : [])]);
  }, []);

  const levels = useMemo(() => (CHRONO_ASC ? [...experiences].reverse() : experiences), [experiences]);
  const firstYear = Math.min(...experiences.map((e) => parsePeriod(e.period).start));

  // nubes del mundo (con semilla: siempre en el mismo lugar)
  const clouds = useMemo(() => {
    const r = seeded(2019);
    return Array.from({ length: 12 }, (_, i) => ({
      left: i % 2 ? 62 + r() * 34 : -8 + r() * 30,
      top: 4 + (i / 12) * 92 + r() * 4,
      w: 14 + r() * 16,
      speed: 0.4 + r() * 1.2,
      tint: ['#FFD9F3', '#E6D9FF', '#D6E9FF'][i % 3],
      o: 0.55 + r() * 0.4,
    }));
  }, []);

  // cabecera + parallax de nubes
  useEffect(() => {
    const world = worldRef.current;
    if (!world || reduced) return;
    const ctx = gsap.context(() => {
      gsap
        .timeline({ scrollTrigger: { trigger: '[data-whead]', start: 'top 80%', toggleActions: 'play none none reverse' } })
        .from('[data-wl]', { yPercent: 70, scale: 0.4, autoAlpha: 0, duration: 0.7, stagger: 0.045, ease: 'back.out(2.4)' })
        .from('[data-sticker]', { scale: 0, rotation: -40, duration: 0.7, ease: 'back.out(2.5)' }, 0.35)
        .from('[data-wfade]', { y: 24, autoAlpha: 0, duration: 0.7, stagger: 0.08, ease: 'power3.out' }, 0.3);
      gsap.utils.toArray<HTMLElement>('[data-speed]', world).forEach((c) => {
        const k = Number(c.dataset.speed) || 1;
        gsap.fromTo(c, { y: () => window.innerHeight * 0.3 * k }, { y: () => -window.innerHeight * 0.3 * k, ease: 'none', scrollTrigger: { trigger: world, start: 'top bottom', end: 'bottom top', scrub: true, invalidateOnRefresh: true } });
      });
    }, world);
    return () => ctx.revert();
  }, [reduced]);

  // ---------- SCROLL ASISTIDO: paradas de reposo de todo el mundo gamer ----------
  // Un gesto viaja de una parada a la siguiente a un ritmo fijo (motor central
  // en lib/assistedScroll). Las posiciones se calculan en vivo en cada gesto.
  useEffect(() => {
    if (reduced) return; // sin pins: el scroll normal basta

    // ScrollTrigger con pin sobre un elemento (escenario de la transición / de la salida)
    const pinOf = (id: string) => ScrollTrigger.getAll().find((s) => s.pin && (s.pin as HTMLElement).id === id);
    const absTop = (el: Element) => el.getBoundingClientRect().top + window.scrollY;
    const vh = () => window.innerHeight;
    // un nivel más alto que 1.08 pantallas se lee en dos paradas (arriba y abajo)
    const TALL = 1.08;
    // posición para que un elemento quede centrado; si es muy alto, arriba con un margen
    const centered = (el: Element) => {
      const h = (el as HTMLElement).offsetHeight;
      const top = absTop(el);
      if (h > vh() * TALL) return top - vh() * 0.06;
      // casi del alto de la pantalla: arriba (para no cortar el encabezado de la tarjeta)
      if (h > vh() * 0.94) return top - vh() * 0.02;
      return top + h / 2 - vh() / 2;
    };
    const levelEl = (i: number) => worldRef.current?.querySelector<HTMLElement>(`[data-level="${i}"]`) ?? null;

    // ESCRITORIO: cada tarjeta de nivel se ajusta (zoom) para caber ENTERA en la pantalla, así
    // cada nivel tiene UNA sola parada y un solo gesto basta para pasar al siguiente (antes, las
    // tarjetas más altas que la pantalla pedían dos gestos: arriba y abajo). Hasta un 24 % menor como máximo.
    const FIT_MAX = 0.86;
    const FIT_MIN = 0.76;
    let fitTimer: number | undefined;
    const fitCards = () => {
      const w = worldRef.current;
      if (!w) return;
      const desktop = window.innerWidth >= 1024;
      let changed = false;
      w.querySelectorAll<HTMLElement>('[data-level]').forEach((li) => {
        const card = li.children[1] as HTMLElement | undefined; // la tarjeta (columna del medio en escritorio)
        if (!card) return;
        const prev = card.style.zoom;
        card.style.zoom = '';
        let next = '';
        if (desktop) {
          const h = card.getBoundingClientRect().height;
          const k = Math.max(FIT_MIN, Math.min(1, (vh() * FIT_MAX) / h));
          if (k < 0.995) next = String(Math.round(k * 1000) / 1000);
        }
        card.style.zoom = next;
        if (next !== prev) changed = true;
      });
      if (changed) refreshScroll();
    };
    fitCards();
    const onFitResize = () => {
      window.clearTimeout(fitTimer);
      fitTimer = window.setTimeout(fitCards, 200);
    };
    window.addEventListener('resize', onFitResize);
    document.fonts?.ready?.then(fitCards);

    const stops: Stop[] = [
      // la carta sola bajo el foco: inicio del pin; el viaje desde el póker es el empalme
      // Viaje desde las cartas boca arriba: el As se levanta, gira boca abajo y queda solo bajo el foco.
      // La bajada queda BLOQUEADA hasta tocar la carta (cardGate); subir es libre.
      { id: 'exp-card', y: () => pinOf('boot-transition-stage')?.start ?? null, desktop: 4.2, mobile: 3.4, holdDown: () => !cardGate.open },
      // todo el arranque (voltear, insertar, encender, zoom a la pantalla) hasta la cabecera legible
      {
        id: 'exp-world',
        y: () => {
          const h = worldRef.current?.querySelector('[data-whead]');
          return h ? absTop(h) - 4 : null;
        },
        desktop: 4.4,
        mobile: 3.6,
        upDesktop: 3.7,
        upMobile: 3.1,
      },
      // un nivel por parada (la tarjeta queda centrada y legible). Si el nivel es
      // muy alto, tiene una segunda parada para leer su mitad inferior.
      ...levels.flatMap((_, i): Stop[] => [
        {
          id: `exp-level-${i + 1}`,
          y: () => {
            const el = levelEl(i);
            return el ? centered(el) : null;
          },
          desktop: i === 0 ? 1.4 : 1.25,
          mobile: i === 0 ? 1.3 : 1.1,
        },
        {
          id: `exp-level-${i + 1}-end`,
          y: () => {
            const el = levelEl(i);
            if (!el || el.offsetHeight <= vh() * TALL) return null;
            return absTop(el) + el.offsetHeight - vh() * 0.94;
          },
          desktop: 0.95,
          mobile: 0.9,
        },
      ]),
      // (sin parada propia para el despegue de la estrella: desde el ULTIMO nivel un solo gesto lleva
      // el despegue (WarpOut) + el salto + la llegada al universo, ver skills-orbit en SystemsGrid)
    ];
    const unregister = registerStops('experience', stops);
    return () => {
      unregister();
      window.removeEventListener('resize', onFitResize);
      window.clearTimeout(fitTimer);
    };
  }, [reduced, levels]);

  const title = 'EXPERIENCIA';

  return (
    <section
      ref={secRef}
      id="enfoque"
      data-nav-theme="light"
      aria-labelledby="exp-title"
      className="relative pointer-events-auto"
      style={{ background: GAME.night, overflowX: 'clip' }}
    >
      <style>{gameCss}</style>

      {/* ---------- 1) transición desde el póker ---------- */}
      {reduced ? (
        // versión quieta: un puente de color paño -> magenta -> cielo
        <div aria-hidden className="relative h-[34vh]" style={{ background: `linear-gradient(180deg, ${GAME.felt} 0%, ${GAME.magenta} 55%, ${GAME.worldTop} 100%)` }}>
          <SparkleField count={14} seed={3} />
        </div>
      ) : (
        <BootTransition total={experiences.length} firstYear={firstYear} />
      )}

      {/* ---------- 2) el mundo ---------- */}
      <div
        ref={worldRef}
        className="relative"
        style={{
          background: `linear-gradient(180deg, ${GAME.worldTop} 0%, #F6D2FF 14%, #E2D3FF 34%, #CFE2FF 58%, #E4D6FF 80%, ${GAME.worldTop} 100%)`,
          color: GAME.plum,
        }}
      >
        {/* nubes y destellos de fondo */}
        <div aria-hidden className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute inset-0 gx-checker opacity-40" style={{ backgroundSize: '64px 64px' }} />
          {clouds.map((c, i) => (
            <div key={i} data-speed={c.speed} className="absolute" style={{ left: `${c.left}%`, top: `${c.top}%`, width: `${c.w}vw`, minWidth: 140, opacity: c.o }}>
              <PuffCloud className="gx-drift w-full" tint={c.tint} />
            </div>
          ))}
          <SparkleField count={40} seed={8} colors={['#FFFFFF', GAME.star, GAME.magenta]} minSize={9} maxSize={18} />
        </div>

        {/* cabecera */}
        <header data-whead className="relative z-10 mx-auto max-w-[1280px] px-5 sm:px-8 lg:px-10 pt-10 md:pt-14 pb-6">
          <div data-wfade className="flex flex-wrap items-center gap-3" style={{ fontFamily: FONT.pixel, fontSize: 'clamp(9px, 0.85vw, 11px)', color: GAME.plumSoft }}>
            <span className="inline-flex items-center gap-2 rounded-full px-3 py-2 bg-white" style={{ border: `2px solid ${GAME.plum}`, boxShadow: `0 3px 0 ${GAME.plum}` }}>
              <PixelStar className="w-3.5 h-3.5" color={GAME.magenta} shade={null} /> TRAYECTORIA
            </span>
            <span>
              {firstYear} — HOY
            </span>
          </div>

          <div className="relative mt-16 sm:mt-18 flex flex-wrap items-center gap-3 sm:inline-block max-w-full">
            <h2
              id="exp-title"
              className="leading-[0.88] text-[clamp(2.1rem,8.3vw,9.5rem)] whitespace-nowrap inline-block"
              style={{
                fontFamily: FONT.puffy,
                color: '#FFFFFF',
                WebkitTextStroke: `0.028em ${GAME.plum}`,
                paintOrder: 'stroke fill',
                textShadow: `0 0.045em 0 ${GAME.magenta}, 0 0.09em 0 ${GAME.plum}, 0 0.2em 0.3em rgba(91,42,107,.22)`,
              }}
            >
              <span className="sr-only">Experiencia laboral</span>
              <span aria-hidden className="inline-flex">
                {title.split('').map((c, i) => (
                  <span key={i} data-wl className="inline-block" style={{ transform: `rotate(${[-3, 2, -1, 3, -2, 1, -3, 2, -1, 3, -2][i]}deg)` }}>
                    {c}
                  </span>
                ))}
              </span>
            </h2>
            {/* sticker "laboral": en celular se ubica a la derecha de EXPERIENCIA (pedido explícito); en escritorio arriba a la derecha */}
            <span
              data-sticker
              aria-hidden
              className="max-sm:static max-sm:translate-y-0 sm:absolute sm:-top-12 sm:right-2 rotate-[9deg] inline-flex items-center gap-1.5 sm:gap-2 rounded-xl sm:rounded-2xl px-2.5 py-0.5 sm:px-4 sm:py-1.5 text-white text-[clamp(11px,2vw,20px)] select-none pointer-events-none z-10"
              style={{ fontFamily: FONT.puffy, background: GAME.magenta, border: `2.5px solid ${GAME.plum}`, boxShadow: `0 4px 0 ${GAME.plum}` }}
            >
              laboral
              <PixelStar className="w-[0.8em] h-[0.8em]" color={GAME.star} />
            </span>
          </div>

          <div className="mt-10 md:mt-12 flex flex-col md:flex-row md:items-end gap-8 md:gap-12">
            <p data-wfade className="max-w-xl text-base md:text-lg leading-relaxed" style={{ fontFamily: FONT.body, color: 'rgba(42,15,53,.8)' }}>
              {profile.title}. Del circuito al código: de la atención al público y la gestión de proyectos al desarrollo de sistemas,
              agentes de IA y automatizaciones.
            </p>
            <dl data-wfade className="md:ml-auto flex gap-3">
              {[
                ['NIVELES', String(experiences.length).padStart(2, '0')],
                ['DESDE', String(firstYear)],
              ].map(([k, v]) => (
                <div key={k} className="rounded-2xl px-5 py-3 bg-white" style={{ border: `3px solid ${GAME.plum}`, boxShadow: `0 5px 0 ${GAME.plum}` }}>
                  <dt style={{ fontFamily: FONT.pixel, fontSize: 9, color: GAME.plumSoft }}>{k}</dt>
                  <dd className="mt-1 text-4xl md:text-5xl leading-none" style={{ fontFamily: FONT.puffy, color: GAME.magenta }}>
                    {v}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <p data-wfade className="mt-14 md:mt-16 text-center" style={{ fontFamily: FONT.pixel, fontSize: 'clamp(9px, 0.9vw, 12px)', color: GAME.plum }}>
            SELECCIONA UN NIVEL <span className="gx-blink inline-block">▼</span>
          </p>
        </header>

        {/* mapa de niveles */}
        <div className="relative z-10">
          <LevelMap levels={levels} reduced={reduced} />
        </div>
      </div>

      {/* ---------- 3) salida: la estrella despega con estela y da paso al salto espacial ---------- */}
      <WarpOut reduced={reduced} />
    </section>
  );
};
