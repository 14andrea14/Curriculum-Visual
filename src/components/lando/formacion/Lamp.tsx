import React from 'react';

// Lámpara colgante arriba al centro del tablero. Su bombilla queda EXACTAMENTE
// en x 50 % / `bulbVh` de la pantalla (10vh), el mismo punto donde la órbita
// deja su luz fija: al relevarse se lee como una sola lámpara que se enciende.
// La línea de tiempo de Formacion.tsx anima .fm-lamp-body (aparece),
// .fm-lamp-bulb y .fm-lamp-cone (parpadeo de encendido).
// Con foto de fondo (`photo`), la foto ya trae lámpara y charco de luz: se
// ocultan pantalla, cable y cono, y queda solo el brillo de la bombilla.
// Decorativa: aria-hidden.

const BULB_CY = 93; // centro de la bombilla dentro del SVG (px)

export const Lamp: React.FC<{ className?: string; photo?: boolean; bulbVh?: number; uid?: string }> = ({
  className = '',
  photo = false,
  bulbVh = 0.1,
  uid = "",
}) => {
  const hide: React.CSSProperties | undefined = photo ? { visibility: 'hidden' } : undefined;
  return (
    <div
      aria-hidden
      className={`fm-lamp pointer-events-none absolute w-[140px] ${className}`}
      // sin transform de CSS: la línea de tiempo mueve esta capa en y durante el relevo
      style={{ left: "50%", marginLeft: -70, top: `calc(${bulbVh * 100}vh - ${BULB_CY}px)` }}
    >
      {/* cono de luz: trapecio con degradado, se ensancha hacia el tablero */}
      <div
        className="fm-lamp-cone absolute left-1/2 top-[92px] -translate-x-1/2 w-[min(1300px,130vw)] h-[92vh]"
        style={{
          clipPath: 'polygon(46.4% 0, 53.6% 0, 100% 100%, 0 100%)',
          background:
            'linear-gradient(180deg, rgba(255,214,160,0.20) 0%, rgba(255,200,140,0.08) 38%, rgba(255,190,130,0.0) 85%)',
          filter: 'blur(6px)',
          ...hide,
        }}
      />
      <svg className="fm-lamp-body relative block overflow-visible" width="140" height="104" viewBox="0 0 140 104" fill="none">
        <defs>
          <linearGradient id={`fm-shade${uid}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#0d1118" />
            <stop offset="0.45" stopColor="#2a3140" />
            <stop offset="0.6" stopColor="#3a4254" />
            <stop offset="1" stopColor="#0d1118" />
          </linearGradient>
          <radialGradient id={`fm-bulb${uid}`} cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#fff6e6" />
            <stop offset="0.5" stopColor="#ffd59a" />
            <stop offset="1" stopColor="#ffb766" stopOpacity="0" />
          </radialGradient>
        </defs>
        {/* cable + florón (el cable sube fuera del escenario) */}
        <line x1="70" y1="-400" x2="70" y2="44" stroke="#2b3240" strokeWidth="2" style={hide} />
        <rect x="64" y="40" width="12" height="10" rx="2" fill="#1b2029" style={hide} />
        {/* pantalla cónica */}
        <path d="M60 50 H80 L118 92 H22 Z" fill={`url(#fm-shade${uid})`} style={hide} />
        <path d="M22 92 H118" stroke="#4a5366" strokeWidth="1.5" strokeLinecap="round" style={hide} />
        {/* bombilla: el punto de luz que llega de la órbita */}
        <ellipse className="fm-lamp-bulb" cx="70" cy={BULB_CY} rx="22" ry="11" fill={`url(#fm-bulb${uid})`} />
      </svg>
    </div>
  );
};
