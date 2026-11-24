import React from 'react';
import { HeroSection } from './components/dom/HeroSection';
import { TopNav } from './components/lando/TopNav';
import { SocialDock } from './components/lando/SocialDock';
import { WorkTrack } from './components/lando/WorkTrack';
import { FlagBand } from './components/lando/FlagBand';
import { HardwareIA } from './components/lando/HardwareIA';
import { SystemsGrid } from './components/lando/SystemsGrid';
import { Formacion } from './components/lando/Formacion';
import { ContactFooter } from './components/lando/ContactAndFooter';
import { useSmoothScroll } from './hooks/useSmoothScroll';
import { useAssistedScroll } from './lib/assistedScroll';

// Estructura "estilo landonorris.com" (ver docs/landonorris-DESIGN.md): portada y
// transformación (HeroSection) intactas; debajo, manifiesto gigante, pista
// horizontal de proyectos, la sección CLARA Hardware | Software, rejilla de
// sistemas técnicos y el cierre (contacto y pie fundidos en una pradera). El menú superior
// cambia de tema según la sección que tiene debajo.
export const App: React.FC = () => {
  // Activate Lenis + GSAP ScrollTrigger smooth scrolling
  useSmoothScroll();
  useAssistedScroll();

  return (
    <div className="relative min-h-screen bg-cyber-dark text-cyber-textBright selection:bg-neo-rose selection:text-white">
      {/* Fondo ambiental liviano (CSS) detrás del Hero */}
      <div className="fixed inset-0 z-0 pointer-events-none bg-cyber-dark bg-radial-glow">
        <div className="absolute inset-0 scanlines-overlay opacity-20" />
      </div>

      {/* La pantalla de carga (Preloader) vive en su propia raíz de React, ver main.tsx */}
      <TopNav />
      <SocialDock />

      {/* DOM Interactive Layer */}
      <div className="relative z-10 flex flex-col">
        {/* (indicador de puntos a la derecha retirado: pedido explícito) */}

        <main className="flex-1 flex flex-col">
          <HeroSection />
          {/* El manifiesto ya no es una sección aparte: es el ÚLTIMO cuadro del pin
              del Hero (el gato camina sobre él, ver CatManifestoStage). Este ancla
              conserva #manifiesto para el menú: alto 100vh con margen -100vh, así
              no ocupa lugar y su borde superior cae exacto en el final del pin
              (los últimos 100vh del pin-spacer, donde el manifiesto final se
              desplaza hacia arriba). data-nav-theme hace que el menú aparezca y
              tome el tema oscuro sobre el manifiesto. */}
          <div
            id="manifiesto"
            data-nav-theme="dark"
            aria-hidden
            className="pointer-events-none"
            style={{ height: '100dvh', marginTop: '-100dvh' }}
          />
          {/* Transición manifiesto -> banderín: "LA CORRIENTE". La línea de horizonte del
              manifiesto se vuelve una pista de circuito; un pulso la recorre, baja hasta el
              banderín (que se fija un momento), se divide en las líneas base de las dos
              filas gigantes, las "enciende" y abre el iris de la foto (ver FlagBand). */}
          <FlagBand />
          <WorkTrack />
          <HardwareIA />
          <SystemsGrid />
          <Formacion />
          <ContactFooter />
        </main>
      </div>
    </div>
  );
};

export default App;
