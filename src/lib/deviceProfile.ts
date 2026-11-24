// Perfil del dispositivo para el MODO LIGERO de celulares y tabletas.
//
// Decisión de la usuaria: en teléfono se deja lo MÍNIMO para que corra en cualquier equipo (iOS
// mata la pestaña al pasar ~1.2-1.5 GB de memoria y la página completa llegaba a ~1.3 GB).
// El escritorio conserva TODA la experiencia, sin cambios.
//
//   'full'   -> escritorio (puntero fino, >= 1024 px): experiencia completa.
//   'lite'   -> celular/tableta (<1024 px o táctil sin mouse): sin guiño, sin cursor de cristal,
//               secuencias de fotogramas reducidas, sin efectos pesados (ver MOVIL_PLAN.md, bloque B).
//   'static' -> sin WebGL2 (o contexto GL imposible de crear): además sin ningún <Canvas> de three;
//               cada escena usa su respaldo CSS/SVG/imagen fija.
//
// Se calcula UNA vez por carga (no cambia al girar el teléfono, para que no se monten y desmonten
// escenas). Importable desde cualquier módulo; no depende de React.

export type DeviceMode = 'full' | 'lite' | 'static';

const MOBILE_QUERY = '(max-width: 1023px), (hover: none) and (pointer: coarse)';

let webgl2: boolean | null = null;
/** ¿Se puede crear un contexto WebGL2? (three r174 lo exige). Cacheado; libera el contexto de prueba. */
export const hasWebGL2 = (): boolean => {
  if (webgl2 !== null) return webgl2;
  if (typeof document === 'undefined') return (webgl2 = false);
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    const gl = c.getContext('webgl2');
    webgl2 = !!gl;
    // soltar el contexto de inmediato: iOS limita los contextos simultáneos
    (gl as WebGL2RenderingContext | null)?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    webgl2 = false;
  }
  return webgl2;
};

let mode: DeviceMode | null = null;
/** Modo del dispositivo (cacheado la primera vez que se pregunta). */
export const getDeviceMode = (): DeviceMode => {
  if (mode) return mode;
  if (typeof window === 'undefined' || !window.matchMedia) return (mode = 'full');
  const mobile = window.matchMedia(MOBILE_QUERY).matches;
  // ?modo=lite|full|static fuerza el modo (para probar en escritorio y para depurar)
  const forced = new URLSearchParams(window.location.search).get('modo');
  if (forced === 'lite' || forced === 'full' || forced === 'static') return (mode = forced);
  if (mobile) return (mode = 'lite');
  return (mode = hasWebGL2() ? 'full' : 'static');
};

/** Celular/tableta (o modo forzado): se omiten los efectos pesados. */
export const isLite = (): boolean => getDeviceMode() !== 'full';
/** Sin WebGL2: nada de <Canvas> de three. */
export const isStatic = (): boolean => getDeviceMode() === 'static';

/** Safari antiguo expone el evento de MediaQueryList a través de addListener. */
export function listenMedia(media: MediaQueryList, onChange: () => void) {
  if (media.addEventListener) {
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }
  media.addListener(onChange);
  return () => media.removeListener(onChange);
}
