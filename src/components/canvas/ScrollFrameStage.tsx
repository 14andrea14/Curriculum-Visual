import React, { useEffect, useRef, useState } from 'react';
import { useHeroFrames } from '../../hooks/useHeroFrames';
import { FrameBitmapCache, drawSequence, newSequenceState, type FrameTransform, type FrameRect } from '../../lib/frameSequence';

// startAlign: ajuste geométrico aplicado completo en progress 0 y que se va
// soltando (suave) hasta desaparecer en progress = until. Sirve para que el
// primer fotograma de este clip calce con el último del clip anterior.
export type StartAlign = FrameTransform & { until: number };
function alignAt(progress: number, a?: StartAlign): FrameTransform | undefined {
  if (!a) return undefined;
  const t = Math.min(1, Math.max(0, progress / a.until));
  const k = 1 - t * t * (3 - 2 * t);
  if (k <= 0.0005) return undefined;
  return { s: 1 + (a.s - 1) * k, dx: a.dx * k, dy: a.dy * k };
}

// Canvas genérico que scrubbea 1:1 con el scroll una secuencia de fotogramas
// ya generada (WebP + manifest.json) — sin disolución en partículas ni
// placeholder procedural, para clips ya aprobados. Se usa para el clip del
// androide y el del gato (ver HeroSection.tsx, framesPath distinto). La
// decodificación por ventana de ImageBitmap y la mezcla entre fotogramas
// viven en lib/frameSequence.ts (ver ahí el porqué).
interface ScrollFrameStageProps {
  progress: number;
  framesPath: string;
  startAlign?: StartAlign;
  // true para secuencias recortadas (con alfa): sin fondo propio, deja ver
  // lo que haya detrás.
  transparent?: boolean;
  // En escritorio, la revelación de este clip usa un fotograma de cada dos
  // antes de llegar a este fotograma exacto de reposo.
  desktopHoldFrame?: number;
  // Avisa si la secuencia quedó lista ('ok') o no está disponible ('failed').
  onStatus?: (status: 'ok' | 'failed') => void;
  // Rectángulo destino por progreso (px del canvas); undefined = "cover" normal.
  rectAt?: (progress: number, w: number, h: number) => FrameRect | undefined;
}

