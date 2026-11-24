import React from 'react';
import { PORTFOLIO_DATA } from '../../../data/portfolioData';

// Notas adhesivas (post-its) del tablero de Formación. TODO el contenido sale
// de portfolioData.ts (education, certifications, awards); aquí solo se decide
// el orden y la maqueta de cada nota. Sin numeración: es un tablero, no una
// secuencia. Todos los tamaños de texto van en `em`, así la misma nota se ve
// completa en el tablero y, al hacer zoom, crece en bloque (misma maqueta).
// Estética: oficina ordenada — papel pálido (crema, rosa, tinte magenta),
// encabezado manuscrito (Caveat) con trazo de rotulador magenta y cuerpo en
// tipografía limpia color tinta.

export const INK = '#0A1A2B';
export const BONE = '#ECE8F2';
export const ACCENT = '#F230D2';
/** tono del escritorio / tablero (fondo de la sección) */
export const DESK = '#12161F';

export type SlideDef = {
  id: string;
  /** etiqueta corta para aria-label */
  label: string;
  /** color del papel */
  paper: string;
  body: React.ReactNode;
};

const inkA = (a: number) => `rgba(10,26,43,${a})`;

// Cabecera: rubro (mono, discreto) y dato a la derecha.
const Meta: React.FC<{ kind: string; right?: string }> = ({ kind, right }) => (
  <div className="flex items-start justify-between gap-3 font-mono uppercase text-[0.72em] tracking-[0.18em]" style={{ color: inkA(0.55) }}>
    <span className="whitespace-nowrap" style={{ color: INK }}>
      {kind}
    </span>
    {right && <span className="text-right max-w-[58%]">{right}</span>}
  </div>
);

// Encabezado manuscrito con trazo de rotulador magenta por debajo.
const Hand: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="fm-hand mt-[0.5em] text-[2em] leading-none">
    <span className="relative inline-block" style={{ color: INK }}>
      <span
        aria-hidden
        className="absolute left-[-4%] right-[-6%] bottom-[0.02em] h-[0.42em] rounded-[40%_60%_50%_45%]"
        style={{ background: ACCENT, opacity: 0.32, transform: 'rotate(-1.2deg)' }}
      />
      <span className="relative">{children}</span>
    </span>
  </div>
);

const TITLE = 'fm-sans uppercase leading-[0.92] text-[2.15em] mt-[0.55em]';
const Rule: React.FC<{ children: React.ReactNode; a?: number }> = ({ children, a = 0.66 }) => (
  <div className="mt-[0.9em] pt-[0.7em] border-t text-[0.95em] leading-relaxed" style={{ borderColor: inkA(0.16), color: inkA(a) }}>
    {children}
  </div>
);

export function buildSlides(): SlideDef[] {
  const { education, certifications, awards } = PORTFOLIO_DATA;
  const [grado, bachiller] = education;
  const award = awards[0];
  const slides: SlideDef[] = [];

  // Ingeniería (el título principal)
  if (grado) {
    slides.push({
      id: 'grado',
      label: grado.degree,
      paper: '#F3EEE3',
      body: (
        <div className="relative flex flex-col" style={{ color: INK }}>
          <Meta kind="Grado" right={grado.location} />
          <Hand>{grado.year}</Hand>
          <h3 className={TITLE}>{grado.degree}</h3>
          <p className="fm-serif mt-[0.6em] text-[1.08em] leading-snug" style={{ color: inkA(0.82) }}>
            {grado.institution}
          </p>
          <Rule>{grado.focus}</Rule>
        </div>
      ),
    });
  }

  // Distinción (papel con tinte magenta)
  if (award) {
    const [puesto, ...resto] = award.title.split('·').map((s) => s.trim());
    slides.push({
      id: 'premio',
      label: award.event,
      paper: '#F6C4E3',
      body: (
        <>
          <span
            aria-hidden
            className="fm-sans absolute -right-[2%] -bottom-[16%] leading-none select-none pointer-events-none text-[11em]"
            style={{ color: inkA(0.07) }}
          >
            1°
          </span>
          <div className="relative flex flex-col" style={{ color: INK }}>
            <Meta kind="Distinción" right={award.event} />
            <Hand>¡Primer lugar! ★</Hand>
            <h3 className={TITLE}>{puesto}</h3>
            {resto.length > 0 && (
              <p className="fm-serif mt-[0.6em] text-[1.12em] leading-snug">{resto.join(' · ')}</p>
            )}
            <Rule a={0.72}>{award.project}</Rule>
          </div>
        </>
      ),
    });
  }

  // Certificaciones (lista tipo checklist)
  if (certifications.length) {
    slides.push({
      id: 'certificaciones',
      label: 'Certificaciones',
      paper: '#F8E1EC',
      body: (
        <div className="relative flex flex-col" style={{ color: INK }}>
          <Meta kind="Certificaciones" right={`${certifications.length} cursos`} />
          <Hand>Cursos completados</Hand>
          <ul className="mt-[0.7em]">
            {certifications.map((c) => (
              <li key={c.title} className="border-t py-[0.5em] flex gap-[0.6em]" style={{ borderColor: inkA(0.16) }}>
                {/* casilla marcada a mano */}
                <svg aria-hidden className="shrink-0 mt-[0.1em] w-[1.05em] h-[1.05em]" viewBox="0 0 16 16" fill="none">
                  <rect x="1.5" y="1.5" width="13" height="13" rx="2" stroke={inkA(0.55)} strokeWidth="1.3" />
                  <path d="M4 8.5l2.6 2.6L12.5 4.5" stroke={ACCENT} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="min-w-0">
                  <span className="block fm-sans uppercase text-[0.98em] leading-tight">{c.title}</span>
                  <span className="block text-[0.86em] leading-snug mt-[0.15em]" style={{ color: inkA(0.62) }}>
                    {c.detail}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ),
    });
  }

  // Bachillerato
  if (bachiller) {
    slides.push({
      id: 'bachiller',
      label: bachiller.degree,
      paper: '#EEEAF3',
      body: (
        <>
          <span
            aria-hidden
            className="fm-sans absolute -right-[2%] -bottom-[10%] leading-none select-none pointer-events-none text-[8em]"
            style={{ color: 'transparent', WebkitTextStroke: `1px ${inkA(0.14)}` }}
          >
            {bachiller.year}
          </span>
          <div className="relative flex flex-col" style={{ color: INK }}>
            <Meta kind="Bachillerato" right={bachiller.location} />
            <Hand>Promoción {bachiller.year}</Hand>
            <h3 className={TITLE}>{bachiller.degree}</h3>
            <p className="fm-serif mt-[0.6em] text-[1.08em]" style={{ color: inkA(0.82) }}>
              {bachiller.institution}
            </p>
            <Rule>{bachiller.focus}</Rule>
          </div>
        </>
      ),
    });
  }

  return slides;
}
