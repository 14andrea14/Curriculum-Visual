import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import gsap from 'gsap';
import { ArrowUpRight, X } from 'lucide-react';
import type { ProjectItem } from '../../../data/portfolioData';
import { lockScroll, unlockScroll } from '../../../hooks/useSmoothScroll';
import { CardFace } from './PlayingCard';
import { POKER, SUIT } from './pokerTheme';

// "Ver la jugada": al hacer clic en una carta se abre la carta ampliada con la
// descripción completa, todo el stack y el enlace a la demo. Se monta en <body>
// (portal): la sección está fijada por ScrollTrigger y un position:fixed adentro
// quedaría atrapado. Esc o clic afuera cierran; el scroll queda detenido mientras.
export const CardDetail: React.FC<{ p: ProjectItem; rank: string; onClose: () => void }> = ({ p, rank, onClose }) => {
  const root = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    lockScroll();
    const prev = document.activeElement as HTMLElement | null;
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ctx = gsap.context(() => {
      if (reduce) return;
      gsap.from(root.current, { autoAlpha: 0, duration: 0.3, ease: 'power2.out' });
      gsap.from(card.current, { y: 60, rotationY: -35, rotation: -6, scale: 0.9, duration: 0.7, ease: 'expo.out', transformPerspective: 1200 });
      gsap.from('.pk-detail-txt > *', { y: 24, autoAlpha: 0, duration: 0.5, stagger: 0.05, delay: 0.12, ease: 'power3.out' });
    }, root);
    return () => {
      window.removeEventListener('keydown', onKey);
      ctx.revert();
      unlockScroll();
      prev?.focus?.();
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={root}
      role="dialog"
      aria-modal="true"
      aria-label={`${p.title} — ${p.client}`}
      className="fixed inset-0 z-[300] overflow-y-auto overflow-x-hidden p-4 sm:p-10"
      style={{
        background: 'rgba(3, 8, 6, 0.96)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
      }}
      onClick={onClose}
      data-lenis-prevent
    >
      <div className="min-h-full flex flex-col justify-center items-center py-6 sm:py-8">
        <div
          className="relative w-full max-w-5xl grid md:grid-cols-[minmax(0,340px)_1fr] gap-6 md:gap-14 items-center"
          onClick={(e) => e.stopPropagation()}
        >
          <div ref={card} className="relative mx-auto w-[min(54vw,220px)] md:w-[min(72vw,340px)] aspect-[5/7]">
            <CardFace p={p} rank={rank} className="" sweep={false} />
          </div>
          <div className="pk-detail-txt text-white">
            <p className="font-mono text-xs tracking-[0.28em] uppercase" style={{ color: POKER.magenta }}>
              {rank} {SUIT} · {p.category} · {p.year}
            </p>
            <h3 className="mt-3 sm:mt-4 font-poster uppercase text-[1.85rem] sm:text-[3.2rem] leading-[0.95]">{p.title}</h3>
            <p className="mt-2 font-serifItalic italic font-semibold text-xl sm:text-2xl" style={{ color: POKER.magenta }}>
              {p.client}
            </p>
            {p.award && (
              <p className="mt-3 sm:mt-4 inline-block font-mono text-[11px] tracking-[0.16em] uppercase px-3 py-1.5 border" style={{ borderColor: POKER.magenta, color: POKER.paper }}>
                ★ {p.award}
              </p>
            )}
            <p className="mt-4 sm:mt-5 text-white/80 leading-relaxed text-sm sm:text-base max-w-xl" style={{ fontFamily: '"Mona Sans", sans-serif' }}>
              {p.description}
            </p>
            <div className="mt-5 sm:mt-6 flex flex-wrap gap-2">
              {p.tags.map((t) => (
                <span key={t} className="inline-flex items-center gap-2 font-mono text-[10px] sm:text-[11px] tracking-wide px-3 py-1.5 rounded-full border border-white/20 text-white/80">
                  <span className="w-2 h-2 rounded-full" style={{ border: `2px dashed ${POKER.magenta}` }} />
                  {t}
                </span>
              ))}
            </div>
            {p.demoUrl && (
              <a
                href={p.demoUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-6 sm:mt-7 inline-flex items-center gap-1.5 font-poster tracking-wide text-base sm:text-lg hover:text-white transition-colors"
                style={{ color: POKER.magenta }}
              >
                VER DEMO <ArrowUpRight className="w-5 h-5" />
              </a>
            )}
          </div>
          <button
            ref={closeBtn}
            onClick={onClose}
            aria-label="Cerrar"
            className="fixed top-4 right-4 md:absolute md:-top-3 md:-right-5 w-11 h-11 flex items-center justify-center rounded-full bg-black/60 md:bg-transparent border border-white/20 md:border-transparent text-[#ECE8F2] hover:text-[#F230D2] transition-colors z-50 focus:outline-none"
          >
            <X className="w-6 h-6 md:w-7 md:h-7" strokeWidth={1.5} />
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};
