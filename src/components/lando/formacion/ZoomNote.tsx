import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import gsap from 'gsap';
import type { SlideDef } from './slides';
import { ACCENT, INK } from './slides';
import { lockScroll, unlockScroll } from '../../../hooks/useSmoothScroll';
import { DrawingCard, NoteCard } from './NoteCard';
import type { DrawingDef } from './drawings';

// Zoom de una nota: la misma nota sale del tablero hacia el centro, ampliada,
// con un fondo suave detrás (FLIP: se mide la nota de origen y la ampliada se
// anima desde esa posición/escala). Como el texto va en `em`, la ampliada usa
// el mismo tamaño relativo y la maqueta es idéntica, solo más grande.
// Cierre: clic fuera, botón × o Esc; el foco vuelve a la nota de origen.
// Movimiento reducido: solo fundido.
// Rapidez: el velo de fondo es plano (SIN backdrop-filter: un desenfoque a pantalla completa
// sobre una página con canvas retrasaba ~70 ms el primer cuadro del diálogo) y la nota empieza
// a moverse en el mismo cuadro del clic; ~0,3 s hasta verse completa, cierre igual de ágil.
// Variante `art`: dibujo recortado (post-it con transparencia) en vez de una nota de texto.

// Con la nota ampliada, ningún gesto de scroll debe mover la página de fondo.
// El scroll asistido (src/lib/assistedScroll.ts) escucha rueda/tacto/teclas en
// `window` en fase de captura y NO sabe que hay un diálogo abierto: lockScroll()
// solo detiene Lenis, pero el motor viaja igualmente con scrollTo forzado. Para
// llegar ANTES que él, este guardián se instala al evaluar el módulo (App importa
// Formacion antes de montar el motor) y corta esos gestos mientras haya un zoom.
// El estado vive en `window` para sobrevivir a recargas en caliente sin duplicar.
type ZoomGuardWindow = Window & { __fmZoomOpen?: number; __fmZoomGuard?: boolean };
if (typeof window !== 'undefined' && !(window as ZoomGuardWindow).__fmZoomGuard) {
  const w = window as ZoomGuardWindow;
  w.__fmZoomGuard = true;
  const open = () => (w.__fmZoomOpen ?? 0) > 0;
  const stop = (e: Event) => {
    if (!open()) return;
    if (e.cancelable) e.preventDefault();
    e.stopImmediatePropagation();
  };
  w.addEventListener('wheel', stop, { passive: false, capture: true });
  w.addEventListener('touchmove', stop, { passive: false, capture: true });
  w.addEventListener(
    'keydown',
    (e) => {
      if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes(e.key)) stop(e);
    },
    { capture: true },
  );
}

type Props = {
  slide?: SlideDef;
  art?: DrawingDef;
  source: HTMLElement;
  rotation: number;
  reduced: boolean;
  onClose: () => void;
};

