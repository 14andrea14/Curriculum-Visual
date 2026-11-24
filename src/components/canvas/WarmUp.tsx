import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { isPreloading, registerWarmup } from '../../lib/preload';

// "Precalentado" de una escena r3f que arranca con frameloop="never" y se enciende
// a mitad del scroll (logos IA, nombre 3D...). La PRIMERA vez que una escena se
// dibuja, el navegador compila sus shaders, genera el mapa de entorno (PMREM del
// <Environment>) y sube geometrías/texturas a la GPU: con materiales físicos eso
// bloquea el hilo principal cientos de ms y el scroll "se detiene".
// Aquí se prepara todo por adelantado:
//   1) un cuadro (advance) → crea el entorno (PMREM) y aplica los acabados de material;
//   2) gl.compileAsync → compila los programas en paralelo (KHR_parallel_shader_compile),
//      sin bloquear el hilo principal mientras el driver trabaja;
//   3) otro cuadro → sube lo que falte (geometrías, uniformes) con los programas ya listos.
// CUÁNDO: si la pantalla de carga sigue visible, como tarea de calentamiento de la
// carga (registerWarmup: el loader espera a que termine). Antes corría en un
// requestIdleCallback después de cargar, o sea YA EN LA PORTADA: medido, un cuadro
// de ~200 ms justo cuando la usuaria empieza a interactuar. Si la carga ya terminó
// (montaje tardío), se hace como antes, en un rato ocioso.
let warmSeq = 0;
// ready: si se indica, se espera (sondeando) a que devuelva true antes de preparar
// (p. ej. hasta que las mallas que dependen de texturas ya estén en la escena).
export const WarmUp: React.FC<{ delay?: number; ready?: () => boolean }> = ({ delay = 1200, ready }) => {
  const readyRef = useRef(ready);
  readyRef.current = ready;
  const { advance, gl, scene, camera } = useThree();
  // sin verificación de errores de shader: esa consulta obliga al navegador a terminar
  // de compilar en el acto (bloqueante); sin ella la compilación puede ir en paralelo
  if (gl.debug) gl.debug.checkShaderErrors = false;
  useEffect(() => {
    let cancelled = false;
    let started = false;
    type RIC = (cb: () => void, opts?: { timeout: number }) => number;
    const ric: RIC =
      (window as unknown as { requestIdleCallback?: RIC }).requestIdleCallback ?? ((cb) => window.setTimeout(cb, 1));
    const idle = () => new Promise<void>((res) => ric(() => res(), { timeout: 3000 }));
    const frame = () => new Promise<void>((res) => requestAnimationFrame(() => res()));
    const go = async (duringLoad: boolean) => {
      if (cancelled || started) return;
      started = true;
      // espera a que la escena esté completa (tope 10 s: después se prepara igual)
      const t0 = performance.now();
      while (!cancelled && readyRef.current && !readyRef.current() && performance.now() - t0 < 10000) {
        await new Promise((r) => setTimeout(r, 50));
      }
      if (cancelled) return;
      const compile = async () => {
        try {
          await gl.compileAsync(scene, camera); // shaders en paralelo
        } catch {
          /* sin compileAsync: el cuadro siguiente compila igual (bloqueante) */
        }
      };
      // 0) primero en paralelo lo que ya se puede compilar: si el primer cuadro llegaba
      //    antes, enlazaba todos los programas de golpe en el hilo principal (medido:
      //    ~3 s de bloqueo durante la carga, la pantalla de carga se congelaba)
      await compile();
      if (cancelled) return;
      advance(performance.now()); // 1) entorno
      await compile(); // 2) variantes que dependen del entorno, en paralelo
      if (cancelled) return;
      // durante la carga no hace falta esperar un rato ocioso (no hay nada que cuidar)
      await (duringLoad ? frame() : idle());
      if (!cancelled) advance(performance.now()); // 3) resto
    };
    const later = () => {
      const id = window.setTimeout(() => ric(() => void go(false), { timeout: 4000 }), delay);
      return () => window.clearTimeout(id);
    };
    if (!isPreloading()) {
      const stop = later();
      return () => {
        cancelled = true;
        stop();
      };
    }
    const unregister = registerWarmup(`r3f-warmup-${++warmSeq}`, () => go(true), 2);
    // red de seguridad: si la carga terminó sin llegar a correr la tarea (tope de tiempo), como antes
    let stopLater: (() => void) | null = null;
    const onDone = () => {
      if (!started) stopLater = later();
    };
    window.addEventListener('preloader-done', onDone, { once: true });
    return () => {
      cancelled = true;
      unregister();
      window.removeEventListener('preloader-done', onDone);
      stopLater?.();
    };
  }, [advance, delay, gl, scene, camera]);
  return null;
};
