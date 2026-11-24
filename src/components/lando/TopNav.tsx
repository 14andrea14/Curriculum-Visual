import React, { useEffect, useRef, useState } from 'react';
import { useSceneScroll } from '../../hooks/useSceneScroll';
import { scrollToSection } from '../../hooks/useSmoothScroll';
import { CandyName } from './CandyName';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

// Barra superior: SOLO el nombre, en una línea "ALEJANDRA ARISMENDI" con letra de caramelo
// (CandyName: Bagel Fat One; no le gustaron Unbounded, Syne ni las versiones 3D). Pedido explícito: sin la marca "AA",
// sin botón CONTACTO y sin menú lateral; a la derecha van las redes (SocialDock, fijo
// arriba a la derecha). NADA FIJO: ambos pertenecen a la escena del manifiesto y se van
// con ella al bajar (useSceneScroll). Reglas que se mantienen:
//  - el nombre CAMBIA DE TEMA según la sección que tiene debajo
//    (data-nav-theme="light|dark" en cada <section>);
//  - no aparece en la portada.
export const TopNav: React.FC = () => {
  const [visible, setVisible] = useState(false);
  // no es fijo: se va hacia arriba con el manifiesto al terminar la portada
  const sceneRef = useRef<HTMLDivElement>(null);
  useSceneScroll(sceneRef);

  useEffect(() => {
    // Un solo ScrollTrigger (sin IntersectionObserver ni getBoundingClientRect por
    // scroll): el ancla #manifiesto tiene su borde superior justo en el final del pin
    // del Hero, así que el nombre aparece al terminar la escena del gato y queda
    // visible hasta el final de la página. refreshPriority -1: se mide después del
    // pin del Hero (que agrega el pin-spacer que lo desplaza).
    // Se crea en el cuadro siguiente: el efecto del Hero (que crea el pin) corre después
    // de este (TopNav va antes en el árbol) y así la primera medición ya lo incluye.
    let st: ScrollTrigger | undefined;
    const raf = requestAnimationFrame(() => {
      if (!document.querySelector('#manifiesto')) return;
      st = ScrollTrigger.create({
        trigger: '#manifiesto',
        start: 'top 8%',
        end: 'max',
        refreshPriority: -1,
        onToggle: (s) => setVisible(s.isActive),
      });
    });
    return () => {
      cancelAnimationFrame(raf);
      st?.kill();
    };
  }, []);

  // las redes (SocialDock) suben a la barra solo cuando se ve el nombre (fuera de la portada)
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('nav-visible', { detail: visible }));
  }, [visible]);

  return (
    <div ref={sceneRef} className="fixed top-0 left-0 w-full z-[60] pointer-events-none" style={{ willChange: 'transform' }}>
      {/* En vista de teléfono (max-sm) centrado y más grande; en escritorio (sm:) alineado a la izquierda */}
      <header
        className="w-full flex justify-center sm:justify-start px-4 sm:px-8 pt-5 sm:pt-6 pointer-events-none"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(-14px)',
          transition: 'opacity 500ms cubic-bezier(0.65,0.05,0,1), transform 500ms cubic-bezier(0.65,0.05,0,1)',
        }}
      >
        <button
          onClick={() => scrollToSection('#hero')}
          className="pointer-events-auto min-h-[48px] h-12 flex items-center justify-center focus:outline-none"
          aria-label="Alejandra Arismendi, ir al inicio"
          style={{ pointerEvents: visible ? 'auto' : 'none' }}
        >
          {/* Letra de caramelo: tamaño grande y centrado en celular (pedido explícito) */}
          <CandyName visible={visible} className="text-[clamp(1.95rem,7.5vw,2.5rem)] sm:text-[clamp(1.5rem,2.2vw,2.2rem)] tracking-[0.01em]" />
        </button>
      </header>
    </div>
  );
};
