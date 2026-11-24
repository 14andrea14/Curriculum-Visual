// Reproducción fluida de secuencias de fotogramas (scrub por scroll).
//
// Diagnóstico (medido en Chrome con GPU real): los <img> de la secuencia
// "terminan de cargar" (onload) pero NO están decodificados. Con el canvas 2D
// acelerado, cada drawImage de un <img> nuevo lo decodifica en el hilo
// principal al cerrar el cuadro (CanvasRenderingContext2D FinalizeFrame ->
// GpuImageDecodeCache::DecodeImage): ~1.8 s de hilo principal cada 4 s de la
// caminata del gato. img.decode() NO sirve aquí: el canvas acelerado vuelve a
// decodificar por su cuenta.
//
// Solución: una ventana deslizante de ImageBitmap decodificados FUERA del hilo
// principal: fetch(url) -> Blob -> createImageBitmap(blob) (desde un Blob,
// Chrome decodifica en hilos aparte y en paralelo; desde un <img> lo haría en
// el principal). Se dibuja con los MISMOS parámetros que antes (mismo recorte
// "cover", suavizado 'high'), así el resultado es idéntico; solo cambia que la
// fuente ya viene decodificada.
// Medido (1440x900, 20 fotogramas en paralelo): sin reescalar ~170 ms; con
// resizeWidth/resizeHeight (calidad 'high' o 'medium') ~650 ms — reescalar en
// la CPU es 4x más lento que decodificar y no alcanza el ritmo del scroll
// asistido (~40 fotogramas/s), así que solo se reescala cuando el canvas es
// menos de la mitad del fotograma (pantallas chicas: ahorra memoria).
// Se pre-cargan unos fotogramas por delante en la dirección del scroll y unos
// pocos por detrás; los que salen de la ventana se liberan (bitmap.close()):
// toda la secuencia decodificada serían cientos de MB. Si el tamaño del canvas
// cambia, la ventana se rehace a la nueva medida.
//
// Si el fotograma pedido aún no está listo se dibuja el bitmap más cercano ya
// decodificado (±3 fotogramas) o, si no hay, el <img> directo (decodifica en
// el hilo principal, como antes) — nunca negro. Sin createImageBitmap/fetch se
// vuelve al camino anterior (img.decode()).
//
// (Se probó mezclar fotograma actual y siguiente para suavizar: con movimiento
// rápido — el giro de la cabeza — la mezcla se ve como imagen doble/fantasma,
// así que se descartó: siempre se dibuja UN solo fotograma, el más cercano.)

function coverCrop(iw: number, ih: number, w: number, h: number) {
  const imgAspect = iw / ih;
  const canvasAspect = w / h;
  if (imgAspect > canvasAspect) {
    const sh = ih;
    const sw = sh * canvasAspect;
    return { sx: (iw - sw) / 2, sy: 0, sw, sh };
  }
  const sw = iw;
  const sh = sw / canvasAspect;
  return { sx: 0, sy: (ih - sh) / 2, sw, sh };
}

export function drawCoverImage(ctx: CanvasRenderingContext2D, img: HTMLImageElement, w: number, h: number) {
  const { sx, sy, sw, sh } = coverCrop(img.width, img.height, w, h);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
}

// Fuente dibujable de un fotograma: bitmap ya decodificado (camino nuevo) o el
// propio <img> (camino anterior / reserva).
export type FrameSource = ImageBitmap | HTMLImageElement;
function srcW(s: FrameSource) {
  return s instanceof HTMLImageElement ? s.naturalWidth : s.width;
}
function srcH(s: FrameSource) {
  return s instanceof HTMLImageElement ? s.naturalHeight : s.height;
}
// Liberar un ImageBitmap (close) es CARO y síncrono (medido: ~2 ms por fotograma
// 1600-1920 px, ~0.6 s de hilo principal en el recorrido de la portada): se hacía
// en pleno cuadro, al correr la ventana. Ahora se encola y se cierra en los ratos
// libres del navegador (requestIdleCallback, con tope de 300 ms para no acumular
// memoria). El bitmap ya salió de la caché, así que nunca se vuelve a dibujar.
const closeQueue: ImageBitmap[] = [];
let closeScheduled = false;
type IdleDeadlineLike = { timeRemaining: () => number; didTimeout?: boolean };
const ric: (cb: (d: IdleDeadlineLike) => void, o?: { timeout: number }) => void =
  typeof window !== 'undefined' && typeof (window as unknown as { requestIdleCallback?: unknown }).requestIdleCallback === 'function'
    ? (cb, o) => (window as unknown as { requestIdleCallback: (c: (d: IdleDeadlineLike) => void, o?: { timeout: number }) => number }).requestIdleCallback(cb, o)
    : (cb) => void setTimeout(() => cb({ timeRemaining: () => 8 }), 60);
