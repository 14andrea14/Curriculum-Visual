import React, { useId, useLayoutEffect, useRef, useState } from 'react';

// Palabra en "burbuja de vidrio" (glassmorphism) — pedido explícito: letras
// burbuja, de vidrio, que llenen su espacio a cada lado de la figura.
//
// Vidrio de verdad, no simulado: un <div> con backdrop-filter (desenfoque +
// saturación de lo que hay detrás: aurora y cuadrícula del fondo) recortado
// con un clipPath SVG que contiene el TEXTO (los clipPath SVG en línea sí usan
// las fuentes web del documento). Encima, un SVG con los detalles de burbuja:
// resplandor interior en los bordes, filo de luz y brillos especulares.
// La palabra se estira para llenar exactamente la caja del contenedor.
//
// OJO: backdrop-filter solo "ve" lo que está detrás si ningún ancestro crea
// una raíz de backdrop (opacity < 1, filter, mask...). El contenedor que la
// anima debe quedar sin filter/opacity al terminar su entrada.

const FONT: React.CSSProperties = {
  fontFamily: 'Fredoka, "Baloo 2", system-ui, sans-serif',
  fontWeight: 700,
  fontSize: 200,
  // sin espaciado negativo: letras superpuestas dejaban una marca más clara
  // en la unión (dos capas de vidrio una sobre otra)
  letterSpacing: '2px',
};

export const GlassWord: React.FC<{ word: string; className?: string }> = ({ word, className = '' }) => {
  const id = useId().replace(/:/g, '');
  const boxRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<SVGTextElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [bb, setBb] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setBox((p) => (p.w === r.width && p.h === r.height ? p : { w: r.width, h: r.height }));
    });
    ro.observe(el);
    const measure = () => {
      const t = measureRef.current;
      if (!t) return;
      const b = t.getBBox();
      // recorte vertical del espacio vacío sobre las mayúsculas
      if (b.width > 0) setBb({ x: b.x, y: b.y + b.height * 0.17, w: b.width, h: b.height * 0.83 });
    };
    measure();
    document.fonts?.ready?.then(measure);
    return () => ro.disconnect();
  }, [word]);

  const ready = bb && box.w > 0;
  const sx = ready ? box.w / bb!.w : 1;
  const sy = ready ? box.h / bb!.h : 1;
  const tf = ready ? `translate(${-bb!.x * sx} ${-bb!.y * sy}) scale(${sx} ${sy})` : undefined;

  return (
    <div ref={boxRef} className={`relative ${className}`}>
      {/* medición (invisible) */}
      <svg width="0" height="0" className="absolute" aria-hidden="true">
        <text ref={measureRef} x="0" y="182" style={FONT}>
          {word}
        </text>
      </svg>

      {ready && (
        <>
          <svg width="0" height="0" className="absolute" aria-hidden="true">
            <defs>
              <clipPath id={`clip${id}`} clipPathUnits="userSpaceOnUse">
                <text x="0" y="182" style={FONT} transform={tf}>
                  {word}
                </text>
              </clipPath>
            </defs>
          </svg>

          {/* el vidrio: desenfoca y satura lo de atrás, con tinte suave */}
          <div
            className="absolute inset-0"
            style={{
              clipPath: `url(#clip${id})`,
              WebkitClipPath: `url(#clip${id})`,
              backdropFilter: 'blur(14px) saturate(190%) brightness(1.25)',
              WebkitBackdropFilter: 'blur(14px) saturate(190%) brightness(1.25)',
              background:
                'linear-gradient(165deg, rgba(255,255,255,0.20) 0%, rgba(255,140,200,0.10) 35%, rgba(242,48,210,0.12) 65%, rgba(12,219,242,0.16) 100%)',
            }}
          />

          {/* detalles de burbuja */}
          <svg
            className="absolute inset-0 overflow-visible"
            width={box.w}
            height={box.h}
            aria-label={word}
            style={{ filter: 'drop-shadow(0 0 18px rgba(242,48,210,0.35))' }}
          >
            <defs>
              <clipPath id={`in${id}`}>
                <text x="0" y="182" style={FONT}>
                  {word}
                </text>
              </clipPath>
              <filter id={`soft${id}`} x="-10%" y="-10%" width="120%" height="120%">
                <feGaussianBlur stdDeviation="7" />
              </filter>
              <filter id={`spec${id}`} x="-5%" y="-10%" width="110%" height="120%" colorInterpolationFilters="sRGB">
                <feGaussianBlur in="SourceAlpha" stdDeviation="9" result="h" />
                <feSpecularLighting in="h" surfaceScale="7" specularConstant="1.4" specularExponent="34" lightingColor="#FFFFFF" result="s">
                  <fePointLight x="120" y="-140" z="240" />
                </feSpecularLighting>
                <feComposite in="s" in2="SourceAlpha" operator="in" />
              </filter>
              <linearGradient id={`rim${id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.95" />
                <stop offset="0.6" stopColor="#FFD0EC" stopOpacity="0.55" />
                <stop offset="1" stopColor="#0CDBF2" stopOpacity="0.8" />
              </linearGradient>
            </defs>
            <g transform={tf}>
              {/* resplandor interior: trazo grueso desenfocado, recortado adentro */}
              <g clipPath={`url(#in${id})`}>
                <text
                  x="0"
                  y="182"
                  style={FONT}
                  fill="none"
                  stroke="rgba(255,255,255,0.75)"
                  strokeWidth="16"
                  filter={`url(#soft${id})`}
                >
                  {word}
                </text>
              </g>
              {/* brillos especulares de burbuja */}
              <text x="0" y="182" style={FONT} fill="#fff" filter={`url(#spec${id})`} opacity="0.85">
                {word}
              </text>
              {/* filo de luz del contorno */}
              <text
                x="0"
                y="182"
                style={FONT}
                fill="none"
                stroke={`url(#rim${id})`}
                strokeWidth="2.2"
                vectorEffect="non-scaling-stroke"
              >
                {word}
              </text>
            </g>
          </svg>
        </>
      )}
    </div>
  );
};
