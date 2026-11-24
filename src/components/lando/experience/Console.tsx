import React from 'react';
import { FONT, GAME } from './utils';
import { PixelSpark, PixelStar, PuffCloud } from './PixelArt';

// ============================================================================
// Consola portátil, cartucho y carta: diseño PROPIO hecho con CSS (sin
// imágenes de marcas). Todo se mide en "u" = ancho de la consola (variable CSS
// --u en el escenario) y el tamaño de letra raíz es u/100, así que 1em = 1 % de
// u y todo escala junto en escritorio y móvil.
//
// Geometría (en u; la consola mide 1 × 1.6):
//   bisel      x .07–.93  y .07–.85
//   pantalla   x .14–.86  y .16–.72   (centro: .5, .44)  <- lo usa el zoom
//   cruceta    centro (.26, 1.13)
//   botones A/B, start/select y parlante abajo
// ============================================================================
export const CONSOLE_H = 1.6;
export const SCREEN = { x: 0.14, y: 0.16, w: 0.72, h: 0.56 };

const box = (x: number, y: number, w: number, h: number): React.CSSProperties => ({
  position: 'absolute',
  left: `${x * 100}%`,
  top: `${(y / CONSOLE_H) * 100}%`,
  width: `${w * 100}%`,
  height: `${(h / CONSOLE_H) * 100}%`,
});

const PIXEL: React.CSSProperties = { fontFamily: FONT.pixel, letterSpacing: '0.04em' };

// ---------------------------------------------------------------------------
// Pantalla de arranque (lo que se ve dentro de la consola al encenderse)
// Clases que anima BootTransition: .gx-scr-on (encendido CRT), .gx-flash,
// .gx-scr-title > span (letras), .gx-scr-press, .gx-scr-star
// ---------------------------------------------------------------------------
const BootScreen: React.FC = () => (
  <div className="absolute inset-0 overflow-hidden" style={{ background: '#140818', borderRadius: '2.2em' }}>
    <div
      className="gx-scr-on absolute inset-0 origin-center"
      style={{
        background: `linear-gradient(180deg, ${GAME.worldTop} 0%, #F6CCFF 55%, ${GAME.lilac} 100%)`,
        transform: 'scale(0, 0.01)',
      }}
    >
      <PuffCloud className="absolute" style={{ width: '38%', left: '-6%', top: '58%', opacity: 0.95 }} />
      <PuffCloud className="absolute" style={{ width: '30%', right: '-4%', top: '12%', opacity: 0.9 }} />
      <PuffCloud className="absolute" style={{ width: '22%', left: '30%', top: '78%' }} />
      <span className="gx-scr-star absolute" style={{ left: '12%', top: '14%', width: '7%' }}>
        <PixelSpark color="#FFFFFF" style={{ width: '100%' }} />
      </span>
      <span className="gx-scr-star absolute" style={{ right: '10%', top: '80%', width: '5%' }}>
        <PixelSpark color={GAME.magenta} style={{ width: '100%' }} />
      </span>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center" style={{ paddingTop: '4%' }}>
        <span className="gx-scr-star block" style={{ width: '13%' }}>
          <PixelStar color={GAME.star} style={{ width: '100%' }} />
        </span>
        <p className="gx-scr-title mt-[4%] flex" style={{ ...PIXEL, fontSize: '4.6em', color: GAME.plum, textShadow: `0.12em 0.12em 0 ${GAME.pink}` }}>
          {'EXPERIENCIA'.split('').map((c, i) => (
            <span key={i} className="inline-block">
              {c}
            </span>
          ))}
        </p>
        <p className="gx-scr-sub mt-[3%]" style={{ ...PIXEL, fontSize: '2.2em', color: GAME.magentaDeep }}>
          5 NIVELES · 2019 — HOY
        </p>
        <p className="gx-scr-press mt-[9%]" style={{ ...PIXEL, fontSize: '2.6em', color: GAME.plum }}>
          <span className="gx-blink">▶ PRESS START</span>
        </p>
      </div>
    </div>
    {/* destello blanco del encendido */}
    <div className="gx-flash absolute inset-0 bg-white pointer-events-none" style={{ opacity: 0 }} />
    {/* líneas de barrido + viñeta del vidrio */}
    <div className="absolute inset-0 gx-scan pointer-events-none" />
    <div
      className="absolute inset-0 pointer-events-none"
      style={{ boxShadow: 'inset 0 0 3em rgba(20,8,24,.55)', borderRadius: '2.2em' }}
    />
  </div>
);