function drainCloseQueue(d: IdleDeadlineLike) {
  closeScheduled = false;
  // con tiempo libre: los que entren; si venció el tope, al menos unos pocos
  let budget = d.didTimeout ? 8 : Infinity;
  while (closeQueue.length && budget-- > 0 && (d.didTimeout || d.timeRemaining() > 2)) closeQueue.shift()!.close();
  if (closeQueue.length) scheduleClose();
}
function scheduleClose() {
  if (closeScheduled) return;
  closeScheduled = true;
  ric(drainCloseQueue, { timeout: 300 });
}
function release(s: FrameSource) {
  if (s instanceof HTMLImageElement) return;
  closeQueue.push(s);
  scheduleClose();
}

// ¿Se puede decodificar fuera del hilo principal? (fetch + createImageBitmap)
const CAN_BITMAP =
  typeof window !== 'undefined' && typeof window.createImageBitmap === 'function' && typeof window.fetch === 'function';
// margen fuera de la ventana antes de liberar un fotograma (evita liberar y
// volver a decodificar en vaivenes cortos del scroll)
const SLACK = 2;
// decodificaciones simultáneas por secuencia
const MAX_INFLIGHT = 6;
// búsqueda amplia del fotograma decodificado más cercano (antes de caer al <img>)
const FAR_NEAREST = 12;

// Blob original de cada fotograma (lo registra useHeroFrames al descargar):
// createImageBitmap lo decodifica sin volver a pedirlo a la red.
export const frameBlobs = new WeakMap<HTMLImageElement, Blob>();

export class FrameBitmapCache {
  private map = new Map<number, FrameSource>();
  private pending = new Map<number, AbortController | null>();
  private w = 0;
  private h = 0;
  private gen = 0;
  private lo = 0;
  private hi = 0;
  // 'bitmap': ImageBitmap fuera del hilo principal; 'img': camino anterior
  // (img.decode()), si el navegador no soporta lo primero o falla.
  private mode: 'bitmap' | 'img' = CAN_BITMAP ? 'bitmap' : 'img';
  // false si el navegador ignora/rechaza las opciones de reescalado
  private resizeOk = true;
  onReady: (() => void) | null = null;

  constructor(
    private getImages: () => HTMLImageElement[] | null,
    private behind = 2,
    private ahead = 10,
    private keepPendingBitmaps?: () => boolean,
  ) {}

  get decodesBitmaps() {
    return this.mode === 'bitmap';
  }

  setSize(canvasW: number, canvasH: number) {
    if (canvasW === this.w && canvasH === this.h) return;
    this.w = canvasW;
    this.h = canvasH;
    // Los bitmaps dependen del tamaño del canvas: se rehace la ventana.
    if (this.mode === 'bitmap') this.clear();
  }

  private clear() {
    this.gen++;
    for (const s of this.map.values()) release(s);
    this.map.clear();
    for (const ac of this.pending.values()) ac?.abort();
    this.pending.clear();
  }

  dispose() {
    this.clear();
    this.onReady = null;
  }

  // Libera la memoria de la ventana (se vuelve a llenar con el próximo request).
  releaseAll() {
    this.clear();
  }

  get(i: number) {
    return this.map.get(i);
  }

  // Fotograma ya listo más cercano a i (hasta ±maxD), preferentemente del
  // lado de donde viene el scroll. Evita decodificar en el hilo principal
  // cuando la ventana va un pelo atrasada.
  nearest(i: number, dir: number, maxD = Math.max(3, Math.ceil(this.stride * 1.5))): FrameSource | undefined {
    const step = dir < 0 ? 1 : -1;
    for (let d = 1; d <= maxD; d++) {
      const a = this.map.get(i + step * d) ?? this.map.get(i - step * d);
      if (a) return a;
    }
    return undefined;
  }

