import React, { useMemo } from 'react';

// Piezas compartidas del rediseño "estilo landonorris.com" (ver
// docs/landonorris-DESIGN.md): motivo gráfico único (aquí, pistas de circuito en
// vez de curvas de nivel), tarjetas de esquina recortada y franja marquee.

// ---------- Pistas de circuito (el "motivo topográfico" de este sitio) ----------
function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Trazos ortogonales con quiebres a 45° y almohadillas (pads) en los extremos,
// como las pistas de una placa. Determinista por `seed`.
function buildTraces(seed: number, count: number) {
  const rnd = mulberry32(seed);
  const G = 40;
  const W = 1600;
  const H = 1000;
  const paths: { d: string; pad: [number, number] }[] = [];
  for (let i = 0; i < count; i++) {
    let x = Math.round((rnd() * W) / G) * G;
    let y = Math.round((rnd() * H) / G) * G;
    let d = `M${x} ${y}`;
    let horizontal = rnd() > 0.5;
    const segs = 3 + Math.floor(rnd() * 4);
    for (let s = 0; s < segs; s++) {
      const len = (2 + Math.floor(rnd() * 8)) * G * (rnd() > 0.5 ? 1 : -1);
      if (horizontal) x += len;
      else y += len;
      if (rnd() > 0.55) {
        // quiebre a 45°
        const dd = (1 + Math.floor(rnd() * 3)) * G * (rnd() > 0.5 ? 1 : -1);
        x += dd;
        y += dd * (rnd() > 0.5 ? 1 : -1);
      }
      d += ` L${x} ${y}`;
      horizontal = !horizontal;
    }
    paths.push({ d, pad: [x, y] });
  }
  return paths;
}

export const CircuitBg: React.FC<{
  seed?: number;
  count?: number;
  stroke?: string;
  opacity?: number;
  className?: string;
}> = ({ seed = 7, count = 26, stroke = '#0CDBF2', opacity = 0.14, className = '' }) => {
  const traces = useMemo(() => buildTraces(seed, count), [seed, count]);
  return (
    <svg
      aria-hidden
      className={`absolute inset-0 w-full h-full pointer-events-none ${className}`}
      viewBox="0 0 1600 1000"
      preserveAspectRatio="xMidYMid slice"
      style={{ opacity }}
    >
      {traces.map((t, i) => (
        <g key={i} fill="none" stroke={stroke} strokeWidth={1.2} vectorEffect="non-scaling-stroke">
          <path d={t.d} vectorEffect="non-scaling-stroke" />
          <circle cx={t.pad[0]} cy={t.pad[1]} r={6} vectorEffect="non-scaling-stroke" />
        </g>
      ))}
    </svg>
  );
};

// ---------- Tarjeta de esquina recortada ----------
const poly = (c: number) => `polygon(0 0, calc(100% - ${c}px) 0, 100% ${c}px, 100% 100%, 0 100%)`;

export const CutCard: React.FC<{
  cut?: number;
  border?: string;
  bg?: string;
  className?: string;
  innerClassName?: string;
  children: React.ReactNode;
}> = ({ cut = 44, border = 'rgba(255,255,255,0.2)', bg = '#0A1A2B', className = '', innerClassName = '', children }) => (
  <div className={className} style={{ clipPath: poly(cut), background: border }}>
    <div className={innerClassName} style={{ clipPath: poly(cut - 1), margin: 1, background: bg, height: 'calc(100% - 2px)' }}>
      {children}
    </div>
  </div>
);

// ---------- Marquee ----------
export const Marquee: React.FC<{
  items: string[];
  className?: string;
  itemClassName?: string;
  separator?: string;
  seconds?: number;
}> = ({ items, className = '', itemClassName = '', separator = '✦', seconds = 38 }) => {
  const row = (
    <div className="flex shrink-0 items-center">
      {items.map((t, i) => (
        <React.Fragment key={i}>
          <span className={`whitespace-nowrap px-[2.2vw] ${itemClassName}`}>{t}</span>
          <span aria-hidden className="px-[0.6vw] text-neo-rose">
            {separator}
          </span>
        </React.Fragment>
      ))}
    </div>
  );
  return (
    <div className={`overflow-hidden ${className}`} aria-hidden>
      <div className="flex w-max" style={{ animation: `marquee-x ${seconds}s linear infinite` }}>
        {row}
        {row}
      </div>
    </div>
  );
};

// Palabra clave en serif itálica (el "serif de acento" de la referencia)
export const Key: React.FC<{ color?: string; children: React.ReactNode }> = ({ color = '#F2075D', children }) => (
  <span className="font-serifItalic italic font-semibold normal-case tracking-normal" style={{ color }}>
    {children}
  </span>
);
