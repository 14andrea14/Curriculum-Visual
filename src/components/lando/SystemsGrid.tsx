import { listenMedia } from '../../lib/deviceProfile';
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Key } from './shared';
import { OrbitStage } from './orbit/OrbitStage';
import { OrbitMobile, OrbitMobileSvg, OrbitMobileAccordion } from './orbit/OrbitMobile';
import { SpaceBackdrop } from './orbit/SpaceBackdrop';
import { WARP_OUT_PIN, WARP_OUT_READY } from './experience/WarpOut';
import { ORBIT, JOURNEY_DONE, EXIT_START, journeyDesktop, journeyMobile, orbitFrame, type Journey } from './orbit/orbitData';
import { registerStops } from '../../lib/assistedScroll';
import { Lamp } from './formacion/Lamp';
import { registerImageWarmup } from './warmup';
import { optionalImage } from './contact/useOptionalImage';
import { BOARD_IMG, BOARD_MASK, BULB_VH, fitBoardPhoto, useBoardPhotoSize } from './formacion/boardPhoto';

import './orbit/orbit.css';

gsap.registerPlugin(ScrollTrigger);

// SISTEMAS TÉCNICOS · el UNIVERSO del portafolio.
// Las estelas de píxel del juego se funden con el salto al hiperespacio en el mismo
// encuadre. Tras el destello frenamos frente a la ÓRBITA: una estrella
// (núcleo), 4 planetas (categorías) en sus órbitas y 31 tecnologías como nodos.
// Todo el viaje va atado al scroll (scrub) y es reversible.
//  - Escenario de 100svh fijado con ScrollTrigger (pin, como el resto del sitio:
//    el body tiene overflow-x oculto, así que `position: sticky` no funciona aquí).
//  - SpaceBackdrop: el espacio (estrellas, nebulosa, planetas) dentro del escenario
//  - Escritorio/tableta: la órbita 3D vive en el escenario
//  - Móvil: salto corto y luego órbita 2D + acordeón (sin 3D)
//  - Movimiento reducido: sin salto ni pin; todo en su estado final, quieto
// Al final la órbita colapsa en un punto de luz que sube y se vuelve la lámpara de la
// pizarra de post-its (arriba al centro), sobre el tono del escritorio (#12161F); al
// soltarse el pin la lámpara se queda quieta en pantalla mientras entra la Formación.
//
// ESCRITORIO (≥ 1024 px) — salida "a la foto del tablero" (una sola escena continua):
//  - el escenario dibuja la MISMA foto del tablero que usa la Formación (mismo encaje,
//    bombilla exacta a 50 % / 10vh), a oscuras, que aparece alrededor de la órbita
//    mientras esta colapsa (nunca una pantalla vacía);
//  - el punto de luz (un elemento DOM encima de la foto) viaja y aterriza en la
//    bombilla de la foto; ahí la lámpara se enciende (parpadeo corto y luz cálida);
//  - el último cuadro de la salida es idéntico al primero de la Formación: la sección
//    Formación tiene margen negativo y queda justo bajo el escenario, así que al
//    terminar el pin se relevan sin salto (el escenario se oculta y sigue la Formación).

const PIN_VH_DESKTOP = 400; // recorrido del pin: llegada + reposo + salida a la lámpara
const WARP_OVERLAP_VH = 60; // tramo en que el despegue y el salto comparten el encuadre
const ORBIT_STOP = EXIT_START; // reposo de la órbita formada: fracción del pin (llegada + reposo terminan en 0.80)
const MOBILE_OVERLAP_VH = 60; // móvil: SISTEMAS se desliza sobre el final de la salida (cielo estrellado -> nebulosa, sin costura)
const PIN_VH_MOBILE = 130; // en móvil: cometas se funden directo en el salto orbital y revelan la órbita

// rampa suave 0..1 entre a y b
const rampM = (x: number, a: number, b: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function useMedia(query: string) {
  const [m, setM] = useState(() => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(query).matches);
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia(query);
    const on = () => setM(mq.matches);
    on();
    return listenMedia(mq, on);
  }, [query]);
  return m;
}