  // Velocidad del scrub (fotogramas que avanza cada dibujo, suavizada). Si el
  // scroll asistido salta de a 10 fotogramas, decodificar todos los
  // intermedios es trabajo tirado (nunca se ven) y la ventana nunca llega a
  // tiempo: se pre-carga "salteando" al mismo paso.
  private lastCenter = -1;
  private lastT = 0;
  private speed = 1;
  private strideFor(center: number) {
    const now = typeof performance !== 'undefined' ? performance.now() : 0;
    if (this.lastCenter >= 0 && center !== this.lastCenter) {
      const d = Math.abs(center - this.lastCenter);
      // tras una pausa se arranca de nuevo desde el salto actual
      this.speed = now - this.lastT > 250 ? d : this.speed * 0.6 + d * 0.4;
      this.lastT = now;
    } else if (now - this.lastT > 250) {
      this.speed = 1;
    }
    this.lastCenter = center;
    return Math.max(1, Math.min(8, Math.round(this.speed)));
  }

  private lastReq: { center: number; dir: number; frameStep: number } | null = null;
  // Vuelve a pedir la última ventana (al terminar una decodificación, para
  // seguir llenándola sin esperar al próximo dibujo).
  private pump() {
    const r = this.lastReq;
    if (r) this.request(r.center, r.dir, r.frameStep, true);
  }

  request(center: number, dir: number, frameStep = 1, fromPump = false) {
    const images = this.getImages();
    if (!images || this.w < 2 || this.h < 2 || typeof HTMLImageElement === 'undefined') return;
    this.lastReq = { center, dir, frameStep };
    const n = images.length;
    const stride = fromPump ? this.stride : Math.max(frameStep, Math.round(this.strideFor(center) / frameStep) * frameStep);
    this.stride = stride;
    // hacia adelante (dirección del scroll) cada `stride` fotogramas; hacia
    // atrás, contiguos (y con paso > 1 se conservan los que llegaron tarde,
    // que sirven como "más cercano" mientras el exacto no está)
    const keepBack = stride > 1 ? Math.max(this.behind, 2 * stride) : this.behind;
    const back = dir < 0 ? this.ahead * stride : keepBack;
    const fwd = dir < 0 ? keepBack : this.ahead * stride;
    this.lo = Math.max(0, center - back);
    this.hi = Math.min(n - 1, center + fwd);

    for (const [k, s] of this.map) {
      if (k < this.lo - SLACK || k > this.hi + SLACK) {
        release(s);
        this.map.delete(k);
      }
    }
    // tope de memoria: si quedaron de más (restos de una ventana anterior
    // dentro del rango), se liberan los más lejanos al punto actual
    const cap = this.ahead + this.behind + 2 * SLACK + 4;
    if (this.map.size > cap) {
      const far = [...this.map.keys()].sort((a, b) => Math.abs(b - center) - Math.abs(a - center));
      for (const k of far.slice(0, this.map.size - cap)) {
        const s = this.map.get(k);
        if (s) release(s);
        this.map.delete(k);
      }
    }
    // Fotogramas objetivo, de más cerca a más lejos del punto actual,
    // priorizando la dirección del scroll.
    // Con paso > 1 la grilla va alineada a múltiplos del paso (no al punto
    // actual): así los objetivos no cambian en cada dibujo y lo ya pedido
    // sigue sirviendo.
    const s = dir < 0 ? -1 : 1;
    const targets: number[] = [center];
    const g0 = stride > 1 ? (s > 0 ? Math.ceil((center + 1) / stride) : Math.floor((center - 1) / stride)) * stride : center + s;
    for (let d = 0; d < this.ahead; d++) targets.push(g0 + s * d * stride);
    for (let d = 1; d <= this.behind; d++) targets.push(center - s * d * frameStep);
    const want = new Set(targets.filter((i) => i >= this.lo && i <= this.hi));
    // Lo pendiente que ya no es objetivo (quedó atrás o fuera de la grilla) se
    // cancela y deja lugar a lo que sí hace falta; si igual termina y sigue en
    // la ventana, se guarda (ver loadBitmap).
    // Una decodificación iniciada no se puede abortar. Conserva su turno
    // hasta que termine para respetar el límite aunque cambie la grilla.
    if (!this.decodesBitmaps || !this.keepPendingBitmaps?.()) {
      for (const [k, ac] of this.pending) {
        if (!want.has(k)) {
          ac?.abort();
          this.pending.delete(k);
        }
      }
    }
    // Pocas a la vez: con muchas en paralelo ninguna llega a tiempo.
    for (const i of targets) {
      if (this.pending.size >= MAX_INFLIGHT) break;
      if (want.has(i)) this.load(images, i);
    }
  }

