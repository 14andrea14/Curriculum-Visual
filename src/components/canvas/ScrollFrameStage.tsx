import React, { useEffect, useRef, useState } from 'react';
import { isLite, listenMedia } from '../../lib/deviceProfile';
import { useHeroFrames } from '../../hooks/useHeroFrames';
import { coverRect, liteCrop, LiteFrameWindow, FrameBitmapCache, drawSequence, newSequenceState, type FrameTransform, type FrameRect } from '../../lib/frameSequence';

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
  liteActive?: boolean;
  liteFallbackFrame?: number;
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
    return listenMedia(media, update);
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

// En móvil la ventana viene y se va con la fase del pin. Solo pide el cuadro
// actual y sus vecinos, y mantiene una pose de respaldo mientras los decodifica.
const LiteScrollFrameStage: React.FC<ScrollFrameStageProps> = ({ progress, framesPath, rectAt, desktopHoldFrame, liteFallbackFrame }) => {
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const fallback = useRef<HTMLImageElement>(null);
  const update = useRef<() => void>(() => {});
  const position = useRef(progress);
  position.current = progress;
  const filename = (index: number) => framesPath + '/frame_' + String(index + 1).padStart(3, '0') + '.webp';

  useEffect(() => {
    const host = stage.current!;
    const cv = canvas.current!;
    const pose = fallback.current!;
    const ctx = cv.getContext('2d');
    const lifetime = new AbortController();
    const blobs = new Map<number, Blob>();
    const requests = new Map<number, AbortController>();
    const failed = new Set<number>();
    const windowFrames = new LiteFrameWindow((k) => blobs.get(k) ?? null, 2, 1);
    let info: { count: number; width: number; height: number } | undefined;
    let samples: number[] = [];
    let target = -1;
    let direction = 1;
    let lastDrawn: ReturnType<typeof windowFrames.get>;
    let lastPainted = -1;
    let crop: ReturnType<typeof liteCrop>;

    const paint = () => {
      if (!ctx || !crop || !info || target < 0) return;
      const current = windowFrames.get(target) ?? windowFrames.nearestReady(target);
      if (!current) {
        if (lastDrawn && Math.abs(target - lastPainted) > 2 && pose.complete && pose.naturalWidth) {
          ctx.clearRect(0, 0, cv.width, cv.height);
          lastDrawn = undefined;
          pose.style.visibility = 'visible';
        }
        return;
      }
      if (current === lastDrawn) return;
      lastDrawn = current;
      lastPainted = target;
      ctx.clearRect(0, 0, cv.width, cv.height);
      if (current.cropped) ctx.drawImage(current.s, crop.dx, crop.dy, crop.dw, crop.dh);
      else ctx.drawImage(current.s, crop.sx, crop.sy, crop.sw, crop.sh, crop.dx, crop.dy, crop.dw, crop.dh);
      pose.style.visibility = 'hidden';
    };

    const sync = () => {
      if (!info || !crop) return;
      const frame = Math.round(position.current * (info.count - 1));
      const next = samples.reduce((best, value, k) => Math.abs(value - frame) < Math.abs(samples[best] - frame) ? k : best, 0);
      if (next !== target) {
        if (target >= 0) direction = Math.sign(next - target);
        target = next;
      }
      const wanted = [target, target + direction, target + 2 * direction, target - direction]
        .filter((k) => k >= 0 && k < samples.length);
      for (const [k, request] of requests) {
        if (!wanted.includes(k)) {
          request.abort();
          requests.delete(k);
        }
      }
      for (const k of blobs.keys()) if (Math.abs(k - target) > 3) blobs.delete(k);
      for (const k of wanted) {
        if (requests.size >= 3) break;
        if (blobs.has(k) || requests.has(k) || failed.has(k)) continue;
        const controller = new AbortController();
        requests.set(k, controller);
        fetch(filename(samples[k]), { signal: controller.signal })
          .then((r) => {
            if (!r.ok || r.headers.get('content-type')?.includes('text/html')) throw new Error('Fotograma no disponible');
            return r.blob();
          })
          .then((blob) => {
            if (!controller.signal.aborted) blobs.set(k, blob);
          })
          .catch(() => {
            if (!controller.signal.aborted) failed.add(k);
          })
          .finally(() => {
            if (controller.signal.aborted || lifetime.signal.aborted) return;
            requests.delete(k);
            sync();
          });
      }
      windowFrames.request(target, direction, samples.length);
      paint();
    };
    const resize = () => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (!w || !h) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.25);
      const rect = rectAt?.(0, w, h) ?? coverRect(w, h);
      Object.assign(pose.style, { left: rect.x + 'px', top: rect.y + 'px', width: rect.w + 'px', height: rect.h + 'px' });
      if (!info) return;
      const width = Math.round(w * dpr);
      const height = Math.round(h * dpr);
      if (crop && cv.width === width && cv.height === height) return;
      cv.width = width;
      cv.height = height;
      lastDrawn = undefined;
      pose.style.visibility = 'visible';
      crop = liteCrop(info.width, info.height, { x: rect.x * dpr, y: rect.y * dpr, w: rect.w * dpr, h: rect.h * dpr }, width, height);
      windowFrames.setCrop(crop);
      sync();
    };

    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();
    update.current = sync;
    windowFrames.onReady = paint;
    fetch(framesPath + '/manifest.json', { signal: lifetime.signal })
      .then((r) => {
        if (!r.ok) throw new Error('Manifiesto no disponible');
        return r.json();
      })
      .then((manifest) => {
        if (lifetime.signal.aborted || !Number.isInteger(manifest.count) || manifest.count < 1 || !manifest.width || !manifest.height) return;
        info = manifest;
        const indices = new Set<number>([0, manifest.count - 1]);
        if (desktopHoldFrame !== undefined && desktopHoldFrame < manifest.count) indices.add(desktopHoldFrame);
        for (let i = 0; i < manifest.count; i += desktopHoldFrame === undefined ? 5 : 7) indices.add(i);
        samples = [...indices].sort((a, b) => a - b);
        resize();
      })
      .catch(() => { /* la pose queda visible si falta el manifiesto */ });

    return () => {
      observer.disconnect();
      update.current = () => {};
      lifetime.abort();
      for (const request of requests.values()) request.abort();
      windowFrames.dispose();
      cv.width = cv.height = 1;
    };
  }, [framesPath, desktopHoldFrame, rectAt]);

  useEffect(() => update.current(), [progress]);

  const poseIndex = desktopHoldFrame !== undefined && progress > 0.25 ? desktopHoldFrame : (liteFallbackFrame ?? 0);
  return (
    <div ref={stage} className="absolute inset-0 overflow-hidden">
            <img
        ref={fallback}
        src={filename(poseIndex)}
        alt=""
        decoding="async"
        onLoad={() => update.current()}
        className="absolute max-w-none"
        style={{ opacity: liteFallbackFrame !== undefined && progress <= 0.08 ? 0 : undefined }}
      />
      <canvas ref={canvas} width={1} height={1} className="absolute inset-0 w-full h-full" />
    </div>
  );
};

