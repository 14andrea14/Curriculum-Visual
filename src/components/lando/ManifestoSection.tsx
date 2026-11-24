import React, { useEffect, useRef, useState } from 'react';
import { CircuitBg, Marquee } from './shared';
import { PORTFOLIO_DATA } from '../../data/portfolioData';

// MANIFIESTO (referencia: "Redefining limits, fighting for wins…" de
// landonorris.com): una frase gigante centrada sobre fondo oscuro, con las
// palabras clave en serif de acento y el resto en condensada blanca. Las
// palabras se encienden UNA A UNA según el scroll (no todo de golpe), y debajo
// corre una franja marquee. El texto sale del CV (resumen del perfil).
export type W = { t: string; key?: string };
// Texto pedido por la usuaria (21/11): "Ingeniero electrónico. Diseño de agentes de IA,
// automatización de procesos y construcción de sistemas de extremo a extremo." y aparte,
// en pequeño y con otra letra, la frase "Del circuito al código" (MANIFESTO_TAGLINE).
// Como el manifiesto de Lando: UN solo color de acento (magenta) y pocas palabras
// destacadas; el resto en blanco roto.
const ACC = '#F230D2';
export const WORDS: W[] = [
  { t: 'INGENIERO' },
  { t: 'ELECTRÓNICO.' },
  { t: 'DISEÑO' },
  { t: 'DE' },
  { t: 'AGENTES', key: ACC },
  { t: 'DE', key: ACC },
  { t: 'IA,', key: ACC },
  { t: 'AUTOMATIZACIÓN' },
  { t: 'DE' },
  { t: 'PROCESOS' },
  { t: 'Y' },
  { t: 'CONSTRUCCIÓN' },
  { t: 'DE' },
  { t: 'SISTEMAS' },
  { t: 'DE' },
  { t: 'EXTREMO', key: ACC },
  { t: 'A', key: ACC },
  { t: 'EXTREMO.', key: ACC },
];
export const MANIFESTO_TAGLINE = 'Del circuito al código';

export const ManifestoSection: React.FC = () => {
  const ref = useRef<HTMLElement>(null);
  const [p, setP] = useState(0);
  const { profile } = PORTFOLIO_DATA;

  useEffect(() => {
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setP(1);
      return;
    }
    let raf = 0;
    const update = () => {
      raf = 0;
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      // 0 cuando la sección asoma por abajo, 1 cuando su mitad llega al 35 % de la pantalla
      const v = (vh * 0.8 - r.top) / (r.height * 0.55);
      setP(Math.min(1, Math.max(0, v)));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <section
      id="manifiesto"
      ref={ref}
      data-nav-theme="dark"
      className="relative bg-neo-ink text-white overflow-hidden pointer-events-auto"
    >
      <CircuitBg seed={11} count={30} stroke="#0CDBF2" opacity={0.11} />
      {/* fundido desde el negro de la portada */}
      <div aria-hidden className="absolute inset-x-0 top-0 h-[26vh] z-[5] pointer-events-none" style={{ background: 'linear-gradient(to bottom, #000 0%, rgba(6,13,23,0) 100%)' }} />
      <div className="relative z-10 min-h-[100svh] flex items-center justify-center px-5 sm:px-10 py-28">
        <p className="font-poster uppercase text-center leading-[0.98] tracking-[-0.005em] max-w-[1300px] text-[10.5vw] sm:text-[6.3vw] lg:text-[5.7rem]">
          {WORDS.map((w, i) => {
            const on = p * (WORDS.length + 2) > i;
            return (
              <span
                key={i}
                className={w.key ? 'font-serifItalic italic font-semibold normal-case tracking-normal' : ''}
                style={{
                  color: w.key ?? '#ffffff',
                  opacity: on ? 1 : 0.14,
                  filter: on ? 'blur(0px)' : 'blur(2px)',
                  transition: 'opacity 450ms cubic-bezier(0.65,0.05,0,1), filter 450ms cubic-bezier(0.65,0.05,0,1)',
                }}
              >
                {w.t}{' '}
              </span>
            );
          })}
        </p>
      </div>
      <Marquee
        items={[profile.statusBadge, 'IA APLICADA', 'AUTOMATIZACIÓN', 'ELECTRÓNICA', 'DESARROLLO WEB', 'AGENTES Y CHATBOTS']}
        className="relative z-10 border-y border-white/10 py-4 font-poster uppercase text-[clamp(1.6rem,3.4vw,3rem)] text-white/80"
      />
    </section>
  );
};
