import { refreshScroll } from '../../../lib/refreshScroll';
import { isLite } from '../../../lib/deviceProfile';
import React, { useLayoutEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ContactButtons } from './ContactButtons';
import { GlassLine } from './GlassLine';

gsap.registerPlugin(ScrollTrigger);

// ESCENA FINAL — pradera con TODO el contacto (pedido de la usuaria: contacto y pie
// fundidos en una sola escena; referencia: footer de Opnest). De atrás hacia adelante:
//   1) cielo (/footer/sky.webp: del azul noche al rosa),
//   2) titular «¿HABLAMOS DE tu proyecto?» y NOMBRE gigante, ambos en VIDRIO esmerilado
//      (ver GlassLine y contactStyles): un bloque con backdrop-filter recortado con la
//      forma de las letras mediante un <clipPath> SVG con <text>; encima, las letras
//      HTML dibujan el borde de luz, el brillo especular y un destello que barre.
//      El titular va justo encima del nombre (misma pila, anclada a la cresta),
//   3) la colina de pasto del frente (/footer/hills.webp, recortada sobre
//      transparente), que TAPA la base de las letras del nombre,
//   4) sobre el pasto: los cuatro iconos de contacto de vidrio y el copyright.
// Geometría: la capa de la colina mide --hh de alto (16:9 del ancho en escritorio) y su
// cresta está a ~53 % de su alto; el nombre se apoya a 42 % de --hh.
// Movimiento: la subida de la tarjeta (ContactAndFooter) la controla el scroll; al
// llegar a la mitad se dispara `ctrl(true)`: el titular se condensa, las letras del
// nombre SUBEN desde detrás de la colina con resorte y un destello las recorre, los
// iconos aparecen de a uno y entra el copyright. `ctrl(false)` lo devuelve (reversible).
// Con el cursor (puntero fino) las letras del nombre se apartan y vuelven con resorte.
// "Reducir movimiento": todo queda estático y visible.

type Geom = { fs: number; lineH: number; xs: number[]; ys: number[]; total: number };

export type SceneCtrl = (on: boolean) => void;

