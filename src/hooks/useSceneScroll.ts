import { useEffect } from 'react';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

// "Nada fijo" (pedido explícito): el nombre y las redes pertenecen a la escena del
// gato / manifiesto. Mientras dura el pin de la portada se ven donde siempre; cuando el
// pin termina (el ancla #manifiesto pasa por arriba de la pantalla), se van hacia arriba
// JUNTO con el manifiesto, como cualquier contenido de la página, en vez de seguir fijos.
// Cada sección siguiente organiza sus propios botones/elementos.
// Aplica translateY al elemento del ref en cada cuadro de scroll (una sola medición).
export function useSceneScroll(ref: React.RefObject<HTMLElement>) {
  useEffect(() => {
    let raf = 0;
    const apply = () => {
      raf = 0;
      const el = ref.current;
      const anchor = document.getElementById('manifiesto');
      if (!el || !anchor) return;
      const off = Math.min(0, anchor.getBoundingClientRect().top);
      el.style.transform = off < 0 ? `translate3d(0, ${off.toFixed(1)}px, 0)` : '';
      // ya fuera de pantalla: que no reciba clics ni cueste pintarlo
      el.style.visibility = off < -window.innerHeight * 0.5 ? 'hidden' : '';
    };
    const on = () => {
      if (!raf) raf = requestAnimationFrame(apply);
    };
    apply();
    window.addEventListener('scroll', on, { passive: true });
    window.addEventListener('resize', on);
    // los pins de ScrollTrigger cambian el alto de la página: re-medir al refrescar y al
    // terminar la pantalla de carga (si no, quedaba medido antes de existir el pin)
    ScrollTrigger.addEventListener('refresh', on);
    window.addEventListener('preloader-done', on);
    const late = window.setTimeout(on, 1500);
    return () => {
      window.removeEventListener('scroll', on);
      window.removeEventListener('resize', on);
      ScrollTrigger.removeEventListener('refresh', on);
      window.removeEventListener('preloader-done', on);
      window.clearTimeout(late);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [ref]);
}
