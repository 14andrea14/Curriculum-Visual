import React from 'react';
import ReactDOM from 'react-dom/client';
import { Preloader } from './components/lando/Preloader';
import { markAppMounting } from './lib/preload';
import { isLite } from './lib/deviceProfile';
import './styles/index.css';

// La pantalla de carga tiene su PROPIA raíz y se pinta primero: montar toda la página
// (Hero, secciones, canvas 3D) bloquea el hilo principal un buen rato, y si fuera parte
// del mismo árbol el letrero "cargando" no aparecería hasta que ese trabajo terminara.
// Así el letrero se ve de inmediato y la página se monta justo después (detrás, a
// z-index 300 por encima de todo, el Preloader la cubre).
// Además la página (App + three + gsap/lenis, ~1.2 MB comprimido) NO está en este chunk de
// entrada: se baja con import() cuando el letrero ya se pintó (vite.config.ts añade un
// modulepreload de baja prioridad para que la descarga arranque en paralelo, sin
// frenar al letrero). Antes todo ese código tenía que bajarse y evaluarse ANTES del primer
// cuadro; ahora el letrero depende solo de react + este archivo.
if (isLite()) {
  const cover = document.createElement('link');
  cover.rel = 'preload';
  cover.as = 'image';
  cover.href = '/hero-still/cover.webp';
  cover.setAttribute('fetchpriority', 'high');
  document.head.appendChild(cover);
}

const preloaderHost = document.createElement('div');
preloaderHost.id = 'preloader-root';
document.body.appendChild(preloaderHost);
ReactDOM.createRoot(preloaderHost).render(
  <React.StrictMode>
    <Preloader />
  </React.StrictMode>
);

const mountApp = (attempt = 0) =>
  import('./App')
    .then(({ default: App }) => {
      markAppMounting();
      ReactDOM.createRoot(document.getElementById('root')!).render(
        <React.StrictMode>
          <App />
        </React.StrictMode>
      );
    })
    .catch((err) => {
      // red caída un instante: reintenta (el Preloader sigue visible y tiene su propio tope)
      console.error('No se pudo cargar la página, reintentando…', err);
      if (attempt < 3) window.setTimeout(() => mountApp(attempt + 1), 1500 * (attempt + 1));
    });
// dos cuadros: da tiempo a que el navegador pinte el letrero antes del trabajo pesado
requestAnimationFrame(() => requestAnimationFrame(() => window.setTimeout(() => mountApp(), 0)));
