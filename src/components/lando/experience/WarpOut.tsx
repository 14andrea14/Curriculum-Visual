import React, { useEffect, useMemo, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { GAME, seeded } from './utils';
import { PixelSpark, PixelStar, PuffCloud } from './PixelArt';

gsap.registerPlugin(ScrollTrigger);

export const WARP_OUT_PIN = 'warp-out';
export const WARP_OUT_READY = 'warp-out-ready';

// ============================================================================
// SALIDA del mundo del juego -> el UNIVERSO (SystemsGrid, "salto orbital").
// Sin botones: todo va atado al scroll (pin + scrub, reversible).
//  1. Mientras el escenario sube, la estrella-cursor del mapa de niveles se
//     queda en la línea de lectura (la "hereda" del camino punteado).
//  2. Ya fijado: la estrella toma impulso (se encoge, tiembla) y SALE
//     DISPARADA hacia arriba dejando una estela magenta; destello arriba.
//  3. El cielo pastel atardece (rosa -> violeta) y se hace de noche en pocos
//     pasos; las nubes se hunden y se apagan.
//  4. Estrellas de píxel SUBEN cada vez más rápido y se estiran en estelas
//     (el arranque del salto al hiperespacio que continúa SystemsGrid).
//  5. En escritorio las estelas se funden a pantalla completa con el salto
//     orbital. En móvil cierran sobre un cielo oscuro con estrellas de píxel.
// Movimiento reducido: degradado cielo -> noche quieto con estrellas.
// ============================================================================
const RISE = 80; // estrellas que suben
const REST = 70; // estrellas quietas del final

export const WarpOut: React.FC<{ reduced: boolean }> = ({ reduced }) => {
  const stageRef = useRef<HTMLDivElement>(null);

  const rise = useMemo(() => {
    const r = seeded(4242);
    return Array.from({ length: RISE }, (_, i) => ({
      x: 2 + r() * 96, // %
      y0: 0.35 + r() * 0.9, // inicio (fracción de pantalla desde arriba)
      k: 0.6 + r() * 0.9, // cuánto sube
      t: r(), // retraso
      s: 10 + r() * 18,
      star: i % 5 === 0,
      c: i % 4 === 0 ? GAME.pink : i % 7 === 0 ? GAME.star : '#FFFFFF',
      m: i % 2 === 1, // solo escritorio (en móvil, la mitad)
    }));
  }, []);
  const rest = useMemo(() => {
    const r = seeded(777);
    return Array.from({ length: REST }, (_, i) => ({
      x: r() * 100,
      y: r() * 100,
      cross: i % 3 === 0,
      s: i % 3 === 0 ? 7 + r() * 6 : 1.5 + r() * 2,
      c: i % 3 === 0 ? (i % 2 ? '#F7A8EC' : '#FFFFFF') : '#ECE8F2',
      o: 0.45 + r() * 0.55,
      d: r() * 3,
    }));
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || reduced) return;
    let ctx: gsap.Context | undefined;
    let cancelled = false;
    let timer = 0;

    const build = () => {
      if (cancelled) return;
      ctx = gsap.context(() => {
        const q = gsap.utils.selector(stage);
        const vh = () => stage.clientHeight;
        const vw = () => stage.clientWidth;
        // x del camino punteado (igual que LevelMap): centro en escritorio,
        // columna izquierda en móvil/tableta
        const trailDx = () => {
          const w = window.innerWidth;
          const x = w < 640 ? 16 + 22 : w < 1024 ? 32 + 32 : vw() / 2;
          return x - vw() / 2;
        };

        // 1) antes del pin: la estrella se queda en la línea del 60 %
        gsap.fromTo(
          q('.gx-w-follow'),
          { y: 0 },
          { y: () => vh() * 0.6, ease: 'none', immediateRender: true, scrollTrigger: { trigger: stage, start: 'top 60%', end: 'top top', scrub: true, invalidateOnRefresh: true } }
        );
        gsap.set(q('.gx-w-star'), { x: trailDx });
        // aparece justo cuando el cursor del mapa llega al final del camino
        const follow = q('.gx-w-follow');
        gsap.set(follow, { autoAlpha: 0 });
        ScrollTrigger.create({
          trigger: stage,
          start: 'top 60%',
          onEnter: () => gsap.set(follow, { autoAlpha: 1 }),
          onLeaveBack: () => gsap.set(follow, { autoAlpha: 0 }),
          onRefresh: (self) => gsap.set(follow, { autoAlpha: self.progress > 0 || self.isActive ? 1 : 0 }),
        });

        const isMobile = window.innerWidth < 768;
        const tl = gsap.timeline({
          defaults: { ease: 'none' },
          scrollTrigger: {
            trigger: stage,
            id: WARP_OUT_PIN,
            start: 'top top',
            end: () => '+=' + vh() * (isMobile ? 1.5 : 1.8),
            pin: true,
            scrub: true,
            anticipatePin: 1,
            invalidateOnRefresh: true,
          },
        });

        // 3) el cielo se apaga (pastel -> atardecer -> noche)
        tl.fromTo(q('.gx-w-sky'), { opacity: 1 }, { opacity: 0, duration: isMobile ? 2.2 : 3.2, ease: 'power1.in' }, 0)
          .fromTo(q('.gx-w-dusk'), { opacity: 0 }, { opacity: 1, duration: isMobile ? 1.1 : 1.8, ease: 'power1.out' }, 0.2)
          .to(q('.gx-w-dusk'), { opacity: 0, duration: isMobile ? 1.2 : 2.0, ease: 'power1.in' }, isMobile ? 1.3 : 2.0);
        q('.gx-w-cloud').forEach((c, i) => {
          tl.to(c, { y: () => vh() * (0.35 + i * 0.12), opacity: 0, duration: isMobile ? 1.4 : 2.2, ease: 'power2.in' }, 0.1 + i * 0.08);
        });

        // 2) la estrella toma impulso y sale disparada
        const star = q('.gx-w-star');
        tl.to(star, { x: 0, duration: isMobile ? 0.4 : 0.8, ease: 'power2.inOut' }, 0)
          .to(star, { scaleX: 1.25, scaleY: 0.7, y: () => vh() * 0.05, duration: isMobile ? 0.3 : 0.5, ease: 'power2.out' }, isMobile ? 0.25 : 0.4)
          .to(star, { rotation: 8, duration: 0.08, yoyo: true, repeat: isMobile ? 3 : 5, ease: 'sine.inOut' }, isMobile ? 0.35 : 0.5)
          .to(star, { scaleX: 0.7, scaleY: 1.5, y: () => -vh() * 0.85, duration: isMobile ? 0.9 : 1.3, ease: 'power3.in' }, isMobile ? 0.6 : 0.9)
          .to(star, { autoAlpha: 0, duration: 0.15 }, isMobile ? 1.4 : 2.1)
          .fromTo(q('.gx-w-trail'), { scaleY: 0, opacity: 1 }, { scaleY: 1, duration: isMobile ? 0.9 : 1.3, ease: 'power3.in' }, isMobile ? 0.6 : 0.9)
          .to(q('.gx-w-trail'), { opacity: 0, duration: isMobile ? 0.3 : 0.6 }, isMobile ? 1.4 : 2.1)
          .fromTo(q('.gx-w-flash'), { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.2, ease: 'power2.out' }, isMobile ? 1.45 : 2.15)
          .to(q('.gx-w-flash'), { scale: 1.8, opacity: 0, duration: 0.4, ease: 'power2.in' }, isMobile ? 1.65 : 2.35);

        // 4) Lluvia de estrellas que suben cada vez más rápido y se estiran (recuperada y optimizada para móvil y escritorio)
        q('.gx-w-rise').forEach((el, i) => {
          const s = rise[i];
          const at = (isMobile ? 0.8 : 1.2) + s.t * (isMobile ? 1.0 : 1.6);
          tl.fromTo(
            el,
            { y: 0 },
            { y: () => -vh() * (s.y0 + 0.3 + s.k * 0.5), duration: isMobile ? 1.8 : 2.4, ease: 'power3.in' },
            at
          );
          tl.fromTo(el, { opacity: 0, scale: 0.3 }, { opacity: 1, scale: 1, duration: 0.4, ease: 'back.out(2)' }, at);
          const tail = el.querySelector('.gx-w-tail');
          if (tail) tl.fromTo(tail, { scaleY: 0 }, { scaleY: 1, duration: isMobile ? 1.0 : 1.3, ease: 'power2.in' }, at + (isMobile ? 0.6 : 0.9));
        });

        tl.fromTo(q('.gx-w-rest'), { opacity: 0, y: () => vh() * 0.04 }, { opacity: 1, y: 0, duration: isMobile ? 1.0 : 1.6, ease: 'power2.out' }, isMobile ? 2.2 : 3.0);
      }, stage);
      ScrollTrigger.sort();
      ScrollTrigger.refresh();
      window.dispatchEvent(new Event(WARP_OUT_READY));
    };

    const fontsReady = document.fonts?.ready ?? Promise.resolve();
    const delay = new Promise<void>((res) => {
      timer = window.setTimeout(res, 1200);
    });
    Promise.all([fontsReady, delay]).then(build, build);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      ctx?.revert();
    };
  }, [reduced, rise]);

  const restField = (
    <div className="gx-w-rest absolute inset-0 pointer-events-none" style={{ opacity: reduced ? 1 : 0 }}>
      {rest.map((s, i) =>
        s.cross ? (
          <span key={i} className="gx-twinkle absolute" style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.s, height: s.s, opacity: s.o, animationDelay: `${-s.d}s` }}>
            <PixelSpark color={s.c} style={{ width: '100%', height: '100%' }} />
          </span>
        ) : (
          <span key={i} className="absolute" style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.s, height: s.s, background: s.c, opacity: s.o }} />
        )
      )}
    </div>
  );

  if (reduced) {
    return (
      <div
        aria-hidden
        className="relative h-[90vh] overflow-hidden"
        style={{ background: `linear-gradient(180deg, ${GAME.worldTop} 0%, #D77AD6 22%, #4A2C84 45%, ${GAME.night} 70%, ${GAME.night} 100%)` }}
      >
        <div className="absolute inset-x-0 bottom-0 h-[50%]">{restField}</div>
      </div>
    );
  }

  return (
    <div ref={stageRef} id="warp-out-stage" aria-hidden className="relative h-screen w-full overflow-hidden select-none md:isolate" style={{ background: GAME.night }}>
      {/* capas de cielo (de arriba hacia abajo se apagan) */}
      <div
        className="gx-w-dusk absolute inset-0"
        style={{ opacity: 0, background: 'linear-gradient(180deg, #F7AEE3 0%, #C66CCF 35%, #6E3BA6 70%, #2C2466 100%)' }}
      />
      <div className="gx-w-sky absolute inset-0" style={{ background: `linear-gradient(180deg, ${GAME.worldTop} 0%, #F6D2FF 55%, #E4D6FF 100%)` }} />
      {/* nubes que se hunden */}
      {[
        { l: '-6%', t: '50%', w: '34vw', tint: '#FFD9F3' },
        { l: '64%', t: '36%', w: '28vw', tint: '#E6D9FF' },
        { l: '30%', t: '72%', w: '24vw', tint: '#FFD9F3' },
      ].map((c, i) => (
        <div key={i} className="gx-w-cloud absolute" style={{ left: c.l, top: c.t, width: c.w, minWidth: 150 }}>
          <PuffCloud className="w-full" tint={c.tint} />
        </div>
      ))}

      {/* estrellas quietas del final */}
      <div className="md:hidden">{restField}</div>

      {/* estrellas que suben (con estela) */}
      <div className="absolute inset-0 pointer-events-none">
        {rise.map((s, i) => (
          <span
            key={i}
            className={`gx-w-rise absolute ${s.m ? 'hidden sm:block' : ''}`}
            style={{ left: `${s.x}%`, top: `${s.y0 * 100}%`, width: s.s, height: s.s, opacity: 0 }}
          >
            <span
              className="gx-w-tail absolute left-1/2 top-1/2 -translate-x-1/2 origin-top"
              style={{ width: Math.max(2, s.s * 0.22), height: '34vh', background: `linear-gradient(to bottom, ${s.c}, rgba(255,255,255,0))`, transform: 'scaleY(0)', opacity: 0.85 }}
            />
            {s.star ? <PixelStar color={s.c} shade={null} style={{ position: 'relative', width: '100%', height: '100%' }} /> : <PixelSpark color={s.c} style={{ position: 'relative', width: '100%', height: '100%' }} />}
          </span>
        ))}
      </div>

      {/* destello arriba cuando la estrella sale */}
      <div
        className="gx-w-flash absolute left-1/2 top-0 w-[60vmin] h-[60vmin] -ml-[30vmin] -mt-[30vmin] rounded-full pointer-events-none"
        style={{ opacity: 0, background: 'radial-gradient(closest-side, rgba(255,255,255,.95), rgba(255,142,219,.55) 40%, rgba(242,48,210,0))' }}
      />

      {/* estrella-cursor (heredada del mapa de niveles) */}
      <div className="gx-w-follow absolute left-1/2 top-0 w-0 h-0 z-10">
        <div className="gx-w-star absolute left-0 top-0 w-0 h-0">
          <span
            className="gx-w-trail absolute left-0 top-0 -translate-x-1/2 origin-top"
            style={{ width: 14, height: '90vh', transform: 'scaleY(0)', background: `repeating-linear-gradient(to bottom, ${GAME.magenta} 0 10px, rgba(242,48,210,0) 10px 22px)`, WebkitMaskImage: 'linear-gradient(to bottom, #000, transparent)', maskImage: 'linear-gradient(to bottom, #000, transparent)' }}
          />
          <div className="absolute -translate-x-1/2 -translate-y-1/2 w-14 h-14 lg:w-16 lg:h-16">
            <span className="absolute inset-[-30%] rounded-full" style={{ background: 'radial-gradient(closest-side, rgba(255,255,255,.95), rgba(255,200,238,.6) 45%, rgba(255,200,238,0))' }} />
            <PixelStar color={GAME.magenta} shade={GAME.plum} style={{ position: 'relative', width: '100%', height: '100%' }} />
          </div>
        </div>
      </div>

      {/* (móvil: sin degradado propio en el borde inferior; SISTEMAS se desliza encima y la nebulosa
          emerge del mismo azul noche, así no hay costura entre las dos secciones) */}
    </div>
  );
};
