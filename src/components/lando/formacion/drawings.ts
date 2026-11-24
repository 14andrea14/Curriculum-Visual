// Dibujos a mano (recortes con fondo transparente) que se clavan en el hueco
// libre de la izquierda del tablero, como toque personal. Solo escritorio.
// `w`/`h` = tamaño natural del archivo (para el alto reservado antes de cargar).
export type DrawingDef = {
  id: string;
  /** etiqueta corta para aria-label del botón */
  label: string;
  src: string;
  alt: string;
  w: number;
  h: number;
  /** inclinación final (grados) */
  tilt: number;
  /** ancho en `em` (la misma unidad de las notas: escala con la pantalla) */
  widthEm: number;
  /** color de la chincheta */
  pin: 'magenta' | 'pale';
  /** segundos de ciclo del vaivén y desfase (s, negativo = ya empezado) */
  sway: { dur: number; delay: number };
};

export const DRAWINGS: DrawingDef[] = [
  {
    id: 'gato',
    label: 'Dibujo de un gato',
    src: '/office/postits/gato.webp',
    alt: 'Dibujo de un gato en un post-it',
    w: 614,
    h: 614,
    tilt: -6,
    widthEm: 15,
    pin: 'magenta',
    sway: { dur: 7.2, delay: -2.4 },
  },
  {
    id: 'pikachu',
    label: 'Dibujo de un personaje frente a una laptop',
    src: '/office/postits/pikachu.webp',
    alt: 'Dibujo de un personaje frente a una laptop en un post-it',
    w: 505,
    h: 470,
    tilt: 5,
    widthEm: 14.5,
    pin: 'pale',
    sway: { dur: 8.6, delay: -6.1 },
  },
];
