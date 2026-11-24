import React from 'react';
import { POKER } from './pokerTheme';

// Fichas de casino en CSS 3D, apoyadas en el paño con la MISMA perspectiva que la
// mesa (cámara cenital algo inclinada). Cada ficha = varias capas finas apiladas
// en Z: el canto se ve continuo y con las franjas (6 "spots" magenta con filetes
// blancos) dando la vuelta; arriba, la cara con las franjas en el borde, un aro
// en relieve y el inlay blanco hueso con "AA". Las pilas varían en altura y cada
// ficha está apenas corrida (como una pila real). Sin imágenes ni espejados.
const BODY = '#14233A';
const SPOTS = `repeating-conic-gradient(from 8deg, ${POKER.magenta} 0deg 22deg, ${POKER.paper} 22deg 25deg, ${BODY} 25deg 57deg, ${POKER.paper} 57deg 60deg)`;
const LAYERS = 5; // capas por ficha
const THICK = 0.085; // grosor de ficha / diámetro (fichas reales ≈ 3.3 mm / 39 mm)

// corrimiento pseudoaleatorio fijo de cada ficha dentro de la pila (% del diámetro)
const jitter = (seed: number, c: number) => {
  const v = Math.sin(seed * 12.9898 + c * 78.233) * 43758.5453;
  return (v - Math.floor(v) - 0.5) * 2.4;
};

export const ChipStack: React.FC<{
  count: number;
  size: number; // diámetro en px
  spin?: number; // giro sobre su eje vertical (grados)
  seed?: number;
  style?: React.CSSProperties;
}> = ({ count, size, spin = 0, seed = 1, style }) => {
  const layers: React.ReactNode[] = [];
  for (let c = 0; c < count; c++) {
    const jx = jitter(seed, c);
    const jy = jitter(seed + 7, c);
    for (let l = 0; l < LAYERS; l++) {
      const top = c === count - 1 && l === LAYERS - 1;
      const z = (c + l / LAYERS) * THICK * size;
      // canto: más oscuro abajo de cada ficha (surco entre fichas) y hacia la base de la pila
      const shade = l === 0 ? 0.62 : 0.34 - (c / Math.max(1, count)) * 0.12;
      layers.push(
        <div
          key={`${c}-${l}`}
          className="absolute inset-0 rounded-full"
          style={{
            transform: `translate3d(${jx}%, ${jy}%, ${z.toFixed(2)}px)`,
            background: top ? SPOTS : `linear-gradient(rgba(0,0,0,${shade}),rgba(0,0,0,${shade})),${SPOTS}`,
          }}
        >
          {top && (
            <>
              {/* aro en relieve */}
              <div
                className="absolute rounded-full"
                style={{ inset: '9%', background: BODY, boxShadow: 'inset 0 1.5px 0 rgba(255,255,255,.22), inset 0 -2px 3px rgba(0,0,0,.5), 0 0 0 1px rgba(0,0,0,.35)' }}
              />
              <div className="absolute rounded-full" style={{ inset: '14%', border: `1px dashed rgba(236,232,242,.55)` }} />
              {/* inlay */}
              <div
                className="absolute rounded-full flex items-center justify-center"
                style={{
                  inset: '22%',
                  background: `radial-gradient(circle at 38% 32%, #FFFFFF, ${POKER.paper} 55%, #CFC8DA)`,
                  boxShadow: `inset 0 0 0 ${Math.max(1.5, size * 0.03)}px ${POKER.magenta}, inset 0 -1px 2px rgba(0,0,0,.25)`,
                }}
              >
                <span style={{ fontFamily: 'Gloock, serif', color: POKER.ink, fontSize: size * 0.17, letterSpacing: '-0.05em', lineHeight: 1 }}>AA</span>
              </div>
              {/* brillo de la lámpara sobre la cara */}
              <div className="absolute inset-0 rounded-full" style={{ background: 'radial-gradient(circle at 35% 28%, rgba(255,240,220,.28), rgba(255,240,220,0) 55%)' }} />
            </>
          )}
        </div>,
      );
    }
  }
  return (
    <div className="absolute pointer-events-none" style={{ width: size, height: size, perspective: 1000, ...style }} aria-hidden>
      <div className="absolute inset-0" style={{ transformStyle: 'preserve-3d', transform: `rotateX(46deg) rotateZ(${spin}deg)` }}>
        {/* sombras de contacto: núcleo oscuro pegado + penumbra amplia hacia afuera de la lámpara */}
        <div className="absolute rounded-full" style={{ inset: '-28%', transform: 'translate(5%, 9%)', background: 'radial-gradient(closest-side, rgba(0,0,0,.45), rgba(0,0,0,0))' }} />
        <div className="absolute rounded-full" style={{ inset: '-3%', background: 'radial-gradient(closest-side, rgba(0,0,0,.85) 70%, rgba(0,0,0,0))' }} />
        {layers}
      </div>
    </div>
  );
};