// lectura del salto (mono, discreta) — se escribe directo en el DOM
const Hud: React.FC<{ hudRef: React.Ref<HTMLDivElement>; barRef: React.Ref<HTMLSpanElement>; spdRef: React.Ref<HTMLSpanElement> }> = ({
  hudRef,
  barRef,
  spdRef,
}) => (
  <div
    ref={hudRef}
    aria-hidden
    className="absolute left-1/2 bottom-8 sm:bottom-10 -translate-x-1/2 z-[70] flex items-center gap-3 sm:gap-4 font-mono text-[10px] tracking-[0.32em] text-[#ECE8F2]/75 whitespace-nowrap pointer-events-none"
    style={{ opacity: 0 }}
  >
    <span>SALTO&nbsp;ORBITAL</span>
    <span className="relative block w-24 sm:w-40 h-px bg-[#ECE8F2]/20 overflow-hidden">
      <span ref={barRef} className="absolute inset-0 bg-[#F230D2] origin-left" style={{ transform: 'scaleX(0)' }} />
    </span>
    <span ref={spdRef} className="tabular-nums w-[5.5em] text-right text-[#F230D2]">
      0.00 c
    </span>
  </div>
);

export const SystemsGrid: React.FC = () => {
  const reduced = useMedia('(prefers-reduced-motion: reduce)');
  const mobile = useMedia('(max-width: 767px)');
  const wide = useMedia('(min-width: 1024px)');
  const blendWarp = !reduced && !mobile;
  // escritorio con animación: salida a la foto del tablero (ver comentario de arriba)
  const hand = wide && !reduced && !mobile;
  const photo = useBoardPhotoSize();
  // foto del tablero y texturas del espacio, ya descargadas y decodificadas detrás de la carga
  useEffect(() => {
    const space = ['/space/nebula.webp', '/space/stars.webp', '/space/planet-a.webp', '/space/planet-b.webp'].filter((s) => optionalImage(s));
    return registerImageWarmup('skills-img', [BOARD_IMG, ...space]);
  }, []);
  const [imgBox, setImgBox] = useState<React.CSSProperties | null>(null);
  const [openCat, setOpenCat] = useState<number>(-1);
  const [orbitHidden, setOrbitHidden] = useState(false);
  const [warpPin, setWarpPin] = useState<ScrollTrigger>();

  const journey = useRef<Journey>({ ...JOURNEY_DONE });
  const stage = useRef<HTMLDivElement>(null);
  const title = useRef<HTMLDivElement>(null);
  const hud = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLSpanElement>(null);
  const spd = useRef<HTMLSpanElement>(null);
  const photoWrap = useRef<HTMLDivElement>(null);
  const shade = useRef<HTMLDivElement>(null);
  const lampBox = useRef<HTMLDivElement>(null);
  const point = useRef<HTMLDivElement>(null);
  const orbitM = useRef<HTMLDivElement>(null); // móvil: órbita 2D (entra con el scroll)
  const accM = useRef<HTMLDivElement>(null); // móvil: acordeón (entra con el scroll)

  useEffect(() => {
    if (!blendWarp) return;
    const read = () => setWarpPin(ScrollTrigger.getById(WARP_OUT_PIN));
    window.addEventListener(WARP_OUT_READY, read);
    read();
    return () => window.removeEventListener(WARP_OUT_READY, read);
  }, [blendWarp]);

  // encaje de la foto: el mismo cálculo que la Formación (bombilla a 50 % / 10vh)
  useLayoutEffect(() => {
    const st = stage.current;
    if (!hand || !photo || !st) return;
    const fit = () => setImgBox(fitBoardPhoto(photo, st.offsetWidth, st.offsetHeight, window.innerHeight));
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [hand, photo]);

  // estado inicial antes del primer cuadro (sin parpadeo del título)
  useLayoutEffect(() => {
    if (reduced) Object.assign(journey.current, JOURNEY_DONE);
    else if (mobile) journeyMobile(0, 0, journey.current);
    else journeyDesktop(0, 0, journey.current, hand);
  }, [reduced, mobile, hand]);

  // En escritorio el pin de la órbita empieza antes de que se suelte el del
  // despegue: el vórtice se funde sobre las estelas con ambos encuadres fijos.
  useEffect(() => {
    const el = stage.current;
    const J = journey.current;
    // ancho / alto del escenario (los actualiza un ResizeObserver; 0 = sin medir todavía)
    const dims = { w: 0, h: 0 };
    const apply = () => {
      const t = title.current;
      if (t) {
        const a = J.title;
        t.style.opacity = a.toFixed(3);
        t.style.transform = `translate3d(0,${((1 - a) * 40).toFixed(1)}px,0) scale(${(1 + (1 - a) * 0.08).toFixed(4)})`;
      }
      if (hud.current) hud.current.style.opacity = J.hud.toFixed(3);
      if (orbitM.current && accM.current) {
        // móvil: la órbita y las opciones se forman a medida que SISTEMAS sube a la pantalla
        // (scrub: J.e = avance de entrada). Sin movimiento reducido: todo ya formado.
        const k = reduced ? 1 : rampM(J.e, 0.3, 0.95);
        const k2 = reduced ? 1 : rampM(J.e, 0.5, 1);
        orbitM.current.style.opacity = k.toFixed(3);
        orbitM.current.style.transform = 'translate3d(0,' + ((1 - k) * 56).toFixed(1) + 'px,0) scale(' + (0.86 + 0.14 * k).toFixed(4) + ')';
        accM.current.style.opacity = k2.toFixed(3);
        accM.current.style.transform = 'translate3d(0,' + ((1 - k2) * 36).toFixed(1) + 'px,0)';
      }
      if (hand) {
        // foto del tablero a oscuras → parpadeo de encendido → luz plena
        if (photoWrap.current) photoWrap.current.style.opacity = J.photo.toFixed(3);
        if (shade.current) shade.current.style.opacity = (1 - J.bright).toFixed(3);
        const bulb = lampBox.current?.querySelector<SVGElement>('.fm-lamp-bulb');
        if (bulb) {
          bulb.style.opacity = J.bulb.toFixed(3);
          bulb.style.transform = 'scale(' + (0.8 + 0.2 * J.bulb).toFixed(4) + ')';
        }
        // punto de luz: del núcleo de la órbita a la bombilla de la foto (50 % / 10vh)
        const pt = point.current;
        if (pt && el) {
          // medidas del escenario cacheadas (ResizeObserver más abajo): leer clientWidth aquí,
          // después de escribir estilos, forzaba un layout en cada cuadro del pin
          if (!dims.w) {
            dims.w = el.clientWidth;
            dims.h = el.clientHeight;
          }
          const W = dims.w;
          const f = orbitFrame(W, dims.h);
          const bx = W / 2;
          const by = BULB_VH * window.innerHeight;
          const m = J.pointMove;
          // leve curva lateral que se cierra a cero al llegar: aterriza EXACTO en la bombilla
          const sway = Math.sin(m * Math.PI) * 70 * (f.cx >= bx ? 1 : -1);
          const x = f.cx + (bx - f.cx) * m + sway;
          const y = f.cy + (by - f.cy) * m;
          pt.style.opacity = J.point.toFixed(3);
          pt.style.transform = 'translate3d(' + (x - 110).toFixed(2) + 'px,' + (y - 110).toFixed(2) + 'px,0)';
        }
      }
      if (bar.current) bar.current.style.transform = `scaleX(${Math.min(1, J.q / 0.45).toFixed(3)})`;
      if (spd.current) {
        // "velocidad" de lectura: sube con el salto
        const c = J.warp * J.warp * 9.8 + J.flash * 2;
        // reemplazar el texto (aunque sea el mismo) invalida el layout: solo si cambió
        const txt = `${c.toFixed(2)} c`;
        if (spd.current.textContent !== txt) spd.current.textContent = txt;
      }
    };
    if (!el || reduced) {
      Object.assign(J, JOURNEY_DONE);
      J.pixel = 0;
      J.title = 1;
      apply();
      // movimiento reducido: sin pin ni viaje; un único reposo en el borde superior
      if (!el) return;
      return registerStops('skills', [
        { id: 'skills-orbit-rm', y: () => el.getBoundingClientRect().top + window.scrollY, desktop: 1.2, mobile: 1.2 },
      ]);
    }
    // WarpOut espera el ajuste tipográfico. Registramos este pin después del suyo
    // para que ScrollTrigger mida el solapamiento con el espaciador ya colocado.
    if (blendWarp && warpPin !== ScrollTrigger.getById(WARP_OUT_PIN)) return;
    if (blendWarp && !warpPin) return;
    // medidas del escenario fuera del camino caliente (el callback corre con el layout ya hecho)
    const roDims =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            dims.w = el.clientWidth;
            dims.h = el.clientHeight;
          })
        : null;
    roDims?.observe(el);
    const fn = mobile ? journeyMobile : (e: number, q: number, J: Journey) => journeyDesktop(e, q, J, hand);
    const pinVh = mobile ? PIN_VH_MOBILE : PIN_VH_DESKTOP;
    let e = 0;
    let q = 0;
    const update = () => {
      fn(e, q, J);
      if (blendWarp) {
        const t = Math.min(1, q * PIN_VH_DESKTOP / WARP_OVERLAP_VH);
        el.style.opacity = (t * t * (3 - 2 * t)).toFixed(3);
      }
      apply();
    };
    const entry = !mobile ? null : ScrollTrigger.create({
      trigger: el,
      start: 'top bottom',
      end: 'top top',
      onUpdate: (self) => {
        e = self.progress;
        update();
      },
      onRefresh: (self) => {
        e = self.progress;
        update();
      },
    });
    const updatePin = (self: ScrollTrigger) => {
      q = self.progress;
      update();
      // Tras el relevo, el escenario aún cruza el viewport aunque ya esté oculto.
      // Pausa ambos lienzos en ese intervalo y reactívalos al volver a la órbita.
      const visibility = q >= 1 ? 'hidden' : '';
      if (hand && el.style.visibility !== visibility) {
        el.style.visibility = visibility;
        setOrbitHidden(q >= 1);
      }
    };
    const pin = mobile
      ? null
      : ScrollTrigger.create({
          trigger: el,
          start: () => warpPin!.end - window.innerHeight * WARP_OVERLAP_VH / 100,
          end: () => `+=${(window.innerHeight * pinVh) / 100}`,
          pin: true,
          anticipatePin: 1,
          invalidateOnRefresh: true,
          onUpdate: updatePin,
          onRefresh: updatePin,
        });
    // relevo: cuando el escenario sale por arriba, la lámpara se queda quieta en pantalla
    const handoff = mobile || hand
      ? null
      : ScrollTrigger.create({
          // justo después del pin, durante una pantalla (lo que tarda el escenario en salir)
          start: () => pin!.end,
          end: () => pin!.end + el.offsetHeight,
          onUpdate: (self) => {
            J.handoff = self.progress;
          },
          onRefresh: (self) => {
            J.handoff = self.progress;
          },
        });

    // ── SCROLL ASISTIDO ─────────────────────────────────────────────────────
    // Paradas de reposo de esta sección; las posiciones se leen EN VIVO en cada gesto.
    // La duración es la del viaje que LLEGA a cada parada (el motor global la aplica).
    const top = () => el.getBoundingClientRect().top + window.scrollY;
    const unregister = pin && hand
      ? // Escritorio (≥ 1024): UN viaje desde la órbita hasta la lámpara encendida
        // (colapso + punto de luz + aterrizaje en la bombilla + encendido). La parada
        // 'skills-lamp' tiene `chain`: al llegar, 0.7 s después arranca sola la siguiente
        // ('formacion-board', las notas clavándose). Al subir, la lámpara encendida
        // y el tablero vacío quedan en reposo hasta el siguiente gesto.
        registerStops('skills', [
          {
            id: 'skills-orbit',
            y: () => pin.start + (pin.end - pin.start) * ORBIT_STOP,
            desktop: 6.2,
            mobile: 4.6,
            upDesktop: 5.3,
            upMobile: 3.9,
          },
          {
            id: 'skills-lamp',
            // reposo = el instante en que la lámpara termina de encenderse (parpadeo listo en
            // x = 0.95 de la salida), no el final del pin: así el viaje encadenado a los post-its
            // arranca YA, sin tiempo muerto con el tablero iluminado y vacío
            y: () => pin.start + (pin.end - pin.start) * (ORBIT_STOP + (1 - ORBIT_STOP) * 0.95),
            desktop: 4.6,
            mobile: 3.6,
            upDesktop: 3.6,
            upMobile: 3.0,
            chain: true,
            // al subir desde la pizarra no se hace reposo en la lámpara: el viaje sigue hasta la órbita
            skipUp: true,
            chainDelay: 0,
          },
        ])
      : pin
      ? // Escritorio / tableta: dos reposos dentro del pin de 400vh.
        //  1) la órbita ya formada y legible. El viaje arranca en la última parada del
        //     juego y recorre WarpOut + salto al hiperespacio + destello + llegada:
        //     es el momento cinematográfico, por eso es el viaje más largo.
        //  2) la lámpara arriba al centro sobre #12161F (fin del pin). Lo que sigue (el
        //     escenario saliendo y la Formación) lo gobierna la parada de Formación.
        registerStops('skills', [
          {
            id: 'skills-orbit',
            y: () => pin.start + (pin.end - pin.start) * ORBIT_STOP,
            // viaje unico desde el ultimo nivel: despegue de la estrella + salto + llegada a la orbita
            desktop: 6.2,
            mobile: 4.6,
            upDesktop: 5.3,
            upMobile: 3.9,
          },
          { id: 'skills-lamp', y: () => pin.end, desktop: 2.8, mobile: 2.2, upDesktop: 2.4, upMobile: 1.9 },
        ])
      : // Móvil (sin pin): la escena cabe en una pantalla; el reposo es su borde superior.
        // Si el acordeón abierto la hace más alta que la pantalla, hay un segundo reposo
        // al pie para poder leerla completa antes de seguir con la Formación.
        registerStops('skills', [
          // el viaje es ~14 % más corto en scroll (la entrada solapa 60vh con la salida): el tiempo baja en proporción
          { id: 'skills-orbit-m', y: top, desktop: 4.0, mobile: 3.5, upDesktop: 3.4, upMobile: 3.0 },
          {
            id: 'skills-orbit-m-end',
            y: () => {
              const over = el.offsetHeight - window.innerHeight;
              return over > 40 ? top() + over : null;
            },
            desktop: 1.2,
            mobile: 1.2,
          },
        ]);

    update();
    return () => {
      roDims?.disconnect();
      unregister();
      handoff?.kill();
      pin?.kill();
      entry?.kill();
      if (blendWarp) el.style.removeProperty('opacity');
      if (hand) {
        el.style.visibility = '';
        setOrbitHidden(false);
      }
    };
  }, [reduced, mobile, hand, blendWarp, warpPin]);

  const titleBlock = (
    <h2 className="font-poster uppercase leading-[0.85] text-white">
      <span className="block text-white">SISTEMAS</span>
      <span className="font-serifItalic italic font-semibold normal-case tracking-normal text-white block">
        técnicos
      </span>
    </h2>
  );

  return (
    <section
      id="skills"
      data-nav-theme="dark"
      className={`relative text-[#ECE8F2] pointer-events-auto${blendWarp || mobile ? '' : ' space-css-stars'}`}
      style={{
        overflow: 'clip',
        // escritorio: se solapa con el despegue; móvil: se desliza sobre el final de la salida (sin costura recta)
        marginTop: blendWarp ? `-${100 + WARP_OVERLAP_VH}vh` : mobile && !reduced ? `-${MOBILE_OVERLAP_VH}vh` : undefined,
      }}
    >
      {/* lista accesible completa (la órbita 3D es decorativa para lectores de pantalla) */}
      {!mobile && (
        <ul className="sr-only">
          {ORBIT.cats.map((c) => (
            <li key={c.tag}>
              {c.title}: {c.techs.map((t) => t.name).join(', ')}
            </li>
          ))}
        </ul>
      )}

      {mobile ? (
        <div
          ref={stage}
          className="relative min-h-[100svh] overflow-hidden flex flex-col justify-between pt-4 pb-6"
          // arriba transparente (deja ver el cielo estrellado de la salida, que queda debajo), abajo azul noche;
          // con movimiento reducido no hay solape: azul noche liso (el mismo color en el que termina la salida)
          style={{ background: reduced ? '#0A1A2B' : 'linear-gradient(to bottom, rgba(10,26,43,0) 0%, #0A1A2B 34vh, #0A1A2B 100%)' }}
        >
          <SpaceBackdrop journey={journey} reduced={reduced} mobile />

          {/* Encabezado: ampliado para vista móvil, todo en blanco */}
          <div
            ref={title}
            className="relative z-[55] px-5 pt-3 will-change-transform text-[clamp(3.3rem,14vw,5.2rem)]"
          >
            {titleBlock}
          </div>

          {/* Galaxia / Órbita 2D centrada verticalmente */}
          <div ref={orbitM} className="relative z-[50] px-2 my-auto flex items-center justify-center pointer-events-none will-change-transform" style={{ opacity: reduced ? 1 : 0 }}>
            <OrbitMobileSvg reduced={reduced} openCat={openCat} />
          </div>

          {/* Botones de opciones ubicados exactamente bajo la galaxia en la vista móvil */}
          <div ref={accM} className="relative z-[55] px-4 pt-1 pb-2 will-change-transform" style={{ opacity: reduced ? 1 : 0 }}>
            <OrbitMobileAccordion openCat={openCat} setOpenCat={setOpenCat} />
          </div>
        </div>
      ) : (
        <div
          ref={stage}
          className={`relative h-[100svh] min-h-[600px]${blendWarp ? ' space-css-stars z-[2]' : ''}`}
          style={blendWarp ? { opacity: 0 } : undefined}
        >
          <SpaceBackdrop journey={journey} reduced={reduced} mobile={false} domPoint={hand} paused={orbitHidden} />
          {/* foto del tablero (misma que la Formación), a oscuras mientras colapsa la órbita */}
          {hand && (
            <div ref={photoWrap} aria-hidden className="absolute inset-0 overflow-hidden pointer-events-none" style={{ opacity: 0 }}>
              {photo && (
                <img
                  decoding="async" src={BOARD_IMG}
                  alt=""
                  aria-hidden
                  className="pointer-events-none select-none"
                  style={{
                    ...(imgBox ?? { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: '50% 0' }),
                    WebkitMaskImage: BOARD_MASK,
                    maskImage: BOARD_MASK,
                  }}
                />
              )}
              {/* sombra de la habitación: se levanta con el parpadeo de la lámpara */}
              <div ref={shade} className="absolute inset-0" style={{ background: '#12161F', opacity: 1 }} />
            </div>
          )}
          <OrbitStage reduced={reduced} journey={journey} paused={orbitHidden}>
            <div
              ref={title}
              className="absolute z-[55] left-5 sm:left-10 top-[clamp(5.5rem,13vh,8rem)] pointer-events-none will-change-transform text-[min(10vw,15vh)] lg:text-[min(7.5rem,15vh)] xl:text-[min(9.5rem,16vh)]"
              style={{ opacity: reduced ? 1 : 0, transformOrigin: '0% 0%' }}
            >
              {titleBlock}
            </div>
          </OrbitStage>
          {/* lámpara de la foto (la misma que usa la Formación) y el punto de luz que llega a ella */}
          {hand && (
            <>
              <div ref={lampBox} aria-hidden className="orbit-lampbox absolute inset-0 z-[56] pointer-events-none">
                <Lamp photo bulbVh={BULB_VH} uid="-orbit" />
              </div>
              <div
                ref={point}
                aria-hidden
                className="absolute left-0 top-0 z-[57] w-[220px] h-[220px] pointer-events-none will-change-transform"
                style={{
                  opacity: 0,
                  background:
                    'radial-gradient(circle at 50% 50%, rgba(255,255,255,1) 0, rgba(255,250,240,0.95) 3.5%, rgba(255,226,180,0.55) 8%, rgba(255,184,130,0.2) 20%, rgba(242,48,210,0.06) 34%, rgba(242,48,210,0) 50%)',
                }}
              />
            </>
          )}
          {!reduced && <Hud hudRef={hud} barRef={bar} spdRef={spd} />}
        </div>
      )}

      {/* cierre en móvil / movimiento reducido (en escritorio la salida es la del pin:
          la órbita colapsa en la lámpara de la oficina y todo termina en #12161F) */}
      {(mobile || reduced) && (
        <div aria-hidden className="relative z-[1] h-[24vh] pointer-events-none">
          <div className="absolute inset-0" style={{ background: mobile ? 'linear-gradient(to bottom, #0A1A2B 0%, #12161F 100%)' : 'linear-gradient(to bottom, rgba(18,22,31,0) 0%, rgba(18,22,31,0.85) 55%, #12161F 100%)' }} />
        </div>
      )}
    </section>
  );
};
