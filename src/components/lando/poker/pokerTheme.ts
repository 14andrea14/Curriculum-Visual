// Tokens y recursos de la sección PROYECTOS como mano de póker.
// Las imágenes viven en public/poker/ (generadas con Nano Banana y procesadas a
// webp): para cambiarlas basta con reemplazar el archivo con el mismo nombre.

export const POKER_ASSETS = {
  felt: '/poker/felt.webp', // mesa vista desde arriba: paño verde-negro, pozo de luz, baranda de cuero
  cardBack: '/poker/card-back.webp', // dorso 5:7: mandala de circuito magenta + monograma "AA"
  chips: '/poker/chips.webp', // fichas de póker decorativas
};

export const POKER = {
  night: '#0A1A2B', // azul noche del sitio (de donde venimos)
  paper: '#ECE8F2', // cartulina de la cara de las cartas
  ink: '#0A1A2B', // tinta de la cara
  magenta: '#F230D2', // único acento: palo, cliente, ribetes
  felt: '#06140F', // color base del paño (se ve si la foto aún no cargó)
};

// Escalera real de diamantes: 5 proyectos destacados = 5 cartas. El As queda
// para el proyecto premiado (el último del CV), por eso el orden 10 → A.
export const RANKS = ['10', 'J', 'Q', 'K', 'A'];
export const SUIT = '♦';

// Grano fino (SVG procedural) que se pone encima del paño: disimula la baja
// resolución de la foto y le da textura de fieltro.
export const GRAIN = `url("data:image/svg+xml;utf8,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.4 0.95'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>",
)}")`;

const svgUrl = (svg: string) => `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;

// Pelo del fieltro: ruido estirado en una dirección (fibras cortas y claras).
export const FIBERS = svgUrl(
  "<svg xmlns='http://www.w3.org/2000/svg' width='320' height='320'><filter id='f'><feTurbulence type='fractalNoise' baseFrequency='0.7 0.45' numOctaves='2' seed='4' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.86  0 0 0 0 0.9  0 0 0 0 0.84  1.8 0 0 0 -1.05'/></filter><rect width='100%' height='100%' filter='url(#f)'/></svg>",
);
// Desgaste: zonas apenas más gastadas/brillantes (degradés suaves, sin mosaico).
export const WEAR =
  'radial-gradient(ellipse 18% 14% at 34% 58%, rgba(190,205,180,.05), transparent 70%), radial-gradient(ellipse 22% 16% at 66% 64%, rgba(190,205,180,.045), transparent 70%), radial-gradient(ellipse 14% 10% at 52% 78%, rgba(0,0,0,.12), transparent 70%)';
// Trama de tejido: cruce de hilos de 3 px, muy sutil.
export const WEAVE =
  'repeating-linear-gradient(45deg, rgba(255,255,255,.022) 0 1px, transparent 1px 3px), repeating-linear-gradient(-45deg, rgba(0,0,0,.06) 0 1px, transparent 1px 3px)';

// Aleatorio con semilla: las cartas que "llueven" caen siempre igual (el scroll
// es reversible y ScrollTrigger recalcula: no puede cambiar entre refrescos).
export function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
