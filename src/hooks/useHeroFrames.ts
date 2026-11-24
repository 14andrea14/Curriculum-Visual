import { useEffect, useState } from 'react';
import { reportLoad } from '../lib/preload';
import { frameBlobs } from '../lib/frameSequence';

interface FrameManifest {
  count: number;
  width: number;
  height: number;
  fps: number;
}

interface HeroFramesState {
  frames: HTMLImageElement[] | null;
  width: number;
  height: number;
  loaded: boolean;
  loadProgress: number;
  // true si la secuencia no está disponible: sin manifest, o más del 10 % de
  // los fotogramas no decodifican (p. ej. el servidor de desarrollo devuelve
  // HTML para una carpeta de public/ creada después de arrancar). El caller
  // debe caer a su alternativa en vez de mostrar un hueco.
  failed: boolean;
}

// Precarga la secuencia de fotogramas del Hero (ver ANALISIS_Y_PLAN_V2.md,
// Sección 3.2). basePath apunta a una carpeta de /public con manifest.json +
// frame_001.webp..frame_NNN.webp. Si el manifest no existe (video aún no
// exportado), loaded queda en false y el caller debe usar su fallback.
export function useHeroFrames(basePath: string, motionHoldFrame?: number): HeroFramesState {
  const [state, setState] = useState<HeroFramesState>({
    frames: null,
    width: 0,
    height: 0,
    loaded: false,
    loadProgress: 0,
    failed: false,
  });
  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    fetch(`${basePath}/manifest.json`, { signal })
      .then((res) => {
        if (!res.ok) throw new Error('manifest not found');
        return res.json() as Promise<FrameManifest>;
      })
      .then((manifest) => {
        if (signal.aborted) return;

        const frames: HTMLImageElement[] = new Array(manifest.count);
        reportLoad(basePath, 0, manifest.count); // pantalla de carga: ya se sabe cuántos cuadros son
        let loadedCount = 0;
        let errorCount = 0;

        const onOneLoaded = () => {
          if (signal.aborted) return;
          loadedCount += 1;
          setState((prev) => ({ ...prev, loadProgress: loadedCount / manifest.count }));
          reportLoad(basePath, loadedCount, manifest.count);
          if (loadedCount === manifest.count) {
            setState({
              frames,
              width: manifest.width,
              height: manifest.height,
              loaded: true,
              loadProgress: 1,
              failed: errorCount > manifest.count * 0.1,
            });
          }
        };

        // Cada fotograma se descarga como Blob y el <img> se crea desde él: el
        // Blob queda registrado (frameBlobs) para que lib/frameSequence lo
        // decodifique fuera del hilo principal sin volver a pedirlo a la red.
        // El <img> sigue existiendo (carga, alternativa de dibujo, API).
        const canBlob = typeof fetch === 'function' && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function';
        for (let i = 0; i < manifest.count; i++) {
          const img = new Image();
          const frameNumber = String(i + 1).padStart(3, '0');
          const filename = `frame_${frameNumber}.webp`;
          const url = `${basePath}/${filename}`;
          let usingMotion = motionHoldFrame !== undefined && i > 0 && i < motionHoldFrame && i % 2 === 0;
          let objUrl = '';
          const releaseUrl = () => {
            if (objUrl) URL.revokeObjectURL(objUrl);
            objUrl = '';
          };
          const loadBlob = (src: string) => fetch(src, { signal })
            .then((r) => {
              if (!r.ok || r.headers.get('content-type')?.includes('text/html')) throw new Error(`Fotograma no disponible: ${src}`);
              return r.blob();
            })
            .then((blob) => {
              if (signal.aborted) return;
              frameBlobs.set(img, blob);
              objUrl = URL.createObjectURL(blob);
              img.src = objUrl;
            });
          const loadOriginal = () => {
            usingMotion = false;
            frameBlobs.delete(img);
            loadBlob(url).catch(() => {
              if (!signal.aborted) img.src = url;
            });
          };
          img.onload = () => {
            releaseUrl(); // el <img> ya tiene sus datos
            onOneLoaded();
          };
          img.onerror = () => {
            releaseUrl();
            if (signal.aborted) return;
            if (usingMotion) {
              loadOriginal();
              return;
            }
            errorCount += 1;
            onOneLoaded(); // no bloquear la carga por un frame roto
          };
          frames[i] = img;
          if (!canBlob) {
            usingMotion = false;
            img.src = url;
            continue;
          }
          // La variante cubre sólo los pares que se usan durante el movimiento;
          // los descansos, la continuación y los cuadros impares usan el original.
          if (usingMotion) {
            loadBlob(`${basePath}-motion/${filename}`).catch(() => {
              if (!signal.aborted) loadOriginal();
            });
          } else {
            loadOriginal();
          }
        }
      })
      .catch(() => {
        if (!signal.aborted) setState((prev) => ({ ...prev, failed: true }));
        // Sin manifest (video real aún no exportado) -> se queda en loaded:false,
        // el caller usa drawPlaceholderFrame como fallback.
      });

    return () => {
      controller.abort();
    };
  }, [basePath, motionHoldFrame]);

  return state;
}
