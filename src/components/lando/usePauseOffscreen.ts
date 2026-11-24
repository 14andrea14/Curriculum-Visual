import { useEffect } from 'react';

// PAUSA las animaciones CSS infinitas (titileos, polvo, nubes a la deriva, pulsos...) de los
// elementos que NO están en pantalla. Una animación infinita sigue "tictaqueando" aunque su
// elemento esté lejos de la vista: cada cuadro Chrome recalcula estilos de todas ellas
// (medido: ~370 elementos y ~13 ms de UpdateLayoutTree por cuadro en la zona del póker).
// Aquí se detectan con getAnimations() (sin lista de clases a mantener) y cada elemento se
// pausa / reanuda con un IntersectionObserver. No cambia nada visible: al volver a la vista
// la animación sigue donde estaba.
export function usePauseOffscreen(ref: React.RefObject<HTMLElement>, margin = 160) {
  useEffect(() => {
    const root = ref.current;
    if (!root || typeof IntersectionObserver === 'undefined' || !root.getAnimations) return;
    const seen = new Set<Element>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) (e.target as HTMLElement).style.animationPlayState = e.isIntersecting ? '' : 'paused';
      },
      { rootMargin: `${margin}px 0px` },
    );
    const scan = () => {
      for (const a of root.getAnimations({ subtree: true })) {
        const eff = a.effect as KeyframeEffect | null;
        const t = eff?.target as HTMLElement | null | undefined;
        if (!t || seen.has(t) || !(a as CSSAnimation).animationName) continue;
        if (eff!.getComputedTiming().iterations !== Infinity) continue;
        // pseudo-elementos: se pausa el elemento que los lleva
        seen.add(t);
        io.observe(t);
      }
    };
    scan();
    // los elementos que se montan o se activan después (clases que se agregan al avanzar)
    const timers = [window.setTimeout(scan, 1500), window.setTimeout(scan, 6000)];
    const onReady = () => scan();
    window.addEventListener('preloader-done', onReady);
    return () => {
      timers.forEach(clearTimeout);
      window.removeEventListener('preloader-done', onReady);
      io.disconnect();
      seen.forEach((el) => ((el as HTMLElement).style.animationPlayState = ''));
    };
  }, [ref, margin]);
}
