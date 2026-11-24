import React, { useState } from 'react';
import { ORBIT, ORBIT_COLORS } from './orbitData';

// Versión móvil: órbita 2D en SVG (sin WebGL) + acordeón de categorías.
// Truco del SVG: cada anillo es un CÍRCULO que gira dentro de un grupo aplastado
// en Y (scale 1, 0.42) → los nodos recorren una elipse, como en la versión 3D.
// La órbita abierta en el acordeón se enciende (anillo, camino y nodos).

const SQUASH = 0.42;
const RADII = [70, 102, 134, 166];
const TILT = [-18, 10, -6, 16];
const DUR = [70, 95, 120, 150];
const pad = (n: number) => String(n).padStart(2, '0');

export const OrbitMobileSvg: React.FC<{ reduced?: boolean; openCat?: number }> = ({ reduced = false, openCat = 0 }) => {
  const { accent, white } = ORBIT_COLORS;

  return (
    <svg viewBox="0 0 400 300" className="w-full h-auto max-h-[28vh] mx-auto" aria-hidden>
      <defs>
        <radialGradient id="orbit-core" cx="50%" cy="45%" r="55%">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.95" />
          <stop offset="35%" stopColor={accent} />
          <stop offset="100%" stopColor="#4a0d44" />
        </radialGradient>
        <radialGradient id="orbit-halo">
          <stop offset="0%" stopColor={accent} stopOpacity="0.55" />
          <stop offset="100%" stopColor={accent} stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="200" cy="150" r="70" fill="url(#orbit-halo)" />
      {ORBIT.cats.map((c, ci) => {
        const on = openCat === ci;
        const R = RADII[ci];
        const n = c.techs.length;
        return (
          <g key={c.tag} transform={`translate(200 150) rotate(${TILT[ci]}) scale(1 ${SQUASH})`}>
            <g className="orbit-m-ring" style={{ ['--orbit-dur' as string]: `${DUR[ci]}s`, animationDirection: ci % 2 ? 'reverse' : 'normal' }}>
              <circle r={R} fill="none" stroke={on ? accent : white} strokeOpacity={on ? 0.9 : 0.18} strokeWidth={on ? 1.6 : 1} vectorEffect="non-scaling-stroke" />
              {/* camino núcleo → categoría */}
              <line
                x1={26}
                y1={0}
                x2={R}
                y2={0}
                stroke={accent}
                strokeOpacity={on ? 1 : 0.25}
                strokeWidth={on ? 1.6 : 1}
                vectorEffect="non-scaling-stroke"
              />
              <circle cx={R} cy={0} r={on ? 6 : 4.5} fill={accent} />
              {c.techs.map((t, j) => {
                const a = ((j + 1) * Math.PI * 2) / (n + 1);
                return <circle key={t.id} cx={Math.cos(a) * R} cy={Math.sin(a) * R} r={on ? 4 : 3} fill={white} fillOpacity={on ? 1 : 0.45} />;
              })}
              {/* cometa en la órbita abierta */}
              {on && !reduced && (
                <g className="orbit-m-ring" style={{ ['--orbit-dur' as string]: '7s' }}>
                  <circle cx={R} cy={0} r={5} fill="#fff" />
                  <circle cx={R} cy={0} r={12} fill="url(#orbit-halo)" />
                </g>
              )}
            </g>
          </g>
        );
      })}
      <circle cx="200" cy="150" r="24" fill="url(#orbit-core)" />
    </svg>
  );
};

export const OrbitMobileAccordion: React.FC<{
  openCat: number;
  setOpenCat: React.Dispatch<React.SetStateAction<number>>;
}> = ({ openCat, setOpenCat }) => {
  return (
    <ul className="w-full flex flex-col gap-1.5 pointer-events-auto">
      {ORBIT.cats.map((c, ci) => {
        const on = openCat === ci;
        return (
          <li key={c.tag} className="border-t border-[#ECE8F2]/15 pt-1">
            <button
              type="button"
              aria-expanded={on}
              aria-controls={`orbit-panel-${ci}`}
              onClick={() => setOpenCat((prev) => (prev === ci ? -1 : ci))}
              className={`w-full grid grid-cols-[1.8rem_1fr_auto] items-center gap-2 py-1.5 px-3 rounded-xl transition-all duration-300 text-left cursor-pointer ${
                on
                  ? 'bg-[#F230D2]/20 border border-[#F230D2]/60 shadow-[0_0_16px_rgba(242,48,210,0.3)]'
                  : 'bg-white/[0.04] border border-white/10 hover:bg-white/[0.08]'
              }`}
            >
              <span className={`font-mono text-[11px] font-bold ${on ? 'text-[#F230D2]' : 'text-[#ECE8F2]/50'}`}>
                {pad(ci + 1)}
              </span>
              <span className={`font-poster uppercase text-[1.1rem] sm:text-[1.25rem] leading-none ${on ? 'text-white' : 'text-[#ECE8F2]/90'}`}>
                {c.title}
              </span>
              <span className={`font-mono text-[11px] font-bold ${on ? 'text-[#F230D2]' : 'text-[#ECE8F2]/50'}`}>
                {pad(c.techs.length)} {on ? '−' : '+'}
              </span>
            </button>
            {on && (
              <div id={`orbit-panel-${ci}`} className="py-2.5 px-3">
                <ul className="flex flex-wrap gap-1.5">
                  {c.techs.map((t) => (
                    <li
                      key={t.id}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 border border-[#F230D2]/30 font-mono text-[10.5px] uppercase tracking-[0.04em] text-[#ECE8F2]"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-[#F230D2] shadow-[0_0_6px_#F230D2]" />
                      {t.name}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
};

export const OrbitMobile: React.FC<{ reduced: boolean }> = ({ reduced }) => {
  const [open, setOpen] = useState<number>(0);

  return (
    <div>
      <OrbitMobileSvg reduced={reduced} openCat={open} />
      <OrbitMobileAccordion openCat={open} setOpenCat={setOpen} />
    </div>
  );
};
