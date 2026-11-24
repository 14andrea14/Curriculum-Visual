import React from 'react';
import type { SlideDef } from './slides';
import { ACCENT } from './slides';
import type { DrawingDef } from './drawings';

// Post-it completo (papel, franja adhesiva, esquina curvada, sombras de
// esquinas levantadas y chincheta). Se usa en el tablero y en el zoom; todo en
// `em` para que la versión ampliada sea la misma maqueta a mayor escala.
// Las clases .fm-* se definen en el <style> de Formacion.tsx.
export const NoteCard: React.FC<{ slide: SlideDef; pinned?: boolean }> = ({ slide, pinned = true }) => (
  <div className="relative">
    <div className="fm-lift" aria-hidden />
    <div className="fm-shell" style={{ background: slide.paper }}>
      <div className="fm-paper" aria-hidden />
      <div className="relative overflow-hidden px-[1.6em] pt-[1.9em] pb-[1.5em] min-h-[23em]">{slide.body}</div>
    </div>
    {pinned && (
      <span
        aria-hidden
        className="fm-pin absolute left-1/2 -top-[0.45em] -ml-[0.8em] w-[1.6em] h-[1.6em] rounded-full"
        style={{
          background: `radial-gradient(circle at 35% 32%, #ffd1f3 0, ${ACCENT} 40%, #8d0c78 100%)`,
          boxShadow: '0.25em 0.45em 0.45em rgba(0,0,0,0.45)',
        }}
      />
    )}
  </div>
);

// Chinchetas de los dibujos: magenta (la de las notas) o pálida, para variar.
const PIN_BG: Record<DrawingDef['pin'], string> = {
  magenta: `radial-gradient(circle at 35% 32%, #ffd1f3 0, ${ACCENT} 40%, #8d0c78 100%)`,
  pale: 'radial-gradient(circle at 35% 32%, #ffffff 0, #e4dff0 42%, #8f89a6 100%)',
};

// Post-it con dibujo: recorte con transparencia (sin papel propio: el papel ya
// está en la imagen). La sombra es un drop-shadow que sigue el contorno del recorte.
// `pinned` pone la chincheta (en el zoom no); la clase .fm-art-img la anima la línea
// de tiempo (la sombra "se asienta" al clavarse).
export const DrawingCard: React.FC<{ art: DrawingDef; pinned?: boolean; zoom?: boolean }> = ({ art, pinned = true, zoom = false }) => (
  <div className="relative">
    <img
      src={art.src}
      alt={art.alt}
      width={art.w}
      height={art.h}
      draggable={false}
      className={zoom ? 'fm-art-img fm-art-zoom block w-full h-auto select-none' : 'fm-art-img block w-full h-auto select-none'}
    />
    {pinned && (
      <span
        aria-hidden
        className="fm-xpin absolute left-1/2 -top-[0.45em] -ml-[0.8em] w-[1.6em] h-[1.6em] rounded-full"
        style={{ background: PIN_BG[art.pin], boxShadow: '0.25em 0.45em 0.45em rgba(0,0,0,0.45)' }}
      />
    )}
  </div>
);
