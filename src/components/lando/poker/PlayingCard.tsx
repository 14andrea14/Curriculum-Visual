import React, { useRef } from 'react';
import type { ProjectItem } from '../../../data/portfolioData';
import { POKER, POKER_ASSETS, SUIT } from './pokerTheme';

// Capas de cada carta (de afuera hacia adentro). Cada capa la mueve UN solo dueño
// para que GSAP y CSS nunca se pisen el mismo transform:
//   .pk-slot   → lugar fijo en la mesa (no se transforma: sirve para medir)
//   .pk-deal   → GSAP: vuelo desde el mazo (x, y, giro, escala)
//   .pk-hover  → CSS: inclinación al pasar el mouse (variables --rx/--ry/--lift)
//   .pk-idle   → CSS: invitación a hacer clic (meneo + brillo) cuando la mano está boca arriba
//   .pk-flip   → GSAP: volteo rotateY 0 → 180 con perspectiva real
//   .pk-face   → dorso y cara (backface-visibility: hidden)
export const POKER_CSS = `
.pk-slot{position:relative;width:var(--cw);aspect-ratio:5/7;flex:none;transform-style:preserve-3d}
.pk-deal,.pk-hover,.pk-idle,.pk-flip{position:absolute;inset:0;transform-style:preserve-3d}
/* invitación a hacer clic: solo cuando la sección tiene .pk-ready (mano boca arriba) */
.pk-idle::before{content:'';position:absolute;inset:-3%;border-radius:7%/5%;box-shadow:0 0 0 1px rgba(242,48,210,.55),0 0 28px 4px rgba(242,48,210,.35);opacity:0;transition:opacity .4s}
.pk-ready .pk-idle{animation:pk-wiggle 5.5s ease-in-out infinite;animation-delay:calc(var(--i,0) * .9s)}
.pk-ready .pk-idle::before{animation:pk-glow 5.5s ease-in-out infinite;animation-delay:calc(var(--i,0) * .9s)}
.pk-hover:hover .pk-idle{animation:none}
.pk-hover:hover .pk-idle::before{animation:none;opacity:1}
@keyframes pk-wiggle{0%,82%,100%{transform:none}86%{transform:rotate(-1.6deg) translateY(-4px)}90%{transform:rotate(1.4deg) translateY(-4px)}94%{transform:rotate(-.6deg)}}
@keyframes pk-glow{0%,78%,100%{opacity:0}86%,92%{opacity:1}}
@keyframes pk-pulse{0%,100%{opacity:.55;transform:translateY(0)}50%{opacity:1;transform:translateY(-3px)}}
@keyframes pk-tap{0%,60%,100%{transform:translateY(0) scale(1)}70%{transform:translateY(3px) scale(.9)}80%{transform:translateY(0) scale(1)}}
.pk-pulse{animation:pk-pulse 2.2s ease-in-out infinite}
.pk-tap{animation:pk-tap 2.2s ease-in-out infinite;display:inline-block}
@media (prefers-reduced-motion: reduce){.pk-ready .pk-idle,.pk-ready .pk-idle::before,.pk-pulse,.pk-tap{animation:none}}
.pk-hover{transform:translateY(var(--lift,0px)) rotateX(var(--rx,0deg)) rotateY(var(--ry,0deg));transition:transform .5s cubic-bezier(.2,.8,.2,1);cursor:pointer;outline:none}
.pk-hover:focus-visible .pk-face{box-shadow:0 0 0 2px ${POKER.magenta},0 18px 40px -12px rgba(0,0,0,.8)}
.pk-flip.pk-up{transform:rotateY(180deg)}
.pk-hidden{opacity:0;visibility:hidden}
.pk-face{position:absolute;inset:0;backface-visibility:hidden;-webkit-backface-visibility:hidden;border-radius:6%/4.3%;overflow:hidden;container-type:inline-size;
  box-shadow:0 1px 0 rgba(255,255,255,.5) inset,0 16px 30px -12px rgba(0,0,0,.75),0 3px 6px rgba(0,0,0,.4)}
.pk-front{transform:rotateY(180deg)}
.pk-back{background:${POKER.paper};padding:3.5%}
.pk-back-art{position:relative;width:100%;height:100%;border-radius:4%/2.9%;overflow:hidden;
  background:#0b1530 url(${POKER_ASSETS.cardBack}) center/cover no-repeat;box-shadow:inset 0 0 0 1px rgba(10,26,43,.6)}
.pk-back-art::after{content:'';position:absolute;inset:0;background:linear-gradient(125deg,rgba(255,255,255,.16) 0%,rgba(255,255,255,0) 38%,rgba(242,48,210,.10) 70%,rgba(255,255,255,0) 100%)}
.pk-paper{background:radial-gradient(120% 90% at 30% 10%,#F6F3FA 0%,${POKER.paper} 55%,#DCD6E4 100%)}
.pk-sweep{position:absolute;top:-25%;left:-60%;width:45%;height:150%;
  background:linear-gradient(90deg,rgba(255,255,255,0),rgba(242,48,210,.16) 30%,rgba(255,255,255,.95) 50%,rgba(242,48,210,.16) 70%,rgba(255,255,255,0));pointer-events:none}
.pk-clamp2{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.pk-clamp3{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.pk-clamp4{display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden}
`;

