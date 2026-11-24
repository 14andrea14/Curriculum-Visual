import React, { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { Check, Mail } from 'lucide-react';
import { SOCIAL_PATHS } from '../SocialDock';

// Los cuatro canales de contacto (correo, LinkedIn, GitHub, WhatsApp) sobre el pasto
// de la escena final: enlaces en burbujas de jabón que estallan al activarse.
// - Toda la información (canal + correo / usuario / teléfono) va en aria-label.
// - Imán: el botón sigue un poco al cursor y vuelve con resorte (solo puntero fino
//   y sin "reducir movimiento").
// - El correo, al hacer clic, abre el cliente de correo Y copia la dirección; una
//   pastilla de vidrio confirma la copia.

type Key = 'email' | 'linkedin' | 'github' | 'whatsapp';
type Item = { key: Key; label: string; detail: string; href: string };

const BrandIcon: React.FC<{ k: Key }> = ({ k }) =>
  k === 'email' ? (
    <Mail className="w-7 h-7 sm:w-8 sm:h-8" strokeWidth={1.9} />
  ) : (
    <svg viewBox="0 0 24 24" className="w-6 h-6 sm:w-7 sm:h-7" fill="currentColor" aria-hidden>
      <path d={SOCIAL_PATHS[k]} />
    </svg>
  );

// Copia al portapapeles (con respaldo para navegadores sin la API o sin permiso).
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      return document.execCommand('copy');
    } catch {
      return false;
    } finally {
      ta.remove();
    }
  }
}

const ContactButton: React.FC<{ item: Item; primary?: boolean }> = ({ item, primary }) => {
  const zoneRef = useRef<HTMLLIElement>(null);
  const magRef = useRef<HTMLDivElement>(null);
  const icoRef = useRef<HTMLSpanElement>(null);
  const [copied, setCopied] = useState(false);
  const [popping, setPopping] = useState(false);

  // Imán: el botón se desplaza hacia el cursor y el ícono un poco más (paralaje).
  useEffect(() => {
    const zone = zoneRef.current;
    const mag = magRef.current;
    const ico = icoRef.current;
    if (!zone || !mag || !ico) return;
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!fine || reduce) return;
    const mx = gsap.quickTo(mag, 'x', { duration: 0.45, ease: 'power3.out' });
    const my = gsap.quickTo(mag, 'y', { duration: 0.45, ease: 'power3.out' });
    const ix = gsap.quickTo(ico, 'x', { duration: 0.45, ease: 'power3.out' });
    const iy = gsap.quickTo(ico, 'y', { duration: 0.45, ease: 'power3.out' });
    const move = (e: PointerEvent) => {
      const r = zone.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      mx(dx * 0.35);
      my(dy * 0.35);
      ix(dx * 0.15);
      iy(dy * 0.15);
    };
    const leave = () => {
      gsap.to([mag, ico], { x: 0, y: 0, duration: 1, ease: 'elastic.out(1, 0.35)', overwrite: true });
    };
    zone.addEventListener('pointermove', move);
    zone.addEventListener('pointerleave', leave);
    return () => {
      zone.removeEventListener('pointermove', move);
      zone.removeEventListener('pointerleave', leave);
    };
  }, []);

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 2600);
    return () => window.clearTimeout(t);
  }, [copied]);

  useEffect(() => {
    if (!popping) return;
    const t = window.setTimeout(() => setPopping(false), 840);
    return () => window.clearTimeout(t);
  }, [popping]);

  const external = item.href.startsWith('http');
  const activate = () => {
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) setPopping(true);
    if (primary) void copyText(item.detail).then(setCopied);
  };

  return (
    // zona del imán: un poco más grande que el botón; la entrada (escala) se anima aquí
    <li ref={zoneRef} className="ft-btn-item relative p-2 -m-2">
      <div
        ref={magRef}
        className={`ft-btn relative ${primary ? 'ft-btn--first' : ''}`}
        data-copied={copied || undefined}
        data-popping={popping || undefined}
      >
        <a
          href={item.href}
          target={external ? '_blank' : undefined}
          rel={external ? 'noreferrer' : undefined}
          aria-label={primary ? `${item.label}: ${item.detail} (abre tu correo y copia la dirección)` : `${item.label}: ${item.detail}`}
          title={item.label}
          onClick={activate}
          onAuxClick={(event) => {
            if (event.button === 1 && external) activate();
          }}
          className="ft-btn-a"
        >
          <span aria-hidden className="ft-bubble" />
          <span aria-hidden className="ft-bubble-spray" />
          <span ref={icoRef} className="ft-btn-ico">
            {primary && copied ? <Check className="w-7 h-7 sm:w-8 sm:h-8" strokeWidth={2.4} /> : <BrandIcon k={item.key} />}
          </span>
        </a>
        {/* Aviso de copiado (encima del botón) */}
        {primary && (
          <span
            role="status"
            aria-live="polite"
            className="ft-toast pointer-events-none absolute z-10 whitespace-nowrap rounded-full px-4 py-2 font-mono text-[11px] tracking-[0.06em]"
          >
            {copied ? <>¡Correo copiado! · {item.detail}</> : ''}
          </span>
        )}
      </div>
    </li>
  );
};

export const ContactButtons: React.FC<{
  email: string;
  linkedin: string;
  github: string;
  whatsapp: string;
  phone: string;
  className?: string;
}> = ({ email, linkedin, github, whatsapp, phone, className = '' }) => {
  const ghUser = github.replace(/\/+$/, '').split('/').pop();
  const items: Item[] = [
    { key: 'email', label: 'Email', detail: email, href: `mailto:${email}` },
    { key: 'linkedin', label: 'LinkedIn', detail: 'alejandra-arismendi-alvarado', href: linkedin },
    { key: 'github', label: 'GitHub', detail: `@${ghUser}`, href: github },
    { key: 'whatsapp', label: 'WhatsApp', detail: phone, href: whatsapp },
  ];
  return (
    <ul className={`ft-btns ${className}`} aria-label="Canales de contacto">
      {items.map((it, i) => (
        <ContactButton key={it.key} item={it} primary={i === 0} />
      ))}
    </ul>
  );
};
