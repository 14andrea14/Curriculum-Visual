import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { FONT, GAME, parsePeriod, type Exp } from './utils';
import { LevelCard } from './LevelCard';
import { PixelStar, PuffCloud } from './PixelArt';

gsap.registerPlugin(ScrollTrigger);

// ============================================================================
// MAPA DE NIVELES. Un camino punteado (como el mapa de un juego de
// plataformas) serpentea entre las tarjetas y pasa por un "botón de nivel" por
// puesto. Una estrella de píxel (el cursor de la jugadora, diseño propio)
// recorre el camino pegada a la línea del 60 % de la pantalla: el tramo ya
// recorrido se pinta magenta y cada nivel alcanzado se ilumina. Del lado libre
// de cada tarjeta flota una "isla" con el año de inicio.
// Escritorio: tarjetas alternadas izquierda/derecha y camino al centro.
// Móvil: camino a la izquierda y tarjetas a la derecha.
// Todo depende solo de la posición del scroll -> reversible.
// ============================================================================
const L0 = 100000; // largo del guion del revelado (más que cualquier camino)
const LINE = 0.6; // línea de lectura (fracción del alto de pantalla)
const Q_WIDE = '(min-width: 1024px)';

type Pt = { x: number; y: number };

export const LevelMap: React.FC<{ levels: Exp[]; reduced: boolean }> = ({ levels, reduced }) => {
  const uid = useId().replace(/:/g, '');
  const wrapRef = useRef<HTMLDivElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const markerRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef<(HTMLDivElement | null)[]>([]);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]); // envoltorio animado de cada tarjeta
  const [geo, setGeo] = useState<{ w: number; h: number; nodes: Pt[]; wide: boolean }>({ w: 0, h: 0, nodes: [], wide: false });
  const [lit, setLit] = useState(reduced ? levels.length : 0);
  const litRef = useRef(lit);
  const lut = useRef<{ l: number; x: number; y: number }[]>([]);
  const len = useRef(0);

  // ---------- medidas -> geometría del camino ----------
  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    let raf = 0;
    const measure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = wrap.getBoundingClientRect();
        const nodes = nodeRefs.current.map((n) => {
          if (!n) return { x: 0, y: 0 };
          const b = n.getBoundingClientRect();
          return { x: Math.round(b.left + b.width / 2 - r.left), y: Math.round(b.top + b.height / 2 - r.top) };
        });
        const next = { w: Math.round(r.width), h: Math.round(wrap.offsetHeight), nodes, wide: window.matchMedia(Q_WIDE).matches };
        setGeo((g) => (g.w === next.w && g.h === next.h && JSON.stringify(g.nodes) === JSON.stringify(next.nodes) ? g : next));
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  // camino: curvas en S entre nodos, alternando hacia qué lado se abomban
  const d = useMemo(() => {
    const { nodes, h, wide, w } = geo;
    if (!nodes.length || !w) return '';
    const A = wide ? Math.min(110, w * 0.08) : 12;
    const pts: Pt[] = [{ x: nodes[0].x, y: 0 }, ...nodes, { x: nodes[nodes.length - 1].x, y: h }];
    let s = `M${pts[0].x} ${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const dy = b.y - a.y;
      // el último tramo (salida) baja recto para no meterse bajo la tarjeta
      const side = i === pts.length - 1 ? 0 : i % 2 ? 1 : -1;
      s += ` C${a.x + side * A} ${a.y + dy * 0.4} ${b.x + side * A} ${b.y - dy * 0.4} ${b.x} ${b.y}`;
    }
    return s;
  }, [geo]);

  // tabla longitud -> punto (para ubicar la estrella por altura)
  useEffect(() => {
    const p = pathRef.current;
    if (!p || !d) return;
    const L = p.getTotalLength();
    len.current = L;
    const N = 600;
    lut.current = Array.from({ length: N + 1 }, (_, i) => {
      const l = (L * i) / N;
      const pt = p.getPointAtLength(l);
      return { l, x: pt.x, y: pt.y };
    });
    ScrollTrigger.refresh();
  }, [d]);

  // ---------- recorrido con el scroll ----------
  useEffect(() => {
    const wrap = wrapRef.current;
    const marker = markerRef.current;
    if (!wrap) return;
    const reveal = wrap.querySelector<SVGPathElement>(`#gx-rev-${uid}`);
    if (reduced) return; // camino completo (offset 0 en el render)
    const mx = marker ? gsap.quickTo(marker, 'x', { duration: 0.35, ease: 'power3.out' }) : null;
    const my = marker ? gsap.quickTo(marker, 'y', { duration: 0.35, ease: 'power3.out' }) : null;

    const update = () => {
      const T = lut.current;
      if (!T.length) return;
      const top = wrap.getBoundingClientRect().top;
      const lineY = window.innerHeight * LINE - top;
      // primer punto cuya altura supera la línea (el camino siempre baja)
      let lo = 0;
      let hi = T.length - 1;
      while (lo < hi) {
        const m = (lo + hi) >> 1;
        if (T[m].y < lineY) lo = m + 1;
        else hi = m;
      }
      const pt = T[lo];
      // dasharray "L0 L0" con offset L0 - l -> se ve exactamente el tramo [0, l]
      if (reveal) reveal.style.strokeDashoffset = String(L0 - pt.l);
      // al terminar el camino la estrella la "hereda" la salida (WarpOut)
      if (marker) gsap.set(marker, { autoAlpha: lineY > T[T.length - 1].y + 2 ? 0 : 1 });
      mx?.(pt.x);
      my?.(Math.min(Math.max(lineY, 0), T[T.length - 1].y));
      const n = geo.nodes.filter((nd) => nd.y <= lineY + 2).length;
      if (n !== litRef.current) {
        litRef.current = n;
        setLit(n);
      }
    };
    const st = ScrollTrigger.create({ trigger: wrap, start: 'top bottom', end: 'bottom top', onUpdate: update, onRefresh: update });
    update();

    return () => {
      st.kill();
    };
  }, [reduced, uid, geo]);

  // ---------- entrada de las tarjetas ("boing") ----------
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || reduced) return;
    const ctx = gsap.context(() => {
      cardRefs.current.forEach((card, i) => {
        if (!card) return;
        const tl = gsap.timeline({
          scrollTrigger: { trigger: card, start: 'top 84%', toggleActions: 'play none none reverse' },
        });
        tl.from(card, { y: 90, rotation: i % 2 ? 2.5 : -2.5, scale: 0.92, autoAlpha: 0, duration: 0.9, ease: 'back.out(1.5)' })
          .from(card.querySelectorAll('[data-in]'), { y: 16, autoAlpha: 0, duration: 0.5, stagger: 0.04, ease: 'power3.out' }, 0.2)
          .from(card.querySelectorAll('[data-item]'), { scale: 0, autoAlpha: 0, duration: 0.45, stagger: 0.04, ease: 'back.out(3)' }, 0.45);
      });
      // islas del año: parallax suave
      gsap.utils.toArray<HTMLElement>('[data-island]', wrap).forEach((el) => {
        gsap.fromTo(el, { yPercent: 18 }, { yPercent: -18, ease: 'none', scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: true } });
      });
    }, wrap);
    return () => ctx.revert();
  }, [reduced]);

  return (
    <div ref={wrapRef} className="relative mx-auto max-w-[1280px] px-4 sm:px-8 lg:px-10 pb-[14vh]">
      {/* camino */}
      <svg aria-hidden className="absolute inset-0 pointer-events-none" width={geo.w} height={geo.h} style={{ overflow: 'visible' }}>
        <defs>
          <mask id={`gx-mask-${uid}`} maskUnits="userSpaceOnUse" x={-200} y={-50} width={geo.w + 400} height={geo.h + 100}>
            <path
              id={`gx-rev-${uid}`}
              d={d}
              fill="none"
              stroke="#fff"
              strokeWidth={40}
              strokeDasharray={`${L0} ${L0}`}
              style={{ strokeDashoffset: reduced ? 0 : L0 }}
            />
          </mask>
        </defs>
        {/* sendero ancho y suave */}
        <path d={d} fill="none" stroke="rgba(255,255,255,.55)" strokeWidth={geo.wide ? 30 : 18} strokeLinecap="round" />
        {/* puntos */}
        <path ref={pathRef} d={d} fill="none" stroke="rgba(91,42,107,.35)" strokeWidth={geo.wide ? 9 : 7} strokeLinecap="round" strokeDasharray="0 22" />
        {/* tramo recorrido */}
        <g mask={`url(#gx-mask-${uid})`}>
          <path d={d} fill="none" stroke={GAME.magenta} strokeWidth={geo.wide ? 12 : 9} strokeLinecap="round" strokeDasharray="0 22" />
        </g>
      </svg>

      {/* cursor de la jugadora: estrella de píxel con halo */}
      {!reduced && (
        <div ref={markerRef} aria-hidden className="absolute left-0 top-0 z-[5] pointer-events-none" style={{ width: 0, height: 0 }}>
          <div className="absolute -translate-x-1/2 -translate-y-1/2 w-14 h-14 lg:w-16 lg:h-16">
            <span className="absolute inset-[-30%] rounded-full" style={{ background: 'radial-gradient(closest-side, rgba(255,255,255,.95), rgba(255,200,238,.6) 45%, rgba(255,200,238,0))' }} />
            <span className="gx-bob absolute inset-0">
              <PixelStar color={GAME.magenta} shade={GAME.plum} style={{ width: '100%', height: '100%' }} />
            </span>
          </div>
        </div>
      )}

      <ol className="relative z-10 flex flex-col gap-[12vh] lg:gap-[16vh] pt-[8vh]">
        {levels.map((item, i) => {
          const right = i % 2 === 1;
          const p = parsePeriod(item.period);
          const isLit = i < lit;
          return (
            <li
              key={item.id}
              data-level={i}
              className="relative grid grid-cols-[44px_minmax(0,1fr)] sm:grid-cols-[64px_minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_220px_minmax(0,1fr)] gap-x-3 sm:gap-x-5 lg:gap-x-0"
            >
              {/* botón de nivel */}
              <div className="relative lg:col-start-2 lg:row-start-1 flex justify-center">
                <div
                  ref={(el) => {
                    nodeRefs.current[i] = el;
                  }}
                  className="relative mt-16 lg:mt-24 w-11 h-11 sm:w-14 sm:h-14 lg:w-[86px] lg:h-[86px] rounded-full flex items-center justify-center transition-[background-color,transform] duration-500"
                  style={{
                    background: isLit ? GAME.magenta : '#FFFFFF',
                    border: `3px solid ${GAME.plum}`,
                    boxShadow: `0 6px 0 ${GAME.plum}`,
                    transform: isLit ? 'scale(1.08)' : 'scale(1)',
                    transitionTimingFunction: 'cubic-bezier(.34,1.56,.64,1)',
                  }}
                >
                  <span
                    className="leading-none text-[20px] sm:text-[26px] lg:text-[40px]"
                    style={{ fontFamily: FONT.puffy, color: isLit ? '#FFFFFF' : GAME.plum, textShadow: isLit ? `0 3px 0 ${GAME.plum}` : 'none' }}
                  >
                    {i + 1}
                  </span>
                  {isLit && !reduced && (
                    <span aria-hidden className="absolute inset-[-10px] rounded-full animate-ping motion-reduce:hidden" style={{ border: `3px solid ${GAME.pink}`, animationIterationCount: 1, animationDuration: '0.9s' }} />
                  )}
                </div>
              </div>

              {/* tarjeta */}
              <div
                ref={(el) => {
                  cardRefs.current[i] = el;
                }}
                className={`relative col-start-2 row-start-1 ${right ? 'lg:col-start-3' : 'lg:col-start-1'}`}
              >
                <LevelCard
                  item={item}
                  level={i + 1}
                  total={levels.length}
                />
              </div>

              {/* isla con el año (solo escritorio, del lado libre) */}
              <div
                aria-hidden
                className={`hidden lg:flex row-start-1 items-center justify-center ${right ? 'col-start-1' : 'col-start-3'}`}
              >
                <div data-island className="relative w-[78%] max-w-[420px] aspect-[1.25] flex flex-col items-center justify-center">
                  <PuffCloud className="gx-drift absolute w-[46%] -left-[8%] top-[6%] opacity-90" />
                  <PuffCloud className="absolute w-[34%] -right-[6%] bottom-[18%] opacity-80" tint="#E6D9FF" />
                  <p style={{ fontFamily: FONT.pixel, fontSize: 11, color: GAME.plumSoft }} className="relative tracking-wider">
                    MUNDO {i + 1}
                  </p>
                  <p
                    className="relative mt-3 leading-[0.85] text-[clamp(88px,9.5vw,150px)]"
                    style={{
                      fontFamily: FONT.puffy,
                      color: '#FFFFFF',
                      WebkitTextStroke: `0.03em ${GAME.plum}`,
                      paintOrder: 'stroke fill',
                      textShadow: `0 0.05em 0 ${GAME.pink}, 0 0.1em 0 ${GAME.plum}`,
                    }}
                  >
                    {p.start}
                  </p>
                  {/* plataforma flotante */}
                  <div className="relative mt-5 w-[64%] h-5 rounded-full" style={{ background: GAME.pink, border: `3px solid ${GAME.plum}`, boxShadow: `0 6px 0 ${GAME.plum}` }} />
                  <p className="relative mt-5" style={{ fontFamily: FONT.pixel, fontSize: 10, color: GAME.plumSoft }}>
                    {p.end === null ? 'EN CURSO ▶' : `→ ${p.end}`}
                  </p>
                  <PixelStar className="gx-twinkle absolute w-7 h-7 right-[14%] top-[14%]" color={GAME.star} />
                  <PixelStar className="gx-twinkle absolute w-5 h-5 left-[16%] bottom-[30%]" color="#FFFFFF" shade={GAME.pink} style={{ animationDelay: '-0.8s' }} />
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
};
