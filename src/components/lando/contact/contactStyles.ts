// Estilos de la escena final CONTACTO + PIE (una sola pradera): cielo + colinas,
// titular y nombre en VIDRIO esmerilado, iconos de contacto de vidrio sobre el pasto
// y el copyright. Todo el texto es de vidrio (ver GlassLine y FooterScene).

// Grano fino (ruido SVG en data URI, estático: se pinta una sola vez)
const GRAIN = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 .55 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>")`;

export const SCENE_CSS = `
/* Solapamiento con la sección anterior: es el tramo de scroll que NO se recorre
   (la escena es una capa fija que el líquido revela, no una tarjeta que sube): cuanto
   más solape, menos se arrastra el tablero de FORMACIÓN mientras sube el líquido.
   En escritorio el tablero es la pantalla entera y el solape se come casi la mitad.
   Con "reducir movimiento" no hay líquido: sin solape. */
.ft-root { --sh: max(100svh, 640px); margin-top: -4.5rem; overflow: hidden; }
@media (min-width: 640px) { .ft-root { margin-top: -14vh; } }
@media (min-width: 1024px) { .ft-root { --sh: max(100svh, 44vw); margin-top: -45vh; } }
@media (prefers-reduced-motion: reduce) { .ft-root { margin-top: 0 !important; } }
.ft-stage { position: relative; background: #23284f; }
/* Modo líquido (lo activa el JS): la sección solo reserva el alto del recorrido; la escena
   es una capa fija a pantalla completa, oculta hasta que el líquido la revele, y se recorta
   con clip-path: polygon (ver liquid.ts). NO se usa border-radius + overflow:hidden ni
   opacidad en ancestros de las capas de vidrio: rompen el recorte con forma de letra. */
.ft-root.ft-live { height: var(--sh); }
.ft-root.ft-live .ft-stage { position: fixed; left: 0; right: 0; bottom: 0; height: var(--sh); visibility: hidden; pointer-events: none; }
.ft-root.ft-live .ft-stage .ft-scene { pointer-events: auto; }
/* piel del líquido: encima de la escena, sin eventos */
.ft-liquid { display: none; }
.ft-root.ft-live .ft-liquid { display: block; position: fixed; left: 0; top: 0; width: 100%; height: 100%; pointer-events: none; visibility: hidden; }

/* ── Escena ──
   --hh = alto de la capa de la colina del frente (16:9 del ancho en escritorio;
   una franja de la pantalla en móvil). Su cresta está a ~53 % de su alto y el
   nombre se apoya a --nb (~42 %) de ese alto (un poco por debajo de la cresta). */
.ft-scene { --hh: 52svh; --nb: .45; position: relative; width: 100%; height: var(--sh, max(100svh, 640px)); color: #fff; }
@media (min-width: 1024px) { .ft-scene { --hh: 56.25vw; --nb: .42; height: var(--sh, max(100svh, 44vw)); } }
.ft-layer { position:absolute; left:0; right:0; pointer-events:none; will-change: transform; }
.ft-img { width:100%; height:100%; object-fit:cover; object-position: 50% 100%; display:block; }
.ft-grain { position:absolute; inset:0; pointer-events:none; opacity:.06; mix-blend-mode: overlay; background-image: ${GRAIN}; }

/* ── Letras de vidrio ──
   Un bloque con backdrop-filter (desenfoca y aclara el cielo de detrás) recortado con
   la forma de las letras (<clipPath> SVG con <text>); encima, las letras HTML solo
   dibujan el borde de luz, el brillo especular y un destello que barre. */
.ft-glass { position:absolute; left:0; pointer-events:none;
  background: linear-gradient(180deg, rgba(255,255,255,0.62) 0%, rgba(255,255,255,0.30) 40%, rgba(255,255,255,0.20) 70%, rgba(255,255,255,0.34) 100%);
  -webkit-backdrop-filter: blur(10px) saturate(1.6) brightness(1.18); backdrop-filter: blur(10px) saturate(1.6) brightness(1.18); }
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) { .ft-glass { background: rgba(255,255,255,0.45); } }

/* nombre: una letra por caja; --p (destello) y --o (posición de la letra) en em */
.ft-name { font-family: Anton, Impact, sans-serif; line-height: .9; letter-spacing: -0.005em; font-size: 1em; --p: -9em; }
.ft-letter { display:inline-block; color: transparent; -webkit-text-stroke: 1.5px rgba(255,255,255,0.95);
  background-image:
    linear-gradient(100deg, transparent calc(var(--p) - var(--o) - 0.7em), rgba(255,255,255,0.85) calc(var(--p) - var(--o) - 0.35em), transparent calc(var(--p) - var(--o))),
    linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.10) 28%, rgba(255,255,255,0) 50%, rgba(255,255,255,0.12) 100%);
  -webkit-background-clip: text; background-clip: text;
  text-shadow: none; will-change: transform; }

/* titular: dos líneas (Anton en mayúsculas + serif itálica del sitio), mismo vidrio.
   --sx = posición del destello (en % de la caja del texto) */
.ft-hl { --hl: min(15.5vw, 8svh); }
/* escritorio: dos líneas; el tamaño se calcula con el alto que queda en el cielo
   (alto de la pantalla − colina − nombre − margen para el menú) */
@media (min-width: 1024px) {
  .ft-hl { --hl: max(64px, min(9.8vw, calc((100svh - var(--hh) * var(--nb) - min(1500px, 100vw - 80px) * 0.108 - 130px) / 2.1))); margin-bottom: clamp(40px, 6svh, 72px); }
}
/* pantallas muy apaisadas (p. ej. 1920×940): el cielo es bajo, el titular va en UNA línea */
@media (min-width: 1024px) and (min-aspect-ratio: 19/10) {
  .ft-hl { --hl: min(calc(min(1500px, 100vw - 80px) / 12.4), 14svh); display: flex; justify-content: center; align-items: baseline; gap: calc(var(--hl) * .3); }
}
.ft-hl-line { position: relative; text-align: center; white-space: nowrap; padding-bottom: .12em; }
.ft-hl-caps { font-family: Anton, Impact, sans-serif; font-size: var(--hl); line-height: .98; letter-spacing: .01em; text-transform: uppercase; }
.ft-hl-serif { font-family: "Playfair Display", Georgia, serif; font-style: italic; font-weight: 600; font-size: calc(var(--hl) * 1.04); line-height: 1.02; margin-top: -.04em; }
.ft-gl-txt { display:inline-block; position: relative; color: transparent; -webkit-text-stroke: 1.5px rgba(255,255,255,0.95);
  background-image:
    linear-gradient(100deg, transparent 0%, rgba(255,255,255,0.9) 50%, transparent 100%),
    linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.10) 30%, rgba(255,255,255,0) 52%, rgba(255,255,255,0.12) 100%);
  background-size: 38% 100%, 100% 100%; background-repeat: no-repeat; background-position: var(--sx, -80%) 0, 0 0;
  -webkit-background-clip: text; background-clip: text;
  filter: drop-shadow(0 2px 10px rgba(40,30,110,0.28)); will-change: transform; }

/* Burbuja de jabón: la película y las gotas se animan dentro del enlace. */
.ft-btns { position:absolute; left:0; right:0; z-index:3; display:grid; grid-template-columns:repeat(4, 1fr); justify-items:center; list-style:none; margin:0 auto; padding:0;
  --ft-bubble-size:64px; max-width:1180px; bottom:clamp(88px, 11vh, 120px); }
@media (min-width: 640px) { .ft-btns { --ft-bubble-size:84px; } }
@media (min-width: 1024px) {
  /* Se estiran el relleno y el contorno juntos, fuera de la medición del nombre. */
  .ft-namewrap { transform:scaleY(1.72); transform-origin:50% 14%; }
  .ft-btns { --ft-bubble-size:clamp(104px, min(9vw, 18svh), 174px); width:82%; max-width:1500px;
    bottom:calc(24.5svh - var(--ft-bubble-size) / 2); }
  .ft-btn-ico svg { width:clamp(36px, 3vw, 54px); height:clamp(36px, 3vw, 54px); }
}
.ft-btn { position:relative; }
.ft-btn-a { position:relative; display:grid; place-items:center; border-radius:50%; color:#fff;
  width:var(--ft-bubble-size); height:var(--ft-bubble-size);
  transition:transform .45s cubic-bezier(.2,.9,.2,1); }
.ft-bubble { position:absolute; inset:0; border-radius:50%; pointer-events:none;
  border:1px solid rgba(255,255,255,.72);
  background:
    radial-gradient(ellipse at 27% 19%, rgba(255,255,255,.86), transparent 22%),
    radial-gradient(ellipse at 76% 79%, rgba(255,227,249,.54), transparent 29%),
    radial-gradient(circle at 52% 48%, transparent 46%, rgba(230,247,255,.16) 63%, rgba(236,248,255,.6) 100%),
    conic-gradient(from 12deg, rgba(185,226,255,.18), rgba(245,180,231,.27), rgba(234,248,255,.09), rgba(212,215,255,.32), rgba(185,226,255,.18));
  -webkit-backdrop-filter:blur(5px) saturate(.65) brightness(1.24);
  backdrop-filter:blur(5px) saturate(.65) brightness(1.24);
  box-shadow:inset 2px 3px 7px rgba(255,255,255,.62), inset -3px -5px 12px rgba(255,232,249,.4), 0 14px 22px -16px rgba(5,22,20,.76); }
.ft-bubble::before { content:""; position:absolute; top:13%; left:13%; width:36%; height:22%;
  border-radius:50%; border-top:2px solid rgba(255,255,255,.9); transform:rotate(-43deg); }
.ft-bubble::after { content:""; position:absolute; bottom:12%; right:12%; width:35%; height:19%;
  border-radius:50%; border-bottom:1px solid rgba(255,255,255,.82); transform:rotate(-42deg); }
.ft-btn-ico { position:relative; display:grid; place-items:center; filter:drop-shadow(0 1px 4px rgba(10,26,43,.92)); }
.ft-bubble-spray { position:absolute; pointer-events:none; width:5px; height:5px; border-radius:50%; opacity:0;
  --r: calc(var(--ft-bubble-size) * .44);
  box-shadow:
    calc(-.83 * var(--r)) calc(-.5 * var(--r)) 2px rgba(232,246,255,.9),
    calc(-.16 * var(--r)) calc(-1.06 * var(--r)) 1px #fff,
    calc(.8 * var(--r)) calc(-.72 * var(--r)) 1px rgba(255,223,249,.9),
    calc(1.15 * var(--r)) calc(.18 * var(--r)) 1px #fff,
    calc(.49 * var(--r)) calc(.95 * var(--r)) 2px rgba(221,237,255,.93),
    calc(-.71 * var(--r)) calc(.79 * var(--r)) 1px rgba(255,232,249,.85),
    calc(-1.14 * var(--r)) calc(.22 * var(--r)) 2px #fff; }
@media (hover:hover) {
  .ft-btn-a:hover { transform:translateY(-6px) scale(1.045); }
}
.ft-btn-a:focus-visible { outline:2px solid #fff; outline-offset:5px; }
.ft-btn-a:active { transform:scale(.96); }
.ft-btn[data-popping] .ft-bubble, .ft-btn[data-popping] .ft-btn-ico > svg { animation:ft-bubble-pop .8s ease-out both; }
.ft-btn[data-popping] .ft-bubble-spray { animation:ft-bubble-spray .55s ease-out both; }
@keyframes ft-bubble-pop {
  0% { transform:scale(1); opacity:1; }
  17% { transform:scale(1.13); opacity:.85; }
  24%, 47% { transform:scale(1.23); opacity:0; }
  48% { transform:scale(.55); opacity:0; }
  84% { transform:scale(1.04); opacity:1; }
  100% { transform:scale(1); opacity:1; }
}
@keyframes ft-bubble-spray {
  0%, 18% { transform:scale(.62); opacity:0; }
  28% { opacity:1; }
  100% { transform:scale(1.52) translateY(-4px); opacity:0; }
}

/* aviso de copiado (pastilla de vidrio encima del botón) */
.ft-toast { left: 50%; bottom: calc(100% + 16px); transform: translate(-50%, 6px); opacity: 0; color:#fff;
  border: 1px solid rgba(255,255,255,0.6); background: rgba(40,40,100,0.35);
  -webkit-backdrop-filter: blur(12px) saturate(1.4); backdrop-filter: blur(12px) saturate(1.4);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.7), 0 10px 30px -10px rgba(0,0,0,0.5);
  transition: opacity .3s, transform .45s cubic-bezier(.2,0,0,1); }
.ft-toast:empty { display: none; }
.ft-btn[data-copied] .ft-toast { opacity: 1; transform: translate(-50%, 0); }
@media (max-width: 639px) { .ft-btn--first .ft-toast { left: 0; transform: translate(0, 6px); } .ft-btn--first[data-copied] .ft-toast { transform: none; } }

/* Año y ubicación como texto sobre el pasto. */
.ft-copy { position:absolute; z-index:3; inset-inline:clamp(18px, 4vw, 72px); bottom:clamp(16px, 3svh, 30px);
  display:flex; justify-content:space-between; align-items:baseline; gap:12px;
  font-family:ui-monospace, "JetBrains Mono", monospace; font-size:clamp(10px, 1vw, 13px); letter-spacing:.08em;
  color:#fff; text-shadow:0 1px 4px #0a1a2b; }
.ft-copy > :last-child { text-align:right; }

@media (prefers-reduced-motion: reduce) {
  .ft-btn-a, .ft-toast { transition:none; }
  .ft-btn-a:hover, .ft-btn-a:active { transform:none; }
  .ft-btn[data-popping] .ft-bubble, .ft-btn[data-popping] .ft-btn-ico > svg,
  .ft-btn[data-popping] .ft-bubble-spray { animation:none; }
}

`;
