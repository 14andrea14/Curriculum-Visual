import React, { useRef, useEffect, useState } from 'react';
import { useHeroFrames } from '../../hooks/useHeroFrames';
import { GlassWord } from './GlassWord';
import { Letters3D } from './Letters3D';
import { CircuitBg } from '../lando/shared';
import {
  FrameBitmapCache,
  drawSequence,
  drawFrameInRect,
  newSequenceState,
  coverRect,
  lerpRect,
  FRAME_ASPECT,
  type FrameRect,
} from '../../lib/frameSequence';

/**
 * Arco de 2 fases de este componente (definido con la usuaria):
 * 1. ENTRADA (0 -> HERO_ENTRY_END): el video entra en cuadro desde la izquierda, sonríe
 *    y dirige la mirada hacia el texto. Coincide con la revelación del nombre.
 * 2. SOSTENIDA (HERO_ENTRY_END -> HERO_DISSOLVE_START): se queda en el último frame,
 *    "viendo" el resto del texto (bio, botones) mientras termina de revelarse.
 *
 * De HERO_DISSOLVE_START en adelante, este componente se apaga casi de
 * inmediato (ver heroOpacity) y le entrega el control a un clip real
 * generado con IA (ScrollFrameStage.tsx con framesPath="/android-frames/
 * desktop", montado por HeroSection.tsx) que arranca EXACTAMENTE en el
 * mismo último fotograma que este componente muestra congelado, y hace toda
 * la transformación (rostro -> androide -> partículas -> luciérnaga) como
 * video real, no como animación hecha a mano. Se llegó acá después de varias
 * iteraciones con partículas/canvas hechas a mano (silueta muestreada del
 * frame, convergencia, remolino, glifo de luciérnaga) que la usuaria pidió
 * descartar por completo ("no me convence nada de lo que animamos"), y
 * antes de eso una versión aún más vieja con una nube de puntos 3D.
 *
 * HeroSection.tsx importa HERO_ENTRY_END para sincronizar el haz de energía conector
 * con la misma ventana de tiempo que la entrada del avatar.
 */
export const HERO_ENTRY_END = 0.55; // coincide con nameRevealProgress en HeroSection.tsx
export const HERO_DISSOLVE_START = 0.63;

// Secuencia real de fotogramas del video Higgsfield (ver ANALISIS_Y_PLAN_V2.md,
// Sección 3.2). Se elige una sola vez al montar según el ancho de viewport
// (breakpoint md de Tailwind = 768px): el clip móvil ya viene recortado 9:16
// desde ffmpeg, no se re-recorta en el cliente.
// Desktop usa la versión RECORTADA (silueta con canal alfa, generada offline
// con remoción de fondo, ver public/hero-frames-cut): el fondo gris/verdoso
// del video original era lo que hacía ver el Hero "sucio" — pedido explícito.
// Debajo del canvas va un fondo limpio con la paleta del rediseño (HeroBackdrop).
// Móvil sigue con el clip original (aún no recortado).
// Portada nueva (nov 2026): un solo cuadro = primer cuadro del video de la transformación.
const DESKTOP_FRAMES_PATH = '/cover-frames-cut/desktop';
const DESKTOP_IS_CUTOUT = true;
const ORIGINAL_DESKTOP_FRAMES_PATH = '/hero-frames/desktop';
const WINK_FRAMES_PATH = '/wink-frames-cut/desktop';

// Encuadre de la silueta en la portada (referencia "Creative Portfolio":
// titular a la izquierda, persona a la derecha con un aro de luz detrás).
// Pedido explícito: la figura debe verse COMPLETA y libre, sin fundidos ni
// bordes. Por eso no se usa el recorte "cover" (en pantallas más anchas que
// 16:9 se comía la parte alta de la cabeza) sino el fotograma completo en un
// rectángulo:
//  - Fotogramas 1-43 (ella entrando a cuadro) TOCAN los bordes del video
//    (medido): ahí el rectángulo cubre la pantalla, así esos bordes quedan
//    fuera de vista, igual que antes.
//  - Desde el 46 la figura ya no toca ningún borde salvo el inferior: la
//    "cámara" se aleja y la desliza a la derecha hasta la pose final, con la
//    cabeza entera y el borde inferior apoyado en el de la pantalla.
// Diseño CENTRADO en tamaño original (pedido explícito: "la del tamaño
// original, que partamos de un diseño centrado"): la figura final ocupa todo
// el alto de la pantalla (= tamaño del video en pantallas 16:9) y se centra
// horizontalmente, igual que el androide; así la transformación no necesita
// desplazarse. En pantallas más anchas que 16:9 sobra aire a los lados (ahí
// la figura no toca bordes), en más angostas se recortan los lados.
const SUBJECT_SCALE = 1; // alto de la figura final, fracción del alto de pantalla
const SUBJECT_HEAD_X = 0.54; // x del centro de la cabeza (pelo incluido) en el fotograma final, medido
const SUBJECT_TARGET_X = 0.5; // (sin uso con el diseño centrado; se deja por si se vuelve a correr)
const FREE_FROM = 0.32; // entryProgress desde el que la figura ya no toca bordes
const SETTLE_SPAN = 0.4;

export function heroFinalRect(w: number, h: number): FrameRect {
  if (w < h || (typeof window !== 'undefined' && window.innerWidth < 768)) {
    // En pantallas verticales (móvil y tablet vertical), escalamos la silueta al 79%
    // con margen superior generoso para que la cabeza/coronilla NUNCA se corte
    // contra el borde superior de la pantalla ni en la foto ni en el androide (pedido explícito).
    const cr = coverRect(w, h);
    const scale = 0.79;
    const fw = Math.round(cr.w * scale);
    const fh = Math.round(cr.h * scale);
    const fx = Math.round((w - fw) / 2);
    // Margen superior generoso: centrado vertical con desplazamiento hacia abajo
    const fy = Math.round((h - fh) / 2 + Math.max(34, h * 0.065));
    return { x: fx, y: fy, w: fw, h: fh };
  }
  return coverRect(w, h);
}
export function heroFrameRect(entryProgress: number, w: number, h: number): FrameRect {
  if (w < h) {
    // En pantallas verticales (móvil y tablet vertical), mantenemos la silueta escalada al 84%
    // anclada hacia el borde inferior para que las letras 3D queden visibles detrás de la cabeza
    return heroFinalRect(w, h);
  }
  const t = Math.min(1, Math.max(0, (entryProgress - FREE_FROM) / SETTLE_SPAN));
  const e = t * t * (3 - 2 * t);
  return lerpRect(coverRect(w, h), heroFinalRect(w, h), e);
}
// Centro del aro = cabeza dentro del fotograma (fracciones del fotograma).
// Medido sobre el recorte de la pose final: cabeza (con pelo) en x 0.36-0.75,
// y 0.02-0.62 del fotograma. El aro la envuelve centrado.
const RING_IN_FRAME = { x: 0.53, y: 0.36, size: 0.68 };
const MOBILE_FRAMES_PATH = '/hero-frames/mobile';

function pickFramesPath() {
  // Tanto en móvil como en escritorio se utiliza la nueva foto recortada con fondo transparente (frame_001.webp)
  return DESKTOP_FRAMES_PATH;
}

// Fase 1 (entrada, 0 -> HERO_ENTRY_END): recorre la secuencia hacia adelante.
// Fase 2/3 (sostenida + disolución): se congela en el último fotograma, que
// es exactamente la pose aprobada como end_image en Higgsfield.
function pickFrameIndex(entryProgress: number, frameCount: number) {
  if (frameCount <= 1) return 0;
  return Math.min(frameCount - 1, Math.round(entryProgress * (frameCount - 1)));
}