export const ZoomNote: React.FC<Props> = ({ slide, art, source, rotation, reduced, onClose }) => {
  const backRef = useRef<HTMLDivElement>(null);
  const noteRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const closing = useRef(false);

  // tamaño de la ampliada: ancho fijo y fuente proporcional a la de origen (se calcula una sola vez)
  const size = useMemo(() => {
    const sw = source.offsetWidth;
    const sfs = parseFloat(getComputedStyle(source).fontSize) || 12;
    const zw = art
      ? Math.min(560, window.innerWidth * 0.9, (window.innerHeight * 0.8 * art.w) / art.h)
      : Math.min(640, window.innerWidth * 0.92, (window.innerHeight * 0.86 * sw) / Math.max(1, source.offsetHeight));
    return { zw, fs: sfs * (zw / sw) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // origen → centro. La escala sale de los anchos de layout (no del rect): si el origen está
  // girado (los dibujos), el rect es la caja envolvente y daría una escala inflada.
  const flip = () => {
    const note = noteRef.current!;
    const s = source.getBoundingClientRect();
    const f = note.getBoundingClientRect();
    return {
      x: s.left + s.width / 2 - (f.left + f.width / 2),
      y: s.top + s.height / 2 - (f.top + f.height / 2),
      scale: source.offsetWidth / note.offsetWidth,
    };
  };

  useLayoutEffect(() => {
    const note = noteRef.current;
    const back = backRef.current;
    if (!note || !back) return;
    source.style.visibility = 'hidden';
    if (reduced) {
      gsap.fromTo([back, note], { opacity: 0 }, { opacity: 1, duration: 0.25 });
    } else {
      const o = flip();
      gsap.fromTo(back, { opacity: 0 }, { opacity: 1, duration: 0.28, ease: 'power2.out' });
      gsap.fromTo(
        note,
        { x: o.x, y: o.y, scale: o.scale, rotation },
        { x: 0, y: 0, scale: 1, rotation: 0, duration: 0.6, ease: 'expo.out' },
      );
    }
    closeRef.current?.focus({ preventScroll: true });
    lockScroll();
    const w = window as ZoomGuardWindow;
    w.__fmZoomOpen = (w.__fmZoomOpen ?? 0) + 1;
    return () => {
      // limpieza completa: en desarrollo React monta dos veces (StrictMode) y la segunda
      // medida partía de la nota ya movida, así que la animación de entrada quedaba anulada
      gsap.killTweensOf([back, note]);
      gsap.set([back, note], { clearProps: 'transform,opacity' });
      w.__fmZoomOpen = Math.max(0, (w.__fmZoomOpen ?? 1) - 1);
      source.style.visibility = '';
      unlockScroll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const close = () => {
    if (closing.current) return;
    closing.current = true;
    const note = noteRef.current;
    const back = backRef.current;
    const done = () => {
      source.style.visibility = '';
      onClose();
      source.focus({ preventScroll: true });
    };
    if (!note || !back) return done();
    if (reduced) {
      gsap.to([back, note], { opacity: 0, duration: 0.15, onComplete: done });
      return;
    }
    gsap.set(note, { x: 0, y: 0, scale: 1, rotation: 0 });
    const o = flip();
    gsap.to(back, { opacity: 0, duration: 0.26, ease: 'power2.in' });
    gsap.to(note, { x: o.x, y: o.y, scale: o.scale, rotation, duration: 0.34, ease: 'power3.inOut', onComplete: done });
  };

  // Esc + trampa de foco mínima (solo hay un elemento enfocable: cerrar)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      } else if (e.key === 'Tab') {
        e.preventDefault();
        closeRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return createPortal(
    <div
      className="fixed inset-0 z-[200] grid place-items-center"
      role="dialog"
      aria-modal="true"
      aria-label={art ? art.label : slide!.label}
      onClick={close}
    >
      <div
        ref={backRef}
        className="absolute inset-0"
        style={{ background: 'radial-gradient(ellipse at 50% 45%, rgba(8,10,16,0.78) 0%, rgba(6,8,13,0.9) 100%)', willChange: 'opacity' }}
      />
      <div
        ref={noteRef}
        className="relative"
        style={{ width: size.zw, fontSize: size.fs, willChange: 'transform' }}
        onClick={(e) => e.stopPropagation()}
      >
        {art ? <DrawingCard art={art} pinned={false} zoom /> : <NoteCard slide={slide!} pinned={false} />}
        <button
          ref={closeRef}
          type="button"
          onClick={close}
          aria-label="Cerrar nota"
          className="fm-focus absolute -top-4 right-2 sm:-right-4 w-11 h-11 rounded-full grid place-items-center text-[18px] leading-none shadow-lg"
          style={{ background: INK, color: '#fff', border: `1px solid ${ACCENT}` }}
        >
          ×
        </button>
      </div>
    </div>,
    document.body,
  );
};
