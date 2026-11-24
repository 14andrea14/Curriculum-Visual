import React, { useLayoutEffect, useRef, useState } from 'react';

// Una línea de texto en VIDRIO esmerilado (para el titular de la escena final).
// Misma técnica que el nombre gigante del pie: un bloque con backdrop-filter
// (clase .ft-glass) recortado con la forma de las letras mediante un <clipPath> SVG
// con <text>; encima, el texto HTML solo dibuja el borde blanco, el brillo especular
// y el destello que barre (clase .ft-gl-txt, variable --sx).
// La posición y la tipografía del <text> SVG se MIDEN del texto HTML (offsetLeft y
// línea base), así el recorte coincide con las letras en cualquier tamaño.

type Meas = { x: number; y: number; family: string; size: string; weight: string; style: string; spacing: string; upper: boolean };

export const GlassLine: React.FC<{ id: string; text: string; kind: 'caps' | 'serif' }> = ({ id, text, kind }) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const txtRef = useRef<HTMLSpanElement>(null);
  const baseRef = useRef<HTMLSpanElement>(null);
  const [m, setM] = useState<Meas | null>(null);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    const txt = txtRef.current;
    const base = baseRef.current;
    if (!wrap || !txt || !base) return;
    const measure = () => {
      const cs = getComputedStyle(txt);
      const next: Meas = {
        x: txt.offsetLeft,
        y: base.offsetTop,
        family: cs.fontFamily,
        size: cs.fontSize,
        weight: cs.fontWeight,
        style: cs.fontStyle,
        spacing: cs.letterSpacing,
        upper: cs.textTransform === 'uppercase',
      };
      setM((p) => (p && p.x === next.x && p.y === next.y && p.size === next.size && p.family === next.family ? p : next));
    };
    measure();
    document.fonts?.ready.then(measure);
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  const clipUrl = `url(#${id})`;
  return (
    <div ref={wrapRef} className={`ft-hl-line ft-hl-${kind}`}>
      {m && (
        <svg aria-hidden width="0" height="0" className="absolute">
          <defs>
            <clipPath id={id} clipPathUnits="userSpaceOnUse">
              <text
                x={m.x}
                y={m.y}
                style={{
                  fontFamily: m.family,
                  fontSize: m.size,
                  fontWeight: m.weight,
                  fontStyle: m.style,
                  letterSpacing: m.spacing,
                }}
              >
                {m.upper ? text.toUpperCase() : text}
              </text>
            </clipPath>
          </defs>
        </svg>
      )}
      <div aria-hidden className="ft-glass" style={{ top: 0, width: '100%', height: '100%', clipPath: clipUrl, WebkitClipPath: clipUrl }} />
      <span ref={txtRef} aria-hidden className="ft-gl-txt">
        <span ref={baseRef} className="inline-block w-0 h-0" />
        {text}
      </span>
    </div>
  );
};
