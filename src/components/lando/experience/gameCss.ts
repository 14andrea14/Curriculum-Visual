// CSS propio de la sección (se inyecta con <style> en HardwareIA). Animaciones
// "por pasos" (steps) para que todo titile como en una pantalla de 8 bits.
// Con prefers-reduced-motion todo queda quieto.
export const gameCss = `
@keyframes gx-twinkle { 0%,100% { opacity: 1; transform: scale(1); } 50% { opacity: .25; transform: scale(.6); } }
@keyframes gx-blink { 0%,49% { opacity: 1; } 50%,100% { opacity: 0; } }
@keyframes gx-bob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-8%); } }
@keyframes gx-drift { from { transform: translateX(-3vw); } to { transform: translateX(3vw); } }
@keyframes gx-spin { to { transform: rotate(360deg); } }
@keyframes gx-pulse { 0%,100% { opacity: .75; } 50% { opacity: 1; } }
.gx-orbit { animation: gx-spin 18s linear infinite; }
.gx-pulse { animation: gx-pulse 2.4s ease-in-out infinite; }
@keyframes gx-tap { 0%,100% { transform: translateY(0) scale(1); } 45% { transform: translateY(-7px) scale(1.1); } 60% { transform: translateY(2px) scale(.92); } }
@keyframes gx-hintglow { 0%,100% { opacity: .6; } 50% { opacity: 1; } }
@keyframes gx-star-appear {
  from { opacity: 0; transform: scale(.35); }
  to { opacity: 1; transform: scale(1); }
}
@keyframes gx-hint-appear {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
.gx-star-entry, .gx-hint-entry { opacity: 0; }
.gx-card-arrived .gx-star-entry { animation: gx-star-appear .55s ease-out var(--gx-entry-delay) both; }
.gx-card-arrived .gx-hint-entry { animation: gx-hint-appear .6s ease-out .24s both; }
.gx-tapicon { animation: gx-tap 1.5s ease-in-out infinite; }
.gx-hintglow { animation: gx-hintglow 1.5s ease-in-out infinite; }
.gx-twinkle { animation: gx-twinkle 1.8s steps(4) infinite; }
.gx-blink { animation: gx-blink 1.1s steps(1) infinite; }
.gx-bob { animation: gx-bob 1.4s steps(4) infinite; }
.gx-drift { animation: gx-drift 9s ease-in-out infinite alternate; }
.gx-scan {
  background-image: repeating-linear-gradient(to bottom, rgba(42,15,53,.16) 0 1px, rgba(0,0,0,0) 1px 3px);
}
.gx-checker {
  background-image: repeating-conic-gradient(rgba(255,255,255,.07) 0 25%, rgba(255,255,255,0) 0 50%);
}
.gx-card { transition: translate .45s cubic-bezier(.34,1.56,.64,1); }
@media (hover: hover) and (pointer: fine) {
  .gx-card:hover { translate: 0 -6px; }
  .gx-chip:hover { translate: 0 -2px; box-shadow: 0 5px 0 #2A0F35; background: #F230D2; color: #fff; }
}
.gx-chip { transition: translate .2s cubic-bezier(.34,1.56,.64,1), box-shadow .2s, background-color .2s, color .2s; }
.gx-abtn { transition: transform .15s cubic-bezier(.34,1.56,.64,1), box-shadow .15s; }
.gx-abtn:hover { transform: translateY(-2px); }
.gx-abtn:active { transform: translateY(4px); box-shadow: 0 2px 0 #2A0F35 !important; }
@media (prefers-reduced-motion: reduce) {
  .gx-twinkle, .gx-blink, .gx-bob, .gx-drift, .gx-orbit, .gx-pulse, .gx-tapicon, .gx-hintglow { animation: none !important; }
  .gx-card-arrived .gx-star-entry, .gx-card-arrived .gx-hint-entry { animation: none; opacity: 1; }
  .gx-card, .gx-chip, .gx-abtn { transition: none !important; }
}
`;
