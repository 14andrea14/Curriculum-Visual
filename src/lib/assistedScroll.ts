// ─────────────────────────────────────────────────────────────────────────────
// SCROLL ASISTIDO GLOBAL (todas las secciones después de la portada)
//
// Pedido de Alejandra: entre cada sección SIEMPRE hay un scroll asistido que
// reproduce la animación a un ritmo pensado para apreciarla, con tiempos
// DISTINTOS para escritorio y para móvil/tablet.
//
// Cómo funciona:
//  - La portada (HeroSection) maneja su propio scroll asistido hasta el final de
//    su pin. Desde ahí (window.__heroPinEnd) manda este motor.
//  - Cada sección REGISTRA sus "paradas" (posiciones de scroll donde la escena
//    queda en reposo) con registerStops(). Cada parada dice cuánto dura el viaje
//    que LLEGA a ella, por separado para escritorio y móvil.
//  - Un gesto (rueda, deslizamiento, teclas) viaja a la parada siguiente o a la
//    anterior. Mientras viaja, Lenis queda detenido: el usuario no puede cortar
//    la animación a la mitad ni pasarse de largo.
//  - Subiendo desde la primera parada se devuelve el control a la portada.
//
// Uso en una sección:
//   useEffect(() => registerStops('flag', [
//     { id: 'flag-read', y: () => pinStart + vh * 0.5, desktop: 2.4, mobile: 1.6 },
//     ...
//   ]), []);
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect } from 'react';
import { getLenis } from '../hooks/useSmoothScroll';

export type Stop = {
  /** identificador legible (para depurar: window.__assistedStops()) */
  id: string;
  /** posición absoluta de scroll (px) de la parada; se evalúa en cada gesto */
  y: () => number | null | undefined;
  /** segundos del viaje que LLEGA a esta parada, en escritorio */
  desktop: number;
  /** segundos del viaje que LLEGA a esta parada, en móvil/tablet */
  mobile: number;
  /** segundos al SUBIR desde esta parada a la anterior (por defecto 85 % de la bajada, mínimo 1.2 s) */
  upDesktop?: number;
  upMobile?: number;
  /** mientras devuelva true, NO se puede bajar de esta parada (p. ej. hay que tocar la carta); solo bajada, subir siempre se puede */
  holdDown?: () => boolean;
  /** al LLEGAR a esta parada bajando, el viaje a la siguiente arranca solo (tras una pausa breve) */
  chain?: boolean;
  /** al SUBIR no se hace reposo aquí: el viaje sigue hasta la parada anterior (la escena es solo de paso) */
  skipUp?: boolean;
  /** ms de pausa antes de arrancar el viaje encadenado (por defecto 700; 0 = inmediato) */
  chainDelay?: number;
  /** curva opcional (t 0..1 -> 0..1); por defecto ease-in-out suave */
  easing?: (t: number) => number;
};

const groups = new Map<string, Stop[]>();
let goFn: ((dir: 1 | -1) => boolean) | null = null;
/** Dispara el viaje a la parada siguiente (1) o anterior (-1) desde código (p. ej. al tocar la carta). */
export const assistedGo = (dir: 1 | -1) => goFn?.(dir) ?? false;

/** Registra (o reemplaza) las paradas de una sección. Devuelve la función de limpieza. */
export const registerStops = (group: string, stops: Stop[]) => {
  groups.set(group, stops);
  return () => {
    if (groups.get(group) === stops) groups.delete(group);
  };
};

export const isMobileProfile = () =>
  typeof window !== 'undefined' &&
  !!window.matchMedia &&
  window.matchMedia('(max-width: 1023px), (hover: none) and (pointer: coarse)').matches;

const reducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const SOFT = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2) * 0.35 + (0.5 - Math.cos(Math.PI * t) / 2) * 0.65;

const heroEnd = (): number | null => {
  const f = (window as any).__heroPinEnd as (() => number | null) | undefined;
  const v = f?.();
  return typeof v === 'number' && isFinite(v) ? v : null;
};

const maxScroll = () => document.documentElement.scrollHeight - window.innerHeight;

type Resolved = { id: string; y: number; stop: Stop | null };