const ScrollFrameStageInner: React.FC<ScrollFrameStageProps> = ({ progress, framesPath, startAlign, transparent = false, onStatus, rectAt, desktopHoldFrame }) => {
  const onStatusRef = useRef(onStatus);
  onStatusRef.current = onStatus;
  const rectAtRef = useRef(rectAt);
  rectAtRef.current = rectAt;
  const transparentRef = useRef(transparent);
  const alignRef = useRef(startAlign);
  alignRef.current = startAlign;
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const progressRef = useRef(progress);
  progressRef.current = progress;
  const desktopHoldFrameRef = useRef(desktopHoldFrame);
  desktopHoldFrameRef.current = desktopHoldFrame;
  const shouldSmoothPlayback = () => desktopHoldFrameRef.current !== undefined && window.innerWidth >= 1024;

  const [desktopMotion, setDesktopMotion] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 1024);
  useEffect(() => {
    if (desktopHoldFrame === undefined) return;
    const media = window.matchMedia('(min-width: 1024px)');
    const update = () => setDesktopMotion(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [desktopHoldFrame]);
  const heroFrames = useHeroFrames(framesPath, desktopMotion ? desktopHoldFrame : undefined);
  useEffect(() => {
    if (heroFrames.failed) onStatusRef.current?.('failed');
    else if (heroFrames.loaded) onStatusRef.current?.('ok');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heroFrames.loaded, heroFrames.failed]);
  const heroFramesRef = useRef(heroFrames);
  heroFramesRef.current = heroFrames;

  const cacheRef = useRef<FrameBitmapCache | null>(null);
  const stateRef = useRef(newSequenceState());

  const redraw = (force = false) => {
    const canvas = canvasRef.current;
    const frames = heroFramesRef.current;
    const cache = cacheRef.current;
    if (!canvas || !cache || !frames.loaded || !frames.frames) return;
    drawSequence(
      canvas,
      cache,
      frames.frames,
      progressRef.current,
      stateRef.current,
      force,
      alignAt(progressRef.current, alignRef.current),
      rectAtRef.current?.(progressRef.current, canvas.width, canvas.height),
      shouldSmoothPlayback() ? desktopHoldFrameRef.current : undefined,
    );
  };

  useEffect(() => {
    const cache = new FrameBitmapCache(() => heroFramesRef.current.frames, 2, 10, shouldSmoothPlayback);
    let redrawFrame = 0;
    cache.onReady = () => {
      if (!shouldSmoothPlayback()) {
        redraw();
        return;
      }
      // Varios bitmaps pueden quedar listos entre dos refrescos de pantalla.
      if (!redrawFrame) {
        redrawFrame = requestAnimationFrame(() => {
          redrawFrame = 0;
          redraw();
        });
      }
    };
    cacheRef.current = cache;
    return () => {
      cancelAnimationFrame(redrawFrame);
      cache.dispose();
      cacheRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // El buffer del canvas se ajusta 1:1 al tamaño real en pantalla, sin
  // reasignar si no cambió (asignar width/height limpia el buffer: ver la
  // franja de ruido en el límite del pin reportada antes), y con relleno
  // oscuro inmediato antes de redibujar.
  useEffect(() => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    if (!stage || !canvas) return;

    const resize = () => {
      const rect = stage.getBoundingClientRect();
      // Escritorio: tope 1.5. Los fotogramas miden 1600 px de ancho y se ven a ~1600 px CSS:
      // un lienzo a 2x (3200 px) no suma detalle, solo cuadruplica píxeles a pintar y
      // componer por cuadro. A 1.5 sigue por encima de la resolución del fotograma.
      // (Móvil, < 1024 px, sin cambios.)
      let dpr = Math.min(window.devicePixelRatio || 1, window.innerWidth >= 1024 ? 1.5 : 2);
      // El clip del androide es 1600×900. Acota el búfer a Full HD con el
      // mismo factor en ambos ejes para mantener el encuadre.
      if (shouldSmoothPlayback()) dpr = Math.min(dpr, 1920 / rect.width, 1080 / rect.height);
      const nextWidth = Math.max(1, Math.round(rect.width * dpr));
      const nextHeight = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width === nextWidth && canvas.height === nextHeight) return;

      canvas.width = nextWidth;
      canvas.height = nextHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      if (transparentRef.current) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      } else {
        ctx.fillStyle = '#07060B';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      cacheRef.current?.setSize(nextWidth, nextHeight);
      redraw(true);
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(stage);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!heroFrames.loaded || !heroFrames.frames) return;
    const canvas = canvasRef.current;
    if (canvas) {
      cacheRef.current?.releaseAll();
      cacheRef.current?.setSize(canvas.width, canvas.height);
    }
    redraw(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heroFrames.loaded, heroFrames.frames]);

  useEffect(() => {
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress]);

  return (
    <div ref={stageRef} className={`absolute inset-0 ${transparent ? '' : 'bg-cyber-dark'}`}>
      <canvas
        ref={canvasRef}
        className="w-full h-full block"
      />
    </div>
  );
};

// HeroSection se re-renderiza en cada cuadro del scroll: memo evita repetir
// este render cuando nada visible cambió. Las funciones (onStatus, rectAt) se
// leen siempre por ref, así que su identidad no cuenta (el padre pasa onStatus
// inline); startAlign se compara por valor.
const sameAlign = (a?: StartAlign, b?: StartAlign) =>
  a === b || (!!a && !!b && a.s === b.s && a.dx === b.dx && a.dy === b.dy && a.until === b.until);
export const ScrollFrameStage = React.memo(
  ScrollFrameStageInner,
  (a, b) =>
    a.progress === b.progress &&
    a.framesPath === b.framesPath &&
    a.transparent === b.transparent &&
    a.desktopHoldFrame === b.desktopHoldFrame &&
    sameAlign(a.startAlign, b.startAlign) &&
    !!a.rectAt === !!b.rectAt &&
    !!a.onStatus === !!b.onStatus
);

export default ScrollFrameStage;
