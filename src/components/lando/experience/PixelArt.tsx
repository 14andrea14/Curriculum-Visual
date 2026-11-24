import { isLite } from '../../../lib/deviceProfile';
import React, { useMemo } from 'react';
import { GAME, seeded } from './utils';

// Pequeñas piezas de "pixel art" ORIGINALES (dibujadas con rectángulos SVG):
// estrella de 5 puntas, destello de 4 puntas y nubes infladas. Nada copiado de
// juegos existentes: son formas genéricas de mapa de bits.

type Grid = string[];

// '#' = relleno, 'w' = brillo
const STAR: Grid = [
  '....#....',
  '...###...',
  '...#w#...',
  '#########',
  '.#######.',
  '..#####..',
  '..#####..',
  '.###.###.',
  '.##...##.',
];

const SPARK: Grid = ['...#...', '...#...', '..###..', '###w###', '..###..', '...#...', '...#...'];

function cells(g: Grid) {
  const out: { x: number; y: number; c: string }[] = [];
  g.forEach((row, y) => row.split('').forEach((c, x) => c !== '.' && out.push({ x, y, c })));
  return out;
}
// En móvil, los trazados agrupan los píxeles y conservan el orden del brillo.
function sprite(grid: Grid) {
  const pixels = cells(grid);
  const pixel = (x: number, y: number) => `M${x} ${y}h1.02v1.02h-1.02Z`;
  const face: { shine: boolean; d: string }[] = [];
  for (const { x, y, c } of pixels) {
    const shine = c === 'w';
    const last = face[face.length - 1];
    if (last?.shine === shine) last.d += pixel(x, y);
    else face.push({ shine, d: pixel(x, y) });
  }
  return { cells: pixels, size: grid.length, face, shade: pixels.map(({ x, y }) => pixel(x + 1, y + 1)).join('') };
}
const SPRITES = { star: sprite(STAR), spark: sprite(SPARK) };

// Sprite de píxeles con sombra dura (1 píxel abajo-derecha)
const Sprite: React.FC<{
  kind: keyof typeof SPRITES;
  color: string;
  shade?: string | null;
  className?: string;
  style?: React.CSSProperties;
}> = ({ kind, color, shade = GAME.plum, className, style }) => (
  <svg
    aria-hidden
    viewBox={`0 0 ${SPRITES[kind].size + 1} ${SPRITES[kind].size + 1}`}
    className={className}
    style={{ shapeRendering: 'crispEdges', overflow: 'visible', ...style }}
  >
    {shade && (isLite()
      ? <path d={SPRITES[kind].shade} fill={shade} />
      : SPRITES[kind].cells.map(({ x, y }, i) => <rect key={'s' + i} x={x + 1} y={y + 1} width={1.02} height={1.02} fill={shade} />))}
    {isLite()
      ? SPRITES[kind].face.map(({ d, shine }, i) => <path key={i} d={d} fill={shine ? '#FFFFFF' : color} />)
      : SPRITES[kind].cells.map(({ x, y, c }, i) => <rect key={i} x={x} y={y} width={1.02} height={1.02} fill={c === 'w' ? '#FFFFFF' : color} />)}
  </svg>
);

export const PixelStar: React.FC<{ color?: string; shade?: string | null; className?: string; style?: React.CSSProperties }> = ({
  color = GAME.star,
  ...rest
}) => <Sprite kind="star" color={color} {...rest} />;

export const PixelSpark: React.FC<{ color?: string; shade?: string | null; className?: string; style?: React.CSSProperties }> = ({
  color = '#FFFFFF',
  shade = null,
  ...rest
}) => <Sprite kind="spark" color={color} shade={shade} {...rest} />;

// Nube inflada: cuerpo blanco + panza rosada (sombra) + brillo
export const PuffCloud: React.FC<{ className?: string; style?: React.CSSProperties; tint?: string }> = ({
  className,
  style,
  tint = '#FFD9F3',
}) => (
  <svg aria-hidden viewBox="0 0 220 110" className={className} style={style}>
    <g fill={tint}>
      <circle cx="52" cy="70" r="34" />
      <circle cx="100" cy="52" r="44" />
      <circle cx="152" cy="62" r="36" />
      <circle cx="188" cy="80" r="24" />
      <rect x="40" y="70" width="160" height="34" rx="17" />
    </g>
    <g fill="#FFFFFF">
      <circle cx="52" cy="64" r="30" />
      <circle cx="100" cy="46" r="40" />
      <circle cx="152" cy="56" r="32" />
      <circle cx="186" cy="74" r="20" />
      <rect x="44" y="62" width="150" height="32" rx="16" />
    </g>
    <ellipse cx="88" cy="30" rx="16" ry="8" fill="#FFFFFF" opacity="0.9" />
  </svg>
);

// Campo de destellos que titilan (CSS por pasos: aspecto de 8 bits).
// `count` y `seed` fijos: siempre quedan en el mismo lugar.
export const SparkleField: React.FC<{
  count?: number;
  seed?: number;
  colors?: string[];
  className?: string;
  minSize?: number;
  maxSize?: number;
}> = ({ count = 18, seed = 7, colors = ['#FFFFFF', GAME.star, GAME.pink], className = '', minSize = 10, maxSize = 22 }) => {
  const items = useMemo(() => {
    const r = seeded(seed);
    return Array.from({ length: count }, () => ({
      x: r() * 100,
      y: r() * 100,
      s: minSize + r() * (maxSize - minSize),
      c: colors[Math.floor(r() * colors.length)],
      d: r() * 2.4,
      star: r() > 0.72,
    }));
  }, [count, seed, colors, minSize, maxSize]);
  return (
    <div aria-hidden className={`absolute inset-0 pointer-events-none ${className}`}>
      {items.map((it, i) => (
        <span
          key={i}
          className="gx-twinkle absolute"
          style={{ left: `${it.x}%`, top: `${it.y}%`, width: it.s, height: it.s, animationDelay: `${-it.d}s` }}
        >
          {it.star ? (
            <PixelStar color={it.c} shade={null} style={{ width: '100%', height: '100%' }} />
          ) : (
            <PixelSpark color={it.c} style={{ width: '100%', height: '100%' }} />
          )}
        </span>
      ))}
    </div>
  );
};