const resolveStops = (): Resolved[] => {
  const he = heroEnd();
  const out: Resolved[] = [];
  if (he != null) out.push({ id: 'hero-end', y: Math.round(he), stop: null });
  groups.forEach((list) =>
    list.forEach((s) => {
      const y = s.y();
      if (typeof y === 'number' && isFinite(y)) out.push({ id: s.id, y: Math.round(Math.min(y, maxScroll())), stop: s });
    }),
  );
  // final de la página: siempre se puede llegar al pie
  out.push({ id: 'page-end', y: Math.round(maxScroll()), stop: { id: 'page-end', y: () => 0, desktop: 1.4, mobile: 1.1 } });
  out.sort((a, b) => a.y - b.y);
  // fusiona paradas casi iguales (la de mayor duración manda)
  const merged: Resolved[] = [];
  for (const r of out) {
    const last = merged[merged.length - 1];
    if (last && Math.abs(last.y - r.y) < 6) {
      if (r.stop && (!last.stop || dur(r.stop, 'down') > dur(last.stop, 'down'))) merged[merged.length - 1] = r;
    } else merged.push(r);
  }
  return merged;
};

// Duración del viaje. Al SUBIR se usa la de la parada que se deja (el viaje inverso del que llegó
// a ella). Por defecto la subida es el ESPEJO de la bajada: 85 % de su duración y nunca menos de
// 1.2 s (salvo que la bajada misma sea más corta). Antes era el 60 % y las subidas se sentían
// bruscas y "cortadas" comparadas con la bajada.
const dur = (s: Stop, dir: 'down' | 'up') => {
  const m = isMobileProfile();
  const down = m ? s.mobile : s.desktop;
  if (dir === 'down') return down;
  const up = m ? s.upMobile : s.upDesktop;
  return up ?? Math.max(down * 0.85, Math.min(down, 1.2));
};

// Curva espejada: subir reproduce la bajada al revés, así que la curva también se invierte
// (si la bajada frena al final, la subida arranca despacio por esa misma parte de la escena).
const mirror = (f: (t: number) => number) => (t: number) => 1 - f(1 - t);

// Gestos de rueda: una "racha" es una serie de eventos seguidos (un giro de rueda o un deslizamiento
// de trackpad con su inercia). Una racha produce A LO SUMO un viaje; la siguiente racha se reconoce por
// una pausa, por un cambio de dirección o porque el empuje vuelve a crecer (dedo nuevo sobre la inercia).
const STREAM_GAP = 200; // ms sin eventos = racha nueva
const WHEEL_THRESHOLD = 24; // px acumulados para que la racha cuente como gesto