// Mientras los fotogramas reales todavía no cargaron, un simple fondo
// oscuro (nada procedural) — el busto/ojos dibujados a mano eran de una
// versión muy anterior (antes de tener el video real de Higgsfield
// integrado) y ya no tienen sentido: el video real siempre existe en
// producción, así que esto solo se ve una fracción de segundo mientras
// cargan las imágenes, no un estado que valga la pena animar.
function drawLoadingFallback(ctx: CanvasRenderingContext2D, w: number, h: number, transparent: boolean) {
  if (transparent) {
    ctx.clearRect(0, 0, w, h);
    return;
  }
  ctx.fillStyle = '#07060B';
  ctx.fillRect(0, 0, w, h);
}

// Fondo limpio detrás de la silueta: azul noche de la paleta (neo-night ->
// neo-ink), un halo rosa/magenta detrás de la figura y un toque cyan abajo a
// la izquierda — sin textura sucia ni viñeta gris.
// Fondo de la portada: NEGRO (pedido explícito: "para más resalte es negro").
// Las burbujas de vidrio vienen sobre negro puro, así se funden sin borde y
// conservan su translucidez; un foco apenas perceptible detrás de la figura
// evita que el negro se vea plano.
export const HeroBackdrop: React.FC<{ opacity: number }> = ({ opacity }) => (
  <div
    className="absolute inset-0"
    style={{ opacity, background: 'radial-gradient(60% 75% at 56% 40%, #0E0F12 0%, #040405 55%, #000000 100%)' }}
  >
    {/* motivo único del sitio (pistas de circuito), apenas perceptible: integra la portada con el resto */}
    <CircuitBg seed={5} count={24} stroke="#F230D2" opacity={0.07} />
  </div>
);

const HeroRing: React.FC<{ progress: number; opacity: number; size: { w: number; h: number } }> = ({
  progress,
  opacity,
  size,
}) => {
  const t = Math.min(1, Math.max(0, (progress - 0.35) / 0.45));
  const e = 1 - Math.pow(1 - t, 3);
  const r = heroFrameRect(progress, size.w, size.h);
  const d = RING_IN_FRAME.size * r.h;
  return (
    <div
      className="absolute pointer-events-none"
      style={{
        left: r.x + RING_IN_FRAME.x * r.w,
        top: r.y + RING_IN_FRAME.y * r.h,
        width: d,
        height: d,
        transform: `translate(-50%, -50%) scale(${0.85 + 0.15 * e})`,
        opacity: opacity * e,
      }}
    >
      {/* resplandor interior */}
      <div
        className="absolute inset-0 rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(242,48,210,0.28) 0%, rgba(242,7,93,0.12) 42%, transparent 68%)' }}
      />
      {/* aro */}
      <div
        className="absolute inset-[6%] rounded-full"
        style={{
          border: '2px solid rgba(242,48,210,0.85)',
          boxShadow: '0 0 24px rgba(242,48,210,0.7), 0 0 70px rgba(242,7,93,0.45), inset 0 0 40px rgba(242,48,210,0.35)',
        }}
      />
    </div>
  );
};

// Título partido a los lados de la figura (pedido explícito: "a la izquierda
// PORTA y a la derecha FOLIO para que se lea mejor"): cada mitad ocupa el
// espacio libre a un costado de la cara, así ninguna letra queda tapada.
// Entra deslizándose desde su lado. Va detrás de la silueta (antes del canvas).
const SplitTitle: React.FC<{ reveal: number; opacity: number }> = ({ reveal, opacity }) => {
  const e = 1 - Math.pow(1 - Math.min(1, Math.max(0, reveal)), 3);
  const common = (dir: number): React.CSSProperties => ({
    // opacity solo < 1 durante la entrada/salida: con opacity < 1 el contenedor
    // corta el desenfoque del vidrio (backdrop-filter) — en reposo queda en 1.
    opacity: opacity * e,
    transform: `translate3d(${(1 - e) * 80 * dir}px, 0, 0) scale(${0.92 + 0.08 * e})`,
    filter: e < 0.999 ? `blur(${(1 - e) * 10}px)` : undefined,
  });
  return (
    <>
      {/* Tamaños tomados del dibujo de la usuaria: letras altas que llenan
          cada costado y pasan POR DETRÁS de ella (este bloque va antes del
          canvas de la silueta, así la cabeza y la mano las tapan). */}
      <div className="absolute pointer-events-none select-none" style={{ left: '1.6%', top: '15%', width: '32vw', height: '60vh', ...common(-1) }}>
        <GlassWord word="PORTA" className="w-full h-full" />
      </div>
      <div className="absolute pointer-events-none select-none" style={{ right: '1.6%', top: '8%', width: '34vw', height: '67vh', ...common(1) }}>
        <GlassWord word="FOLIO" className="w-full h-full" />
      </div>
    </>
  );
};

const PosterWord: React.FC<{ progress: number; opacity: number }> = ({ progress, opacity }) => {
  const t = Math.min(1, Math.max(0, (progress - 0.25) / 0.5));
  const e = 1 - Math.pow(1 - t, 3);
  return (
    <div
      className="absolute inset-x-0 flex justify-center pointer-events-none select-none"
      style={{
        // Arriba, como en la referencia: la cabeza de la silueta entra en la
        // palabra y la tapa en parte.
        top: '8%',
        opacity: opacity * e,
        transform: `translate3d(0, ${(1 - e) * 60}px, 0) scale(${1.06 - 0.06 * e})`,
        filter: e < 0.999 ? `blur(${(1 - e) * 10}px)` : undefined,
      }}
    >
      <span
        className="font-poster uppercase leading-[0.8] whitespace-nowrap"
        style={{
          fontSize: 'min(21vw, 46vh)',
          letterSpacing: '-0.01em',
          backgroundImage: 'linear-gradient(180deg, #FFFFFF 0%, #AEB8C8 100%)',
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          color: 'transparent',
          opacity: 0.95,
        }}
      >
        Portafolio
      </span>
    </div>
  );
};

