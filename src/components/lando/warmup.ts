import { isPreloading, registerWarmup } from '../../lib/preload';
import { FIBERS, GRAIN, WEAR, WEAVE } from './poker/pokerTheme';

// CALENTAMIENTO de las secciones posteriores a la portada (corre DETRÁS de la pantalla de
// carga, ver registerWarmup en lib/preload.ts). Dos cosas que, si ocurren por primera vez a
// mitad del scroll, congelan la página:
//  1) decodificar las imágenes grandes (paño 2560x1440, colinas del pie, foto del tablero...);
//  2) la PRIMERA vez que Chrome pinta cada tipo de efecto (turbulencia SVG, máscaras, blur,
//     backdrop-filter, sombras grandes, 3D con backface...) compila un shader en la GPU:
//     con una caché fría eso son cientos de ms por efecto, y la mesa de póker junta varios de
//     golpe (medido: un solo cuadro de ~4.5 s al entrar al póker). Aquí se pintan una vez, en
//     muestras diminutas casi transparentes, mientras todavía se ve la carga.

// las imágenes se guardan para que el navegador no descarte lo decodificado
const keep: HTMLImageElement[] = [];
export const warmKeep = (src: string) =>
  new Promise<void>((res) => {
    const im = new Image();
    im.decoding = 'async';
    keep.push(im);
    im.onload = () => (im.decode ? im.decode().then(() => res(), () => res()) : res());
    im.onerror = () => res();
    im.src = src;
  });

/** Registra el calentamiento de un grupo de imágenes (devuelve la función que lo cancela). */
export const registerImageWarmup = (key: string, srcs: string[], weight = 1) =>
  registerWarmup(key, () => Promise.all(srcs.map(warmKeep)), weight);

const SAMPLE = 'position:absolute;width:44px;height:44px;opacity:0.012;overflow:hidden;';
const svgUrl = (s: string) => `url("data:image/svg+xml;utf8,${encodeURIComponent(s)}")`;

// una muestra por efecto (el programa de shader depende del tipo de efecto, no del tamaño)
const samples = (): string[] => {
  const duo = document.getElementById('fb-duotone');
  return [
    // turbulencia SVG (grano / pelo del paño / grano de las tarjetas de vidrio y del pie)
    `<div style="${SAMPLE}background:#06140F"><div style="position:absolute;inset:0;background-image:${GRAIN}"></div><div style="position:absolute;inset:0;background-image:${FIBERS};background-size:320px 320px"></div></div>`,
    `<div style="${SAMPLE}mix-blend-mode:overlay;background-image:${svgUrl("<svg xmlns='http://www.w3.org/2000/svg' width='140' height='140'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>")}"></div>`,
    // máscara con degradé + degradés radiales / repetidos del paño
    `<div style="${SAMPLE}background:#06140F;-webkit-mask-image:linear-gradient(to bottom,transparent 0,#000 16px);mask-image:linear-gradient(to bottom,transparent 0,#000 16px)"><div style="position:absolute;inset:0;background:${WEAR},${WEAVE}"></div></div>`,
    // vidrio: backdrop-filter (con y sin saturación / brillo)
    `<div style="${SAMPLE}background:linear-gradient(90deg,#F230D2,#0A1A2B)"><div style="position:absolute;inset:4px;border-radius:12px;backdrop-filter:blur(16px) saturate(150%);-webkit-backdrop-filter:blur(16px) saturate(150%);box-shadow:inset 0 1px 0 rgba(255,255,255,.3),0 24px 50px -24px rgba(0,0,0,.75)"></div><div style="position:absolute;inset:14px;backdrop-filter:blur(10px) saturate(1.6) brightness(1.18);-webkit-backdrop-filter:blur(10px) saturate(1.6) brightness(1.18);clip-path:inset(0 round 8px)"></div></div>`,
    // blur / drop-shadow como filtro y recortes animados
    `<div style="${SAMPLE}"><span style="position:absolute;left:4px;top:4px;color:#ECE8F2;filter:blur(4px);clip-path:inset(-30% 20% -30% -40%)">Ab</span><span style="position:absolute;left:20px;top:20px;color:#ECE8F2;filter:drop-shadow(0 0 8px #F230D2);clip-path:polygon(44% 0,56% 0,78% 100%,22% 100%)">Cd</span></div>`,
    // 3D: perspectiva, backface oculta, sombras grandes, texto con degradé recortado
    `<div style="${SAMPLE}overflow:visible;perspective:700px"><div style="position:absolute;inset:6px;transform-style:preserve-3d;transform:rotateY(35deg) rotateX(10deg)"><div style="position:absolute;inset:0;backface-visibility:hidden;border-radius:6px;background:#ECE8F2;box-shadow:0 16px 30px -12px rgba(0,0,0,.75),0 3px 6px rgba(0,0,0,.4)"></div><div style="position:absolute;inset:0;backface-visibility:hidden;transform:rotateY(180deg);background:#0b1530"></div></div></div>`,
    `<div style="${SAMPLE}"><span style="color:transparent;-webkit-text-stroke:1.5px #fff;background-image:linear-gradient(100deg,transparent,rgba(255,255,255,.85),transparent),linear-gradient(180deg,rgba(255,255,255,.55),rgba(255,255,255,0));-webkit-background-clip:text;background-clip:text;font:700 30px Anton,sans-serif">Ab</span></div>`,
    // mezcla de capas + filtro duotono SVG de la foto del banderín + desenfoque SVG de la firma
    `<div style="${SAMPLE}background:#0A1A2B"><div style="position:absolute;inset:0;mix-blend-mode:screen;background:radial-gradient(circle,rgba(255,240,215,.55),rgba(255,240,215,0) 70%)"></div></div>`,
    duo ? `<div style="${SAMPLE}background:linear-gradient(135deg,#888,#eee);filter:brightness(1.28) contrast(1.1) url(#fb-duotone)"></div>` : '',
    `<svg style="${SAMPLE}" viewBox="0 0 44 44"><defs><filter id="wu-blur" x="-10%" y="-30%" width="120%" height="160%"><feGaussianBlur stdDeviation="6"/></filter></defs><text x="4" y="30" font-size="28" fill="#000" fill-opacity=".55" filter="url(#wu-blur)">Aj</text></svg>`,
  ];
};

let paintWarmed = false;
/** Pinta una vez una muestra de cada efecto pesado (solo mientras la carga cubre la página). */
export const registerPaintWarmup = () =>
  registerWarmup(
    'lando-paint-effects',
    () =>
      new Promise<void>((res) => {
        if (paintWarmed || !isPreloading() || typeof document === 'undefined') return res();
        paintWarmed = true;
        const host = document.createElement('div');
        host.setAttribute('aria-hidden', 'true');
        // por encima de todo pero casi transparente (la carga es z-300): si fuera por debajo, el
        // compositor descartaría las muestras tapadas y no compilaría los efectos de composición
        host.style.cssText = 'position:fixed;left:0;top:0;width:480px;height:96px;z-index:2147483000;pointer-events:none;contain:layout paint;';
        host.innerHTML = samples()
          .map((h, i) => `<div style="position:absolute;left:${(i % 10) * 46}px;top:${Math.floor(i / 10) * 46}px;width:44px;height:44px">${h}</div>`)
          .join('');
        document.body.appendChild(host);
        // dos cuadros para que se pinten y componga todo, y un respiro para que la GPU compile
        requestAnimationFrame(() =>
          requestAnimationFrame(() =>
            window.setTimeout(() => {
              host.remove();
              res();
            }, 350),
          ),
        );
      }),
    2,
  );
