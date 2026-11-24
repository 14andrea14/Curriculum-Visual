import React from 'react';

// "ALEJANDRA ARISMENDI" con letra NORMAL pero llamativa (pedido explícito, después de
// descartar las versiones 3D): Bagel Fat One (gorda y redonda como las letras de globo
// de su referencia "PINK SUGAR", pero con los huecos de la A/R/D intactos) con
// acabado de caramelo en CSS: degradé rosa brillante con reflejo arriba, borde inferior
// más oscuro que da volumen y un halo magenta. Cada letra flota con su propio ritmo,
// algo girada; al pasar el cursor por el nombre las letras saltan en ola.
const TEXT = 'Alejandra Arismendi';

const CSS = `
@keyframes cn-float {
  0%, 100% { transform: translateY(0) rotate(var(--r)); }
  50% { transform: translateY(-2.5px) rotate(calc(var(--r) * -1)); }
}
@keyframes cn-in {
  0% { transform: translateY(70%) scale(0.4); opacity: 0; }
  60% { transform: translateY(-12%) scale(1.12); opacity: 1; }
  100% { transform: translateY(0) scale(1); opacity: 1; }
}
.cn-word { display: inline-flex; white-space: nowrap; }
.cn-l {
  display: inline-block;
  font-family: "Bagel Fat One", "Fredoka", system-ui, sans-serif;
  font-weight: 400;
  line-height: 1;
  padding: 0.08em 0.02em 0.2em;
  margin: -0.08em -0.02em -0.2em;
  color: transparent;
  background: linear-gradient(178deg, #ffe3f7 0%, #ff9ae3 22%, #ff5fd0 46%, #f230d2 70%, #b9189d 100%);
  -webkit-background-clip: text;
  background-clip: text;
  filter: drop-shadow(0 2px 0 #8a0f74) drop-shadow(0 0 10px rgba(242,48,210,0.45));
  animation: cn-float var(--d) ease-in-out var(--dl) infinite;
  transition: transform 260ms cubic-bezier(0.3, 1.6, 0.5, 1);
  will-change: transform;
}
.cn-in .cn-l { animation: cn-in 620ms cubic-bezier(0.3, 1.4, 0.5, 1) var(--ei) both, cn-float var(--d) ease-in-out var(--dl) infinite; }
.cn-wrap:not(.cn-in) .cn-l { animation: none; }
.cn-wrap:hover .cn-l { animation-play-state: paused; transform: translateY(-4px) rotate(calc(var(--r) * -2)) scale(1.08); transition-delay: var(--hd); }
@media (prefers-reduced-motion: reduce) { .cn-l, .cn-in .cn-l { animation: none; } }
`;

export const CandyName: React.FC<{ visible: boolean; className?: string; style?: React.CSSProperties }> = ({ visible, className = '', style }) => {
  // La entrada (rebote letra por letra) se reinicia sola cada vez que aparece la barra:
  // al alternar la clase cn-in cambia la lista de animaciones y el navegador las
  // relanza, sin remontar el nodo (antes: key={run}). Oculto, las letras no animan.
  // El <style> ya no está dentro de un nodo con key, así que no se reinyecta.
  let k = 0;
  return (
    <span className={`cn-wrap ${visible ? 'cn-in' : ''} inline-flex items-center gap-[0.32em] ${className}`} style={style}>
      <style>{CSS}</style>
      {TEXT.split(' ').map((w, wi) => (
        <span key={wi} className="cn-word">
          {w.split('').map((ch) => {
            const i = k++;
            const vars = {
              '--r': `${(((i * 37) % 7) - 3) * 1.4}deg`,
              '--d': `${2.6 + ((i * 53) % 5) * 0.25}s`,
              '--dl': `${-i * 0.23}s`,
              '--ei': `${i * 35}ms`,
              '--hd': `${i * 18}ms`,
            } as React.CSSProperties;
            return (
              <span key={i} className="cn-l" style={vars}>
                {ch}
              </span>
            );
          })}
        </span>
      ))}
    </span>
  );
};