// ---------- Dorso ----------
export const CardBack: React.FC = () => (
  <div className="pk-face pk-back" aria-hidden>
    <div className="pk-back-art" />
  </div>
);

// ---------- Cara (contenido real del CV) ----------
// Todo se mide en cqw (ancho de la carta) para que la misma cara sirva en la mesa,
// en móvil y ampliada en el detalle.
export const CardFace: React.FC<{ p: ProjectItem; rank: string; className?: string; sweep?: boolean }> = ({
  p,
  rank,
  className = 'pk-front',
  sweep = true,
}) => (
  <div className={`pk-face pk-paper ${className}`} style={{ color: POKER.ink }}>
    {/* filete interior magenta, como las cartas impresas */}
    <div className="absolute" style={{ inset: '3.4cqw', border: '1px solid rgba(242,48,210,.38)', borderRadius: '4cqw' }} />
    {/* palo gigante de marca de agua */}
    <span
      aria-hidden
      className="absolute leading-none select-none"
      style={{ right: '-16cqw', top: '44cqw', fontSize: '70cqw', color: POKER.magenta, opacity: 0.05 }}
    >
      {SUIT}
    </span>
    {/* índice de esquina */}
    <div className="absolute flex flex-col items-center leading-none" style={{ left: '7cqw', top: '6.5cqw' }}>
      <span style={{ fontFamily: 'Gloock, serif', fontSize: rank === '10' ? '11.5cqw' : '13cqw', letterSpacing: '-0.04em' }}>{rank}</span>
      <span style={{ fontSize: '8cqw', color: POKER.magenta, marginTop: '0.6cqw' }}>{SUIT}</span>
    </div>
    <div
      className="absolute flex flex-col items-center leading-none"
      style={{ right: '7cqw', bottom: '6.5cqw', transform: 'rotate(180deg)' }}
      aria-hidden
    >
      <span style={{ fontFamily: 'Gloock, serif', fontSize: rank === '10' ? '8cqw' : '9cqw' }}>{rank}</span>
      <span style={{ fontSize: '6cqw', color: POKER.magenta, marginTop: '0.4cqw' }}>{SUIT}</span>
    </div>
    {/* año + categoría arriba a la derecha */}
    <div className="absolute text-right font-mono uppercase" style={{ right: '7.5cqw', top: '8cqw', fontSize: '3.3cqw', letterSpacing: '0.14em', lineHeight: 1.5 }}>
      <span style={{ color: POKER.magenta }}>{p.year}</span>
      <br />
      <span style={{ opacity: 0.6 }}>{p.category}</span>
    </div>

    <div className="absolute flex flex-col" style={{ left: '8cqw', right: '8cqw', top: '33cqw', bottom: '16cqw' }}>
      {p.award && (
        <span
          className="self-start font-mono uppercase"
          style={{ fontSize: '3cqw', letterSpacing: '0.16em', padding: '0.8cqw 2cqw', border: `1px solid ${POKER.magenta}`, color: POKER.magenta, marginBottom: '2.4cqw' }}
        >
          ★ Primer lugar
        </span>
      )}
      <h3 className="font-poster uppercase pk-clamp4" style={{ fontSize: '8.2cqw', lineHeight: 0.98, letterSpacing: '0.005em' }}>
        {p.title}
      </h3>
      <p className="font-serifItalic italic font-semibold" style={{ fontSize: '7cqw', color: POKER.magenta, marginTop: '1.6cqw', lineHeight: 1.05 }}>
        {p.client}
      </p>
      <p className="pk-clamp3" style={{ fontFamily: '"Mona Sans", sans-serif', fontSize: '3.9cqw', lineHeight: 1.38, opacity: 0.72, marginTop: 'auto' }}>
        {p.description}
      </p>
      {/* stack como fichitas */}
      <div className="flex flex-wrap" style={{ gap: '1.4cqw', marginTop: '2.6cqw' }}>
        {p.tags.slice(0, 3).map((t) => (
          <span
            key={t}
            className="inline-flex items-center font-mono"
            style={{ fontSize: '3cqw', gap: '1.2cqw', padding: '0.9cqw 2.2cqw 0.9cqw 1.2cqw', borderRadius: '99px', background: POKER.ink, color: POKER.paper }}
          >
            <span style={{ width: '2.4cqw', height: '2.4cqw', borderRadius: '50%', border: `0.7cqw dashed ${POKER.magenta}` }} />
            {t}
          </span>
        ))}
      </div>
    </div>
    {sweep && <div className="pk-sweep" />}
  </div>
);