// Imágenes quietas de la portada (generadas con Gemini a partir de los
// fotogramas del video: fondo negro puro, nitidez restaurada) con alfa propio
// (scripts/make-hero-stills.mjs). Pose = portada en reposo; sonrisa = punto máximo
// de la reacción. Entre ambas se usan los fotogramas del video (recortados) y se
// pasa de unas a otros con un fundido lineal en espacio premultiplicado: el
// interior de la figura nunca se vuelve translúcido (no se ven las letras a través).
// Sombra proyectada de la figura sobre las letras (lienzo 2D y lienzo GL de la ventana)
const AVATAR_SHADOW = 'drop-shadow(0 10px 38px rgba(0,0,0,0.8)) drop-shadow(0 0 8px rgba(0,0,0,0.5))';
const HERO_SMILE_P = 0.61; // mismo valor que SMILE_P en HeroSection
const smooth01 = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};
function compositeStills(
  canvas: HTMLCanvasElement,
  rect: FrameRect,
  pose: HTMLImageElement | ImageBitmap | null,
  smile: HTMLImageElement | ImageBitmap | null,
  wPose: number,
  wSmile: number
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const wVideo = Math.max(0, 1 - wPose - wSmile);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  if (wVideo < 0.999) {
    // escala el fotograma de video ya dibujado por su peso
    ctx.globalCompositeOperation = 'destination-in';
    ctx.globalAlpha = wVideo;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.globalCompositeOperation = 'lighter';
  if (pose && wPose > 0) {
    ctx.globalAlpha = wPose;
    ctx.drawImage(pose, rect.x, rect.y, rect.w, rect.h);
  }
  if (smile && wSmile > 0) {
    ctx.globalAlpha = wSmile;
    ctx.drawImage(smile, rect.x, rect.y, rect.w, rect.h);
  }
  ctx.restore();
}

interface HeroAvatarStageProps {
  progress: number;
  onReady?: () => void;
  // Si tiene valor (0-1, mismo dominio que entryProgress), manda sobre el
  // scroll: así la "reacción" (sonrisa) se reproduce sin mover la página.
  frameOverrideRef?: React.MutableRefObject<number | null>;
  // Guiño del clic (0-1 = tiempo del video del guiño; null = sin guiño).
  winkRef?: React.MutableRefObject<number | null>;
}

const HeroAvatarStageInner: React.FC<HeroAvatarStageProps> = ({ progress, onReady, frameOverrideRef, winkRef }) => {
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const stageRef = useRef<HTMLDivElement>(null);
  // versión del lienzo de la figura (sube cada vez que se repinta): la estela de
  // cristal solo vuelve a subir la textura cuando cambia
  const avatarVersionRef = useRef(0);
  const canvas2DRef = useRef<HTMLCanvasElement | null>(null);
  const [ready, setReady] = useState(false);

  // Elegido una sola vez al montar (ver pickFramesPath): desktop u móvil.
  const [framesPath, setFramesPath] = useState(pickFramesPath);
  const framesPathRef = useRef(framesPath);
  framesPathRef.current = framesPath;
  const isCutout = DESKTOP_IS_CUTOUT && framesPath === DESKTOP_FRAMES_PATH;
  const [stageSize, setStageSize] = useState({ w: 0, h: 0 });
  const isCutoutRef = useRef(isCutout);
  isCutoutRef.current = isCutout;
  const heroFrames = useHeroFrames(framesPath);
  // Dirección del scroll del hero: al VOLVER del androide las letras deben entrar junto con
  // la figura (mientras ella se funde de vuelta), no esperar a que termine el rebobinado.
  const prevProgressRef = useRef(progress);
  const rewindingRef = useRef(false);
  if (Math.abs(progress - prevProgressRef.current) > 0.0004) {
    rewindingRef.current = progress < prevProgressRef.current;
    prevProgressRef.current = progress;
  }
  const lettersBack = rewindingRef.current && progress > 0.55;
  // Video del guiño (clic en la portada), recortado: se reproduce completo, a su velocidad.
  const winkFrames = useHeroFrames(WINK_FRAMES_PATH);
  const winkFramesRef = useRef(winkFrames);
  winkFramesRef.current = winkFrames;
  const lastWinkKeyRef = useRef('');
  // Avisa cuando la secuencia está lista para reproducirse (la portada
  // espera esto antes de arrancar la entrada automática).
  useEffect(() => {
    if (heroFrames.loaded && !heroFrames.failed) onReadyRef.current?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heroFrames.loaded, heroFrames.failed]);
  // Si la versión recortada no carga, se usa el video original (con su fondo)
  // en vez de dejar el Hero vacío.
  useEffect(() => {
    if (isCutout && heroFrames.failed) setFramesPath(ORIGINAL_DESKTOP_FRAMES_PATH);
  }, [isCutout, heroFrames.failed]);

  // entryProgress maneja la posición/frame de la entrada; se congela en 1 durante la fase sostenida.
  // >= 0.985 se fija en 1: el estado de scroll se actualiza con un umbral
  // mínimo de cambio, así que al terminar el autoplay podía quedar un pelo por
  // debajo y mostrar el penúltimo fotograma en vez de la pose final.
  const rawEntry = Math.min(Math.max(progress / HERO_ENTRY_END, 0), 1);
  const entryProgress = rawEntry >= 0.985 ? 1 : rawEntry;
  const entryProgressRef = useRef(entryProgress);
  entryProgressRef.current = entryProgress;

  // El fotograma 145 de hero-frames y el fotograma 001 de android-frames son idénticos byte por byte.
  // heroOpacity es 1 mientras estamos en la secuencia de entrada del Hero (progress < HERO_DISSOLVE_START).
  // A partir de HERO_DISSOLVE_START, ScrollFrameStage (que arranca exactamente en ese mismo fotograma idéntico)
  // asume el control del video continuo de rotación hacia el androide.
  // Al no superponer dos capas semi-transparentes sobre video en movimiento, se elimina por completo
  // el efecto de doble rostro / ghosting y cualquier salto visual.
  // ACTUALIZADO: los dos fotogramas finales originales (144-145) eran un
  // empalme con el primero del clip del androide — otra toma, corrida de
  // posición y con otra luz — y se veían como un salto/imagen sobrepuesta al
  // llegar a la pose asentada. Ahora la secuencia termina en su fotograma
  // natural (143, copiado sobre 144/145) y el clip del androide se ALINEA
  // geométricamente a él (ver ANDROID_START_ALIGN en HeroSection.tsx). Como
  // ya calzan en posición, el paso de uno a otro es un fundido corto (no un
  // corte seco) que absorbe la diferencia de luz sin "doble rostro".
  const HERO_HANDOFF_FADE = 0.09;
  const coverActiveRef = useRef(false);
  const coverActive = DESKTOP_IS_CUTOUT && entryProgress >= 0.985 && progress < HERO_DISSOLVE_START - 0.02; // (el guiño del clic no apaga el efecto del cursor)
  coverActiveRef.current = coverActive;
  // despierta/apaga el bucle del fluido del cursor solo cuando cambia coverActive
  const fluidWakeRef = useRef<() => void>(() => {});
  const heroOpacity =
    progress < HERO_DISSOLVE_START ? 1 : Math.max(0, 1 - (progress - HERO_DISSOLVE_START) / HERO_HANDOFF_FADE);

  // Función estable (vía ref) que dibuja el fotograma actual: usa la
  // secuencia real ya cargada, o el fallback oscuro mientras carga. Se
  // reasigna en cada render para cerrar siempre sobre el heroFrames/
  // entryProgress más reciente, pero mantiene identidad de función estable
  // para quien la llama (resize, loop de animación).
  // Decodificación por ventana de ImageBitmap + mezcla entre fotogramas
  // (ver lib/frameSequence.ts).
  const heroFramesRef = useRef(heroFrames);
  heroFramesRef.current = heroFrames;
  const cacheRef = useRef<FrameBitmapCache | null>(null);
  const winkCacheRef = useRef<FrameBitmapCache | null>(null);
  const seqStateRef = useRef(newSequenceState());
  const stillsRef = useRef<{ pose: HTMLImageElement | ImageBitmap | null; smile: HTMLImageElement | ImageBitmap | null }>({ pose: null, smile: null });
  const lastWKeyRef = useRef('');
  // Revelado con el cursor (ver el efecto de más abajo)
  const revealCanvasRef = useRef<HTMLCanvasElement>(null);
  const drawFrameRef = useRef<(force?: boolean) => void>(() => {});
  drawFrameRef.current = (force = false) => {
    const canvas = canvas2DRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const frames = heroFramesRef.current;
    const cache = cacheRef.current;
    // GUIÑO: mientras corre, se dibuja el cuadro del video del guiño en el mismo encuadre
    // de la portada. Al entrar y salir se funde con la imagen de la portada (mismo
    // encuadre, solo cambia el grano) para que no se note el cambio de toma.
    const wk = winkRef?.current ?? null;
    const wf = winkFramesRef.current;
    if (wk != null && isCutoutRef.current && wf.loaded && wf.frames && wf.frames.length) {
      const idx = Math.min(wf.frames.length - 1, Math.max(0, Math.round(wk * (wf.frames.length - 1))));
      const wPoseW = stillsRef.current.pose ? 1 - smooth01(Math.min(wk, 1 - wk) / 0.07) : 0;
      const key = idx + '|' + Math.round(wPoseW * 40) + '|' + canvas.width;
      if (force || key !== lastWinkKeyRef.current) {
        const rect = heroFrameRect(1, canvas.width, canvas.height);
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        // bitmap ya decodificado fuera del hilo principal (ver lib/frameSequence.ts);
        // si aún no está, el más cercano o el <img> como antes
        winkCacheRef.current?.setSize(canvas.width, canvas.height);
        const exact = drawFrameInRect(ctx, winkCacheRef.current, wf.frames, idx, rect);
        ctx.restore();
        if (wPoseW > 0) compositeStills(canvas, rect, stillsRef.current.pose, null, wPoseW, 0);
        avatarVersionRef.current++;
        // sin el fotograma exacto, se vuelve a pintar cuando llegue
        lastWinkKeyRef.current = exact ? key : key + '|tmp';
        lastWKeyRef.current = '';
      }
      return;
    }
    if (lastWinkKeyRef.current) {
      lastWinkKeyRef.current = '';
      force = true;
      // Terminó el guiño: su ventana de bitmaps quedó en los ÚLTIMOS fotogramas. Se
      // vuelve a pre-decodificar el arranque, si no el próximo clic dibujaba los
      // primeros cuadros desde el <img> (decodificado en el hilo principal: tirón).
      if (coverActiveRef.current) winkCacheRef.current?.request(0, 1);
    }
    if (frames.loaded && frames.frames && cache) {
      const ov = frameOverrideRef?.current ?? null;
      const entryNow = ov ?? entryProgressRef.current;
      let rect = isCutoutRef.current ? heroFrameRect(entryNow, canvas.width, canvas.height) : undefined;
      // Empuje de cámara durante la sonrisa: la figura se acerca ~4 % con la
      // misma curva de la reacción y vuelve con ella (sensación de que se inclina
      // hacia la cámara). En los extremos vale 1, así que no choca con la imagen quieta.
      if (rect && ov != null) {
        const dep = Math.min(1, Math.max(0, (1 - ov) / (1 - HERO_SMILE_P)));
        const reducedMotion = typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const k = 1 + (reducedMotion ? 0 : 0) * smooth01(dep);
        const pcx = canvas.width * 0.5;
        const pcy = canvas.height * 0.42;
        rect = { x: pcx + (rect.x - pcx) * k, y: pcy + (rect.y - pcy) * k, w: rect.w * k, h: rect.h * k };
      }
      // pesos de las imágenes quietas (ver HERO_SMILE_P)
      const still = stillsRef.current;
      let wPose = 0;
      let wSmile = 0;
      if (isCutoutRef.current && still.pose) {
        if (ov == null) {
          if (entryProgressRef.current >= 0.985) wPose = 1;
        } else {
          const depth = Math.min(1, Math.max(0, (1 - ov) / (1 - HERO_SMILE_P)));
          // el fundido va solo donde el fotograma de video casi coincide con la imagen
          // quieta (los primeros/últimos ~3 fotogramas): más lejos se vería doble
          wPose = 1 - smooth01(depth / 0.08);
          wSmile = 0;
        }
      }
      const wKey = Math.round(wPose * 60) + '|' + Math.round(wSmile * 60);
      const wChanged = wKey !== lastWKeyRef.current;
      const keyBefore = seqStateRef.current.lastKey;
      if (
        drawSequence(
          canvas,
          cache,
          frames.frames,
          entryNow,
          seqStateRef.current,
          force || wChanged,
          undefined,
          rect
        )
      ) {
        const keyAfter = seqStateRef.current.lastKey;
        // se recompone solo si el lienzo se repintó de verdad
        const repainted = force || wChanged || keyAfter === -1 || keyAfter !== keyBefore;
        if (rect && (wPose > 0 || wSmile > 0) && repainted) {
          compositeStills(canvas, rect, still.pose, still.smile, wPose, wSmile);
        }
        if (repainted) avatarVersionRef.current++;
        lastWKeyRef.current = wKey;
        return;
      }
    }
    drawLoadingFallback(ctx, canvas.width, canvas.height, isCutout);
  };

  // carga de las imágenes quietas (si no existen, todo sigue con los fotogramas)
  useEffect(() => {
    let alive = true;
    const load = (src: string, key: 'pose' | 'smile') => {
      const im = new Image();
      im.decoding = 'async';
      im.onload = () => {
        if (!alive) return;
        stillsRef.current[key] = im;
        lastWKeyRef.current = '';
        drawFrameRef.current(true);
        // Se cambia por un ImageBitmap decodificado fuera del hilo principal
        // (mismo dibujo; el <img> lo decodificaba el canvas en el hilo principal).
        if (typeof createImageBitmap === 'function' && typeof fetch === 'function') {
          fetch(src, { cache: 'force-cache' })
            .then((r) => (r.ok ? r.blob() : Promise.reject(new Error('http ' + r.status))))
            .then((b) => createImageBitmap(b))
            .then((bm) => {
              if (!alive || bm.width !== im.naturalWidth || bm.height !== im.naturalHeight) {
                bm.close();
                return;
              }
              stillsRef.current[key] = bm;
            })
            .catch(() => {});
        }
      };
      im.src = src;
    };
    load('/hero-still/cover.webp', 'pose');
    // (la imagen de la sonrisa ya no se usa: en el pico se ve solo el video)
    return () => {
      alive = false;
    };
  }, []);

  // "VENTANA DE CRISTAL" CON EL CURSOR (referencia de mecánica: landonorris.com, donde
  // por donde pasa el cursor se revela la capa de atrás con una mancha de borde
  // irregular que se va cerrando). Aquí, por donde pasa el cursor LA FIGURA SE VUELVE
  // TRANSPARENTE y se ven las letras de PORTAFOLIO y el fondo que hay detrás. El borde
  // de la ventana es un cristal líquido: la figura se curva hacia el borde como
  // una lente, con un brillo de bisel y una línea fina de luz que cambia de
  // color (paleta). La ventana se cierra sola en ~1 s.
  // CÓMO: mientras hay ventana, la figura se dibuja en un shader de WebGL (el
  // mismo lienzo de la figura se sube como textura, 1:1 en píxeles) y el 2D
  // original se oculta; al cerrarse todo vuelve al lienzo 2D. El borde sale liso
  // porque la máscara se evalúa a la resolución de la pantalla.
  useEffect(() => {
    const canvas0 = revealCanvasRef.current;
    if (!canvas0) return;
    // prefers-reduced-motion: sin ventana/fluido del cursor (movimiento amplio, Tier 1)
    if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const gl = canvas0.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false });
    if (!gl) return;
    const canvas: HTMLCanvasElement = canvas0;

    const VS = 'attribute vec2 p; varying vec2 vUv; void main(){ vUv = vec2(p.x*0.5+0.5, 0.5-p.y*0.5); gl_Position = vec4(p,0.,1.); }';
    const FS = [
      '#extension GL_OES_standard_derivatives : enable',
      'precision highp float;',
      'varying vec2 vUv;',
      'uniform sampler2D uField; uniform sampler2D uAvatar; uniform sampler2D uBack;',
      'uniform vec2 uRes; uniform float uTime;',
      '#ifdef GL_OES_standard_derivatives',
      'float aaw(float x){ return fwidth(x); }',
      '#else',
      'float aaw(float x){ return 0.015; }',
      '#endif',
      'float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }',
      'float vnoise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f*f*(3.-2.*f);',
      '  return mix(mix(hash(i), hash(i+vec2(1.,0.)), f.x), mix(hash(i+vec2(0.,1.)), hash(i+vec2(1.,1.)), f.x), f.y); }',
      'vec3 pal(float t){ t = fract(t) * 5.;',
      '  vec3 c0 = vec3(.047,.859,.949); vec3 c1 = vec3(.59,.275,1.); vec3 c2 = vec3(.949,.188,.824); vec3 c3 = vec3(.949,.027,.365); vec3 c4 = vec3(.80,.40,1.);',
      '  if (t < 1.) return mix(c0,c1,t); if (t < 2.) return mix(c1,c2,t-1.); if (t < 3.) return mix(c2,c3,t-2.); if (t < 4.) return mix(c3,c4,t-3.); return mix(c4,c0,t-4.); }',
      'float fieldAt(vec2 uv){ return texture2D(uField, uv).r * 1.4; }',
      'void main(){',
      '  vec2 px = vUv * uRes;',
      '  // forma orgánica pero limpia: ruido de baja amplitud (sin encaje al cerrarse)',
      '  float n = vnoise(px / 80.) * 0.65 + vnoise(px / 30.) * 0.35;',
      '  float v = fieldAt(vUv) + (n - 0.5) * 0.07;',
      '  vec4 sharp = texture2D(uAvatar, vUv);',
      '  const float T = 0.32;',
      '  if (v < T - 0.22) { gl_FragColor = sharp; return; }',
      '  float aa = max(aaw(v), 0.0008);',
      '  float inside = smoothstep(T - aa, T + aa, v);',
      '  // línea de luz fina (ancho constante en píxeles)',
      '  float edge = 1. - smoothstep(aa * 0.8, aa * 2.6, abs(v - T));',
      '  // aro esmerilado FUERA del borde: la figura desenfocada que se funde con la nítida',
      '  float outside = (1. - inside) * (1. - smoothstep(aa * 2., aa * 13., T - v));',
      '  vec4 blur = vec4(0.);',
      '  for (int i = 0; i < 12; i++) {',
      '    float a = float(i) * 2.39996; float r = sqrt((float(i) + .5) / 12.) * 10.;',
      '    blur += texture2D(uAvatar, vUv + vec2(cos(a), sin(a)) * r / uRes);',
      '  }',
      '  blur /= 12.;',
      '  // dentro de la ventana: la palabra de atrás (PORTAFOLIO) sobre lo que ya hay',
      '  vec4 back = texture2D(uBack, vUv);',
      '  vec4 col = mix(sharp, blur, outside * 0.9) * (1. - inside * 0.72) + back * inside * 0.72;',
      '  vec3 pc = pal(vUv.x * 0.9 + vUv.y * 0.5 + uTime * 0.16);',
      '  // velo de color muy tenue pegado al borde, por dentro de la ventana',
      '  float inner = inside * (1. - smoothstep(aa * 2., aa * 26., v - T)) * 0.06;',
      '  col = vec4(pc * inner, inner) + col * (1. - inner);',
      '  // curvas de nivel del tinte dentro de la ventana (el motivo topográfico de la referencia)',
      '  float q = (v - T) / 0.17;',
      '  float fq = abs(fract(q + 0.5) - 0.5);',
      '  float contour = step(0.6, q) * (1. - smoothstep(0., aaw(q) * 1.4, fq)) * inside;',
      '  vec3 lc = mix(pc, vec3(1.), 0.5); float la = contour * 0.1;',
      '  col = vec4(lc * la, la) + col * (1. - la);',
      '  vec3 ec = mix(pc, vec3(1.), 0.65); float ea = edge * 0.3;',
      '  col = vec4(ec * ea, ea) + col * (1. - ea);',
      '  gl_FragColor = col;',
      '}',
    ].join('\n');

    gl.getExtension('OES_standard_derivatives');
    const mkShader = (type: number, src: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        console.warn('[ventana] shader:', gl.getShaderInfoLog(sh));
        return null;
      }
      return sh;
    };
    const vs = mkShader(gl.VERTEX_SHADER, VS);
    const fs = mkShader(gl.FRAGMENT_SHADER, FS);
    if (!vs || !fs) return;
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const uRes = gl.getUniformLocation(prog, 'uRes');
    const uTime = gl.getUniformLocation(prog, 'uTime');
    gl.uniform1i(gl.getUniformLocation(prog, 'uField'), 0);
    gl.uniform1i(gl.getUniformLocation(prog, 'uAvatar'), 1);
    gl.uniform1i(gl.getUniformLocation(prog, 'uBack'), 2);

    const MW = 192;
    const MH = 108;
    const field = new Float32Array(MW * MH);
    const bytes = new Uint8Array(MW * MH);
    const mkTex = (unit: number, filter: number) => {
      const t = gl.createTexture()!;
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    };
    const fieldTex = mkTex(0, gl.LINEAR);
    const avatarTex = mkTex(1, gl.LINEAR);
    const backTex = mkTex(2, gl.LINEAR);
    // Fondo de la ventana: solo una neblina de color muy suave (violeta/magenta)
    // detrás de la cabeza, para que lo que se ve por la ventana no sea un hueco
    // negro plano. NO lleva texto: las letras que se ven por la ventana son las
    // letras 3D reales que hay detrás de la figura. Se pinta en un 2D del mismo
    // tamaño que el lienzo y se repinta si cambia el tamaño.
    const backCanvas = document.createElement('canvas');
    let backW = 0;
    let backH = 0;
    let backDirty = true;
    const paintBack = (W: number, H: number) => {
      backCanvas.width = W;
      backCanvas.height = H;
      const c = backCanvas.getContext('2d');
      if (!c) return;
      c.clearRect(0, 0, W, H);
      const haze = (x: number, y: number, r: number, rgb: string, a: number) => {
        const g = c.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, 'rgba(' + rgb + ',' + a + ')');
        g.addColorStop(1, 'rgba(' + rgb + ',0)');
        c.fillStyle = g;
        c.fillRect(0, 0, W, H);
      };
      haze(W * 0.5, H * 0.42, W * 0.42, '150,70,255', 0.16);
      haze(W * 0.36, H * 0.55, W * 0.3, '242,48,210', 0.1);
      haze(W * 0.64, H * 0.4, W * 0.28, '12,219,242', 0.06);
      backDirty = true;
    };
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, fieldTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, MW, MH, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, bytes);
    let uploadedVersion = -1;

    const cur = { x: 0, y: 0, has: false };
    const last = { x: 0, y: 0, has: false };
    // hubo pointermove desde el último paso del bucle
    let moved = false;
    // El bucle (rAF) solo corre mientras la portada está activa Y hay algo que
    // hacer (movimiento del cursor o una mancha que todavía se disipa); en
    // reposo no hay rAF. wake() lo vuelve a arrancar.
    let wake: () => void = () => {};
    const onMove = (e: PointerEvent) => {
      cur.x = e.clientX;
      cur.y = e.clientY;
      cur.has = true;
      moved = true;
      if (coverActiveRef.current) wake();
    };
    const onTouch = (e: TouchEvent) => {
      if (!e.touches[0]) return;
      cur.x = e.touches[0].clientX;
      cur.y = e.touches[0].clientY;
      cur.has = true;
      moved = true;
      if (coverActiveRef.current) wake();
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', onMove, { passive: true });
    window.addEventListener('touchmove', onTouch, { passive: true });
    // Rect del escenario en caché: se mide de nuevo solo tras resize/scroll
    // (antes era un getBoundingClientRect por cuadro, para siempre).
    let stageRect: DOMRect | null = null;
    const invalidateRect = () => {
      stageRect = null;
    };
    window.addEventListener('scroll', invalidateRect, { passive: true, capture: true });
    window.addEventListener('resize', invalidateRect, { passive: true });
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(invalidateRect) : null;
    if (stageRef.current) ro?.observe(stageRef.current);

    // FLUIDO DEL CURSOR (como en landonorris.com: allí el cursor es una simulación
    // de fluido en GPU — advección BFECC + presión — y la mancha es el umbral de ese
    // "tinte" sobre el que se revela la otra capa). Aquí es el mismo método
    // ("stable fluids" de Jos Stam) en CPU a baja resolución: el cursor inyecta
    // VELOCIDAD y TINTE; el tinte viaja con el flujo (se enrosca y se estira) y se
    // disipa; el shader toma el umbral del tinte. Por eso la mancha fluye en vez de
    // ser un sello circular que se encoge.
    const GW = MW;
    const GH = MH;
    const SZ = (GW + 2) * (GH + 2);
    const IX = (x: number, y: number) => x + (GW + 2) * y;
    const fu = new Float32Array(SZ);
    const fv = new Float32Array(SZ);
    const fu0 = new Float32Array(SZ);
    const fv0 = new Float32Array(SZ);
    const fd = new Float32Array(SZ);
    const fd0 = new Float32Array(SZ);
    const fp = new Float32Array(SZ);
    const fdiv = new Float32Array(SZ);
    const advect = (dst: Float32Array, src: Float32Array, dt: number) => {
      for (let y = 1; y <= GH; y++) {
        for (let x = 1; x <= GW; x++) {
          const i = IX(x, y);
          let px = x - dt * fu[i];
          let py = y - dt * fv[i];
          px = px < 0.5 ? 0.5 : px > GW + 0.5 ? GW + 0.5 : px;
          py = py < 0.5 ? 0.5 : py > GH + 0.5 ? GH + 0.5 : py;
          const x0 = px | 0;
          const y0 = py | 0;
          const sx = px - x0;
          const sy = py - y0;
          const j = IX(x0, y0);
          dst[i] = (src[j] * (1 - sx) + src[j + 1] * sx) * (1 - sy) + (src[j + GW + 2] * (1 - sx) + src[j + GW + 3] * sx) * sy;
        }
      }
    };
    const project = () => {
      for (let y = 1; y <= GH; y++) {
        for (let x = 1; x <= GW; x++) {
          const i = IX(x, y);
          fdiv[i] = -0.5 * (fu[i + 1] - fu[i - 1] + fv[i + GW + 2] - fv[i - GW - 2]);
          fp[i] = 0;
        }
      }
      for (let k = 0; k < 8; k++) {
        for (let y = 1; y <= GH; y++) {
          for (let x = 1; x <= GW; x++) {
            const i = IX(x, y);
            fp[i] = (fdiv[i] + fp[i - 1] + fp[i + 1] + fp[i - GW - 2] + fp[i + GW + 2]) * 0.25;
          }
        }
      }
      for (let y = 1; y <= GH; y++) {
        for (let x = 1; x <= GW; x++) {
          const i = IX(x, y);
          fu[i] -= 0.5 * (fp[i + 1] - fp[i - 1]);
          fv[i] -= 0.5 * (fp[i + GW + 2] - fp[i - GW - 2]);
        }
      }
    };
    // el cursor inyecta velocidad (celdas/s) y tinte en un disco suave
    const splat = (cu: number, cv: number, rxCells: number, ryCells: number, vx: number, vy: number, dye: number) => {
      const cx = cu * GW + 1;
      const cy = cv * GH + 1;
      const x0 = Math.max(1, Math.floor(cx - rxCells));
      const x1 = Math.min(GW, Math.ceil(cx + rxCells));
      const y0 = Math.max(1, Math.floor(cy - ryCells));
      const y1 = Math.min(GH, Math.ceil(cy + ryCells));
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const d = Math.hypot((x - cx) / rxCells, (y - cy) / ryCells);
          if (d >= 1) continue;
          const w = (1 - d) * (1 - d);
          const i = IX(x, y);
          fu[i] += vx * w * 0.3;
          fv[i] += vy * w * 0.3;
          fd[i] = Math.min(1.3, fd[i] + dye * w * 0.75);
        }
      }
    };
    const cursorVel = { x: 0, y: 0 };
    const stepFluid = (dt: number) => {
      // velocidad: advección + proyección (incompresible) + disipación
      advect(fu0, fu, dt);
      advect(fv0, fv, dt);
      fu.set(fu0);
      fv.set(fv0);
      project();
      const kv = Math.exp(-dt * 2.4);
      for (let i = 0; i < SZ; i++) {
        fu[i] *= kv;
        fv[i] *= kv;
      }
      // tinte: viaja con el flujo y se disipa
      advect(fd0, fd, dt);
      fd.set(fd0);
      const kd = Math.exp(-dt / 0.42);
      let any = false;
      for (let y = 1; y <= GH; y++) {
        for (let x = 1; x <= GW; x++) {
          const i = IX(x, y);
          let v = fd[i] * kd - 0.07 * dt;
          if (v < 0) v = 0;
          fd[i] = v;
          if (v > 0.002) any = true;
          field[(y - 1) * MW + (x - 1)] = v;
        }
      }
      return any;
    };

    let raf = 0;
    let tPrev = performance.now();
    let drawn = false;
    const showAvatar = () => {
      const a = canvas2DRef.current;
      if (a) a.style.visibility = 'visible';
    };
    // true mientras el fluido tenga tinte/velocidad que disipar
    let alive = false;
    const loop = () => {
      raf = 0;
      const nowMs = performance.now();
      const dt = Math.min(0.05, (nowMs - tPrev) / 1000);
      tPrev = nowMs;
      // Se mira primero si la portada está activa (antes se medía el rect en
      // cada cuadro aunque no lo estuviera).
      const active = coverActiveRef.current;

      if (!active) {
        // fuera de la portada quieta (sonrisa, paso al androide): sin ventana.
        // Se limpia una vez y el bucle se detiene hasta que vuelva a activarse.
        if (drawn) {
          gl.clearColor(0, 0, 0, 0);
          gl.clear(gl.COLOR_BUFFER_BIT);
          drawn = false;
          canvas.style.filter = '';
          showAvatar();
        }
        field.fill(0);
        fd.fill(0);
        fu.fill(0);
        fv.fill(0);
        last.has = false;
        alive = false;
        moved = false;
        return;
      }
      const stage = stageRef.current;
      const avatar = canvas2DRef.current;
      if (!stage || !avatar || avatar.width < 2) return;
      if (!stageRect) stageRect = stage.getBoundingClientRect();
      const rect = stageRect;
      if (rect.width < 2) return;
      // Sin movimiento nuevo y sin mancha que disipar: no hay nada que simular
      // (project() era el 18 % de CPU con la portada quieta). El bucle se para.
      const hadMove = moved;
      moved = false;
      if (!hadMove && !alive) return;

      // el cursor inyecta velocidad y tinte SOLO si se mueve
      let injected = false;
      if (cur.has && cur.x >= rect.left && cur.x <= rect.right && cur.y >= rect.top && cur.y <= rect.bottom) {
        const u = (cur.x - rect.left) / rect.width;
        const v = (cur.y - rect.top) / rect.height;
        if (last.has) {
          const dux = u - last.x;
          const duy = v - last.y;
          const movedPx = Math.hypot(dux * rect.width, duy * rect.height);
          if (movedPx > 1.2) {
            const dtm = Math.max(dt, 1e-3);
            // velocidad del cursor en celdas/s, suavizada
            cursorVel.x += (dux * GW / dtm - cursorVel.x) * 0.5;
            cursorVel.y += (duy * GH / dtm - cursorVel.y) * 0.5;
            const rPx = 0.04 * rect.height;
            const rx = (rPx / rect.width) * GW;
            const ry = (rPx / rect.height) * GH;
            const steps = Math.max(1, Math.ceil(movedPx / (rPx * 0.35)));
            for (let k = 1; k <= steps; k++) splat(last.x + (dux * k) / steps, last.y + (duy * k) / steps, rx, ry, cursorVel.x, cursorVel.y, 0.8);
            injected = true;
            last.x = u;
            last.y = v;
          }
        } else {
          // primer contacto: solo se anota la posición (la mancha nace al mover)
          last.x = u;
          last.y = v;
          last.has = true;
        }
      } else {
        last.has = false;
      }

      // nada inyectado y nada que disipar: el campo está en cero, no se simula
      if (!injected && !alive) return;
      // un paso del fluido (la mancha fluye y se disipa sola en ~1 s)
      const any = stepFluid(Math.min(dt, 1 / 30));
      alive = any;
      // sigue el próximo cuadro mientras haya mancha (sin movimiento nuevo se para)
      if (any) schedule();
      for (let i = 0; i < field.length; i++) bytes[i] = Math.min(255, Math.round((field[i] / 1.4) * 255));
      if (!any) {
        if (drawn) {
          gl.clearColor(0, 0, 0, 0);
          gl.clear(gl.COLOR_BUFFER_BIT);
          drawn = false;
          canvas.style.filter = '';
          showAvatar();
        }
        return;
      }

      // el lienzo GL tiene EXACTAMENTE el tamaño del lienzo de la figura (1:1)
      const cw = avatar.width;
      const ch = avatar.height;
      if (canvas.width !== cw || canvas.height !== ch) {
        canvas.width = cw;
        canvas.height = ch;
      }
      if (backW !== cw || backH !== ch) {
        backW = cw;
        backH = ch;
        paintBack(cw, ch);
      }
      gl.viewport(0, 0, cw, ch);
      gl.useProgram(prog);
      if (backDirty) {
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, backTex);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, backCanvas);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        backDirty = false;
      }
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, fieldTex);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, MW, MH, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, bytes);
      // la textura de la figura solo se vuelve a subir si el lienzo cambió
      if (uploadedVersion !== avatarVersionRef.current || !drawn) {
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, avatarTex);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, avatar);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        uploadedVersion = avatarVersionRef.current;
      }
      gl.uniform2f(uRes, cw, ch);
      gl.uniform1f(uTime, nowMs / 1000);
      gl.disable(gl.BLEND);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      drawn = true;
      // la sombra (mismo filtro que la figura 2D) solo mientras este lienzo muestra algo:
      // vacío no proyecta nada, pero el filtro igual costaba dos pasadas de desenfoque
      // a pantalla completa por cuadro en la GPU
      if (!canvas.style.filter) canvas.style.filter = AVATAR_SHADOW;
      // ahora la figura se ve desde el lienzo GL; se oculta la 2D
      avatar.style.visibility = 'hidden';
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(loop);
    };
    wake = () => {
      if (raf) return;
      const now = performance.now();
      // En pausa no se simuló: la velocidad residual (sin tinte) se atenúa de
      // golpe como lo habría hecho cuadro a cuadro (exp(-2.4 t)).
      if (!alive) {
        const kv = Math.exp(-((now - tPrev) / 1000) * 2.4);
        if (kv < 0.999) {
          for (let i = 0; i < SZ; i++) {
            fu[i] *= kv;
            fv[i] *= kv;
          }
        }
      }
      // tras una pausa el primer paso no debe "saltar" (dt se recorta igual)
      tPrev = now;
      raf = requestAnimationFrame(loop);
    };
    fluidWakeRef.current = () => {
      stageRect = null;
      wake();
    };
    wake();
    return () => {
      cancelAnimationFrame(raf);
      raf = 0;
      fluidWakeRef.current = () => {};
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onMove);
      window.removeEventListener('touchmove', onTouch);
      window.removeEventListener('scroll', invalidateRect, { capture: true });
      window.removeEventListener('resize', invalidateRect);
      ro?.disconnect();
      showAvatar();
      gl.deleteTexture(fieldTex);
      gl.deleteTexture(avatarTex);
      gl.deleteTexture(backTex);
      gl.deleteBuffer(buf);
      gl.deleteProgram(prog);
    };
  }, []);

  useEffect(() => {
    const cache = new FrameBitmapCache(() => heroFramesRef.current.frames);
    cache.onReady = () => drawFrameRef.current();
    cacheRef.current = cache;
    // guiño: ventana más corta (72 fotogramas a ~45 fps durante el clic)
    const winkCache = new FrameBitmapCache(() => winkFramesRef.current.frames, 2, 12);
    winkCache.onReady = () => drawFrameRef.current();
    winkCacheRef.current = winkCache;
    return () => {
      cache.dispose();
      cacheRef.current = null;
      winkCache.dispose();
      winkCacheRef.current = null;
    };
  }, []);

  // El bucle del fluido del cursor solo se despierta/apaga cuando cambia esto.
  useEffect(() => {
    fluidWakeRef.current();
  }, [coverActive]);

  // Guiño: con la portada activa se pre-decodifican sus primeros fotogramas
  // (así el clic arranca sin decodificar en el hilo principal); fuera de la
  // portada se libera esa memoria.
  useEffect(() => {
    const wc = winkCacheRef.current;
    const canvas = canvas2DRef.current;
    if (!wc || !canvas || !isCutout) return;
    if (coverActive && winkFrames.loaded && winkFrames.frames && !winkFrames.failed) {
      wc.setSize(canvas.width, canvas.height);
      wc.request(0, 1);
    } else if (!coverActive && winkRef?.current == null) {
      wc.releaseAll();
    }
  }, [coverActive, isCutout, winkFrames.loaded, winkFrames.frames, winkFrames.failed, winkRef]);

  useEffect(() => {
    setReady(true);
  }, []);

  // El buffer del canvas se ajusta 1:1 al tamaño real renderizado en pantalla
  // (con devicePixelRatio para nitidez), sin depender de un recorte por
  // object-fit: cover que antes desalineaba la composición.
  useEffect(() => {
    const stage = stageRef.current;
    const canvas = canvas2DRef.current;
    if (!stage || !canvas) return;

    const resize = () => {
      const rect = stage.getBoundingClientRect();
      setStageSize((prev) => (prev.w === rect.width && prev.h === rect.height ? prev : { w: rect.width, h: rect.height }));
      // Escritorio: tope 1.5. Los fotogramas miden 1600 px de ancho y se ven a ~1600 px CSS:
      // un lienzo a 2x (3200 px) no suma detalle, solo cuadruplica píxeles a pintar y
      // componer por cuadro. A 1.5 sigue por encima de la resolución del fotograma.
      // (Móvil, < 1024 px, sin cambios.)
      const dpr = Math.min(window.devicePixelRatio || 1, window.innerWidth >= 1024 ? 1.5 : 2);
      const nextWidth = Math.max(1, Math.round(rect.width * dpr));
      const nextHeight = Math.max(1, Math.round(rect.height * dpr));

      // Evita reasignar el buffer si el tamaño no cambió realmente: escribir
      // canvas.width/height SIEMPRE reinicializa (limpia) el buffer de
      // dibujo, aunque el valor sea idéntico. El pin/despin de GSAP en el
      // Hero puede disparar el ResizeObserver por cambios sub-pixel
      // espurios justo en el límite de la sección — sin este guard, eso
      // producía un frame de buffer "en blanco/basura" (visible como una
      // franja de ruido horizontal) hasta el próximo redibujado.
      if (canvas.width === nextWidth && canvas.height === nextHeight) return;

      canvas.width = nextWidth;
      canvas.height = nextHeight;

      // Redibuja de inmediato en el mismo tick, no se espera al próximo
      // requestAnimationFrame del loop de animación, para no dejar el
      // buffer recién reinicializado vacío ni un solo frame.
      cacheRef.current?.setSize(nextWidth, nextHeight);
      drawFrameRef.current(true);
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  // Redibuja solo cuando cambia la posición visible (drawSequence ya omite
  // los repintados redundantes): menos dibujados de una imagen 1920x1080 por
  // tick = menos ventanas para el desgarro visual reportado antes.
  // Antes: drawFrameRef() en CADA cuadro, para siempre. Ahora se dibuja solo
  // cuando cambia algo: el progreso (este efecto), la caché lista (onReady),
  // el tamaño (resize) o la carga de las imágenes quietas. La sonrisa y el
  // guiño cambian por ref sin re-render: mientras la figura es visible, un
  // bucle mínimo compara esos dos valores y solo dibuja si cambiaron.
  useEffect(() => {
    if (!ready) return;
    drawFrameRef.current();
  }, [ready, heroFrames.loaded, heroFrames.frames, entryProgress]);

  const figureVisible = heroOpacity > 0;
  useEffect(() => {
    if (!ready) return;
    let lastOv: number | null | undefined;
    let lastWk: number | null | undefined;
    let rafId = 0;
    const poll = () => {
      rafId = requestAnimationFrame(poll);
      const ov = frameOverrideRef?.current ?? null;
      const wk = winkRef?.current ?? null;
      if (ov === lastOv && wk === lastWk) return;
      lastOv = ov;
      lastWk = wk;
      drawFrameRef.current();
    };
    // Con la figura apagada (más abajo en la página) no hace falta vigilar;
    // si igual hay sonrisa/guiño en curso, se sigue vigilando hasta que acabe.
    if (figureVisible || frameOverrideRef?.current != null || winkRef?.current != null) {
      rafId = requestAnimationFrame(poll);
    }
    return () => cancelAnimationFrame(rafId);
  }, [ready, heroFrames.loaded, heroFrames.frames, figureVisible, frameOverrideRef, winkRef]);

  const lettersOpacity = lettersBack ? Math.min(1, Math.max(0, (0.84 - progress) / 0.1)) : Math.min(1, Math.max(0, (0.592 - progress) / 0.022));
  const lettersActiveUntil = typeof window !== 'undefined' && window.innerWidth >= 1024
    ? (lettersBack ? 0.84 : 0.592) // pausa WebGL en cuanto termina el fundido
    : (lettersBack ? 0.95 : HERO_DISSOLVE_START);

  return (
    <div ref={stageRef} className="absolute inset-0">
      {isCutout && <HeroBackdrop opacity={heroOpacity} />}
      {/* Aro de luz detrás de la cabeza (referencia "Creative Portfolio"),
          en el rosa/magenta de la paleta. Crece y se enciende mientras ella
          entra a cuadro. */}
      {/* (aro de luz retirado: la portada ahora es solo la figura y la palabra) */}
      {/* "PORTAFOLIO" gigante DETRÁS de la silueta (diseño centrado): la cabeza
          entra en la palabra. Se apaga antes del fundido hacia el androide (si
          no, se vería a través de la cara semitransparente). */}
      {/* "PORTA" / "FOLIO" como modelo 3D (vidrio burbuja tipo grafiti)
          DETRÁS de la silueta: reacciona al cursor y sale despedido al bajar
          hacia el androide. Desvinculado de isCutout para que se muestre en celulares. */}
      <Letters3D
        className="absolute inset-0 z-0"
        reactRef={frameOverrideRef}
        entry={typeof window !== 'undefined' && window.innerWidth < 768 ? 1 : entryProgress}
        exit={lettersBack ? Math.min(1, Math.max(0, (progress - 0.6) / 0.2)) : Math.min(1, Math.max(0, (progress - 0.565) / 0.06))}
        active={progress < lettersActiveUntil && ((typeof window !== 'undefined' && window.innerWidth < 768) || entryProgress > 0.2)}
        // se van apenas despegan: sin siluetas oscuras flotando durante el cambio
        style={{ opacity: lettersOpacity }}
      />
      <canvas
        ref={canvas2DRef}
        className="relative z-10 w-full h-full block"
        style={{
          opacity: heroOpacity,
          // Luz de contorno suave sobre la silueta (rosa de la paleta).
          // Sombra proyectada sobre las letras (la figura está DELANTE de ellas):
          // oscurece la palabra alrededor de la silueta y la "asienta" en el
          // espacio, en vez de verse como un recorte pegado encima.
          // (con opacidad 0 el filtro no se ve: se quita para no pagarlo en la GPU)
          filter: isCutout && heroOpacity > 0 ? AVATAR_SHADOW : undefined,
        }}
      />
      {/* Ventana de cristal del cursor: la figura se vuelve transparente (ver el efecto "VENTANA DE CRISTAL") */}
      {isCutout && (
        <canvas
          ref={revealCanvasRef}
          className="absolute inset-0 z-20 w-full h-full pointer-events-none"
          // filtro de sombra: lo pone/quita el bucle de la ventana (solo con contenido)
          style={{ opacity: heroOpacity }}
        />
      )}
      {/* Integración de luz: el rosa de las letras "rebota" sobre el pelo y la
          piel de los costados (soft-light: sobre negro no suma nada, así el
          fondo sigue siendo negro puro) y el borde inferior se hunde en la
          oscuridad en vez de cortarse en seco. */}
      {isCutout && (
        <div
          className="absolute inset-0 z-20 pointer-events-none"
          style={{
            // solo mientras están las letras (es su luz rebotando); al bajar se apaga con ellas
            opacity: heroOpacity * (1 - Math.min(1, Math.max(0, (progress - 0.555) / 0.03))),
            mixBlendMode: 'soft-light',
            background:
              'radial-gradient(38% 60% at 14% 38%, rgba(242,48,210,0.6) 0%, rgba(242,7,93,0.25) 55%, transparent 100%), radial-gradient(38% 60% at 88% 36%, rgba(242,48,210,0.6) 0%, rgba(180,60,242,0.25) 55%, transparent 100%)',
          }}
        />
      )}
      {isCutout && (
        <div
          className="absolute inset-0 z-20 pointer-events-none"
          style={{
            opacity: heroOpacity,
            background:
              'linear-gradient(to top, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.35) 9%, transparent 24%), linear-gradient(to right, rgba(0,0,0,0.45) 0%, transparent 10%, transparent 90%, rgba(0,0,0,0.45) 100%)',
          }}
        />
      )}
    </div>
  );
};

// HeroSection se re-renderiza en cada cuadro del scroll: memo evita repetir
// este render si el progreso no cambió. onReady se lee por ref (el padre la
// pasa inline), así que su identidad no cuenta.
export const HeroAvatarStage = React.memo(
  HeroAvatarStageInner,
  (a, b) =>
    a.progress === b.progress &&
    a.frameOverrideRef === b.frameOverrideRef &&
    a.winkRef === b.winkRef &&
    !!a.onReady === !!b.onReady
);

export default HeroAvatarStage;