export const FooterScene: React.FC<{
  name: string;
  location: string;
  contact: { email: string; linkedin: string; github: string; whatsapp: string; phone: string };
  ctrlRef: React.MutableRefObject<SceneCtrl | null>;
}> = ({ name, location, contact, ctrlRef }) => {
  const words = name.toUpperCase().split(' ').slice(0, 2);
  const letters = words.flatMap((w, wi) => Array.from(w).map((c, ci) => ({ c, key: `${wi}-${ci}` })));
  const rootRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [geom, setGeom] = useState<Geom>({ fs: 100, lineH: 90, xs: letters.map(() => 0), ys: letters.map(() => 80), total: 10 });
  const geomRef = useRef(geom);
  geomRef.current = geom;

  // Ajusta el tamaño para que el nombre ocupe el ancho (una línea en escritorio, dos
  // en móvil) y mide la posición de cada letra y la línea base de su palabra (para el
  // recorte SVG del vidrio).
  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    let lastKey = '';
    let lastRoW = 0;
    let lastRoH = 0;
    let roRaf = 0;
    let refreshTimer = 0;
    let lastEm = 0; // ancho del nombre en em (depende de la fuente)
    const fit = (force = false) => {
      const line = wrap.querySelector<HTMLElement>('.ft-name');
      if (!line) return;
      const key = `${wrap.clientWidth}|${getComputedStyle(line).flexDirection}`;
      if (!force && key === lastKey) return;
      lastKey = key;
      wrap.style.fontSize = '100px';
      const w = line.scrollWidth;
      if (w <= 0) return;
      lastEm = w / 100;
      const fs = (100 * wrap.clientWidth) / w;
      wrap.style.fontSize = `${fs}px`;
      const drops = Array.from(line.querySelectorAll<HTMLElement>('.ft-drop'));
      drops.forEach((el) => {
        const l = el.querySelector<HTMLElement>('.ft-letter');
        if (l) l.style.setProperty('--o', `${(el.offsetLeft / fs).toFixed(4)}em`);
      });
      const baseOf = (el: HTMLElement) => el.closest('.ft-word')?.querySelector<HTMLElement>('.ft-base')?.offsetTop ?? 0;
      setGeom({
        fs,
        lineH: line.offsetHeight,
        xs: drops.map((el) => el.offsetLeft),
        ys: drops.map(baseOf),
        total: w / 100,
      });
      // los ajustes por redimensionado agrupan el refresh (150 ms); los forzados (montaje,
      // fuentes) lo hacen enseguida, como antes
      window.clearTimeout(refreshTimer);
      if (force) refreshScroll();
      else refreshTimer = window.setTimeout(() => refreshScroll(), 150);
    };
    fit(true);
    document.fonts?.ready.then(() => fit(true));
    // Tolerante: los cambios pequeños de tamaño (< 24 px en ancho Y alto; p. ej. los ~11 px
    // de una barra de scroll que aparece o desaparece) se ignoran, y los reales se agrupan
    // en un solo ajuste por cuadro. Cada ajuste termina en refreshScroll(), que
    // recalcula estilos y layout de toda la página (~0,5 s medidos).
    lastRoW = wrap.clientWidth;
    lastRoH = wrap.clientHeight;
    const ro = new ResizeObserver((entries) => {
      // El ancho del nombre (en em) cambia si carga la fuente Anton DESPUÉS del ajuste
      // (`document.fonts.ready` puede resolverse antes de que se pida): hay que reajustar
      // aunque el cuadro contenedor no cambie. Antes esto se corregía "de rebote" con el
      // cambio de ancho de la barra de scroll.
      const ln0 = wrap.querySelector<HTMLElement>('.ft-name');
      const fsNow0 = parseFloat(wrap.style.fontSize);
      if (ln0 && fsNow0 > 0 && lastEm > 0 && Math.abs(ln0.scrollWidth / fsNow0 - lastEm) / lastEm > 0.005) {
        lastRoW = wrap.clientWidth;
        lastRoH = wrap.clientHeight;
        if (roRaf) cancelAnimationFrame(roRaf);
        roRaf = requestAnimationFrame(() => {
          roRaf = 0;
          fit(true);
        });
        return;
      }
      const r = entries.find((e) => e.target === wrap)?.contentRect;
      if (!r) return;
      if (Math.abs(r.width - lastRoW) < 24 && Math.abs(r.height - lastRoH) < 24) {
        // salvo que cambie el cuadro del nombre (una o dos líneas, en el punto de corte lg)
        const ln = wrap.querySelector<HTMLElement>('.ft-name');
        if (!ln || lastKey.endsWith(`|${getComputedStyle(ln).flexDirection}`)) return;
      }
      if (r) {
        lastRoW = r.width;
        lastRoH = r.height;
      }
      if (roRaf) return;
      roRaf = requestAnimationFrame(() => {
        roRaf = 0;
        fit();
      });
    });
    ro.observe(wrap);
    const nameLine = wrap.querySelector<HTMLElement>('.ft-name');
    if (nameLine) ro.observe(nameLine);
    return () => {
      if (roRaf) cancelAnimationFrame(roRaf);
      window.clearTimeout(refreshTimer);
      ro.disconnect();
    };
  }, []);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const wrap = wrapRef.current;
    if (!root || !wrap) return;
    const mm = gsap.matchMedia();
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      const q = gsap.utils.selector(root);
      const line = q('.ft-name')[0] as HTMLElement | undefined;
      const drops = q('.ft-drop') as HTMLElement[];
      const cgs = Array.from(root.querySelectorAll<SVGGElement>('.ft-cg'));
      const n = drops.length;
      if (!line || !n) return;
      const fsNow = () => parseFloat(wrap.style.fontSize) || geomRef.current.fs;

      // Estado inicial (oculto) y línea de tiempo de ENTRADA de la escena
      const front = { p: -9 };
      const setP = () => line.style.setProperty('--p', `${front.p.toFixed(3)}em`);
      setP();
      const hl = { v: -80 };
      const hlTxt = q('.ft-hl-line .ft-gl-txt') as HTMLElement[];
      const setHl = () => hlTxt.forEach((el) => el.style.setProperty('--sx', `${hl.v.toFixed(1)}%`));
      const hlLines = q('.ft-hl-line') as HTMLElement[];
      const nameGlass = q('.ft-name-glass');
      const pairs = [...drops, ...cgs];
      if (cgs.length > 0) gsap.set(cgs, { transformOrigin: '50% 50%' });

      const tl = gsap.timeline({ paused: true });
      // 1) titular: cada línea sube un poco y el vidrio "se condensa" (la opacidad va en
      //    el bloque de vidrio y en el texto por separado, no en un contenedor: un
      //    ancestro con opacidad < 1 anula el backdrop-filter de sus hijos)
      hlLines.forEach((ln, i) => {
        const glass = ln.querySelector('.ft-glass');
        const txt = ln.querySelector('.ft-gl-txt');
        tl.fromTo(ln, { y: () => fsNow() * 0.4 }, { y: 0, duration: 1.1, ease: 'power3.out' }, i * 0.16);
        tl.fromTo([glass, txt], { opacity: 0 }, { opacity: 1, duration: 0.8, ease: 'power2.out' }, i * 0.16);
      });
      tl.fromTo(hl, { v: -80 }, { v: 170, duration: 1.5, ease: 'power2.inOut', onUpdate: setHl }, 0.7).set(hl, { v: -80, onComplete: setHl });

      // 2) nombre: las letras (bordes HTML + recorte del vidrio, en pareja) suben desde
      //    detrás de la colina con resorte; luego un destello las recorre
      tl.fromTo([nameGlass, ...q('.ft-letter')], { opacity: 0 }, { opacity: 1, duration: 0.35, ease: 'none' }, 0.3);
      tl.fromTo(
        pairs,
        { y: () => fsNow() * 0.95, rotation: (i: number) => (((i % n) * 37) % 17) - 8 },
        { y: 0, rotation: 0, duration: 1.2, ease: 'elastic.out(1, 0.6)', stagger: (i: number) => (i % n) * 0.05 },
        0.3
      );
      tl.fromTo(front, { p: -1 }, { p: () => geomRef.current.total + 1, duration: 1.4, ease: 'power2.inOut', onUpdate: setP }, 1.3).set(front, { p: -9, onComplete: setP });

      // 3) iconos de contacto: de a uno, con un pequeño rebote; 4) copyright
      tl.fromTo(q('.ft-btn-item'), { scale: 0 }, { scale: 1, duration: 0.6, ease: 'back.out(2.4)', stagger: 0.12 }, 1.3);
      tl.fromTo(q('.ft-copy'), { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.7, ease: 'power2.out' }, 2.0);

      ctrlRef.current = (on) => {
        if (on) {
          if (tl.progress() === 0) tl.invalidate();
          tl.timeScale(1).play();
        } else tl.timeScale(2.2).reverse();
      };

      // Repulsión del cursor (letras HTML y su recorte de vidrio juntos)
      const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
      let offPointer = () => {};
      const lets = q('.ft-letter') as HTMLElement[];
      const cts = Array.from(root.querySelectorAll<SVGTextElement>('.ft-ct'));
      if (fine && lets.length > 0 && cts.length > 0) {
        gsap.set(cts, { transformOrigin: '50% 50%' });
        const opts = { duration: 0.9, ease: 'elastic.out(1, 0.45)' };
        const mk = (prop: string) => lets.map((el, i) => [gsap.quickTo(el, prop, opts), gsap.quickTo(cts[i], prop, opts)]);
        const qx = mk('x');
        const qy = mk('y');
        const qr = mk('rotation');
        const set = (arr: ReturnType<typeof mk>, i: number, v: number) => {
          arr[i][0](v);
          arr[i][1](v);
        };
        let raf = 0;
        let px = 0;
        let py = 0;
        const apply = () => {
          raf = 0;
          const fs = geomRef.current.fs;
          const R = fs * 1.15;
          for (let i = 0; i < lets.length; i++) {
            const r = (lets[i].parentElement as HTMLElement).getBoundingClientRect();
            const dx = r.left + r.width / 2 - px;
            const dy = r.top + r.height / 2 - py;
            const d = Math.hypot(dx, dy) || 1;
            const f = d < R ? Math.pow(1 - d / R, 2) : 0;
            set(qx, i, (dx / d) * f * fs * 0.3);
            set(qy, i, (dy / d) * f * fs * 0.3);
            set(qr, i, (dx / d) * f * 12);
          }
        };
        const move = (e: PointerEvent) => {
          px = e.clientX;
          py = e.clientY;
          if (!raf) raf = requestAnimationFrame(apply);
        };
        const leave = () => {
          if (raf) cancelAnimationFrame(raf);
          raf = 0;
          for (let i = 0; i < lets.length; i++) {
            set(qx, i, 0);
            set(qy, i, 0);
            set(qr, i, 0);
          }
        };
        root.addEventListener('pointermove', move);
        root.addEventListener('pointerleave', leave);
        offPointer = () => {
          if (raf) cancelAnimationFrame(raf);
          root.removeEventListener('pointermove', move);
          root.removeEventListener('pointerleave', leave);
        };
      }

      return () => {
        offPointer();
        ctrlRef.current = null;
        tl.kill();
        line.style.removeProperty('--p');
        hlTxt.forEach((el) => el.style.removeProperty('--sx'));
      };
    });
    return () => mm.revert();
  }, [ctrlRef]);

  // margen del bloque de vidrio alrededor del nombre (para que las letras que
  // suben o se apartan no queden fuera del recorte)
  const pad = geom.fs;

  return (
    <div ref={rootRef} className="ft-scene pointer-events-auto">
      {/* 1) cielo */}
      <div aria-hidden className="ft-layer ft-sky -top-[7%] h-[107%]">
        <img src={isLite() ? '/footer/sky-lite.webp' : '/footer/sky.webp'} alt="" className="ft-img" decoding="async" loading="lazy" />
      </div>

      {/* 2) pila de vidrio: titular + nombre, apoyada un poco por debajo de la cresta */}
      <div className="absolute inset-x-0 px-5 sm:px-10" style={{ bottom: 'calc(var(--hh) * var(--nb))' }}>
        <div className="max-w-[1500px] mx-auto">
          <h2 className="ft-hl select-none mb-[0.5em] lg:mb-[0.35em]" aria-label="¿Hablamos de tu proyecto?">
            <GlassLine id="ft-hl-clip-a" text="¿HABLAMOS DE" kind="caps" />
            <GlassLine id="ft-hl-clip-b" text="tu proyecto?" kind="serif" />
          </h2>
          <div ref={wrapRef} className="ft-namewrap relative select-none" title={name}>
            {/* recorte con la forma de las letras (mismas posiciones medidas) */}
            <svg aria-hidden width="0" height="0" className="absolute">
              <defs>
                <clipPath id="ft-glass-clip" clipPathUnits="userSpaceOnUse">
                  {letters.map((l, i) => (
                    <g key={l.key} className="ft-cg">
                      <text
                        className="ft-ct"
                        x={geom.xs[i] ?? 0}
                        y={(geom.ys[i] ?? 0) + pad}
                        fontFamily="Anton, Impact, sans-serif"
                        fontSize={geom.fs}
                      >
                        {l.c}
                      </text>
                    </g>
                  ))}
                </clipPath>
              </defs>
            </svg>
            <div
              aria-hidden
              className="ft-glass ft-name-glass"
              style={{ top: -pad, width: '100%', height: geom.lineH + pad * 2, clipPath: 'url(#ft-glass-clip)', WebkitClipPath: 'url(#ft-glass-clip)' }}
            />
            <div aria-hidden className="ft-name relative flex flex-col lg:flex-row w-max whitespace-nowrap gap-x-[0.2em] uppercase">
              {words.map((w, wi) => (
                <span key={wi} className="ft-word whitespace-nowrap">
                  <span className="ft-base inline-block w-0 h-0" />
                  {Array.from(w).map((c, ci) => (
                    // fuera: sube desde detrás de la colina (entrada); dentro: reacciona al cursor
                    <span key={ci} className="ft-drop inline-block">
                      <span className="ft-letter">{c}</span>
                    </span>
                  ))}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 3) colina de pasto del frente: tapa la base de las letras */}
      <div aria-hidden className="ft-layer ft-near bottom-0" style={{ height: 'var(--hh)' }}>
        <img src={isLite() ? '/footer/hills-lite.webp' : '/footer/hills.webp'} alt="" className="ft-img" decoding="async" loading="lazy" />
      </div>
      <div aria-hidden className="ft-grain" />

      {/* 4) sobre el pasto: iconos de contacto de vidrio y copyright */}
      <ContactButtons {...contact} />
      <footer className="ft-copy">
        <span>© 2026</span>
        <span>{location}</span>
      </footer>
    </div>
  );
};