  // paso actual de la pre-carga (para buscar el fotograma listo más cercano)
  stride = 1;

  private inWindow(i: number) {
    return i >= this.lo - SLACK && i <= this.hi + SLACK;
  }

  private load(images: HTMLImageElement[], i: number) {
    if (i < this.lo || i > this.hi) return;
    if (this.map.has(i) || this.pending.has(i)) return;
    const img = images[i];
    if (!img || !img.complete || img.naturalWidth === 0) return;
    if (this.mode === 'bitmap') this.loadBitmap(img, i);
    else this.loadImg(img, i);
  }

  // Camino nuevo: descarga (sale de la caché HTTP: el <img> ya la bajó) y
  // decodifica en otro hilo (reescala solo si el canvas es < 1/2 del fotograma).
  private loadBitmap(img: HTMLImageElement, i: number) {
    const gen = this.gen;
    const ac = typeof AbortController === 'function' ? new AbortController() : null;
    this.pending.set(i, ac);
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    // escala "cover" del canvas respecto al fotograma
    const sc = Math.min(1, Math.max(this.w / iw, this.h / ih));
    const bw = Math.max(1, Math.round(iw * sc));
    const bh = Math.max(1, Math.round(ih * sc));
    const resize = sc < 0.5 && this.resizeOk;
    // El Blob ya descargado por useHeroFrames (sin red); si no está, se
    // descarga (de la caché HTTP si se puede).
    const known = frameBlobs.get(img);
    (known
      ? Promise.resolve(known)
      : fetch(img.currentSrc || img.src, { cache: 'force-cache', signal: ac?.signal }).then((r) => {
          if (!r.ok) throw new Error('http ' + r.status);
          return r.blob();
        })
    )
      .then((blob) => {
        if (gen !== this.gen || !this.inWindow(i)) return null;
        if (!resize) return createImageBitmap(blob);
        return createImageBitmap(blob, { resizeWidth: bw, resizeHeight: bh, resizeQuality: 'high' }).catch(() => {
          // opciones no soportadas: sin reescalar (se escala al dibujar)
          this.resizeOk = false;
          return createImageBitmap(blob);
        });
      })
      .then((bm) => {
        if (!bm) return;
        if (gen !== this.gen || !this.inWindow(i)) {
          release(bm);
          return;
        }
        if (this.pending.get(i) === ac) this.pending.delete(i);
        const old = this.map.get(i);
        if (old) release(old);
        this.map.set(i, bm);
        this.onReady?.();
      })
      .catch((err: unknown) => {
        if (gen === this.gen && this.pending.get(i) === ac) this.pending.delete(i);
        if (err instanceof DOMException && err.name === 'AbortError') return;
        // Si el navegador no puede (p. ej. fetch bloqueado o decodificador
        // sin soporte), se vuelve al camino anterior para toda la secuencia.
        if (gen === this.gen && this.mode === 'bitmap') {
          this.mode = 'img';
          this.onReady?.();
        }
      })
      .finally(() => {
        if (gen !== this.gen) return;
        if (this.pending.get(i) === ac) this.pending.delete(i);
        // hay lugar libre: se sigue llenando la ventana
        this.pump();
      });
  }

  // Camino anterior (reserva): img.decode().
  private loadImg(img: HTMLImageElement, i: number) {
    const gen = this.gen;
    this.pending.set(i, null);
    img
      .decode()
      .then(() => {
        this.pending.delete(i);
        if (gen !== this.gen || !this.inWindow(i)) return;
        this.map.set(i, img);
        this.onReady?.();
      })
      .catch(() => this.pending.delete(i))
      .finally(() => {
        if (gen === this.gen) this.pump();
      });
  }
}

// ¿Es 1:1 (mismo tamaño en píxeles)? Entonces no hace falta suavizado caro.
const near = (a: number, b: number) => Math.abs(a - b) < 0.75;