export const HandheldConsole: React.FC = () => (
  <div
    className="relative"
    style={{ width: 'var(--u)', height: `calc(var(--u) * ${CONSOLE_H})`, fontSize: 'calc(var(--u) / 100)' }}
  >
    {/* carcasa: plástico "inflado", esquinas muy redondeadas y simétricas */}
    <div
      className="absolute inset-0"
      style={{
        borderRadius: '16em 16em 22em 22em / 11em 11em 15em 15em',
        background: 'linear-gradient(155deg, #FFB3E8 0%, #FF7AD9 28%, #F230D2 62%, #C21CA6 100%)',
        boxShadow:
          'inset 0 1.1em 0 rgba(255,255,255,.45), inset 0 -1.6em 0 rgba(110,0,85,.35), inset 1em 0 0 rgba(255,255,255,.12), inset -1em 0 0 rgba(110,0,85,.2), 0 4em 7em -1em rgba(0,0,0,.5)',
      }}
    />
    {/* ranura del cartucho (canal superior) */}
    <div style={{ ...box(0.12, 0.012, 0.76, 0.02), borderRadius: '1em', background: 'rgba(80,0,60,.45)' }} />

    {/* bisel + pantalla */}
    <div
      style={{
        ...box(0.07, 0.07, 0.86, 0.78),
        background: 'linear-gradient(180deg, #3A1849, #24092F)',
        borderRadius: '6em',
        boxShadow: 'inset 0 0.5em 0 rgba(255,255,255,.08), inset 0 -0.6em 0 rgba(0,0,0,.35)',
      }}
    >
      {/* destellos de píxel en las esquinas del bisel */}
      <PixelSpark color={GAME.pink} className="absolute" style={{ width: '4.5%', left: '4%', top: '3.5%' }} />
      <PixelSpark color={GAME.lilac} className="absolute" style={{ width: '4.5%', right: '4%', top: '3.5%' }} />
    </div>
    {/* LED de encendido */}
    <div style={{ ...box(0.085, 0.38, 0.04, 0.04) }}>
      <span className="absolute inset-0 rounded-full" style={{ background: '#4A1F55' }} />
      <span
        className="gx-led absolute inset-0 rounded-full"
        style={{ background: '#FF5FE0', boxShadow: '0 0 1.2em 0.4em rgba(255,95,224,.9)', opacity: 0 }}
      />
      <span className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap" style={{ ...PIXEL, top: '130%', fontSize: '1.3em', color: 'rgba(255,255,255,.45)' }}>
        POWER
      </span>
    </div>
    <div style={{ ...box(SCREEN.x, SCREEN.y, SCREEN.w, SCREEN.h) }}>
      <BootScreen />
    </div>
    {/* marca propia bajo la pantalla */}
    <p
      className="absolute text-center"
      style={{ left: 0, right: 0, top: `${(0.755 / CONSOLE_H) * 100}%`, ...PIXEL, fontSize: '2.4em', color: 'rgba(255,255,255,.7)' }}
    >
      AA<span style={{ color: GAME.pink }}>·</span>
      <span style={{ fontFamily: FONT.puffy, letterSpacing: 0, fontSize: '1.5em', color: '#FFFFFF' }}>pocket</span>
    </p>

    {/* cruceta (cruz redondeada) */}
    <div style={{ ...box(0.11, 0.98, 0.27, 0.27) }}>
      <div className="absolute rounded-[2em]" style={{ left: '34%', top: 0, width: '32%', height: '100%', background: GAME.plum, boxShadow: '0 0.9em 0 #12051A' }} />
      <div className="absolute rounded-[2em]" style={{ top: '34%', left: 0, height: '32%', width: '100%', background: GAME.plum, boxShadow: '0 0.9em 0 #12051A' }} />
      <div className="absolute rounded-full" style={{ left: '40%', top: '40%', width: '20%', height: '20%', background: '#45204F' }} />
    </div>
    {/* botones A / B: en fila, con la letra impresa */}
    {[
      { k: 'B', x: 0.54 },
      { k: 'A', x: 0.74 },
    ].map((b) => (
      <div key={b.k} className={b.k === 'A' ? 'gx-btn-a' : undefined} style={{ ...box(b.x, 1.04, 0.16, 0.16) }}>
        <span
          className="absolute inset-0 rounded-full flex items-center justify-center"
          style={{
            background: b.k === 'A' ? 'radial-gradient(circle at 35% 30%, #FFE27A, #F2B705 75%)' : 'radial-gradient(circle at 35% 30%, #D8C8FF, #9C84E8 75%)',
            boxShadow: `inset 0 0.6em 0 rgba(255,255,255,.35), 0 0.9em 0 ${b.k === 'A' ? '#A8780A' : '#5E4BA6'}`,
            ...PIXEL,
            fontSize: '3.4em',
            color: GAME.plum,
          }}
        >
          {b.k}
        </span>
      </div>
    ))}
    {/* select / start (horizontales) */}
    {[0.3, 0.56].map((x, i) => (
      <div key={x} style={{ ...box(x, 1.33, 0.14, 0.036) }}>
        <span className="absolute inset-0 rounded-full" style={{ background: '#7A2A86', boxShadow: '0 0.5em 0 #4A1356' }} />
        <span className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap" style={{ ...PIXEL, top: '180%', fontSize: '1.3em', color: 'rgba(42,15,53,.6)' }}>
          {i ? 'START' : 'SELECT'}
        </span>
      </div>
    ))}
    {/* parlante: grilla de puntos */}
    <div style={{ ...box(0.72, 1.36, 0.18, 0.12) }} className="grid grid-cols-5 grid-rows-3 place-items-center">
      {Array.from({ length: 15 }, (_, i) => (
        <span key={i} className="block rounded-full" style={{ width: '1.8em', height: '1.8em', background: 'rgba(80,0,60,.45)', boxShadow: 'inset 0 0.4em 0 rgba(0,0,0,.25)' }} />
      ))}
    </div>
    {/* estrella en relieve */}
    <PixelStar color="rgba(255,255,255,.35)" shade="rgba(110,0,85,.3)" className="absolute" style={{ width: '9%', left: '13%', top: `${(1.38 / CONSOLE_H) * 100}%` }} />
  </div>
);