const NearbyLiteSequence: React.FC<ScrollFrameStageProps> = (props) => {
  const root = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(true);
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setNear(entry.isIntersecting), { rootMargin: '120px' });
    observer.observe(root.current!);
    return () => observer.disconnect();
  }, []);
  return <div ref={root} className="absolute inset-0">{near && <LiteScrollFrameStage {...props} />}</div>;
};

const ScrollFrameStageByMode: React.FC<ScrollFrameStageProps> = (props) => {
  if (!isLite()) return <ScrollFrameStageInner {...props} />;
  return props.liteActive ? <NearbyLiteSequence {...props} /> : null;
};

// HeroSection se re-renderiza en cada cuadro del scroll: memo evita repetir
// este render cuando nada visible cambió. Las funciones (onStatus, rectAt) se
// leen siempre por ref, así que su identidad no cuenta (el padre pasa onStatus
// inline); startAlign se compara por valor.
const sameAlign = (a?: StartAlign, b?: StartAlign) =>
  a === b || (!!a && !!b && a.s === b.s && a.dx === b.dx && a.dy === b.dy && a.until === b.until);
export const ScrollFrameStage = React.memo(
  ScrollFrameStageByMode,
  (a, b) =>
    a.progress === b.progress &&
    a.framesPath === b.framesPath &&
    a.liteActive === b.liteActive &&
    a.liteFallbackFrame === b.liteFallbackFrame &&
    a.transparent === b.transparent &&
    a.desktopHoldFrame === b.desktopHoldFrame &&
    sameAlign(a.startAlign, b.startAlign) &&
    !!a.rectAt === !!b.rectAt &&
    !!a.onStatus === !!b.onStatus
);

export default ScrollFrameStage;