// Dibuja el fotograma completo dentro de rect (píxeles del canvas).
function drawInRect(ctx: CanvasRenderingContext2D, s: FrameSource, rect: FrameRect) {
  const sw = srcW(s);
  const sh = srcH(s);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = near(sw, rect.w) && near(sh, rect.h) ? 'low' : 'high';
  ctx.drawImage(s, 0, 0, sw, sh, rect.x, rect.y, rect.w, rect.h);
}

// Dibuja el fotograma en modo "cover" ocupando w x h.
function drawCover(ctx: CanvasRenderingContext2D, s: FrameSource, w: number, h: number) {
  const iw = srcW(s);
  const ih = srcH(s);
  const c = coverCrop(iw, ih, w, h);
  ctx.imageSmoothingEnabled = true;
  if (near(c.sw, w) && near(c.sh, h) && iw >= w && ih >= h) {
    // bitmap ya al tamaño del canvas: copia 1:1 (recorte en píxeles enteros)
    const sx = Math.min(iw - w, Math.max(0, Math.round(c.sx)));
    const sy = Math.min(ih - h, Math.max(0, Math.round(c.sy)));
    ctx.imageSmoothingQuality = 'low';
    ctx.drawImage(s, sx, sy, w, h, 0, 0, w, h);
    return;
  }
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(s, c.sx, c.sy, c.sw, c.sh, 0, 0, w, h);
}

// Dibuja el fotograma i de la secuencia en rect usando la caché si está listo
// (si no, el más cercano listo o el <img>). Devuelve true si usó un fotograma
// ya decodificado (el que se pidió exactamente).
export function drawFrameInRect(
  ctx: CanvasRenderingContext2D,
  cache: FrameBitmapCache | null,
  images: HTMLImageElement[],
  i: number,
  rect: FrameRect,
  dir = 1
): boolean {
  cache?.request(i, dir);
  const a = cache?.get(i);
  // si no hay uno cercano, uno algo más lejano (±FAR_NEAREST) antes que el <img>: el <img>
  // se decodifica en el hilo principal (20-40 ms, tirón visible); el exacto llega enseguida
  const s = a ?? cache?.nearest(i, dir) ?? cache?.nearest(i, dir, FAR_NEAREST) ?? images[i];
  if (!s || (s instanceof HTMLImageElement && (!s.complete || s.naturalWidth === 0))) return false;
  drawInRect(ctx, s, rect);
  return !!a;
}

// Ajuste geométrico opcional (escala alrededor del centro + desplazamiento,
// en fracciones del canvas). Se usa para alinear el primer fotograma de un
// clip con el último del clip anterior cuando vienen de tomas distintas.
export interface FrameTransform {
  s: number;
  dx: number;
  dy: number;
}
// Cuando la figura se achica (s < 1) los bordes del fotograma quedan DENTRO
// de la pantalla y el recorte se ve como una línea recta (pelo "cortado"
// arriba, brazo abajo). Esta máscara funde suavemente esos bordes. Devuelve
// undefined si los bordes caen fuera de pantalla (no hace falta máscara).
export function edgeFadeMask(xf?: FrameTransform): string | undefined {
  if (!xf) return undefined;
  const top = (0.5 - xf.s / 2 + xf.dy) * 100; // borde superior, % de alto
  const bottom = (0.5 + xf.s / 2 + xf.dy) * 100; // borde inferior
  if (top <= 0.5 && bottom >= 99.5) return undefined;
  const t0 = Math.max(0, top);
  const b1 = Math.min(100, bottom);
  return `linear-gradient(to bottom, transparent ${t0}%, #000 ${t0 + 9}%, #000 ${b1 - 12}%, rgba(0,0,0,0.35) ${b1}%)`;
}

function applyTransform(ctx: CanvasRenderingContext2D, w: number, h: number, xf?: FrameTransform) {
  if (!xf) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    return;
  }
  ctx.setTransform(xf.s, 0, 0, xf.s, (w * (1 - xf.s)) / 2 + xf.dx * w, (h * (1 - xf.s)) / 2 + xf.dy * h);
}

