import { useEffect } from 'react';

const TILT_RADIUS_PX = 240;
const TILT_MAX_DEG = 7;

// Inclina el bloque completo (como una tarjeta) hacia el cursor cuando pasa
// cerca — mismo criterio ya usado en ScrollTerminal.tsx (confirmado como el
// enfoque correcto: "distorsionar el bloque completo como una unidad, no
// letra por letra"), extraído acá como hook reutilizable. A diferencia de
// ScrollTerminal (que solo reacciona mientras el cursor está ENCIMA del
// bloque, vía onMouseMove de React), este usa un listener global + radio de
// proximidad real con caída coseno: reacciona apenas el cursor SE ACERCA,
// no recién al tocarlo — pedido explícito ("cuando se les acerque el
// mouse"). El listener global también evita pelear con pointer-events-none
// en los contenedores de texto del Hero.
export function useProximityTilt(ref: React.RefObject<HTMLElement | null>, active: boolean = true) {
  useEffect(() => {
    if (!active) return;
    const el = ref.current;
    if (!el) return;

    const reset = () => {
      el.style.transform = 'perspective(800px) rotateX(0deg) rotateY(0deg) scale(1)';
    };

    const handleMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;

      const edgeDx = e.clientX < rect.left ? rect.left - e.clientX : e.clientX > rect.right ? e.clientX - rect.right : 0;
      const edgeDy = e.clientY < rect.top ? rect.top - e.clientY : e.clientY > rect.bottom ? e.clientY - rect.bottom : 0;
      const dist = Math.sqrt(edgeDx * edgeDx + edgeDy * edgeDy);

      if (dist < TILT_RADIUS_PX) {
        const t = dist / TILT_RADIUS_PX;
        const strength = (Math.cos(t * Math.PI) + 1) / 2;
        // Normalizado -1..1 según en qué cuadrante del bloque cae el cursor.
        const nx = Math.max(-1, Math.min(1, (e.clientX - cx) / (rect.width / 2)));
        const ny = Math.max(-1, Math.min(1, (e.clientY - cy) / (rect.height / 2)));
        const rotateY = nx * TILT_MAX_DEG * strength;
        const rotateX = -ny * TILT_MAX_DEG * strength;
        el.style.transform = `perspective(800px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(${1 + 0.025 * strength})`;
      } else {
        reset();
      }
    };

    window.addEventListener('mousemove', handleMove, { passive: true });
    return () => {
      window.removeEventListener('mousemove', handleMove);
      reset();
    };
  }, [ref, active]);
}
