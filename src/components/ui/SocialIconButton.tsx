import React, { useEffect, useRef } from 'react';

interface SocialIconButtonProps {
  href: string;
  label: string;
  icon: React.ReactNode;
  variant?: 'cyan' | 'magenta' | 'crimson';
  size?: 'md' | 'lg' | 'xl';
  // El botón se "atrae" hacia el cursor cuando pasa cerca — pedido explícito
  // de la usuaria para el tramo "asentado" del Hero.
  magnetic?: boolean;
}

const MAGNET_RADIUS_PX = 75;
const MAGNET_STRENGTH = 0.4;

const sizeClasses: Record<NonNullable<SocialIconButtonProps['size']>, string> = {
  md: 'w-11 h-11',
  lg: 'w-14 h-14 sm:w-16 sm:h-16',
  xl: 'w-16 h-16 sm:w-20 sm:h-20',
};

// Rosa neón (mismo tono que la lluvia/terminal del screensaver, #E01985) en
// vez del tratamiento blanco anterior — pedido explícito de la usuaria para
// unificar el Hero con esa identidad de color. Mismo tratamiento para las
// tres variantes (el prop queda por compatibilidad de la API). Borde grueso
// y a plena opacidad (antes /50, muy débil contra el video) + un fondo con
// tinte rosado (antes negro puro) para que se lea como "vidrio rosa", no
// como un agujero oscuro con un borde apenas visible.
const variantClasses: Record<NonNullable<SocialIconButtonProps['variant']>, string> = {
  cyan: 'border-2 border-cyber-magenta bg-[#060D17]/80 text-cyber-magenta hover:bg-cyber-magenta hover:text-cyber-dark',
  magenta: 'border-2 border-cyber-magenta bg-[#060D17]/80 text-cyber-magenta hover:bg-cyber-magenta hover:text-cyber-dark',
  crimson: 'border-2 border-cyber-magenta bg-[#060D17]/80 text-cyber-magenta hover:bg-cyber-magenta hover:text-cyber-dark',
};

// Botón circular de solo ícono, inspirado en los links sociales minimalistas
// de trevornoah.com (sin texto, sin chip pesado) — para accesos externos
// donde el ícono ya es reconocible por sí mismo (LinkedIn, GitHub, WhatsApp).
export const SocialIconButton: React.FC<SocialIconButtonProps> = ({
  href,
  label,
  icon,
  variant = 'cyan',
  size = 'md',
  magnetic = false,
}) => {
  const anchorRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    const el = anchorRef.current;
    if (!el) return;

    if (!magnetic) {
      el.style.transform = 'translate3d(0, 0, 0)';
      return;
    }

    let rafId = 0;
    let targetX = 0;
    let targetY = 0;
    let currentX = 0;
    let currentY = 0;
    // desplazamiento realmente aplicado al elemento (lo que incluye su rect)
    let appliedX = 0;
    let appliedY = 0;
    const setT = (x: number, y: number, css: string) => {
      appliedX = x;
      appliedY = y;
      el.style.transform = css;
    };

    // Centro "en reposo" en caché (antes: un getBoundingClientRect por cada
    // mousemove). Se vuelve a medir tras scroll/resize, o si la medida tiene
    // más de medio segundo (el botón puede moverse con animaciones del Hero).
    let restCx = 0;
    let restCy = 0;
    let rectAt = -Infinity;
    const invalidate = () => {
      rectAt = -Infinity;
    };
    const measure = () => {
      const rect = el.getBoundingClientRect();
      // el rect incluye el desplazamiento aplicado: se descuenta
      restCx = rect.left + rect.width / 2 - appliedX;
      restCy = rect.top + rect.height / 2 - appliedY;
      rectAt = performance.now();
    };

    const handleMove = (e: MouseEvent) => {
      if (performance.now() - rectAt > 500) measure();
      // mismo centro que medía antes el rect del elemento ya desplazado
      const cx = restCx + appliedX;
      const cy = restCy + appliedY;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < MAGNET_RADIUS_PX) {
        const pull = (1 - dist / MAGNET_RADIUS_PX) * MAGNET_STRENGTH;
        const rawX = dx * pull;
        const rawY = dy * pull;
        // Limitamos el desplazamiento para que nunca choque con SectionDots a la derecha (máx 8px a la derecha)
        targetX = Math.max(-14, Math.min(rawX > 0 ? 8 : 14, rawX));
        targetY = Math.max(-14, Math.min(14, rawY));
      } else {
        targetX = 0;
        targetY = 0;
      }
      // solo hay rAF mientras haya algo que mover (antes: un bucle permanente por botón)
      if (!rafId && (targetX !== currentX || targetY !== currentY)) rafId = requestAnimationFrame(updateLoop);
    };

    const updateLoop = () => {
      rafId = 0;
      // Lerp suave para física magnética orgánica sin tirones
      currentX += (targetX - currentX) * 0.25;
      currentY += (targetY - currentY) * 0.25;
      if (Math.abs(targetX - currentX) > 0.05 || Math.abs(targetY - currentY) > 0.05) {
        setT(+currentX.toFixed(2), +currentY.toFixed(2), `translate3d(${currentX.toFixed(2)}px, ${currentY.toFixed(2)}px, 0)`);
        rafId = requestAnimationFrame(updateLoop);
      } else if (targetX === 0 && targetY === 0 && (currentX !== 0 || currentY !== 0)) {
        currentX = 0;
        currentY = 0;
        setT(0, 0, 'translate3d(0, 0, 0)');
      }
      // (si quedó a < 0.05 px de un objetivo distinto de 0, igual que antes no
      // se escribe nada más: el bucle se detiene hasta el próximo mousemove)
    };

    window.addEventListener('mousemove', handleMove, { passive: true });
    window.addEventListener('scroll', invalidate, { passive: true, capture: true });
    window.addEventListener('resize', invalidate, { passive: true });

    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('scroll', invalidate, { capture: true });
      window.removeEventListener('resize', invalidate);
      cancelAnimationFrame(rafId);
      if (el) el.style.transform = 'translate3d(0, 0, 0)';
    };
  }, [magnetic]);

  return (
    <a
      ref={anchorRef}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      title={label}
      className={`inline-flex items-center justify-center rounded-full backdrop-blur-md pointer-events-auto ${sizeClasses[size]} ${variantClasses[variant]}`}
      style={{
        transition: 'background-color 0.3s ease, color 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease',
        boxShadow: '0 0 14px rgba(224,25,133,0.4)',
        willChange: 'transform',
      }}
    >
      {icon}
    </a>
  );
};