export const useAssistedScroll = () => {
  useEffect(() => {
    let animating = false;
    let safety: number | undefined;
    let chainTimer: number | undefined;
    // gesto en espera: un gesto NUEVO que llegó durante el viaje se ejecuta al aterrizar
    // (antes se descartaba, y con la cooldown fija de 450 ms el primer gesto tras llegar
    // también se perdía: había que repetirlo 2 o 3 veces)
    let pendingDir: 0 | 1 | -1 = 0;
    // dirección y hora de llegada del viaje en curso (para decidir si un gesto nuevo se encola)
    let tripDir: 1 | -1 = 1;
    let tripEndsAt = 0;
    const QUEUE_WINDOW = 600; // ms antes de aterrizar en que un gesto de la misma dirección aún se encola
    let pendingKind: 'wheel' | 'touch' = 'wheel';
    // última parada a la que se llegó (para navegar por índice aunque la posición se corra unos px)
    let lastStopId: string | null = null;
    let landedAt = -Infinity;
    // estado de la racha de rueda
    let streamDir = 0;
    let streamAt = -Infinity;
    let streamMag = 0;
    let streamPeak = 0;
    let streamUsed = false;
    let wheelAccum = 0;
    let touchY: number | null = null;
    let touchFired = false;

    const zoneStart = () => heroEnd();
    const inZone = () => {
      const z = zoneStart();
      return z != null && window.scrollY >= z - 8;
    };

    const go = (dir: 1 | -1): boolean => {
      const lenis = getLenis();
      if (!lenis) return false;
      const y = window.scrollY;
      const stops = resolveStops();
      // ¿en qué parada estamos? Exacta (±6 px) o la última a la que se llegó si la página se corrió
      // un poco desde entonces (refresh de ScrollTrigger, barra del navegador móvil, fuentes): así un
      // gesto nunca se gasta en un "viaje" de pocos píxeles que no se ve.
      let hereIdx = stops.findIndex((s) => Math.abs(s.y - y) <= 6);
      if (hereIdx < 0 && lastStopId) {
        const i = stops.findIndex((s) => s.id === lastStopId);
        if (i >= 0 && Math.abs(stops[i].y - y) <= window.innerHeight * 0.3) hereIdx = i;
      }
      const here = hereIdx >= 0 ? stops[hereIdx] : undefined;
      let target: Resolved | undefined;
      let from: Resolved | undefined;
      if (dir > 0) {
        // parada en la que estamos: si exige un gesto especial (tocar la carta), la bajada espera
        let hold: Resolved | undefined = here;
        if (!hold) for (let i = stops.length - 1; i >= 0; i--) if (stops[i].y <= y + 6) { hold = stops[i]; break; }
        if (hold?.stop?.holdDown?.()) {
          window.dispatchEvent(new CustomEvent('assisted-blocked', { detail: hold.id }));
          return true; // se traga el gesto (no hay viaje)
        }
        target = here ? stops[hereIdx + 1] : stops.find((s) => s.y > y + 4);
      } else {
        if (here) {
          target = stops[hereIdx - 1];
          from = here;
        } else {
          for (let i = stops.length - 1; i >= 0; i--) if (stops[i].y < y - 4) { target = stops[i]; break; }
          // la primera parada por encima define la subida
          from = stops.find((s) => s.y >= y - 4);
        }
      }
      // corrido unos px de la primera/última parada y sin vecina hacia ese lado: se vuelve a ella
      if (!target && here && Math.abs(here.y - y) > 4) target = here;
      if (!target) return false;
      // subir más allá del final de la portada: se la devuelve a HeroSection
      if (dir < 0 && target.id === 'hero-end' && y <= target.y + 4) return false;
      // subiendo: las paradas "de paso" (skipUp) no frenan el viaje; siguen hasta la anterior y
      // suman a la duración la mitad de lo que habría durado ese tramo suelto
      let skippedSecs = 0;
      if (dir < 0) {
        let ti = stops.indexOf(target);
        while (ti > 0 && stops[ti].stop?.skipUp && stops[ti - 1].id !== 'hero-end') {
          skippedSecs += dur(stops[ti].stop as Stop, 'up') * 0.5;
          ti--;
          target = stops[ti];
        }
      }
      let seconds =
        dir > 0
          ? target.stop ? dur(target.stop, 'down') : 1.2
          : (from?.stop ? dur(from.stop, 'up') : 1.2) + skippedSecs;
      if (reducedMotion()) seconds = Math.min(seconds, 0.35);
      const custom = dir > 0 ? target.stop?.easing : from?.stop?.easing;
      const easing = custom ? (dir > 0 ? custom : mirror(custom)) : SOFT;
      animating = true;
      tripDir = dir;
      tripEndsAt = performance.now() + seconds * 1000;
      pendingDir = 0;
      window.clearTimeout(chainTimer);
      const to = target;
      const finish = () => {
        window.clearTimeout(safety);
        animating = false;
        // el evento 'scroll' del último cuadro llega DESPUÉS de onComplete: durante un instante se
        // sigue informando "viajando" para que la portada no confunda la llegada a hero-end con una
        // reentrada desde abajo (la retenía en el manifiesto y se tragaba el siguiente gesto)
        landedAt = performance.now();
        lastStopId = to.id;
        const queued = pendingDir;
        const kind = pendingKind;
        pendingDir = 0;
        // encadenado: la escena sigue sola hacia la parada siguiente (sin nuevo gesto)...
        if (dir > 0 && to.stop?.chain && queued >= 0) {
          window.clearTimeout(chainTimer);
          chainTimer = window.setTimeout(() => {
            if (!animating) go(1);
          }, to.stop.chainDelay ?? 700);
          return;
        }
        // ...y un gesto que quedó en espera durante el viaje se cumple ahora, sin pedirlo otra vez
        if (queued) {
          window.setTimeout(() => {
            if (!animating && !runGesture(queued)) upToCover(kind);
          }, 0);
        }
      };
      // red de seguridad: si algo cancela el viaje y nunca llega onComplete,
      // el motor no debe quedar "viajando" para siempre (tragándose los gestos)
      window.clearTimeout(safety);
      safety = window.setTimeout(() => {
        animating = false;
        pendingDir = 0;
      }, seconds * 1000 + 800);
      lenis.stop();
      lenis.scrollTo(target.y, {
        duration: seconds,
        easing,
        force: true,
        lock: true,
        onComplete: finish,
      });
      return true;
    };

    // Entrega un gesto de subida a la portada (HeroSection solo escucha rueda y tacto cuando está
    // libre): se le reenvía como el mismo tipo de gesto, sintético. Se usa para las teclas y para un
    // gesto que quedó en espera y aterrizó justo en el borde. En móvil va como deslizamiento (la
    // portada no responde a una rueda sintética en ese perfil).
    const upToCover = (kind: 'wheel' | 'touch') => {
      getLenis()?.start();
      if (kind === 'touch' && typeof Touch === 'function' && typeof TouchEvent === 'function') {
        const x = window.innerWidth / 2;
        const mk = (y: number) => new Touch({ identifier: 9001, target: document.body, clientX: x, clientY: y });
        const send = (type: string, t: Touch, active: boolean) =>
          document.body.dispatchEvent(
            new TouchEvent(type, { touches: active ? [t] : [], targetTouches: active ? [t] : [], changedTouches: [t], bubbles: true, cancelable: true }),
          );
        const y0 = window.innerHeight * 0.35;
        send('touchstart', mk(y0), true);
        send('touchmove', mk(y0 + 120), true);
        send('touchend', mk(y0 + 120), false);
        return;
      }
      window.dispatchEvent(new WheelEvent('wheel', { deltaY: -120, deltaMode: 0, cancelable: true }));
    };

    // Ejecuta un gesto fuera de un viaje. En el borde superior de la zona (subiendo desde la primera
    // parada) devuelve false: la portada retoma con su propio asistido.
    const runGesture = (dir: 1 | -1): boolean => {
      if (go(dir)) return true;
      if (dir < 0) {
        getLenis()?.start();
        return false;
      }
      return true;
    };

    // Llega siempre un gesto NUEVO (la cola de inercia de uno anterior se filtra antes, en onWheel;
    // las teclas repetidas en onKey; el tacto exige un deslizamiento nuevo).
    const handle = (dir: 1 | -1, e: Event | undefined) => {
      if (!inZone()) return;
      const lenis = getLenis();
      if (animating) {
        if (e?.cancelable) e.preventDefault();
        lenis?.stop();
        // Gesto durante un viaje: no lo corta (pedido de Alejandra), pero tampoco se pierde:
        // queda en espera y se cumple al llegar (el último gesto manda).
        // Pero un gesto en la MISMA dirección y todavía lejos de aterrizar es una repetición
        // impaciente (o inercia/empuje nuevo del trackpad): si se encolara, al llegar saltaría
        // la parada siguiente ("pasa de largo"). Solo cuenta si cae cerca del aterrizaje.
        if (dir === tripDir && tripEndsAt - performance.now() > QUEUE_WINDOW) return;
        pendingDir = dir;
        pendingKind = e?.type.startsWith('touch') ? 'touch' : 'wheel';
        return;
      }
      // un gesto del usuario cancela un encadenado pendiente
      window.clearTimeout(chainTimer);
      const ok = runGesture(dir);
      if (ok && e?.cancelable) e.preventDefault();
    };

    // Un detalle de proyecto tiene su propio desplazamiento nativo.
    const usesNativeScroll = (target: EventTarget | null) =>
      target instanceof Element && !!target.closest('[data-lenis-prevent]');

    const onWheel = (e: WheelEvent) => {
      if (usesNativeScroll(e.target) || !inZone()) return;
      const lenis = getLenis();
      // dentro de la zona, Lenis nunca mueve la página por su cuenta
      const toHero = e.deltaY < 0 && !animating && window.scrollY <= (zoneStart() ?? 0) + 4;
      if (!toHero) {
        lenis?.stop();
        // el gesto es del motor: ni la portada ni Lenis deben reaccionar a él
        e.stopImmediatePropagation();
        if (e.cancelable) e.preventDefault();
      }
      const px = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerHeight : 1);
      if (!px) return;
      // hora del evento según el sistema (no la de este handler): si el hilo principal estuvo ocupado
      // y los eventos llegan amontonados, la racha no se parte en dos por una pausa que no existió
      const now = e.timeStamp || performance.now();
      const dir = px > 0 ? 1 : -1;
      const mag = Math.abs(px);
      const gap = now - streamAt;
      // ¿racha nueva? pausa, cambio de dirección, o un empuje que vuelve a crecer cuando la racha ya
      // venía decayendo (dedo nuevo sobre la inercia; en la rampa inicial de un deslizamiento no cuenta)
      const fresh =
        gap > STREAM_GAP ||
        dir !== streamDir ||
        (streamMag < streamPeak * 0.5 && mag >= 16 && mag > streamMag * 2.5);
      if (fresh) {
        streamDir = dir;
        streamUsed = false;
        streamPeak = 0;
        wheelAccum = 0;
      }
      streamAt = now;
      streamMag = mag;
      streamPeak = Math.max(streamPeak, mag);
      // la racha ya produjo su viaje (o llegó mientras viajaba): su cola de inercia no hace nada
      if (streamUsed) return;
      wheelAccum += px;
      if (Math.abs(wheelAccum) < WHEEL_THRESHOLD) return;
      streamUsed = true;
      wheelAccum = 0;
      handle(dir, e);
    };

    const onTouchStart = (e: TouchEvent) => {
      touchY = usesNativeScroll(e.target) ? null : (e.touches[0]?.clientY ?? null);
      touchFired = false;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (usesNativeScroll(e.target) || !inZone() || touchY == null) return;
      const dy = touchY - (e.touches[0]?.clientY ?? touchY);
      const atTop = !animating && window.scrollY <= (zoneStart() ?? 0) + 4 && dy < 0;
      if (!atTop) {
        if (e.cancelable) e.preventDefault();
        e.stopImmediatePropagation();
      }
      if (touchFired || Math.abs(dy) < 28) return;
      touchFired = true;
      // cada deslizamiento es un gesto nuevo (sin inercia nativa: el touchmove se cancela)
      handle(dy > 0 ? 1 : -1, e);
    };

    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (usesNativeScroll(t)) return;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (!inZone()) return;
      const down = ['ArrowDown', 'PageDown', ' '].includes(e.key) && !e.shiftKey;
      const up = ['ArrowUp', 'PageUp'].includes(e.key) || (e.key === ' ' && e.shiftKey);
      if (!down && !up) return;
      const toHero = up && !animating && window.scrollY <= (zoneStart() ?? 0) + 4;
      if (toHero) {
        // borde con la portada: la portada solo escucha la rueda y el tacto cuando está libre, así
        // que la tecla se le entrega como un giro de rueda hacia arriba (un gesto = un viaje)
        e.preventDefault();
        if (e.repeat) return;
        window.clearTimeout(chainTimer);
        upToCover('wheel');
        return;
      }
      e.stopImmediatePropagation();
      // mantener la tecla apretada no encadena viajes: un toque = un viaje
      if (e.repeat) {
        e.preventDefault();
        return;
      }
      handle(down ? 1 : -1, e);
    };

    // captura: corre ANTES que el listener de Lenis, así un lenis.stop() a tiempo
    // hace que Lenis descarte el evento
    window.addEventListener('wheel', onWheel, { passive: false, capture: true });
    window.addEventListener('touchstart', onTouchStart, { passive: true, capture: true });
    window.addEventListener('touchmove', onTouchMove, { passive: false, capture: true });
    window.addEventListener('keydown', onKey, { capture: true });
    goFn = go;
    (window as any).__assistedOwnsScroll = () => animating || inZone();
    (window as any).__assistedAnimating = () => animating || performance.now() - landedAt < 250;
    (window as any).__assistedStops = () => resolveStops().map((s) => `${s.id} @ ${s.y}`);
    return () => {
      window.clearTimeout(safety);
      window.clearTimeout(chainTimer);
      window.removeEventListener('wheel', onWheel, { capture: true } as any);
      window.removeEventListener('touchstart', onTouchStart, { capture: true } as any);
      window.removeEventListener('touchmove', onTouchMove, { capture: true } as any);
      window.removeEventListener('keydown', onKey, { capture: true } as any);
    };
  }, []);
};
