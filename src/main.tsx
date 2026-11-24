import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { Preloader } from './components/lando/Preloader';
import './styles/index.css';

// La pantalla de carga tiene su PROPIA raíz y se pinta primero: montar toda la página
// (Hero, secciones, canvas 3D) bloquea el hilo principal un buen rato, y si fuera parte
// del mismo árbol el letrero "cargando" no aparecería hasta que ese trabajo terminara.
// Así el letrero se ve de inmediato y la página se monta justo después (detrás, a
// z-index 300 por encima de todo, el Preloader la cubre).
const preloaderHost = document.createElement('div');
preloaderHost.id = 'preloader-root';
document.body.appendChild(preloaderHost);
ReactDOM.createRoot(preloaderHost).render(
  <React.StrictMode>
    <Preloader />
  </React.StrictMode>
);

const mountApp = () =>
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
// dos cuadros: da tiempo a que el navegador pinte el letrero antes del trabajo pesado
requestAnimationFrame(() => requestAnimationFrame(() => window.setTimeout(mountApp, 0)));