// ---------------------------------------------------------------------------
// Cartucho (cara trasera de la carta que se voltea). Medidas en u: .8 × .9
// ---------------------------------------------------------------------------
export const Cartridge: React.FC<{ total: number; firstYear: number }> = ({ total, firstYear }) => (
  <div
    className="absolute inset-0"
    style={{
      fontSize: 'calc(var(--u) / 100)',
      borderRadius: '6em 6em 4em 4em',
      background: 'linear-gradient(160deg, #FCE3F4 0%, #F2BFE4 55%, #D98ACB 100%)',
    }}
  >
    {/* estrías de agarre */}
    <div className="absolute flex flex-col gap-[1.1em]" style={{ left: '8%', right: '16%', top: '3.5%' }}>
      {[0, 1, 2].map((i) => (
        <span key={i} className="block h-[0.9em] rounded-full" style={{ background: 'rgba(120,20,100,.22)', boxShadow: '0 0.35em 0 rgba(255,255,255,.6)' }} />
      ))}
    </div>
    {/* etiqueta */}
    <div
      className="absolute overflow-hidden"
      style={{
        left: '9%',
        right: '9%',
        top: '20%',
        bottom: '13%',
        borderRadius: '3em',
        background: `linear-gradient(180deg, ${GAME.magenta} 0%, #FF73D6 45%, ${GAME.blush} 100%)`,
        boxShadow: 'inset 0 0 0 0.9em #FFFFFF, inset 0 0 0 1.3em rgba(42,15,53,.25)',
      }}
    >
      <div className="absolute inset-0 gx-checker" style={{ backgroundSize: '7em 7em', opacity: 0.8 }} />
      <PuffCloud className="absolute" style={{ width: '58%', left: '-12%', bottom: '-4%' }} />
      <PuffCloud className="absolute" style={{ width: '48%', right: '-10%', bottom: '6%' }} />
      <PixelStar color={GAME.star} className="absolute" style={{ width: '26%', left: '37%', top: '12%', transform: 'rotate(-8deg)' }} />
      <PixelSpark className="absolute" style={{ width: '9%', left: '16%', top: '18%' }} />
      <PixelSpark className="absolute" style={{ width: '7%', right: '17%', top: '30%' }} />
      <p className="absolute left-0 right-0 text-center" style={{ top: '45%', fontFamily: FONT.puffy, fontSize: '10.5em', lineHeight: 1, color: '#FFFFFF', textShadow: `0 0.06em 0 ${GAME.magentaDeep}, 0 0.12em 0 ${GAME.plum}` }}>
        AA
      </p>
      <p className="absolute left-0 right-0 text-center" style={{ bottom: '9%', ...PIXEL, fontSize: '2.7em', color: GAME.plum }}>
        EXPERIENCIA
      </p>
    </div>
    <p className="absolute left-0 right-0 text-center" style={{ bottom: '4%', ...PIXEL, fontSize: '1.7em', color: 'rgba(42,15,53,.55)' }}>
      {String(total).padStart(2, '0')} NIVELES · {firstYear}
    </p>
  </div>
);

// Dorso de carta (el mismo arte de la mesa de póker) — cara frontal del volteo
export const CardBackFace: React.FC = () => (
  <div
    className="absolute inset-0 overflow-hidden"
    style={{
      borderRadius: '6%/4.3%',
      background: '#ECE8F2',
      padding: '3.5%',
      boxShadow: '0 2em 4em -1em rgba(0,0,0,.6)',
    }}
  >
    <img decoding="async" src="/poker/card-back.webp" alt="" className="w-full h-full object-cover select-none" style={{ borderRadius: '4%/2.9%' }} draggable={false} />
  </div>
);
