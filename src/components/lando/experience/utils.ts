import { useEffect, useState } from 'react';
import type { ExperienceItem } from '../../../data/portfolioData';

// ============================================================================
// EXPERIENCIA LABORAL · ambientación "consola portátil" (inspirada en la
// estética de los juegos de Nintendo que le gustan a Alejandra, pero 100 %
// ORIGINAL: sin personajes, logos, sprites ni música de terceros).
// Paleta: el magenta del sitio como color de "plástico" principal + rosas
// pastel, lila y celeste para el cielo, y el azul noche del sitio al final.
// ============================================================================
export const GAME = {
  magenta: '#F230D2', // color principal del juego (consola, ribetes, acentos)
  magentaDeep: '#B0178F', // sombras del plástico / botones
  pink: '#FF8EDB',
  blush: '#FFC8EE',
  cream: '#FFF8FD', // "papel" de las tarjetas de nivel
  plum: '#2A0F35', // tinta (texto y contornos gruesos)
  plumSoft: '#5B2A6B',
  lilac: '#CDBBFF',
  sky: '#C4E0FF',
  star: '#FFD84D', // estrellas doradas (logros)
  felt: '#06140F', // paño de la sección anterior (póker)
  worldTop: '#FFD6F2', // primer color del mundo (= color del barrido de píxeles)
  night: '#0A1A2B', // azul noche del sitio (borde inferior, entrega al espacio)
} as const;

// Tipografías ya cargadas en index.html
export const FONT = {
  pixel: '"Press Start 2P", "VT323", monospace', // rótulos tipo HUD (siempre pequeños)
  puffy: '"Bagel Fat One", "Fredoka", sans-serif', // titulares "inflados"
  round: '"Fredoka", "Outfit", sans-serif', // puestos y chips (redondeada y legible)
  body: '"Outfit", "Inter", sans-serif',
} as const;

export interface ParsedPeriod {
  start: number;
  end: number | null; // null = "Presente"
  label: string; // "2026 — Presente"
}

// "Ene 2026 - Jul 2026" -> { start: 2026, end: 2026, label: "Ene 2026 — Jul 2026" }
export function parsePeriod(period: string): ParsedPeriod {
  const years = (period.match(/\d{4}/g) || []).map(Number);
  const present = /presente/i.test(period);
  const start = years[0] ?? new Date().getFullYear();
  return {
    start,
    end: present ? null : years[1] ?? start,
    label: period.replace(/\s*-\s*/g, ' — '),
  };
}

// "Chatbot corporativo con IA: liderazgo técnico..." -> ["Chatbot corporativo con IA", "liderazgo técnico..."]
export function splitHighlight(h: string): [string | null, string] {
  const i = h.indexOf(':');
  if (i > 0 && i < 48) return [h.slice(0, i), h.slice(i + 1).trim()];
  return [null, h];
}

export type Exp = ExperienceItem;

// Aleatorio con semilla (las estrellas/nubes quedan siempre en el mismo lugar)
export function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// prefers-reduced-motion en vivo (si la usuaria lo cambia, la sección se adapta)
export function useReducedMotion() {
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduced(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return reduced;
}
