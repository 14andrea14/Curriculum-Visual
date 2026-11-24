import { useEffect, useRef } from 'react';

// Rectángulo en pantalla de un lienzo, en caché, para los useFrame de r3f.
// Antes cada cuadro llamaba a getBoundingClientRect(): dentro del rAF, con el DOM
// recién modificado por el scroll (Lenis/GSAP/React), eso obliga al navegador a
// recalcular el layout de toda la página en el acto (medido: ~2.5 s de hilo
// principal en el recorrido de la portada, entre las letras 3D y los logos IA).
// Ahora se mide solo cuando el layout ya está resuelto o puede haber cambiado:
//  - en el callback del ResizeObserver (corre después del layout: lectura gratis);
//  - en resize de la ventana;
//  - tras un scroll, en el siguiente movimiento del mouse (lo único para lo que se
//    usa el rectángulo es convertir la posición del cursor). Los lienzos que lo
//    usan viven dentro del pin de la portada (fijos en pantalla mientras animan),
//    así que el valor no cambia entre medio.
export function useCanvasRectRef(el: HTMLElement | null) {
  const ref = useRef<{ left: number; top: number; width: number; height: number }>({ left: 0, top: 0, width: 0, height: 0 });
  useEffect(() => {
    if (!el) return;
    let dirty = false;
    let at = 0;
    const measure = () => {
      const r = el.getBoundingClientRect();
      ref.current = { left: r.left, top: r.top, width: r.width, height: r.height };
      dirty = false;
      at = performance.now();
    };
    measure();
    const onScroll = () => {
      dirty = true;
    };
    // con el mouse en movimiento se vuelve a medir como mucho 4 veces por segundo
    // (cubre cambios de posición sin scroll ni resize, p. ej. cuando GSAP fija el pin)
    const onMove = () => {
      if (dirty || performance.now() - at > 250) measure();
    };
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    window.addEventListener('resize', measure, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    // en captura: se mide ANTES de que otros listeners lean la posición del cursor
    window.addEventListener('mousemove', onMove, { passive: true, capture: true });
    window.addEventListener('pointerdown', onMove, { passive: true, capture: true });
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', onScroll, { capture: true });
      window.removeEventListener('mousemove', onMove, { capture: true });
      window.removeEventListener('pointerdown', onMove, { capture: true });
    };
  }, [el]);
  return ref;
}
