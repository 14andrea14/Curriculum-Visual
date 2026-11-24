import { useEffect } from 'react';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

// "Nada fijo" (pedido explícito): el nombre y las redes pertenecen a la escena del
// gato / manifiesto. Mientras dura el pin de la portada se ven donde siempre; cuando el
// pin termina (el ancla #manifiesto pasa por arriba de la pantalla), se van hacia arriba
// JUNTO con el manifiesto, como cualquier contenido de la página, en vez de seguir fijos.
// Cada sección siguiente organiza sus propios botones/elementos.
// Aplica translateY al elemento del ref en cada cuadro de scroll.
//
// Rendimiento: antes se leía anchor.getBoundingClientRect() en un rAF propio en CADA
// cuadro de scroll de toda la página (dos veces: TopNav y SocialDock). Ese rAF corre
// después de los que escriben estilos (banderín, pistas SVG, gsap), así que cada lectura
// forzaba un recálculo de estilos + layout extra por cuadro (medido: ~0,85 s de CPU en el
// recorrido del banderín y ~0,25 s por sección en el resto). Ahora la posición del ancla en
// el documento se mide SOLO al montar / redimensionar / refrescar ScrollTrigger, y por
// cuadro se usa el scroll que ScrollTrigger ya leyó (cacheado, sin forzar layout).
// El resultado (transform / visibility) es el mismo.
export function useSceneScroll(ref: React.RefObject<HTMLElement>) {
  useEffect(() => {
    let raf = 0;
    // borde superior del ancla en coordenadas del documento (null = sin medir)
    let anchorTop: number | null = null;
    let lastT = '\u0000';
    let lastV = '\u0000';
    const write = (scroll: number) => {
      const el = ref.current;
      if (!el || anchorTop === null) return;
      const off = Math.min(0, anchorTop - scroll);
      // ya fuera de pantalla: que no reciba clics ni cueste pintarlo
      const v = off < -window.innerHeight * 0.5 ? 'hidden' : '';
      // oculto y sigue oculto: el transform no se ve, no hace falta escribirlo cada cuadro
      if (!(v === 'hidden' && lastV === 'hidden')) {
        const t = off < 0 ? `translate3d(0, ${off.toFixed(1)}px, 0)` : '';
        if (t !== lastT) {
          el.style.transform = t;
          lastT = t;
        }
      }
      if (v !== lastV) {
        el.style.visibility = v;
        // marca para que los hijos pausen sus animaciones CSS infinitas mientras no se ven
        // (ver CandyName): oculto, una animación sigue recalculando estilos en cada cuadro
        el.toggleAttribute('data-scene-hidden', v === 'hidden');
        lastV = v;
      }
    };
    // medición (fuera del camino caliente): posición del ancla en el documento
    const measure = () => {
      raf = 0;
      const anchor = document.getElementById('manifiesto');
      if (!anchor || !ref.current) return;
      anchorTop = anchor.getBoundingClientRect().top + window.scrollY;
      lastT = '\u0000'; // forzar la escritura con la medida nueva
      lastV = '\u0000';
      write(window.scrollY);
    };
    const remeasure = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };
    measure();
    // por cuadro de scroll: el scroll cacheado de ScrollTrigger (misma pasada que el resto
    // de los ScrollTrigger, sin una lectura de layout propia)
    const st = ScrollTrigger.create({
      start: 0,
      end: 'max',
      onUpdate: (self) => write(self.scroll()),
    });
    window.addEventListener('resize', remeasure);
    // los pins de ScrollTrigger cambian el alto de la página: re-medir al refrescar y al
    // terminar la pantalla de carga (si no, quedaba medido antes de existir el pin)
    ScrollTrigger.addEventListener('refresh', remeasure);
    window.addEventListener('preloader-done', remeasure);
    const late = window.setTimeout(remeasure, 1500);
    document.fonts?.ready.then(remeasure).catch(() => {});
    return () => {
      st.kill();
      window.removeEventListener('resize', remeasure);
      ScrollTrigger.removeEventListener('refresh', remeasure);
      window.removeEventListener('preloader-done', remeasure);
      window.clearTimeout(late);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [ref]);
}