// ---------- Carta completa en su lugar de la mesa ----------
export const PlayingCard: React.FC<{
  p: ProjectItem;
  rank: string;
  faceUp?: boolean; // estático (reducir movimiento): ya boca arriba
  hidden?: boolean; // modo fijado: oculta hasta que el crupier la reparte
  tilt?: boolean;
  slotStyle?: React.CSSProperties;
  index?: number;
  id?: string;
  onOpen: () => void;
}> = ({ p, rank, faceUp, hidden, tilt = true, slotStyle, index = 0, id, onOpen }) => {
  const hover = useRef<HTMLDivElement>(null);
  const raf = useRef(0);

  // inclinación al pasar el mouse: solo variables CSS, con un rAF por movimiento
  const onMove = (e: React.PointerEvent) => {
    if (!tilt || e.pointerType !== 'mouse') return;
    const el = hover.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const nx = (e.clientX - r.left) / r.width - 0.5;
    const ny = (e.clientY - r.top) / r.height - 0.5;
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      el.style.setProperty('--ry', `${(-nx * 14).toFixed(2)}deg`);
      el.style.setProperty('--rx', `${(ny * 10).toFixed(2)}deg`);
      el.style.setProperty('--lift', '-14px');
    });
  };
  const onLeave = () => {
    cancelAnimationFrame(raf.current);
    const el = hover.current;
    if (!el) return;
    el.style.setProperty('--ry', '0deg');
    el.style.setProperty('--rx', '0deg');
    el.style.setProperty('--lift', '0px');
  };

  return (
    <div id={id} className="pk-slot" style={{ ...slotStyle, ['--i' as string]: index } as React.CSSProperties}>
      <div className={`pk-deal ${hidden ? 'pk-hidden' : ''}`}>
        <div
          ref={hover}
          className="pk-hover"
          role="button"
          tabIndex={0}
          aria-label={`${rank} de diamantes: ${p.title} — ${p.client}. Ver detalles`}
          onPointerMove={onMove}
          onPointerLeave={onLeave}
          onClick={onOpen}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onOpen();
            }
          }}
        >
          <div className="pk-idle">
            <div className={`pk-flip ${faceUp ? 'pk-up' : ''}`}>
              <CardBack />
              <CardFace p={p} rank={rank} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
