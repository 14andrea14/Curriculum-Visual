import { useEffect, useRef } from 'react';

export interface MouseClientState {
  x: number;
  y: number;
}

// Posición cruda del mouse en píxeles de viewport (clientX/Y), como ref (no
// state) para que loops de requestAnimationFrame (cursor personalizado, campo
// de circuitos) lean el valor más reciente sin forzar un re-render de React
// en cada mousemove. Empieza centrado en pantalla para evitar que el cursor
// personalizado "salte" desde (0,0) antes del primer movimiento real.
export function useMouseClientRef() {
  const ref = useRef<MouseClientState>({
    x: typeof window !== 'undefined' ? window.innerWidth / 2 : 0,
    y: typeof window !== 'undefined' ? window.innerHeight / 2 : 0,
  });

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      ref.current.x = e.clientX;
      ref.current.y = e.clientY;
    };
    window.addEventListener('mousemove', handleMove, { passive: true });
    return () => window.removeEventListener('mousemove', handleMove);
  }, []);

  return ref;
}
