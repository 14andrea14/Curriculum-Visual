import React, { forwardRef } from 'react';
import { FONT, GAME, parsePeriod, splitHighlight, type Exp } from './utils';
import { PixelStar } from './PixelArt';

// ============================================================================
// Tarjeta de NIVEL (= un puesto del CV). Plástico grueso: contorno ciruela de
// 3 px, sombra dura magenta desplazada (como una pieza de consola) y barra de
// título con rótulos de píxel. Todo el texto sale de portfolioData:
//   barra       NIVEL 0X · estado ("JUGANDO" si es el puesto actual, si no "COMPLETADO")
//   meta        período + ubicación
//   puesto      redondeada grande / empresa en letra "inflada" magenta
//   LOGROS      una estrella dorada por cada logro del CV (solo cuenta, sin puntajes inventados)
//   INVENTARIO  el stack como "ítems"
// Piezas que anima LevelMap: [data-pop] (tarjeta), [data-in] (contenido), [data-item] (chips)
// ============================================================================
export const LevelCard = forwardRef<HTMLElement, { item: Exp; level: number; total: number }>(({ item, level, total }, ref) => {
  const period = parsePeriod(item.period);
  const current = period.end === null;
  const lvl = String(level).padStart(2, '0');

  return (
    <article
      ref={ref}
      data-pop
      aria-label={`Nivel ${level} de ${total}: ${item.role} en ${item.company}, ${period.label}`}
      className="gx-card relative rounded-[26px] md:rounded-[30px]"
      style={{
        background: GAME.cream,
        border: `3px solid ${GAME.plum}`,
        boxShadow: `0 10px 0 ${GAME.magenta}, 0 10px 0 3px ${GAME.plum}, 0 34px 60px -24px rgba(91,42,107,.55)`,
      }}
    >
      {/* barra de título */}
      <div
        className="relative flex items-center gap-3 px-4 md:px-6 h-12 md:h-14 rounded-t-[22px] md:rounded-t-[26px] overflow-hidden"
        style={{ background: `linear-gradient(90deg, ${GAME.magenta}, #FF6FD6)`, borderBottom: `3px solid ${GAME.plum}` }}
      >
        <div aria-hidden className="absolute inset-0 gx-checker opacity-60" style={{ backgroundSize: '18px 18px' }} />
        <span className="relative text-white" style={{ fontFamily: FONT.pixel, fontSize: 'clamp(9px, 0.85vw, 11px)', textShadow: `2px 2px 0 ${GAME.plum}` }}>
          NIVEL {lvl}
          <span className="opacity-70"> / {String(total).padStart(2, '0')}</span>
        </span>
        <span
          className="relative ml-auto inline-flex items-center gap-2 rounded-full px-3 py-1.5"
          style={{
            fontFamily: FONT.pixel,
            fontSize: 'clamp(8px, 0.75vw, 10px)',
            background: current ? GAME.plum : '#FFFFFF',
            color: current ? '#FFFFFF' : GAME.plum,
            boxShadow: `0 3px 0 ${GAME.plum}`,
          }}
        >
          {current ? (
            <>
              <span className="gx-blink" style={{ color: GAME.pink }}>
                ▶
              </span>
              JUGANDO
            </>
          ) : (
            <>
              <span style={{ color: GAME.star, textShadow: `1px 1px 0 ${GAME.plum}` }}>★</span>
              COMPLETADO
            </>
          )}
        </span>
        {/* "tornillos" del plástico */}
        <span aria-hidden className="relative hidden sm:block w-2.5 h-2.5 rounded-full" style={{ background: 'rgba(42,15,53,.35)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,.4)' }} />
      </div>

      <div className="p-5 sm:p-6 md:p-8">
        {/* meta */}
        <div data-in className="flex flex-wrap items-center gap-2.5 text-[12px]" style={{ fontFamily: FONT.round, fontWeight: 600, color: GAME.plumSoft }}>
          <span className="inline-flex items-center gap-2 rounded-full px-3 py-1" style={{ background: current ? 'rgba(242,48,210,.12)' : 'rgba(42,15,53,.06)', color: GAME.plum }}>
            {current && <span className="w-2 h-2 rounded-full animate-pulse motion-reduce:animate-none" style={{ background: GAME.magenta }} />}
            {period.label}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <svg aria-hidden viewBox="0 0 7 9" className="w-[10px] h-[13px]" style={{ shapeRendering: 'crispEdges' }}>
              <path d="M2 0h3v1h1v1h1v3H6v1H5v1H4v2H3V7H2V6H1V5H0V2h1V1h1zM3 2v2h1V2z" fill={GAME.magenta} />
            </svg>
            {item.location}
          </span>
        </div>

        {/* puesto + empresa */}
        <h3 data-in className="mt-4 leading-[1.02] text-[clamp(26px,3.1vw,42px)]" style={{ fontFamily: FONT.round, fontWeight: 700, color: GAME.plum, letterSpacing: '-0.01em' }}>
          {item.role}
        </h3>
        <p
          data-in
          className="mt-1.5 leading-[1.05] text-[clamp(30px,3.6vw,52px)]"
          style={{
            fontFamily: FONT.puffy,
            color: GAME.magenta,
            WebkitTextStroke: `0.045em ${GAME.plum}`,
            paintOrder: 'stroke fill',
            textShadow: `0 0.07em 0 ${GAME.plum}`,
          }}
        >
          {item.company}
        </p>

        <p data-in className="mt-5 text-[15px] md:text-base leading-relaxed" style={{ fontFamily: FONT.body, color: 'rgba(42,15,53,.82)' }}>
          {item.description}
        </p>

        {/* logros */}
        <div data-in className="mt-6 flex items-center gap-3">
          <span style={{ fontFamily: FONT.pixel, fontSize: 10, color: GAME.plumSoft }}>LOGROS</span>
          <span className="flex gap-1" aria-label={`${item.highlights.length} logros`}>
            {item.highlights.map((_, i) => (
              <PixelStar key={i} color={GAME.star} className="w-[18px] h-[18px]" />
            ))}
          </span>
          <span className="h-[3px] flex-1 rounded-full" style={{ background: 'repeating-linear-gradient(90deg, rgba(42,15,53,.18) 0 6px, transparent 6px 10px)' }} />
        </div>
        <ul className={`mt-4 grid gap-x-7 gap-y-3.5 ${item.highlights.length > 2 ? 'lg:grid-cols-2' : ''}`}>
          {item.highlights.map((h, i) => {
            const [label, text] = splitHighlight(h);
            return (
              <li key={i} data-in className="relative pl-6 text-[13.5px] leading-relaxed" style={{ fontFamily: FONT.body, color: 'rgba(42,15,53,.75)' }}>
                <PixelStar color={GAME.pink} className="absolute left-0 top-[0.3em] w-[13px] h-[13px]" />
                {label && <span className="font-semibold" style={{ color: GAME.plum }}>{label}. </span>}
                {text.charAt(0).toUpperCase() + text.slice(1)}
              </li>
            );
          })}
        </ul>

        {/* inventario (stack) */}
        <div className="mt-6 pt-5" style={{ borderTop: `2px dashed rgba(42,15,53,.18)` }}>
          <p data-in style={{ fontFamily: FONT.pixel, fontSize: 10, color: GAME.plumSoft }}>INVENTARIO</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {item.techStack.map((t) => (
              <span
                key={t}
                data-item
                className="gx-chip inline-block rounded-[10px] px-3 py-1.5 text-[12.5px]"
                style={{ fontFamily: FONT.round, fontWeight: 600, color: GAME.plum, background: '#FFFFFF', border: `2px solid ${GAME.plum}`, boxShadow: `0 3px 0 ${GAME.plum}` }}
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      </div>
    </article>
  );
});
LevelCard.displayName = 'LevelCard';