// Rectángulo destino en píxeles del canvas: el fotograma COMPLETO (sin
// recorte "cover") se dibuja dentro. Para siluetas recortadas, permite
// mostrar la figura entera aunque la pantalla tenga otra proporción.
export interface FrameRect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export const FRAME_ASPECT = 16 / 9;
export function coverRect(w: number, h: number, aspect = FRAME_ASPECT): FrameRect {
  const sc = Math.max(w / aspect, h);
  const rw = aspect * sc;
  return { x: (w - rw) / 2, y: (h - sc) / 2, w: rw, h: sc };
}
export function lerpRect(a: FrameRect, b: FrameRect, t: number): FrameRect {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, w: a.w + (b.w - a.w) * t, h: a.h + (b.h - a.h) * t };
}

export interface SequenceState {
  lastIdx: number;
  dir: number;
  lastKey: number | string;
  lastSource?: FrameSource;
}

export const newSequenceState = (): SequenceState => ({ lastIdx: -1, dir: 1, lastKey: -1 });

// Dibuja la posición continua `progress` (0-1) de la secuencia. Devuelve
// false si no dibujó nada (nada cargado todavía).
export function drawSequence(
  canvas: HTMLCanvasElement,
  cache: FrameBitmapCache,
  images: HTMLImageElement[],
  progress: number,
  state: SequenceState,
  force = false,
  xf?: FrameTransform,
  rect?: FrameRect,
  desktopHoldFrame?: number,
): boolean {
  const ctx = canvas.getContext('2d');
  if (!ctx || images.length === 0) return false;
  const n = images.length;
  const pos = Math.min(1, Math.max(0, progress)) * (n - 1);
  const frameIndex = Math.round(pos);
  const smoothPlayback = desktopHoldFrame !== undefined;
  const sample = desktopHoldFrame !== undefined && frameIndex < desktopHoldFrame;
  const nearest = sample && !force
    ? Math.min(Math.floor((desktopHoldFrame - 1) / 2), Math.round(pos / 2)) * 2
    : frameIndex;
  // (no-op si no cambió; asegura el tamaño aunque el caller no lo haya pasado,
  // p. ej. tras el doble montaje de StrictMode con el canvas ya medido)
  cache.setSize(canvas.width, canvas.height);

  if (nearest !== state.lastIdx) {
    state.dir = state.lastIdx >= 0 ? Math.sign(nearest - state.lastIdx) || state.dir : 1;
    state.lastIdx = nearest;
  }
  cache.request(nearest, state.dir, sample ? 2 : 1);

  const key = smoothPlayback
    ? (rect ? `${rect.x}|${rect.y}|${rect.w}|${rect.h}` : xf ? `${xf.s}|${xf.dx}|${xf.dy}` : 0)
    : rect
      ? `${nearest}|${Math.round(rect.x)}|${Math.round(rect.y)}|${Math.round(rect.w)}`
      : nearest * 1000 + (xf ? Math.round((xf.s - 1) * 4000 + xf.dx * 9000) : 0);
  const a = cache.get(nearest);
  // Sin cambios visibles desde el último dibujo (y con el fotograma exacto ya
  // disponible): no se repinta.
  if (!smoothPlayback && !force && key === state.lastKey && a) return true;

  // Si el exacto no está listo: el más cercano ya decodificado (±3) y, si no
  // hay, el <img> directo (decodifica en el hilo principal, como antes). En
  // ambos casos se repinta cuando llegue el exacto (lastKey = -1).
  // (más lejano, ±FAR_NEAREST, antes que el <img>: ver drawFrameInRect)
  let s: FrameSource | undefined = a ?? cache.nearest(nearest, state.dir) ?? cache.nearest(nearest, state.dir, FAR_NEAREST);
  if (!s) {
    // Si la ventana se queda atrás, conserva lo pintado hasta que llegue un
    // bitmap. La carga inicial, el resize y los navegadores sin bitmaps aún
    // pueden dibujar desde el elemento de imagen.
    if (smoothPlayback && !force && cache.decodesBitmaps && state.lastSource) return true;
    const img = images[nearest];
    if (img && img.complete && img.naturalWidth > 0) s = img;
  }
  if (!s) return false;
  if (smoothPlayback && !force && s === state.lastSource && key === state.lastKey) return true;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (rect) {
    drawInRect(ctx, s, rect);
  } else {
    applyTransform(ctx, canvas.width, canvas.height, xf);
    drawCover(ctx, s, canvas.width, canvas.height);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  state.lastKey = smoothPlayback || a ? key : -1;
  state.lastSource = smoothPlayback ? s : undefined;
  return true;
}

// =====================================================================================
// MODO LIGERO (celulares / tabletas, ver lib/deviceProfile.ts). El escritorio NO usa nada
// de lo que sigue: allí todo funciona exactamente como arriba.
//
// En el teléfono la página llegaba a ~1,3 GB (iOS mata la pestaña): por cada fotograma se
// retenían un <img> + su Blob (cientos), las ventanas de ImageBitmap guardaban fotogramas
// COMPLETOS de 1600x900 (5,5 MB c/u) aunque en vertical solo se ve un tercio, y había
// ventanas llenas de secuencias que no estaban en pantalla. Aquí:
//  - solo se guardan los Blob (comprimidos) de una secuencia SUBMUESTREADA (1 de cada N),
//    sin <img> ni URL de objeto (los descarga ScrollFrameStage por proximidad);
//  - se decodifica una VENTANA chica alrededor del cuadro actual,
//    RECORTADA a la parte del fotograma que cae dentro del lienzo y reescalada al tamaño
//    en que se dibuja (nunca ampliada): ~2 MB por bitmap en vez de 5,5;
//  - lo que sale de la ventana se libera (close) y al salir de la sección se libera todo.
// Si el cuadro pedido aún no se descargó, se usa el descargado más cercano (la "pose fija"):
// nunca un hueco.
// =====================================================================================

/** Recorte del fotograma (px de la fuente, enteros) y su destino en el lienzo (px). */
export interface LiteCrop {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  dx: number;
  dy: number;
  dw: number;
  dh: number;
}

/** Parte visible del fotograma iw x ih dibujado completo en `rect`, recortada al lienzo W x H. */
export function liteCrop(iw: number, ih: number, rect: FrameRect, W: number, H: number): LiteCrop | null {
  const x0 = Math.max(0, rect.x);
  const y0 = Math.max(0, rect.y);
  const x1 = Math.min(W, rect.x + rect.w);
  const y1 = Math.min(H, rect.y + rect.h);
  if (x1 - x0 < 1 || y1 - y0 < 1 || rect.w < 1 || rect.h < 1) return null;
  const kx = iw / rect.w;
  const ky = ih / rect.h;
  // createImageBitmap pide un recorte en píxeles enteros: se redondea hacia afuera y el
  // destino se corrige con la misma escala (el dibujo queda en el mismo lugar)
  const sx = Math.max(0, Math.floor((x0 - rect.x) * kx));
  const sy = Math.max(0, Math.floor((y0 - rect.y) * ky));
  const sw = Math.max(1, Math.min(iw - sx, Math.ceil((x1 - rect.x) * kx) - sx));
  const sh = Math.max(1, Math.min(ih - sy, Math.ceil((y1 - rect.y) * ky) - sy));
  return { sx, sy, sw, sh, dx: rect.x + sx / kx, dy: rect.y + sy / ky, dw: sw / kx, dh: sh / ky };
}

interface LiteEntry {
  s: FrameSource;
  // true: la fuente ya es solo el recorte (se dibuja entera en el destino)
  cropped: boolean;
}

function releaseLite(e: LiteEntry) {
  if (e.s instanceof HTMLImageElement) {
    // suelta la imagen decodificada (camino de reserva sin createImageBitmap)
    e.s.removeAttribute('src');
    return;
  }
  release(e.s);
}

export class LiteFrameWindow {
  private map = new Map<number, LiteEntry>();
  private pending = new Set<number>();
  private failed = new Set<number>();
  private crop: LiteCrop | null = null;
  private key = '';
  private gen = 0;
  private lo = 0;
  private hi = -1;
  private last: { k: number; dir: number; n: number } | null = null;
  // escalones de compatibilidad: recorte + reescalado -> solo recorte -> completo -> <img>
  private mode: 'resize' | 'crop' | 'full' | 'img' = CAN_BITMAP ? 'resize' : 'img';
  onReady: (() => void) | null = null;

  constructor(
    private getBlob: (k: number) => Blob | null,
    private ahead = 3,
    private behind = 1,
  ) {}

  setCrop(c: LiteCrop | null) {
    const key = c ? `${c.sx},${c.sy},${c.sw},${c.sh},${Math.round(c.dw)},${Math.round(c.dh)}` : '';
    this.crop = c;
    if (key === this.key) return;
    this.key = key;
    this.clear();
  }

  private clear() {
    this.gen++;
    for (const e of this.map.values()) releaseLite(e);
    this.map.clear();
    this.pending.clear();
    this.failed.clear();
  }

  /** Libera toda la ventana (al salir de la sección); se vuelve a llenar al pedir. */
  releaseAll() {
    this.clear();
    this.last = null;
  }

  dispose() {
    this.clear();
    this.onReady = null;
  }

  get size() {
    return this.map.size;
  }

  get(k: number) {
    return this.map.get(k);
  }

  /** El ya decodificado más cercano a k (la ventana es chica: se recorre entera). */
  nearestReady(k: number): LiteEntry | undefined {
    let best: LiteEntry | undefined;
    let bd = Infinity;
    for (const [i, e] of this.map) {
      const d = Math.abs(i - k) + (i > k ? 0.5 : 0); // a igual distancia, el anterior
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  private inWindow(k: number) {
    return k >= this.lo - 1 && k <= this.hi + 1;
  }

  request(k: number, dir: number, n: number) {
    if (!this.crop) return;
    this.last = { k, dir, n };
    const back = dir < 0 ? this.ahead : this.behind;
    const fwd = dir < 0 ? this.behind : this.ahead;
    this.lo = Math.max(0, k - back);
    this.hi = Math.min(n - 1, k + fwd);
    for (const [i, e] of this.map) {
      if (!this.inWindow(i)) {
        releaseLite(e);
        this.map.delete(i);
      }
    }
    const s = dir < 0 ? -1 : 1;
    const targets = [k];
    for (let d = 1; d <= this.ahead; d++) targets.push(k + s * d);
    for (let d = 1; d <= this.behind; d++) targets.push(k - s * d);
    for (const i of targets) {
      // de a dos: en un teléfono más decodificaciones a la vez no llegan antes
      if (this.pending.size >= 2) break;
      if (i < this.lo || i > this.hi || this.map.has(i) || this.pending.has(i) || this.failed.has(i)) continue;
      const blob = this.getBlob(i);
      if (blob) this.load(i, blob);
    }
  }

  /** Avisa que llegó un Blob nuevo (puede completar la ventana actual). */
  poke() {
    const r = this.last;
    if (r) this.request(r.k, r.dir, r.n);
  }

  private load(k: number, blob: Blob) {
    const gen = this.gen;
    const crop = this.crop!;
    this.pending.add(k);
    this.decode(blob, crop)
      .then((e) => {
        if (gen !== this.gen || !this.inWindow(k)) {
          releaseLite(e);
          return;
        }
        const old = this.map.get(k);
        if (old) releaseLite(old);
        this.map.set(k, e);
        this.onReady?.();
      })
      .catch(() => {
        /* fotograma dañado: se sigue con los vecinos */
      })
      .finally(() => {
        if (gen !== this.gen) return;
        this.pending.delete(k);
        this.poke();
      });
  }

  private async decode(blob: Blob, c: LiteCrop): Promise<LiteEntry> {
    // tamaño final: el del destino en el lienzo, sin ampliar nunca la fuente
    const rw = Math.max(1, Math.min(c.sw, Math.round(c.dw)));
    const rh = Math.max(1, Math.min(c.sh, Math.round(c.dh)));
    if (this.mode === 'resize') {
      try {
        return { s: await createImageBitmap(blob, c.sx, c.sy, c.sw, c.sh, { resizeWidth: rw, resizeHeight: rh, resizeQuality: 'medium' }), cropped: true };
      } catch {
        this.mode = 'crop';
      }
    }
    if (this.mode === 'crop') {
      try {
        return { s: await createImageBitmap(blob, c.sx, c.sy, c.sw, c.sh), cropped: true };
      } catch {
        this.mode = 'full';
      }
    }
    if (this.mode === 'full') {
      try {
        return { s: await createImageBitmap(blob), cropped: false };
      } catch {
        this.mode = 'img';
      }
    }
    const url = URL.createObjectURL(blob);
    try {
      const im = new Image();
      im.decoding = 'async';
      await new Promise<void>((resolve, reject) => {
        im.onload = () => resolve();
        im.onerror = reject;
        im.src = url;
      });
      return { s: im, cropped: false };
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}
