import { isLite } from '../../lib/deviceProfile';
import React, { useEffect, useLayoutEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { PORTFOLIO_DATA } from '../../data/portfolioData';
import { registerStops } from '../../lib/assistedScroll';
import { SCENE_CSS } from './contact/contactStyles';
import { FooterScene, type SceneCtrl } from './contact/FooterScene';
import { createLiquid, type LiquidHandle } from './contact/liquid';
import { registerImageWarmup } from './warmup';

gsap.registerPlugin(ScrollTrigger);

// CONTACTO + PIE — UNA sola escena (la pradera). Es el cierre de la página y el
// CAMBIO DE AMBIENTE (oficina → exterior). La tarjeta de contacto azul desapareció:
// su transición ahora trae la pradera.
// La transición es un LÍQUIDO que sube desde el borde inferior (ver contact/liquid.ts):
// desde el final del tablero de FORMACIÓN, la superficie ondulada (olas que se mueven
// y se calman al llenarse) asciende hasta salir por arriba y la escena se ve DENTRO del
// líquido (el líquido es la máscara de la escena). Va atada al scroll (reversible: al
// subir, se drena) y el tablero queda a la vista por encima de la superficie. El
// escenario va en una capa FIJA a pantalla completa (así el tablero no se arrastra con
// la subida) y solo se recorta con clip-path: polygon, sin filtros. Con la escena casi
// llena se dispara la entrada del contenido (titular de vidrio, nombre que sube desde
// detrás de la colina, iconos, copyright; ver FooterScene), también reversible.
// "Reducir movimiento": sin líquido, la escena queda estática y visible.
export const ContactFooter: React.FC = () => {
  const { profile } = PORTFOLIO_DATA;
  const rootRef = useRef<HTMLElement>(null);
  const ctrlRef = useRef<SceneCtrl | null>(null);
  // cielo y colina (2560x1430): decodificados detrás de la carga, no al llegar al pie
  useEffect(() => registerImageWarmup('footer-img', ['/footer/sky.webp', '/footer/hills.webp']), []);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const mm = gsap.matchMedia();
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      const q = gsap.utils.selector(root);
      const stage = q('.ft-stage')[0] as HTMLElement;
      const canvas = q('.ft-liquid')[0] as HTMLCanvasElement | undefined;
      const sky = q('.ft-sky')[0] as HTMLElement;
      const near = q('.ft-near')[0] as HTMLElement;
      // la sección arranca solapada con el final del tablero: lo que solapa es el tramo
      // de scroll que NO se recorre, así el tablero se arrastra menos mientras sube el líquido
      const overlap = () => Math.max(0, -parseFloat(getComputedStyle(root).marginTop) || 0);

      // modo "vivo": escenario fijo, oculto hasta que el líquido lo revele
      root.classList.add('ft-live');

      // El recorrido empieza cuando el borde del tablero asoma por abajo (scroll 0 del
      // final de FORMACIÓN) y termina en el pie de la página, con la escena a pantalla completa.
      let shown = false;
      let liquid: LiquidHandle | null = null;
      const wake = () => liquid?.wake();
      const st = ScrollTrigger.create({
        trigger: root,
        start: () => `top bottom-=${overlap()}`,
        end: () => ScrollTrigger.maxScroll(window),
        invalidateOnRefresh: true,
        onUpdate: wake,
        onRefresh: wake,
      });
      // antes del tramo (una pantalla y media): despierta el tick para precalentar la escena
      const pre = ScrollTrigger.create({
        trigger: root,
        start: () => st.start - window.innerHeight * 1.5,
        end: () => st.start,
        invalidateOnRefresh: true,
        onToggle: wake,
      });
      // progreso directo del scroll (sin esperar al evento): lo lee el tick del líquido
      const read = () => {
        const span = st.end - st.start;
        return span > 0 ? (window.scrollY - st.start) / span : 0;
      };
      const onFrame = (p: number) => {
        // paralaje: el cielo y la colina se acomodan a distinta velocidad
        sky.style.transform = `translate3d(0,${(-6 * (1 - p)).toFixed(2)}%,0)`;
        near.style.transform = `translate3d(0,${(10 * (1 - p)).toFixed(2)}%,0)`;
        // contenido: entra con el líquido ya a media pantalla (con histéresis para no parpadear)
        const on = shown ? p > 0.36 : p > 0.42;
        if (on !== shown) {
          shown = on;
          ctrlRef.current?.(on);
        }
      };
      if (canvas) {
        liquid = createLiquid({ stage, canvas, read, span: () => st.end - st.start, onFrame });
      } else {
        const reveal = () => {
          const p = Math.max(0, Math.min(1, read()));
          stage.style.visibility = p > 0 ? 'visible' : 'hidden';
          stage.style.clipPath = p >= 1 ? '' : 'inset(' + (100 * (1 - p)) + '% 0 0)';
          onFrame(p);
        };
        liquid = { wake: reveal, destroy: () => {
          stage.style.visibility = '';
          stage.style.clipPath = '';
        } };
        reveal();
      }
      return () => {
        st.kill();
        pre.kill();
        liquid?.destroy();
        liquid = null;
        sky.style.transform = '';
        near.style.transform = '';
        root.classList.remove('ft-live');
      };
    });
    return () => mm.revert();
  }, []);

  // Scroll asistido: un solo reposo, el último cuadro de la escena (todo ya entró).
  // El viaje que llega aquí es toda la coreografía (subida del líquido, titular,
  // letras del nombre con resorte y destello, iconos de a uno), por eso es largo.
  // Coincide con la parada 'page-end' del motor, que se fusiona con esta y se queda
  // con la más larga.
  useEffect(
    () =>
      registerStops('contact', [
        {
          id: 'contact-footer',
          y: () => document.documentElement.scrollHeight - window.innerHeight,
          desktop: 4.5,
          mobile: 3.5,
          upDesktop: 3.8,
        },
      ]),
    [],
  );

  return (
    <section ref={rootRef} id="contact" data-nav-theme="dark" className="ft-root relative isolate pointer-events-none">
      <style>{SCENE_CSS}</style>
      {/* .ft-stage = la escena (en modo vivo: capa fija a pantalla completa que recorta el líquido) */}
      <div className="ft-stage">
        <FooterScene
          name={profile.name}
          location={profile.location}
          contact={{ email: profile.email, linkedin: profile.linkedin, github: profile.github, whatsapp: profile.whatsapp, phone: profile.phone }}
          ctrlRef={ctrlRef}
        />
      </div>
      {/* piel del líquido: borde translúcido, brillo, burbujas y gotas (un solo canvas 2D) */}
      {!isLite() && <canvas aria-hidden className="ft-liquid" />}
    </section>
  );
};
