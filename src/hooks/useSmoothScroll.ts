import { useEffect } from 'react';
import Lenis from 'lenis';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

let lenisInstance: Lenis | null = null;
export const getLenis = () => lenisInstance;

// Navega a una sección respetando el smooth scroll de Lenis (evita el salto
// que produce un scrollIntoView nativo mientras Lenis controla el scroll).
// Bloqueo del scroll en la portada (Hero): la página arranca congelada en la
// pose inicial y solo se libera cuando la usuaria interactúa (clic o intento
// de scroll). Lenis.stop() detiene el scroll suave; los listeners nativos de
// HeroSection se encargan de rueda, touch y teclado.
export const lockScroll = () => lenisInstance?.stop();
export const unlockScroll = () => lenisInstance?.start();

export const scrollToSection = (target: string) => {
  // Cualquier navegación explícita (puntos laterales, enlaces) también libera
  // la portada: si no, un clic en el menú no haría nada mientras está bloqueada.
  window.dispatchEvent(new Event('hero-unlock'));
  if (lenisInstance) {
    lenisInstance.start();
    lenisInstance.scrollTo(target);
  } else {
    document.querySelector(target)?.scrollIntoView({ behavior: 'smooth' });
  }
};

// Expone lenis.scrollTo con todas sus opciones (duration, easing, onComplete, etc.)
// para secuencias de "scroll asistido". Se fuerza lock: false para garantizar que
// ningún gesto del usuario quede congelado ni bloquee el scroll hacia arriba o abajo.
// Marca de cuándo empezó el último scrollTo programático con lock (ver ensureUnlocked).
let lockedAt = 0;
export const smoothScrollTo = (target: number | string | HTMLElement, options?: Parameters<Lenis['scrollTo']>[1]) => {
  if (lenisInstance) {
    // Se respeta el lock que pide quien llama (la portada lo usa para que la
    // rueda no corte su animación a la mitad). Antes se forzaba lock:false y
    // cada giro de rueda cancelaba el scroll asistido de la portada.
    if (options?.lock) lockedAt = performance.now();
    lenisInstance.scrollTo(target as any, options);
  } else {
    if (typeof target === 'string') {
      document.querySelector(target)?.scrollIntoView({ behavior: 'smooth' });
    } else if (typeof target === 'number') {
      window.scrollTo({ top: target, behavior: 'smooth' });
    } else if (target instanceof HTMLElement) {
      target.scrollIntoView({ behavior: 'smooth' });
    }
  }
};

export const useSmoothScroll = () => {
  useEffect(() => {
    // Initialize Lenis smooth scroll
    const lenis = new Lenis({
      // lerp (sin duration/easing): sigue a la rueda con un suavizado más ágil;
      // duration 1.2 con curva exponencial se sentía pesado. Los scrollTo
      // programáticos que pasan su propia duration/easing no cambian.
      lerp: 0.1,
      orientation: 'vertical',
      gestureOrientation: 'vertical',
      smoothWheel: true,
      wheelMultiplier: 1.0,
      touchMultiplier: 1.5,
    });
    lenisInstance = lenis;

    // Garantía absoluta contra bloqueo de scroll: si el usuario intenta interactuar,
    // se asegura que Lenis no quede en estado isLocked
    const ensureUnlocked = () => {
      // Red de seguridad contra bloqueos COLGADOS (p. ej. un scrollTo con lock que
      // nunca terminó): solo libera si el lock lleva más de 8 s. No reactiva un
      // Lenis detenido a propósito (portada bloqueada o motor de scroll asistido).
      if ((window as any).__assistedOwnsScroll?.()) return;
      if ((lenis as any)['isLocked'] && performance.now() - lockedAt > 8000) (lenis as any)['isLocked'] = false;
    };
    window.addEventListener('touchstart', ensureUnlocked, { passive: true });
    window.addEventListener('wheel', ensureUnlocked, { passive: true });

    // Synchronize Lenis scroll position with GSAP ScrollTrigger
    lenis.on('scroll', ScrollTrigger.update);

    const updateCallback = (time: number) => {
      lenis.raf(time * 1000);
    };

    gsap.ticker.add(updateCallback);
    gsap.ticker.lagSmoothing(0);

    // Las Google Fonts (Sora/Outfit/JetBrains Mono) cargan async. Si el
    // texto cambia de tamaño cuando la fuente real reemplaza al fallback
    // DESPUÉS de que ScrollTrigger ya calculó el rango de un pin (ej. el
    // Hero, "end: +=110%"), el pin se desincroniza justo en el límite de
    // la sección — se manifiesta como un frame de glitch/salto visual ahí.
    // Refrescar cuando las fuentes terminan de cargar corrige las medidas.
    document.fonts?.ready?.then(() => ScrollTrigger.refresh());

    return () => {
      window.removeEventListener('touchstart', ensureUnlocked);
      window.removeEventListener('wheel', ensureUnlocked);
      gsap.ticker.remove(updateCallback);
      lenis.off('scroll', ScrollTrigger.update);
      lenis.destroy();
      lenisInstance = null;
    };
  }, []);
};

// "Scroll asistido" (saltos automáticos entre etapas, bloqueo de la carta hasta el
// toque): SOLO en celular/tablet táctil. En escritorio el scroll es libre y lo
// controlan los pins con scrub; los saltos automáticos lo descontrolaban.
export const isAssistedScrollEnabled = () =>
  typeof window !== 'undefined' &&
  !!window.matchMedia &&
  window.matchMedia('(max-width: 1023px), (hover: none) and (pointer: coarse)').matches;
