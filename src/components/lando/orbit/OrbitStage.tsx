import React, { useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { WarmUp } from '../../canvas/WarmUp';
import { OrbitScene, type OrbitShared } from './OrbitScene';
import { ORBIT, TECH_COUNT, type Journey } from './orbitData';

import './orbit.css';

// Escenario de escritorio/tableta: vive DENTRO del tramo fijado (sticky) de la
// sección y ocupa toda la pantalla. Lienzo 3D transparente (el espacio lo pinta
// SpaceBackdrop detrás) + etiquetas DOM proyectadas + leyenda de categorías.
// - El viaje del scroll (journey) decide la llegada de la órbita, cuánto circuito
//   está encendido y cuándo aparece la UI.
// - Hover/clic en una categoría o tecnología: se enciende su camino y su planeta,
//   el resto se atenúa. Clic fija la selección; clic de nuevo la suelta.
// - El lienzo solo anima mientras el escenario es visible.

const TECHS = ORBIT.cats.flatMap((c) => c.techs);
const pad = (n: number) => String(n).padStart(2, '0');

type Props = {
  reduced: boolean;
  paused: boolean;
  journey: React.MutableRefObject<Journey>;
  children?: React.ReactNode; // título de la sección (columna izquierda)
};

export const OrbitStage: React.FC<Props> = ({ reduced, paused, journey, children }) => {
  const stageRef = useRef<HTMLDivElement>(null);
  const shared = useRef<OrbitShared>({
    journey,
    focusCat: -1,
    focusTech: null,
    pointer: { x: 0, y: 0 },
    reduced,
    techLabels: [],
    hubLabels: [],
    legend: null,
  });
  shared.current.reduced = reduced;
  shared.current.journey = journey;

  const [live, setLive] = useState(false);
  const [hover, setHover] = useState<{ cat: number; tech: string | null } | null>(null);
  const [locked, setLocked] = useState<{ cat: number; tech: string | null } | null>(null);
  const focus = hover ?? locked;

  // foco → escena (y un cuadro si el bucle está en modo "demand")
  useEffect(() => {
    shared.current.focusCat = focus ? focus.cat : -1;
    shared.current.focusTech = focus ? focus.tech : null;
    shared.current.invalidate?.();
  }, [focus]);

  // visibilidad → bucle de render
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setLive(e.isIntersecting), { rootMargin: '120px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // paralaje: puntero normalizado a la ventana (sin leer el layout)
  useEffect(() => {
    if (reduced) return;
    const onMove = (e: PointerEvent) => {
      shared.current.pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      shared.current.pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, [reduced]);

  const toggleLock = (f: { cat: number; tech: string | null }) =>
    setLocked((l) => (l && l.cat === f.cat && l.tech === f.tech ? null : f));

  const focusCatData = focus ? ORBIT.cats[focus.cat] : null;
  const focusTechData = focus?.tech ? TECHS.find((t) => t.id === focus.tech) : null;

  return (
    <div
      ref={stageRef}
      className="orbit-stage absolute inset-0"
      onClick={(e) => {
        // clic en el vacío: suelta la selección fijada
        if (e.target === e.currentTarget || (e.target as HTMLElement).tagName === 'CANVAS') setLocked(null);
      }}
    >
      <Canvas
        aria-hidden
        className="!absolute inset-0"
        resize={{ offsetSize: true, scroll: false }}
        frameloop={live && !paused ? (reduced ? 'demand' : 'always') : 'never'}
        dpr={[1, 1.5]}
        camera={{ position: [0, 0, 11], fov: 35, far: 400 }}
        gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
      >
        <OrbitScene shared={shared} />
        <WarmUp delay={1800} />
      </Canvas>

      {/* etiquetas proyectadas (decorativas para lectores: la lista accesible va aparte) */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden>
        {ORBIT.cats.map((c, ci) => (
          <div
            key={c.tag}
            ref={(el) => (shared.current.hubLabels[ci] = el)}
            className="orbit-hub absolute left-0 top-0 opacity-0 will-change-transform"
            style={{ zIndex: 40 }}
          >
            <button
              type="button"
              tabIndex={-1}
              className="orbit-hub-inner"
              style={{ pointerEvents: 'none' }}
              onPointerEnter={() => setHover({ cat: ci, tech: null })}
              onPointerLeave={() => setHover(null)}
              onClick={() => toggleLock({ cat: ci, tech: null })}
            >
              <span className="font-mono text-[10px] tracking-[0.25em] text-[#F230D2]">{pad(ci + 1)}</span>
              <span className="font-poster uppercase text-[15px] tracking-[0.04em] leading-none text-[#ECE8F2]">{c.title}</span>
            </button>
          </div>
        ))}
        {TECHS.map((t, gi) => {
          const on = focus?.tech === t.id;
          return (
            <div
              key={t.id}
              ref={(el) => (shared.current.techLabels[gi] = el)}
              className="orbit-tech absolute left-0 top-0 opacity-0 will-change-transform"
              style={{ pointerEvents: 'none' }}
            >
              <button
                type="button"
                tabIndex={-1}
                className={`orbit-tech-inner ${on ? 'is-on' : ''}`}
                onPointerEnter={() => setHover({ cat: t.cat, tech: t.id })}
                onPointerLeave={() => setHover(null)}
                onClick={() => toggleLock({ cat: t.cat, tech: t.id })}
              >
                {t.name}
              </button>
            </div>
          );
        })}
      </div>

      {children}

      {/* LEYENDA. Alturas fijas en todo: filas de 44px, indicador con hueco
          reservado (solo escala), bloque de detalle de alto fijo. Cambiar la
          selección nunca mueve nada (antes el bloque crecía y, anclado abajo,
          empujaba la lista hacia arriba). */}
      <div
        ref={(el) => (shared.current.legend = el)}
        className="orbit-legend absolute z-[60] left-5 right-5 bottom-6 md:max-lg:grid md:max-lg:grid-cols-[1fr_1fr] md:max-lg:gap-x-8 lg:right-auto lg:left-8 lg:bottom-8 lg:w-[19rem] xl:left-10 xl:bottom-10 xl:w-[22rem]"
        style={{ opacity: reduced ? 1 : 0, pointerEvents: reduced ? 'auto' : 'none' }}
      >
        <div>
          <p className="font-mono text-[10px] tracking-[0.3em] text-[#ECE8F2]/50 mb-3 h-4">
            {ORBIT.cats.length} ÓRBITAS · {TECH_COUNT} NODOS
          </p>
          <ul>
            {ORBIT.cats.map((c, ci) => {
              const active = focus?.cat === ci;
              const dim = focus && !active;
              const isLocked = locked?.cat === ci && !locked.tech;
              return (
                <li key={c.tag}>
                  <button
                    type="button"
                    aria-pressed={isLocked}
                    onPointerEnter={() => setHover({ cat: ci, tech: null })}
                    onPointerLeave={() => setHover(null)}
                    onFocus={() => setHover({ cat: ci, tech: null })}
                    onBlur={() => setHover(null)}
                    onClick={() => toggleLock({ cat: ci, tech: null })}
                    className="orbit-legend-row group w-full h-11 text-left grid grid-cols-[2.2rem_18px_1fr_auto] items-center gap-x-2 border-t border-[#ECE8F2]/12 transition-opacity duration-300 focus:outline-none focus-visible:outline focus-visible:outline-1 focus-visible:outline-[#F230D2] focus-visible:outline-offset-4"
                    style={{ opacity: dim ? 0.35 : 1 }}
                  >
                    <span className={`font-mono text-[11px] transition-colors ${active ? 'text-[#F230D2]' : 'text-[#ECE8F2]/45'}`}>{pad(ci + 1)}</span>
                    <span
                      aria-hidden
                      className="block h-[2px] w-full bg-[#F230D2] origin-left transition-transform duration-500 ease-[cubic-bezier(0.2,0,0,1)]"
                      style={{ transform: `scaleX(${active ? 1 : 0})` }}
                    />
                    <span className="font-poster uppercase text-[1.3rem] leading-none text-[#ECE8F2] whitespace-nowrap overflow-hidden text-ellipsis">
                      {c.title}
                    </span>
                    <span className="font-mono text-[11px] text-[#ECE8F2]/45 tabular-nums">{pad(c.techs.length)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
        <div className="mt-4 md:max-lg:mt-7 h-[7.25rem] overflow-hidden border-t border-[#ECE8F2]/12 pt-4" aria-live="polite">
          {focusTechData ? (
            <>
              <p className="font-mono text-[10px] tracking-[0.3em] text-[#F230D2]">NODO ACTIVO</p>
              <p
                className={`font-poster uppercase leading-[1] mt-1 text-[#ECE8F2] line-clamp-2 ${
                  focusTechData.name.length > 14 ? 'text-[1.45rem]' : 'text-[2rem]'
                }`}
              >
                {focusTechData.name}
              </p>
              <p className="font-mono text-[11px] text-[#ECE8F2]/55 mt-1 truncate">
                {pad(focusTechData.cat + 1)} / {ORBIT.cats[focusTechData.cat].title}
              </p>
            </>
          ) : focusCatData ? (
            <>
              <p className="font-mono text-[10px] tracking-[0.3em] text-[#F230D2]">ÓRBITA {pad(focusCatData.index + 1)}</p>
              <p className="text-[13px] leading-[1.55] text-[#ECE8F2]/70 mt-2 line-clamp-4">
                {focusCatData.techs.map((t) => t.name).join(' · ')}
              </p>
            </>
          ) : (
            <p className="font-mono text-[11px] leading-relaxed text-[#ECE8F2]/45">
              Pasa el cursor por una órbita o un nodo para encender su camino. Clic para fijarlo.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
