import { useEffect, useState } from 'react';

// Foto del tablero (public/office/board.webp) compartida por la ÓRBITA y la
// FORMACIÓN (escritorio). La órbita termina "dentro" de esta misma foto y la
// Formación continúa con ella: las dos usan EXACTAMENTE el mismo encaje
// (`fitBoardPhoto`), así el último cuadro de la órbita y el primero de la
// Formación son la misma imagen y el relevo no se nota.

export const BOARD_IMG = '/office/board.webp';
/** posición de la bombilla dentro de la imagen (fracción de ancho / alto), medida sobre la foto */
export const PHOTO_BULB_X = 0.499;
export const PHOTO_BULB_Y = 0.154;
/** la bombilla queda a esta altura de la pantalla (fracción de la altura de la ventana) */
export const BULB_VH = 0.1;

export type PhotoSize = { w: number; h: number };

// tamaño natural, cargado una sola vez para toda la página
let sizePromise: Promise<PhotoSize | null> | null = null;
let sizeCache: PhotoSize | null = null;
const loadSize = () => {
  if (!sizePromise) {
    sizePromise = new Promise((res) => {
      const im = new Image();
      im.onload = () => {
        sizeCache = { w: im.naturalWidth, h: im.naturalHeight };
        res(sizeCache);
      };
      im.onerror = () => res(null);
      im.src = BOARD_IMG;
    });
  }
  return sizePromise;
};

export function useBoardPhotoSize(): PhotoSize | null {
  const [size, setSize] = useState<PhotoSize | null>(sizeCache);
  useEffect(() => {
    let alive = true;
    loadSize().then((s) => alive && setSize(s));
    return () => {
      alive = false;
    };
  }, []);
  return size;
}

/**
 * Encaje de escritorio: la foto cubre el escenario (cw × boxH) anclada arriba, pero
 * desplazada para que SU bombilla quede EXACTO en x = 50 % del ancho y y = 10vh.
 * Devuelve la caja absoluta de la imagen (px, relativa al escenario).
 */
export function fitBoardPhoto(photo: PhotoSize, cw: number, boxH: number, vh: number): React.CSSProperties {
  const target = BULB_VH * vh;
  // alto limitado: d = Y·(boxH + d) − target  →  d = (Y·boxH − target)/(1 − Y)
  const dH = Math.max(0, (PHOTO_BULB_Y * boxH - target) / (1 - PHOTO_BULB_Y));
  const sc = Math.max(cw / photo.w, (boxH + dH) / photo.h);
  const h = photo.h * sc;
  const w = photo.w * sc;
  const d = PHOTO_BULB_Y * h - target; // sube la foto hasta que la bombilla caiga en `target`
  const left = cw / 2 - PHOTO_BULB_X * w;
  return { position: 'absolute', left, top: -d, width: w, height: h, maxWidth: 'none' };
}

/** máscara del borde superior (liso, igual que la Formación en escritorio) */
export const BOARD_MASK = 'linear-gradient(#0000 0, #000 9vh)';
