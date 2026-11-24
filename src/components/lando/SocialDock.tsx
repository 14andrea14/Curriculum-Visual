import React from 'react';
import { PORTFOLIO_DATA } from '../../data/portfolioData';
import { useSceneScroll } from '../../hooks/useSceneScroll';

// Redes fijas ARRIBA a la derecha, en el lugar del antiguo CONTACTO + menú (WhatsApp, LinkedIn,
// GitHub del CV). Pedido explícito:
// minimalistas, en rosa neón y SIEMPRE visibles (no desaparecen con el scroll).
const ICONS: { key: 'whatsapp' | 'linkedin' | 'github'; label: string; d: string }[] = [
  {
    key: 'whatsapp',
    label: 'WhatsApp',
    d: 'M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z',
  },
  {
    key: 'linkedin',
    label: 'LinkedIn',
    d: 'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452z',
  },
  {
    key: 'github',
    label: 'GitHub',
    d: 'M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12',
  },
];

export const SOCIAL_PATHS = Object.fromEntries(ICONS.map((i) => [i.key, i.d])) as Record<'whatsapp' | 'linkedin' | 'github', string>;

export const SocialDock: React.FC = () => {
  const { profile } = PORTFOLIO_DATA;
  // Mientras la ficha de formación está abierta, los botones "son" la ficha (ver
  // HeroSection, evento 'dock-morph'): el dock se oculta y lo reemplazan las copias en vuelo.
  const [morphed, setMorphed] = React.useState(false);
  // no es fijo: después de la portada se va hacia arriba con el manifiesto
  const sceneRef = React.useRef<HTMLDivElement>(null);
  useSceneScroll(sceneRef);
  // En la portada van ABAJO a la derecha (como siempre); cuando aparece la barra con el
  // nombre (después de la portada) suben ARRIBA a la derecha. Cambio con fundido corto.
  const [top, setTop] = React.useState(false);
  const [fade, setFade] = React.useState(false);
  // Oculto: "convertido" (ficha / disolución / gato, ver HeroSection) y todavía abajo.
  // Una vez arriba (barra visible) se muestra siempre: así nombre y redes aparecen
  // JUNTOS al final de la escena del gato y se quedan al pasar a la sección siguiente.
  const hidden = morphed && !top;
  const morphedRef = React.useRef(morphed);
  morphedRef.current = morphed;
  React.useEffect(() => {
    let t = 0;
    const on = (e: Event) => {
      const v = Boolean((e as CustomEvent).detail);
      window.clearTimeout(t);
      if (morphedRef.current) {
        // ya está invisible: se cambia de lugar al instante (un solo fundido de entrada)
        setFade(false);
        setTop(v);
        return;
      }
      setFade(true);
      window.clearTimeout(t);
      t = window.setTimeout(() => {
        setTop(v);
        setFade(false);
      }, 220);
    };
    window.addEventListener('nav-visible', on);
    return () => {
      window.removeEventListener('nav-visible', on);
      window.clearTimeout(t);
    };
  }, []);
  React.useEffect(() => {
    const on = (e: Event) => setMorphed(Boolean((e as CustomEvent).detail));
    window.addEventListener('dock-morph', on);
    return () => window.removeEventListener('dock-morph', on);
  }, []);

  // Efecto magnético: si el cursor entra en un radio de ~130 px, cada botón se desliza
  // hacia él (máx. 11 px) y el ícono un poco más (1.4x) con una leve inclinación, dando
  // profundidad. Al alejarse vuelve con un resorte amortiguado. Todo va por rAF + refs
  // (transform directo en el DOM, sin re-render de React). Se desactiva con reduced-motion.
  const wrapRefs = React.useRef<(HTMLSpanElement | null)[]>([]);
  const iconRefs = React.useRef<(SVGSVGElement | null)[]>([]);
  const hiddenRef = React.useRef(hidden);
  hiddenRef.current = hidden;
  React.useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const RADIUS = 130;
    const MAX = 11;
    const DEPTH = 1.4;
    const STIFF = 0.12; // rigidez del resorte
    const DAMP = 0.78; // amortiguación (fricción por cuadro)
    const state = ICONS.map(() => ({ x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0 }));
    let mouseX = -1e4;
    let mouseY = -1e4;
    let raf = 0;

    const apply = (i: number) => {
      const s = state[i];
      const wrap = wrapRefs.current[i];
      const icon = iconRefs.current[i];
      if (wrap) wrap.style.transform = `translate3d(${s.x.toFixed(2)}px, ${s.y.toFixed(2)}px, 0)`;
      if (icon) {
        const k = DEPTH - 1;
        icon.style.transform = `translate3d(${(s.x * k).toFixed(2)}px, ${(s.y * k).toFixed(2)}px, 0) rotate(${(s.x * 0.9).toFixed(2)}deg)`;
      }
    };

    const reset = () => {
      state.forEach((s, i) => {
        Object.assign(s, { x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0 });
        apply(i);
      });
    };

    const tick = () => {
      raf = 0;
      let moving = false;
      state.forEach((s, i) => {
        const wrap = wrapRefs.current[i];
        if (!wrap) return;
        // Centro "en reposo": el rect actual menos el desplazamiento ya aplicado.
        const r = wrap.getBoundingClientRect();
        const cx = r.left + r.width / 2 - s.x;
        const cy = r.top + r.height / 2 - s.y;
        const dx = mouseX - cx;
        const dy = mouseY - cy;
        const dist = Math.hypot(dx, dy);
        if (!hiddenRef.current && dist < RADIUS && dist > 0) {
          const pull = (1 - dist / RADIUS) * MAX; // más cerca = más atracción
          s.tx = (dx / dist) * pull;
          s.ty = (dy / dist) * pull;
        } else {
          s.tx = 0;
          s.ty = 0;
        }
        s.vx = (s.vx + (s.tx - s.x) * STIFF) * DAMP;
        s.vy = (s.vy + (s.ty - s.y) * STIFF) * DAMP;
        s.x += s.vx;
        s.y += s.vy;
        if (Math.abs(s.vx) > 0.01 || Math.abs(s.vy) > 0.01 || Math.abs(s.tx - s.x) > 0.01 || Math.abs(s.ty - s.y) > 0.01) {
          moving = true;
        } else {
          s.x = s.tx;
          s.y = s.ty;
        }
        apply(i);
      });
      if (moving) raf = requestAnimationFrame(tick);
    };

    const onMove = (e: MouseEvent) => {
      if (mq.matches) return;
      mouseX = e.clientX;
      mouseY = e.clientY;
      if (!raf) raf = requestAnimationFrame(tick);
    };
    const onMq = () => {
      if (mq.matches) {
        cancelAnimationFrame(raf);
        raf = 0;
        reset();
      }
    };

    window.addEventListener('mousemove', onMove, { passive: true });
    mq.addEventListener?.('change', onMq);
    return () => {
      window.removeEventListener('mousemove', onMove);
      mq.removeEventListener?.('change', onMq);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div ref={sceneRef} className="fixed inset-0 z-[65] pointer-events-none" style={{ willChange: 'transform' }}>
    <div
      /* En móvil (max-sm), los botones van SIEMPRE abajo para no competir con el nombre arriba (pedido explícito).
         En escritorio (>=sm), en portada están abajo a la derecha y al salir suben junto al nombre. */
      className={`absolute flex items-center gap-2 sm:gap-3 ${
        top
          ? 'max-sm:bottom-[calc(1.25rem+env(safe-area-inset-bottom,0px))] max-sm:right-4 max-sm:top-auto top-5 sm:top-6 right-3 sm:right-8'
          : 'bottom-[calc(1.25rem+env(safe-area-inset-bottom,0px))] sm:bottom-8 right-3 sm:right-8'
      }`}
      style={{ opacity: hidden || fade ? 0 : 1, pointerEvents: hidden ? 'none' : 'auto', transition: 'opacity 220ms ease' }}
    >
      {ICONS.map((s, i) => (
        // El envoltorio recibe el desplazamiento magnético; así el transition-all del
        // botón (hover) no interfiere con el movimiento por cuadro.
        <span
          key={s.key}
          ref={(el) => {
            wrapRefs.current[i] = el;
          }}
          className="inline-flex will-change-transform"
        >
          <a
            href={profile[s.key]}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={s.label}
            className="w-10 h-10 sm:w-11 sm:h-11 rounded-full border border-[#F230D2]/70 bg-[#F230D2]/[0.06] text-[#F230D2] flex items-center justify-center shadow-[0_0_10px_rgba(242,48,210,0.25)] transition-all duration-300 ease-out hover:bg-[#F230D2] hover:text-white hover:border-[#F230D2] hover:shadow-[0_0_20px_rgba(242,48,210,0.6)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F230D2]/60"
          >
            <svg
              ref={(el) => {
                iconRefs.current[i] = el;
              }}
              viewBox="0 0 24 24"
              className="w-[18px] h-[18px]"
              fill="currentColor"
              aria-hidden
            >
              <path d={s.d} />
            </svg>
          </a>
        </span>
      ))}
    </div>
    </div>
  );
};
