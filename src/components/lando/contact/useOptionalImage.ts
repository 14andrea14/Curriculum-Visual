// Imágenes OPCIONALES de /public (fondos generados con Nano Banana, ver
// docs/prompts-nano/). Se detectan en tiempo de compilación con import.meta.glob
// (solo las claves: no se importa nada), así no hay peticiones fallidas (404)
// en la consola cuando todavía no existen; si no están, se usa la versión
// procedural (SVG / CSS) que ya está dibujada.
const FOUND = new Set(
  Object.keys(import.meta.glob(['/public/contact/*.webp', '/public/footer/*.webp', '/public/experience/*.webp', '/public/space/*.webp'])).map((k) => k.replace(/^\/public/, ''))
);

export function optionalImage(src: string): string | null {
  return FOUND.has(src) ? src : null;
}
