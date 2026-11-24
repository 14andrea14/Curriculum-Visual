import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { isLite } from './deviceProfile';

let queued = false;

// En móvil, varios pins pueden invalidar medidas en el mismo cuadro.
export function refreshScroll() {
  if (!isLite()) {
    ScrollTrigger.refresh();
    return;
  }
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    ScrollTrigger.refresh();
  });
}
