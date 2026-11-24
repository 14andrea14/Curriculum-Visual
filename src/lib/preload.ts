// Registro global de la PANTALLA DE CARGA (ver components/lando/Preloader.tsx).
// Las secuencias de fotogramas (useHeroFrames) informan cuántos cuadros llevan cargados;
// el Preloader suma todo y muestra el porcentaje real. Mientras dura la carga,
// isPreloading() es true: las animaciones de entrada (letras PORTAFOLIO) esperan.

const progress = new Map<string, { loaded: number; total: number }>();
let preloading = typeof window !== 'undefined';

export const reportLoad = (key: string, loaded: number, total: number) => {
  progress.set(key, { loaded, total });
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('preload-progress'));
};

export const loadState = () => {
  let loaded = 0;
  let total = 0;
  progress.forEach((v) => {
    loaded += v.loaded;
    total += v.total;
  });
  return { loaded, total };
};

export const isPreloading = () => preloading;

// Instante (performance.now) en que main.tsx monta la página, que se baja DESPUÉS de pintar la
// pantalla de carga (import() de App). El Preloader mide con él los topes de la carga real.
let appMountedAt: number | null = null;
export const markAppMounting = () => {
  appMountedAt = performance.now();
};
export const appMountTime = () => appMountedAt;

// CALENTAMIENTO de secciones (para que no haya tirones al llegar a ellas): cada sección
// registra una tarea que se ejecuta DURANTE la pantalla de carga (decodificar sus
// imágenes, compilar shaders, crear texturas...). El Preloader espera a que terminen
// todas (con un tope de tiempo) antes de mostrar la página.
// Cada tarea pesa `weight` en el porcentaje de la pantalla de carga (por defecto 1).
// Las tareas se registran al montar la sección (a la vez que arranca el Preloader) y
// pueden llegar tarde: startWarmups() es idempotente y arranca solo las que faltan.
interface Warmup {
  task: () => Promise<unknown>;
  weight: number;
  started: boolean;
  done: boolean;
  promise?: Promise<void>;
}
const warmups = new Map<string, Warmup>();
export const registerWarmup = (key: string, task: () => Promise<unknown>, weight = 1) => {
  const w: Warmup = { task, weight: Math.max(0.1, weight), started: false, done: false };
  warmups.set(key, w);
  return () => {
    if (warmups.get(key) === w) warmups.delete(key);
  };
};
/** Arranca (una sola vez) las tareas registradas que aún no corrieron. Nunca rechaza. */
export const startWarmups = () => {
  warmups.forEach((w) => {
    if (w.started) return;
    w.started = true;
    w.promise = Promise.resolve()
      .then(w.task) // un throw síncrono de la tarea también se captura aquí
      .then(
        () => undefined,
        () => undefined,
      )
      .then(() => {
        w.done = true;
        if (typeof window !== 'undefined') window.dispatchEvent(new Event('preload-progress'));
      });
  });
};
/** Avance ponderado de las tareas: { done, total } en "pesos" (0/0 si no hay ninguna). */
export const warmupState = () => {
  let done = 0;
  let total = 0;
  warmups.forEach((w) => {
    total += w.weight;
    if (w.done) done += w.weight;
  });
  return { done, total };
};
/** Ejecuta todas las tareas registradas (en paralelo) y espera a que terminen,
 *  incluidas las que se registren mientras tanto; nunca rechaza. */
export const runWarmups = async () => {
  for (let guard = 0; guard < 20; guard++) {
    startWarmups();
    const pending = [...warmups.values()].filter((w) => !w.done).map((w) => w.promise);
    if (!pending.length) return;
    await Promise.all(pending);
  }
};
/** Decodifica una imagen fuera del hilo principal (no falla si no existe). */
export const warmImage = (src: string) =>
  new Promise<void>((res) => {
    const im = new Image();
    im.decoding = 'async';
    im.onload = () => {
      (im.decode?.() ?? Promise.resolve()).then(() => res(), () => res());
    };
    im.onerror = () => res();
    im.src = src;
  });

export const endPreloading = () => {
  if (!preloading) return;
  preloading = false;
  window.dispatchEvent(new Event('preloader-done'));
};

// FUENTES: la hoja de Google Fonts se pide sin bloquear el render (ver index.html), así que
// document.fonts.ready puede resolverse antes de que exista ninguna @font-face. Se espera a
// la hoja (con tope) y luego se piden de verdad las familias que usa la página.
const FONT_FAMILIES = [
  'Sora', 'Outfit', 'Anton', 'Gloock', 'Mona Sans', 'Fredoka', 'Caveat', 'JetBrains Mono',
  'Playfair Display', 'Unbounded', 'Bagel Fat One',
  // (Inter no va: solo es respaldo de Mona Sans en la pila y no se pinta; pedirla bajaba 48 kB inútiles)
];
export const loadFonts = (timeoutMs = 5000) => {
  if (typeof document === 'undefined' || !document.fonts) return Promise.resolve();
  const sheet = new Promise<void>((res) => {
    const link = document.querySelector<HTMLLinkElement>('link[data-fonts-css]');
    if (!link || link.sheet || link.media === 'all') return res();
    link.addEventListener('load', () => res(), { once: true });
    link.addEventListener('error', () => res(), { once: true });
  });
  const real = sheet
    .then(() => Promise.all(FONT_FAMILIES.map((f) => document.fonts.load(`1em "${f}"`).catch(() => []))))
    .then(() => document.fonts.ready)
    .then(() => undefined);
  return Promise.race([real, new Promise<void>((res) => window.setTimeout(res, timeoutMs))]);
};
