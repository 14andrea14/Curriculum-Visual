import React, { useEffect, useState, useRef } from 'react';
import { PORTFOLIO_DATA } from '../../data/portfolioData';
import { SOCIAL_PATHS } from '../lando/SocialDock';
import { AIFloaters, type AIFocus } from '../canvas/AIFloaters';
import { SocialIconButton } from '../ui/SocialIconButton';
import { HeroAvatarStage, HeroBackdrop, HERO_DISSOLVE_START, heroFinalRect } from '../canvas/HeroAvatarStage';
import { coverRect, lerpRect, type FrameRect } from '../../lib/frameSequence';
import { ScrollFrameStage } from '../canvas/ScrollFrameStage';
import { CatManifestoStage } from '../lando/CatManifestoStage';
import { MapPin, MessageCircle, Github, Linkedin, ChevronDown } from 'lucide-react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { smoothScrollTo, lockScroll, unlockScroll } from '../../hooks/useSmoothScroll';
import { registerWarmup, warmImage } from '../../lib/preload';
import { useProximityTilt } from '../../hooks/useProximityTilt';

gsap.registerPlugin(ScrollTrigger);

// Progreso (0-1) hasta donde llega el "scroll asistido": un primer gesto de
// scroll hacia abajo, apenas arrancado el Hero, dispara un desplazamiento
// automático con ritmo y curva propios hasta este punto, en vez de dejar que
// la velocidad real del usuario determine qué tan rápido pasa la secuencia
// — eso era lo que se sentía "correr una imagen" en vez de interactivo.
// Debe coincidir con HERO_ENTRY_END de HeroAvatarStage.tsx (fin real de la
// secuencia de video, el frame final aprobado como end_image): un valor menor
// (0.36) hacía que el autoplay se detuviera a la mitad del video en vez de
// completarlo, y el resto había que recorrerlo a mano con scroll normal.
// Pasado este punto, el scroll vuelve a responder normalmente (sostenido +
// disolución hacia la sección 02).
const AUTOPLAY_TARGET_PROGRESS = 0.55;
// Bajado de 5.5s originalmente (se sentía "muy lento"). Subido un poco de
// 3.5s a 4.2s: la cadena de texto (nombre + ubicación + subtítulo + bios +
// íconos) tardaba más que el propio video, así que casi toda la información
// terminaba apareciendo recién cuando el video ya había llegado al último
// fotograma — pedido explícito de que la info vaya saliendo MIENTRAS pasan
// los fotogramas. Este ajuste se combina con acortar las animaciones que no
// tienen una velocidad de tipeo ya aprobada (ver comentarios más abajo).
const AUTOPLAY_DURATION = 4.2;
// LINEAL a propósito: cualquier ease-in/out (incluso uno suave tipo
// quad-in-out) hace que la velocidad de scroll caiga a casi cero cerca del
// final del recorrido. Como el índice de fotograma sale directo de
// scrollProgress, y el scroll suave además aplica su propio suavizado
// sobre ESE valor ya desacelerado, el efecto se duplicaba: los
// últimos fotogramas quedaban "pegados" mucho más tiempo real que los del
// medio antes de saltar al siguiente — eso es lo que se veía "robótico"
// (como pasos de motor a pasos) en vez de una reproducción fluida. Con
// velocidad constante, cada fotograma recibe el mismo tiempo real y el
// suavizado de scrub queda acotado en vez de acumularse al final.
// Curvas del scroll asistido (motion design: nada espacial va lineal). Son
// mezclas SUAVES con lineal (no un ease completo): un ease-in-out puro deja la
// velocidad casi en cero en los extremos y los primeros/últimos fotogramas se
// quedan "pegados" — eso era lo que se veía robótico antes. Con la mezcla, la
// velocidad arranca/termina al ~50 % y se acelera hacia el medio: arranque y
// frenado con peso, sin fotogramas trabados.
const smoothstep01 = (t: number) => t * t * (3 - 2 * t);
const SOFT_IN_OUT = (t: number) => t + 0.5 * (smoothstep01(t) - t);
const SOFT_IN = (t: number) => t + 0.5 * (t * t - t);
const SOFT_OUT = (t: number) => t + 0.5 * (1 - (1 - t) * (1 - t) - t);
const AUTOPLAY_EASING = SOFT_IN_OUT;
// Ida y vuelta de la transformación (portada <-> androide): seno suave en los
// dos extremos, sin arranques bruscos, y con la MISMA curva y casi la misma
// duración en ambos sentidos para que subir y bajar se sientan iguales.
const NATURAL_IN_OUT = (t: number) => -(Math.cos(Math.PI * Math.min(1, Math.max(0, t))) - 1) / 2;
// Umbral para permitir que el scroll asistido se vuelva a disparar: si el
// usuario ya completó la secuencia y luego sube hasta cerca del inicio otra
// vez, debe poder re-experimentarla igual que la primera vez en vez de que
// el segundo scroll hacia abajo quede "crudo" (atado 1:1 al mouse, sin la
// reproducción asistida) — eso rompería la fluidez que se buscó lograr.
const AUTOPLAY_RESET_AT = 0.01;

// "Rebobinado" (scroll hacia arriba), en dos etapas — mismo espíritu que el
// autoplay hacia adelante, pero espejado:
//  1) Desde cualquier punto MÁS ALLÁ de la pose final (fase sostenida o
//     disolución), el primer gesto hacia arriba rebobina el video de vuelta
//     hasta esa pose (AUTOPLAY_TARGET_PROGRESS) y se DETIENE ahí — no sigue
//     de largo hasta la cortina de números en el mismo gesto.
//  2) Solo un SEGUNDO gesto hacia arriba, ya parado en esa pose, rebobina el
//     resto (el tramo de entrada 0 -> AUTOPLAY_TARGET_PROGRESS) y revela la
//     pantalla inicial (cortina de números).
// FORWARD_SPEED es la velocidad real del autoplay hacia adelante (usada por
// triggerAutoplay). REWIND_SPEED (usada por triggerRewind) ya NO es la misma
// velocidad: antes lo era, pero subir AUTOPLAY_DURATION para sincronizar el
// texto con el video de bajada volvía más lento el rebobinado hacia arriba
// sin querer ("hacia abajo está bien, hacia arriba se ve muy lento" —
// reporte explícito). REWIND_SPEED_MULTIPLIER desacopla ambos: el
// rebobinado (subir) siempre va más rápido que la reproducción (bajar), sin
// importar cómo se ajuste AUTOPLAY_DURATION.
const FORWARD_SPEED = AUTOPLAY_TARGET_PROGRESS / AUTOPLAY_DURATION;
const REWIND_SPEED_MULTIPLIER = 1.5;
const REWIND_SPEED = FORWARD_SPEED * REWIND_SPEED_MULTIPLIER;
const REWIND_MIN_DURATION = 0.6;
// El rebobinado que llega hasta el frame 0 (revela la cortina de números,
// "debes scrollear para ver el perfil") se sentía lento — pedido explícito
// de subirle un poco la velocidad SOLO a esa etapa, sin tocar la del
// autoplay hacia adelante ni la del rebobinado a la pose final.
const REWIND_TO_TOP_SPEED_MULTIPLIER = 1.35;
// Margen sobre AUTOPLAY_TARGET_PROGRESS para considerar que "ya se está" en
// la pose final (evita que un residuo de scrub de un píxel deje al usuario
// justo debajo del umbral exacto y dispare la etapa equivocada).
const REWIND_SETTLED_BAND = 0.02;
// Piso al rebobinar DESPUÉS de haber entrado alguna vez (no en la primera
// visita a la página, donde todavía no hay nada que rebobinar): pedido
// explícito de que, de regreso, no se pueda pasar de la pose asentada
// (nombre + ubicación + bio + badge + íconos ya completos, "Ver más"
// visible) — ni la "cortina de números" ni ningún punto intermedio de la
// cadena de aparición. La cortina es solo la primera pantalla de carga; la
// pose asentada es el verdadero final de la "sección 1". Usar
// AUTOPLAY_TARGET_PROGRESS como piso también evita, de paso, el bug de la
// cadena de aparición rota (nunca se vuelve a cruzar ningún umbral que
// oculte un elemento).
const REWIND_FLOOR_AFTER_ENTRY = AUTOPLAY_TARGET_PROGRESS;

// Puente automático hacia la revelación del androide: pedido explícito de
// que, una vez se le dé scroll (o clic en "Ver más") desde la pose asentada,
// arranque una secuencia asistida que recorre la salida del Hero (el
// androide despertando y girando) y SE DETIENE exactamente cuando el rostro
// termina de revelarse, de frente y centrado — no sigue de largo hacia la
// disolución/gato en el mismo gesto. Esa pose centrada, con espacio libre a
// los costados, es el fondo de una sección de contenido propia (ver
// HOLD_DISTANCE_PCT más abajo: "de la electrónica a la Inteligencia
// Artificial") — pedido explícito: "hay que hacer la parada del scroll
// automático ahí, donde se revela el androide... esta va a ser la cara de
// nuestra nueva sección". Solo DESPUÉS de leer esa sección (scroll manual,
// a su propio ritmo) un segundo disparador (triggerContinue, más abajo)
// retoma la disolución en partículas hacia la luciérnaga y la caminata del
// gato — mismo mecanismo que triggerAutoplay/triggerRewind (smoothScrollTo
// con lock).
//
// La secuencia del gato YA NO es una sección/pin aparte (CatTransitionSection
// fue retirada): antes, dos ScrollTrigger con pin:true consecutivos (Hero y
// esa sección) producían un salto/corte de sección visible exactamente en el
// borde entre ambos, sin importar qué tan bien coincidiera el contenido de
// cada lado — es una limitación estructural de tener dos pines separados, no
// algo ajustable con timing. Reportado explícitamente ("es como un paso de
// diapositiva..."). La solución fue fusionar todo en UN SOLO pin (ver las
// fracciones de fase más abajo): ScrollFrameStage.tsx se monta varias veces,
// como capas dentro del mismo contenedor fijado del Hero, así que
// triggerBridge solo necesita mover el scroll dentro del MISMO ScrollTrigger
// (stRef), sin buscar un trigger hermano por id.
//
// La salida del Hero, después de varias iteraciones con partículas hechas a
// mano (descartadas por completo, pedido explícito: "no me convence nada de
// lo que animamos"), terminó siendo OTRO clip real generado con IA (rostro
// -> androide -> partículas -> luciérnaga, ver ANDROID_CUT_FRAMES_PATH) en vez de
// una animación programada — ver HeroAvatarStage.tsx para el porqué.
//
// BRIDGE_FULL_DURATION son los segundos para recorrer, EN TOTAL, la parte de
// video real que los dos triggerBridge cubren entre ambos.
// Ajustado a un ritmo mucho más ágil y dinámico (5.5s) para no dejar tiempos muertos.
const BRIDGE_FULL_DURATION = 5.5;
const BRIDGE_MIN_DURATION = 0.8;
// Primer puente (pose de la portada -> androide revelado): es LA transformación
// (rostro -> neón -> androide) y la usuaria pidió que no pase "súper rápido"
// sino con calma, pero tampoco lenta: ~2.7 s (2.5 s le pareció muy rápido, 3.4 s muy largo).
// Pedido explícito: lento y progresivo, IGUAL en ambos sentidos (curva coseno: arranca y
// frena suave). El video de 7,8 s se recorre a ~1,4x.
const BRIDGE_REVEAL_DURATION = 5.5; // portada -> androide
const REWIND_REVEAL_DURATION = 5.5; // androide -> portada
// Ruta de los fotogramas del clip generado con IA que hace la transformación
// completa rostro -> androide -> partículas -> luciérnaga (ver
// ScrollFrameStage.tsx, reutilizado también para el clip del gato).
// TODA la secuencia (androide completo y gato) va RECORTADA (alfa) y se compone sobre un
// fondo propio del sitio (ver "ESCENARIO" en el JSX), no sobre el fondo del video: así el
// fondo se controla en cada cuadro, cambia de forma continua (negro -> vacío violeta ->
// azul noche del sitio) y no hay salto de "imagen a video" ni de color con Lando.
//  - androide 1-116: recorte del modelo + llave por luminancia (scratchpad bg/refine3.mjs)
//  - androide 117-145 (partículas/torbellino/luciérnaga): luz sobre oscuro -> llave por luminancia
//  - gato: recorte del modelo (bg/cutcat.mjs)
// Desde nov 2026 la transformación es un video NUEVO que arranca en la portada (retrato
// mirando sobre el hombro) y termina en el androide, todo sobre negro (scratchpad bg/buildtr.mjs):
// cuadros 1-188 = video nuevo recortado, 189-194 = fundido, 195-248 = partículas del clip viejo.
const SOCIAL_ICON_PATHS = SOCIAL_PATHS;
const ANDROID_CUT_FRAMES_PATH = '/transform-frames-cut/desktop';
const CAT_CUT_FRAMES_PATH = '/cat-frames-cut/desktop';
// El clip del androide tiene 145 fotogramas (0-144). El fotograma 84
// (frame_085.webp) es el punto exacto donde termina el giro y queda
// revelada de frente, centrada, con espacio libre a ambos lados.
const ANDROID_FRAME_COUNT = 248;
// Alineación del primer fotograma del androide con el último natural del
// Hero (frame_143): medida por registro de imagen (escala + desplazamiento
// que minimiza la diferencia entre ambos). Se suelta suavemente durante el
// giro (hasta ~fotograma 29 del androide), donde el movimiento la disimula.
// El androide arranca exactamente donde quedó ella en la portada (rectángulo
// final del Hero + la alineación medida entre ambas tomas: escala 1.04 y
// corrimiento 1.67 % / 0.74 %) y vuelve suavemente a pantalla completa
// durante el giro (hasta el 20 % del clip, antes de que aparezca el cuerpo
// del robot, que sí toca los bordes del video).
// El video nuevo arranca EXACTAMENTE en la imagen de la portada (mismo encuadre a pantalla
// completa), así que ya no hace falta alinear: se dibuja siempre en "cover".
const androidRectAt = (p: number, w: number, h: number): FrameRect | undefined => {
  const isPortrait = w < h || (typeof window !== 'undefined' && window.innerWidth < 768);
  if (isPortrait) {
    // En celular/móvil: el androide debe tener exactamente la misma posición y escala
    // que el avatar en la portada (heroFinalRect), para que la transición sea 100% idéntica sin saltos
    return heroFinalRect(w, h);
  }
  if (p >= 0) return undefined;
  const t = Math.min(1, Math.max(0, p / 0.2));
  const k = 1 - t * t * (3 - 2 * t);
  if (k <= 0.0005) return undefined;
  const hr = heroFinalRect(w, h);
  const aw = hr.w * 1.04;
  const ah = hr.h * 1.04;
  const cx = hr.x + hr.w / 2 + 0.0167 * hr.w;
  const cy = hr.y + hr.h / 2 + 0.0074 * hr.h;
  const aligned = { x: cx - aw / 2, y: cy - ah / 2, w: aw, h: ah };
  return lerpRect(coverRect(w, h), aligned, k);
};
const catRectAt = (_p: number, w: number, h: number): FrameRect | undefined => {
  if (w >= 768 && w >= h) return undefined;
  // En móvil / vertical: el video 16:9 del gato se cortaba en los bordes ("el gato se sale de cuadro").
  // Enmarcamos el video para que el gato completo quepa en el ancho de la pantalla y camine sobre el texto:
  const aspect = 1920 / 1080;
  const fw = Math.min(Math.round(w * 1.18), Math.round(h * 0.52 * aspect));
  const fh = Math.round(fw / aspect);
  const fx = Math.round((w - fw) / 2);
  const fy = Math.round(h * 0.58 - fh * 0.45);
  return { x: fx, y: fy, w: fw, h: fh };
};
const ANDROID_HOLD_FRAME_INDEX = 187; // último cuadro del video nuevo: el androide de frente
const ANDROID_HOLD_PROGRESS = ANDROID_HOLD_FRAME_INDEX / (ANDROID_FRAME_COUNT - 1);
const REVEAL_EASE_POWER = 0.45;
// Transición gato + manifiesto (CatManifestoStage): sin cortes ni capas
// encima — todo montado una cosa sobre otra dentro del mismo pin. Mientras el
// androide se disuelve en partículas, el manifiesto aparece detrás (desde el
// cuadro MANIFESTO_ENTER_FROM_FRAME del clip, cuando las partículas ya cubren);
// el gato camina sobre él y al final pasa la cámara dejando el manifiesto
// completo, que es el último cuadro del pin. De ahí se sigue con scroll normal.
const MANIFESTO_ENTER_FROM_FRAME = 200;
// Caminata del gato (puente por tiempo): ~5 s para que se lea el manifiesto
// encendiéndose palabra por palabra a su paso.
const CAT_WALK_DURATION = 5;
// Rebobinado desde el manifiesto hasta la sección del androide (inverso de
// "continue": caminata + disolución al revés).
const BACK_TO_HOLD_DURATION = 4;
// Punto final de la caminata (progreso RAW del pin): un pelo antes de 1 para
// que el pin siga "activo" y la caminata llegue a su cuadro final (catProgress
// se normaliza contra este valor).
const CAT_END_RAW = 0.999;


// Fusión de TODO (Hero + sección HOLD + disolución + gato) en un solo pin.
// Distancias optimizadas: se reduce la altura del pin total (de 725% a 440%)
// para eliminar el exceso de scroll muerto después de la sección del androide,
// permitiendo una transición rápida y natural hacia la siguiente sección de Experiencia.
const HERO_DISTANCE_PCT = 220;
const HOLD_DISTANCE_PCT = 60;
const ANDROID_CONTINUE_DISTANCE_PCT = 45;
// La caminata (ahora también el encendido del manifiesto) dura ~5 s: más tramo
// de scroll para que, recorrida a mano, tampoco pase de golpe.
const CAT_DISTANCE_PCT = 100;
const TOTAL_DISTANCE_PCT = HERO_DISTANCE_PCT + HOLD_DISTANCE_PCT + ANDROID_CONTINUE_DISTANCE_PCT + CAT_DISTANCE_PCT;

// Fracciones acumuladas (0-1 del pin combinado) donde termina cada fase.
const HERO_PHASE_END = HERO_DISTANCE_PCT / TOTAL_DISTANCE_PCT;
const HOLD_PHASE_END = (HERO_DISTANCE_PCT + HOLD_DISTANCE_PCT) / TOTAL_DISTANCE_PCT;
const CONTINUE_PHASE_END = (HERO_DISTANCE_PCT + HOLD_DISTANCE_PCT + ANDROID_CONTINUE_DISTANCE_PCT) / TOTAL_DISTANCE_PCT;
// (la fase del gato termina en 1, el final del pin)

// Velocidad de los dos triggerBridge, en unidades de progreso RAW
const settledRawProgress = AUTOPLAY_TARGET_PROGRESS * HERO_PHASE_END;
const totalBridgeRawDistance = (HERO_PHASE_END - settledRawProgress) + (1 - HOLD_PHASE_END);
const BRIDGE_SPEED_RAW = totalBridgeRawDistance / BRIDGE_FULL_DURATION;


// Texto del nombre y el subtítulo como constantes (no solo en el JSX): el
// tipeado usa steps(N) donde N = cantidad de caracteres exacta de cada
// línea, así que el mismo string maneja el JSX y el cálculo de la animación
// — evita que se desincronicen si alguna se edita sin tocar la otra.
const NAME_LINE_1 = 'Alejandra';
const NAME_LINE_2 = 'Arismendi';
const BADGE_LINE_1 = 'ELECTRONIC ENGINEER';
const BADGE_LINE_2 = 'SPECIALIST IN AUTOMATION & AI';
// Segundos por carácter — cada bloque tiene su propia velocidad.
// NAME_TYPE_SPEED bajado de 0.13: identificado como la causa raíz de que
// toda la cadena de abajo (ubicación, subtítulo, bios, íconos) arrancara
// tarde — el nombre por sí solo tardaba ~2.3s. Más rápido acá le da paso
// antes al resto sin tocar sus propias duraciones.
const NAME_TYPE_SPEED = 0.08;
// Bajado de nuevo (0.04 -> 0.025): el badge sigue siendo el tramo más largo
// de la cadena (49 caracteres en total) y era el que más atrasaba a todo lo
// que viene después (bios, íconos) respecto al avance del video.
const BADGE_TYPE_SPEED = 0.025;

// Puntos de disparo (0-1 de scrollProgress) para cada elemento de texto/UI.
// A diferencia del avatar (que sí queda scrubbeado 1:1 al scroll, porque es
// video real y así se ve correcto), estos elementos ya NO calculan su
// opacidad/transform como función lineal continua del scroll — eso hacía
// que todo se sintiera "pasar hojas de un flipbook con el dedo" en vez de
// interactivo.
// Orden de aparición pedido explícitamente (mismo orden, invertido, al
// salir — ver el bloque de disolución más abajo): (1) nombre Y subtítulo
// tipean EN PARALELO ("a la vez", título+subtítulo juntos — pedido
// explícito: "cuando sale el nombre... debería estar saliendo el
// subtítulo"), (2) ubicación saliendo de atrás, (3) las dos bios (wipe
// direccional), (4) botones de redes AL FINAL, uno por uno. Todo esto está
// ENCADENADO por callbacks (ver más abajo: el onComplete de una timeline
// dispara la siguiente) — estos umbrales solo definen cuándo arranca la
// CABEZA de la cadena (nombre+badge juntos) y cuándo cada elemento debe
// OCULTARSE si el usuario sube de nuevo. Los valores quedan en el mismo
// orden creciente que la aparición, para que al subir se oculten en el
// orden inverso (íconos primero, nombre+badge al final).
// Bajados (antes 0.05/0.07): reportado que en un frame ya bastante avanzado
// del video, "gran parte de la información" (nombre, ubicación) todavía no
// había aparecido — la cadena de texto arrancaba demasiado tarde respecto al
// avance del video. Arrancar casi al primer pixel de scroll le da al nombre
// (2.3s en tipear, ya confirmado como velocidad correcta) más margen real
// para terminar antes de que el video llegue a su pose final.
const SCREENSAVER_HIDE_AT = 0.02;
const NAME_IN_AT = 0.03;
const LOCATION_IN_AT = 0.1;
const BIO_IN_AT = 0.17;
const ICONS_IN_AT = 0.21;

// Sección HOLD ("de la electrónica a la Inteligencia Artificial"): morado en
// vez del rosa neón del resto del sitio — pedido explícito ("la colorimetría
// pasa a destellos morados"), tomando el mismo tono de la imagen de
// referencia del androide que se usó para generar el video. Layout tomado
// del propio Hero (pedido explícito, "para que todo se vea mejor"): título
// arriba a la izquierda igual que el nombre. El párrafo, que arrancó arriba
// a la derecha (igual que la bio derecha del Hero), se movió después justo
// debajo del título, también a la izquierda — pedido explícito. Sin eyebrow
// ni columnas centradas verticalmente como antes. Reemplaza por completo la
// vieja sección "story" (placeholder "TRANSMISIÓN // LOG_02", eliminada —
// pedido explícito, esta es ahora el punto 2 real de la narrativa;
// experiencia pasa a ser el 3).
// 3 líneas (no 2) — pedido explícito, para no solaparse con la cara del
// androide: cada línea corta y con whitespace-nowrap (mismo criterio que
// NAME_LINE_1/2 en el Hero) para no depender de dónde caiga el wrap natural.
const HOLD_TITLE_LINE_1 = 'DE LA ELECTRÓNICA A';
const HOLD_TITLE_LINE_2 = 'LA INTELIGENCIA';
const HOLD_TITLE_LINE_3 = 'ARTIFICIAL';
// Líneas fijas y cortas (no un solo string con wrap natural) — pedido
// explícito de "acomodar en más líneas... para respetar el espacio de la
// imagen": el párrafo debe quedarse dentro de la misma columna angosta que
// el título, a la izquierda de la cara del androide, no extenderse hacia el
// centro.
const HOLD_STATEMENT_LINES = [
  'Mi enfoque profesional une dos mundos',
  'fundamentales, la precisión determinista',
  'del hardware electrónico con la',
  'adaptabilidad y potencia de',
  'la Inteligencia Artificial.',
];
// Umbrales de holdProgress (0-1) para la aparición escalonada del contenido
// — mismo criterio que NAME_IN_AT/LOCATION_IN_AT/etc. arriba, pero con
// opacidad simple calculada directo del scroll (sin cadena de GSAP): esta
// sección no tiene tipeado ni animaciones encadenadas, así que no hace
// falta esa maquinaria.
const HOLD_EDU_LINES = [
  'Ingeniero Electrónico mención Telecomunicaciones',
  'UNEXPO - Universidad Nacional Experimental',
  '"Antonio José de Sucre"',
  'Especialización en Automatización,',
  'Sistemas y Procesamiento Digital',
];
const HOLD_TITLE_IN_AT = 0.04;
const HOLD_STATEMENT_IN_AT = 0.16;
const HOLD_HOLOGRAM_IN_AT = 0.24;
const HOLD_CONTINUE_IN_AT = 0.34;
const HOLD_FADE_SPAN = 0.14; // cuánto tarda cada elemento en llegar a opacidad 1 una vez cruzado su umbral
// Fracción de continueProgress (0-1, arranca al disparar "Continuar") en la
// que el texto de esta sección se apaga — pedido explícito: antes se
// quedaba visible durante TODO el puente hacia el gato; debe desvanecerse
// "poco a poco, como fue cargado" apenas arranca esa animación, no quedarse
// hasta la caminata del gato.
const HOLD_EXIT_FADE_SPAN = 0.35;
// Fracción de continueProgress en la que el campo de puntos morados del
// androide termina de apagarse (antes de que aparezca el gato).
const PURPLE_FIELD_FADE_END = 0.6;

// Salida del texto del Hero al arrancar la disolución (ver el bloque "Fase
// de salida" en el componente): duración de cada fundido individual, más
// separación escalonada entre el arranque de cada grupo, en el orden pedido
// explícito: "los botones primero uno a uno, luego los textos, luego la
// ubicación, y por último título y subtítulo" (nombre y badge juntos, al
// final, no uno antes que el otro). Módulo-nivel (no dentro del componente)
// para que el efecto de holdAutoProgress, definido ANTES en el archivo,
// pueda usar DISSOLVE_EXIT_TOTAL sin depender del orden de declaración
// dentro de la función.
const DISSOLVE_EXIT_DURATION = 1.1;
const DISSOLVE_EXIT_STAGGER = 0.18;
const DISSOLVE_EXIT_ICON_COUNT = 3; // LinkedIn, mensaje, GitHub
const DISSOLVE_EXIT_ICON_STAGGER = 0.1;
// íconos (uno a uno) -> bios -> ubicación -> (nombre + badge, juntos, último).
const DISSOLVE_EXIT_LAST_GROUP_DELAY =
  Math.max(0, DISSOLVE_EXIT_ICON_COUNT - 1) * DISSOLVE_EXIT_ICON_STAGGER + DISSOLVE_EXIT_STAGGER * 3;
const DISSOLVE_EXIT_TOTAL = DISSOLVE_EXIT_LAST_GROUP_DELAY + DISSOLVE_EXIT_DURATION;

// Glifos para el "decodificado" del título de HOLD (estilo pantalla de
// hackeo, pedido explícito: "algo como una animación gamer o de IA") — cada
// carácter todavía no resuelto muestra uno de estos al azar, cambiando cada
// frame, hasta que le toca "fijarse" en el carácter real (de izquierda a
// derecha). Módulo-nivel: no depende de nada del componente.
// Entrada de elementos (motion design: nunca solo opacidad): sube ~14 px y
// pasa de desenfocado a nítido con desaceleración (ease-out cúbico), atado
// al mismo progreso 0-1 que ya maneja su opacidad.
const riseStyle = (p: number): React.CSSProperties => {
  const e = 1 - Math.pow(1 - Math.min(1, Math.max(0, p)), 3);
  if (e >= 0.999) return {};
  return { transform: `translate3d(0, ${(1 - e) * 14}px, 0)`, filter: `blur(${(1 - e) * 6}px)` };
};

const SCRAMBLE_CHARS = '01ABCDEFGHIJKLMNOPQRSTUVWXYZ!@#$%&*+<>/\\';

// progress 0 = todo sin resolver, 1 = todo resuelto (texto final estático,
// sin más aleatoriedad — evita seguir "parpadeando" para siempre una vez
// completo). Los espacios nunca se scramblean (se ven raros como glifo).
const ScrambleLine: React.FC<{ text: string; progress: number; className?: string }> = ({
  text,
  progress,
  className,
}) => {
  if (progress >= 1) {
    return <span className={className}>{text}</span>;
  }
  const lockedCount = Math.floor(Math.max(0, progress) * text.length);
  return (
    <span className={className}>
      {text.split('').map((char, i) => {
        if (char === ' ') return <React.Fragment key={i}> </React.Fragment>;
        if (i < lockedCount) return <React.Fragment key={i}>{char}</React.Fragment>;
        const glitch = SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
        return (
          <span key={i} className="text-cyan-300/80">
            {glitch}
          </span>
        );
      })}
    </span>
  );
};

export const HeroSection: React.FC = () => {
  const { profile } = PORTFOLIO_DATA;
  const containerRef = useRef<HTMLDivElement>(null!);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [iconsInteractive, setIconsInteractive] = useState(false);
  // La capa recortada del androide solo se muestra cuando sus fotogramas
  // cargaron bien; si no, queda el clip original (nunca un fondo vacío
  // tapando al robot).
  const [androidCutReady, setAndroidCutReady] = useState(false);
  // La capa recortada del androide (fondo negro) tiene que estar CARGADA ANTES de
  // empezar a bajar: si no, el primer scroll mostraba el clip original (fondo
  // azul con puntos) y se notaba un salto. Si el usuario baja antes, el descenso
  // espera a que termine de cargar y arranca solo.
  const androidCutReadyRef = useRef(false);
  const pendingDescendRef = useRef(false);
  const descendRef = useRef<() => void>(() => {});
  const heroFramesReadyRef = useRef(false);
  // PORTADA INTERACTIVA (pedido explícito): la página abre congelada en la pose
  // inicial (el último fotograma de la entrada: mano en la mejilla), con el
  // scroll bloqueado. La sonrisa NO se ve hasta que la usuaria interactúa: un
  // clic sobre la figura (o un intento de scroll/tecla) reproduce una
  // "reacción" (gira hacia la cámara, sonríe y vuelve a la pose) y recién ahí
  // se libera el scroll.
  const lockedRef = useRef(false);
  const [coverLocked, setCoverLocked] = useState(false);
  const frameOverrideRef = useRef<number | null>(null);
  // guiño del clic: tiempo (0-1) del video del guiño; null = no está corriendo
  const winkRef = useRef<number | null>(null);
  const smilePlayingRef = useRef(false);
  const playSmileRef = useRef<(thenContinue?: boolean) => void>(() => {});
  // Vuelve a bloquear la portada cuando se regresa a la pose inicial desde abajo.
  const relockCoverRef = useRef<() => void>(() => {});

  const screensaverRef = useRef<HTMLDivElement>(null!);
  const badgeRef = useRef<HTMLDivElement>(null!);
  const nameRef = useRef<HTMLHeadingElement>(null!);
  const nameLine1Ref = useRef<HTMLSpanElement>(null!);
  const nameLine2Ref = useRef<HTMLSpanElement>(null!);
  const nameCursorRef = useRef<HTMLSpanElement>(null!);
  const badgeLine1Ref = useRef<HTMLSpanElement>(null!);
  const badgeLine2Ref = useRef<HTMLSpanElement>(null!);
  const badgeCursorRef = useRef<HTMLSpanElement>(null!);
  const locationRef = useRef<HTMLDivElement>(null!);
  const nameLocationGroupRef = useRef<HTMLDivElement>(null!);
  const iconsRef = useRef<HTMLDivElement>(null!);
  const bioRef = useRef<HTMLDivElement>(null!);
  const bioRightRef = useRef<HTMLDivElement>(null!);
  const seeMoreRef = useRef<HTMLDivElement>(null!);

  const screensaverTl = useRef<gsap.core.Timeline>(null!);
  const badgeTl = useRef<gsap.core.Timeline>(null!);
  const nameTl = useRef<gsap.core.Timeline>(null!);
  const locationTl = useRef<gsap.core.Timeline>(null!);
  const iconsTl = useRef<gsap.core.Timeline>(null!);
  const bioTl = useRef<gsap.core.Timeline>(null!);
  const bioRightTl = useRef<gsap.core.Timeline>(null!);
  const seeMoreTl = useRef<gsap.core.Timeline>(null!);
  // true después de la PRIMERA vez que se reproduce la cadena de entrada
  // completa — pedido explícito: al volver a la sección Perfil después de
  // haber retrocedido el scroll, la cadena (tipeado del nombre, badge, wipes
  // de las bios, íconos uno a uno) no debe volver a tardar varios segundos
  // como la primera vez; a partir de la segunda vez, se reproduce mucho más
  // rápido (mismo diseño visual, solo con timeScale alto).
  const hasEnteredOnceRef = useRef(false);
  // DISTINTO de hasEnteredOnceRef: ese se pone en true al ARRANCAR
  // triggerAutoplay (para decidir la velocidad de ESA reproducción), antes
  // de que la animación de entrada del avatar siquiera se reproduzca. Este
  // otro solo se pone en true cuando esa animación REALMENTE TERMINA (llega
  // a la pose asentada) — bug real encontrado: el piso de rebobinado y el
  // "no dejar bajar el scroll" de más abajo usaban hasEnteredOnceRef, que ya
  // era true desde el primer instante del primerísimo scroll hacia abajo —
  // el piso se activaba de inmediato y saltaba directo a la pose asentada,
  // saltándose por completo la animación de entrada del avatar (reportado
  // explícito: "eliminaste la entrada del avatar").
  const hasReachedSettledRef = useRef(false);
  // Velocidad de la cadena de ESTA entrada en curso — fijada una sola vez
  // por triggerAutoplay al arrancar (ver ahí). Las tweens "frescas" (que ya
  // no son timelines pre-construidas — location, bios, "Ver más") leen este
  // ref en vez de recalcular desde hasEnteredOnceRef directamente: para
  // cuando esos pasos se disparan (más adentro de la cadena), triggerAutoplay
  // ya puso hasEnteredOnceRef en true, así que recalcular ahí siempre daría
  // "repetición" incluso en la primerísima entrada.
  const chainSpeedRef = useRef(1);

  const scrollProgressRef = useRef(0);
  // Ver el comentario junto a onUpdate de ScrollTrigger: evita llamar a
  // setScrollProgress si el cambio es prácticamente nulo.
  const lastScrollProgressSetRef = useRef(-1);
  // Se dispara UNA sola vez por cruce hacia adelante del umbral (no en cada
  // tick de scroll mientras heroProgress siga >= HERO_DISSOLVE_START) — sin
  // esto, el propio "showTypedGroup" del nombre (que corre en TODOS los
  // ticks donde heroProgress > NAME_IN_AT, umbral que sigue cumplido durante
  // toda la disolución) fuerza la opacidad a 1 de nuevo en el mismo tick en
  // que se crea un nuevo tween de fade-a-0, y como gsap.to NO sobreescribe
  // tweens previos por defecto (overwrite:false), terminaban compitiendo:
  // mientras se sigue scrolleando el contenedor se queda "pegado" en
  // opacidad 1 (el texto no se ve desvanecer con calma durante la
  // transformación) y, al dejar de scrollear, el ÚLTIMO tween creado sigue
  // corriendo solo (por su propio ticker) hasta terminar en 0 sin que nada
  // vuelva a corregirlo — el nombre se quedaba invisible al volver a la pose
  // asentada. Con un solo tween por cruce, corre sin competencia.
  const dissolveExitFiredRef = useRef(false);
  const stRef = useRef<ScrollTrigger | null>(null);
  const forwardStateRef = useRef<'idle' | 'playing' | 'done'>('idle');
  const rewindStateRef = useRef<'idle' | 'playing'>('idle');
  // bridgeStateRef: primer triggerBridge (settled -> revelación del androide).
  // continueStateRef: segundo triggerBridge, disparado desde "Continuar" al
  // final de la sección HOLD (revelación -> disolución -> gato). Son DOS
  // máquinas de estado independientes porque cubren tramos distintos del pin
  // y se disparan en momentos distintos — no son la misma "sesión" de puente.
  const bridgeStateRef = useRef<'idle' | 'playing' | 'done'>('idle');
  const continueStateRef = useRef<'idle' | 'playing' | 'done'>('idle');
  // triggerBridge en sí vive dentro del useEffect de scroll asistido (más
  // abajo) — estas refs lo exponen para que los onClick de "Ver más" y
  // "Continuar" (JSX) puedan llamarlo directamente, sin duplicar su lógica.
  const triggerBridgeRef = useRef<() => boolean>(() => false);
  const triggerContinueRef = useRef<() => boolean>(() => false);
  // Rebobinado manifiesto -> androide (inverso de "continue") en curso.
  const backStateRef = useRef<'idle' | 'playing'>('idle');

  // scrollProgress es RAW (0-1 sobre el pin combinado: Hero + sección HOLD +
  // disolución + gato — ver comentario junto a HERO_DISTANCE_PCT sobre por
  // qué la revelación del androide NO tiene su propio bloque). Cada fase
  // tiene su propio progreso local 0-1, clampeado a 1 antes de que empiece y
  // a partir de que termina.
  const heroProgress = Math.min(1, scrollProgress / HERO_PHASE_END);
  const holdProgress = Math.min(1, Math.max(0, (scrollProgress - HERO_PHASE_END) / (HOLD_PHASE_END - HERO_PHASE_END)));
  const continueProgress = Math.min(1, Math.max(0, (scrollProgress - HOLD_PHASE_END) / (CONTINUE_PHASE_END - HOLD_PHASE_END)));
  const catProgress = Math.min(1, Math.max(0, (scrollProgress - CONTINUE_PHASE_END) / (CAT_END_RAW - CONTINUE_PHASE_END)));
  // Multiplicador de salida para el texto de la sección HOLD: 1 mientras no
  // se ha disparado "Continuar", baja a 0 durante el primer tramo de
  // continueProgress (ver HOLD_EXIT_FADE_SPAN) — el texto no debe seguir
  // visible durante la disolución hacia el gato.
  const holdExitOpacity = 1 - Math.min(1, continueProgress / HOLD_EXIT_FADE_SPAN);

  // Progreso (0-1) del clip del androide en SÍ MISMO, sobre sus 145
  // fotogramas: recorre 0 -> ANDROID_HOLD_PROGRESS DENTRO del propio tramo
  // final del Hero (heroProgress HERO_DISSOLVE_START -> 1, igual que
  // heroOpacity en HeroAvatarStage.tsx — ambos arrancan a la vez, sin hueco
  // muerto entre uno y otro), queda CONGELADO en ANDROID_HOLD_PROGRESS
  // durante toda la sección HOLD (de ahí el nombre: es literalmente una
  // "pausa" del video, no una imagen estática aparte), y retoma de
  // ANDROID_HOLD_PROGRESS -> 1 durante la fase de disolución.
  let androidProgress: number;
  if (scrollProgress <= HERO_PHASE_END) {
    const revealT = Math.min(1, Math.max(0, (heroProgress - HERO_DISSOLVE_START) / (1 - HERO_DISSOLVE_START)));
    // Curva smoothstep para la rotación del androide: derivada cero en t=0 y t=1.
    // Esto asegura que al comenzar la rotación (y al rebobinar hacia atrás), el clip arranca y frena suavemente,
    // eliminando por completo cualquier salto brusco o sensación de "colocar una imagen" al subir o bajar el scroll.
    const easedRevealT = revealT * revealT * (3 - 2 * revealT);
    androidProgress = easedRevealT * ANDROID_HOLD_PROGRESS;
  } else if (scrollProgress <= HOLD_PHASE_END) {
    androidProgress = ANDROID_HOLD_PROGRESS;
  } else {
    androidProgress = ANDROID_HOLD_PROGRESS + continueProgress * (1 - ANDROID_HOLD_PROGRESS);
  }

  // scrollProgressRef ya se actualiza síncrono dentro del onUpdate de
  // ScrollTrigger (ver más abajo) — no hace falta un efecto aparte que lo
  // repita un render después.

  // Avisa a SectionDots.tsx cuándo estamos en la fase interna del androide (Educación)
  // Se activa al llegar al androide (heroProgress >= 0.94) y dura toda la sección HOLD.
  useEffect(() => {
    const active = heroProgress >= 0.94 && scrollProgress < CONTINUE_PHASE_END;
    window.dispatchEvent(new CustomEvent('section-override', { detail: active ? 'android' : null }));
  }, [heroProgress, scrollProgress]);

  // El texto de la sección HOLD aparece SOLO al llegar, sin necesitar scroll
  // — pedido explícito ("no necesito scrollear para que aparezcan las
  // palabras"). holdProgress (scroll-driven) sigue existiendo y sigue
  // controlando cuándo se activan las partículas moradas (el segundo puente,
  // "Continuar", ya NO depende de holdProgress — dispara con el próximo
  // gesto apenas se llega acá, ver handleDownGesture), pero la REVELACIÓN
  // del texto en sí la lleva holdAutoProgress, un tween de tiempo. Dispara en
  // heroProgress >= HERO_DISSOLVE_START (no holdProgress > 0, que recién pasa a ser cierto
  // mucho después, con el androide YA revelado del todo) — pedido explícito:
  // el texto de esta sección debe empezar a aparecer apenas desaparece el
  // texto del Hero, no esperar a que termine toda la transformación. El
  // `delay` (DISSOLVE_EXIT_TOTAL) hace que arranque justo CUANDO termina TODA
  // la salida escalonada del Hero (no solo el primer elemento) — que sea
  // secuencial ("una vez desaparezca, empiece a aparecer el otro texto").
  const [holdAutoProgress, setHoldAutoProgress] = useState(0);
  const holdEnteredRef = useRef(false);
  const holdAutoTweenRef = useRef<gsap.core.Tween | null>(null);
  // Decodificado del título (ver ScrambleLine): tween PROPIO, con su propia
  // duración fija y ease lineal — NO reutiliza holdAutoProgress. Motivo:
  // holdAutoProgress usa power1.out sobre 3.5s, una curva que se mueve muy
  // rápido al principio — el tramo HOLD_TITLE_IN_AT..+HOLD_FADE_SPAN pasaba
  // en una fracción de segundo (~0.3s) y ENCIMA con opacidad todavía baja
  // (ambos atados al mismo valor), así que el glitch quedaba casi
  // imperceptible. Reportado explícito ("no percibo la animación").
  const [holdTitleScrambleT, setHoldTitleScrambleT] = useState(0);
  const holdTitleScrambleTweenRef = useRef<gsap.core.Tween | null>(null);
  // true una vez que el decodificado terminó alguna vez — no se resetea al
  // salir de la sección: volver a entrar más tarde solo hace fade, sin
  // repetir el glitch (mismo criterio ya acordado para el nombre del Hero,
  // evitar un "re-tipeo innecesario").
  const holdTitleScrambleDoneRef = useRef(false);

  useEffect(() => {
    // La sección de educación (HOLD) se activa ÚNICAMENTE al llegar al androide (heroProgress >= 0.95),
    // cuando el rostro del androide ya está centrado y de frente.
    if (heroProgress >= 0.95 && !holdEnteredRef.current) {
      if (import.meta.env?.DEV) console.log('[HoldChain] ENTER fired at android hold');
      holdEnteredRef.current = true;
      const obj = { v: 0 };
      holdAutoTweenRef.current?.kill();
      holdAutoTweenRef.current = gsap.to(obj, {
        v: 1,
        duration: 2.0,
        delay: 0.15,
        ease: 'power1.out',
        onUpdate: () => setHoldAutoProgress(obj.v),
      });
      if (!holdTitleScrambleDoneRef.current) {
        const scrambleObj = { v: 0 };
        holdTitleScrambleTweenRef.current?.kill();
        holdTitleScrambleTweenRef.current = gsap.to(scrambleObj, {
          v: 1,
          duration: 1.0,
          delay: 0.15,
          ease: 'none',
          onUpdate: () => setHoldTitleScrambleT(scrambleObj.v),
          onComplete: () => {
            holdTitleScrambleDoneRef.current = true;
          },
        });
      }
    } else if (heroProgress < 0.90 && holdEnteredRef.current) {
      // Al hacer scroll hacia arriba, se resetea de inmediato para que desaparezca sin rezagarse
      if (import.meta.env?.DEV) console.log('[HoldChain] LEAVE fired');
      holdEnteredRef.current = false;
      holdAutoTweenRef.current?.kill();
      holdTitleScrambleTweenRef.current?.kill();
      setHoldAutoProgress(0);
    }
  }, [heroProgress]);

  // Multiplicador de opacidad (0-1) para TODO el contenido de la sección HOLD (Educación):
  // Al scrollear hacia arriba, apenas se sale del androide (heroProgress < 0.97),
  // los textos y el holograma se desvanecen con rapidez y alcanzan el 0 absoluto en 0.90.
  // Como el rostro humano del avatar recién empieza a asomarse por debajo de 0.79,
  // es garantizado que la educación NUNCA se sobreponga con el rostro del avatar.
  const HOLD_LEAVE_FADE_START = 0.90;
  const HOLD_LEAVE_FADE_END = 0.97;
  const holdLeaveFade = Math.min(1, Math.max(0, (heroProgress - HOLD_LEAVE_FADE_START) / (HOLD_LEAVE_FADE_END - HOLD_LEAVE_FADE_START)));

  useEffect(() => {
    // LA PORTADA ES EL PUNTO MÁS ALTO DE LA PÁGINA (pedido explícito): la pose
    // quieta de la portada corresponde a scrollY = 0. Antes, para llegar a ella
    // había ~870 px de scroll "de entrada" por encima que ya no se usan (la
    // página abre directo en la pose). Se resuelve subiendo el contenedor esas
    // mismas px con un margen negativo: el pin arranca "ya avanzado" y el
    // progreso en scrollY = 0 es justo el de la pose asentada. El margen se
    // recalcula antes de cada refresh (cambia con el alto de la ventana).
    const settledOffset = () => (TOTAL_DISTANCE_PCT / 100) * window.innerHeight * HERO_PHASE_END * AUTOPLAY_TARGET_PROGRESS;
    const applyTopOffset = () => {
      if (containerRef.current) containerRef.current.style.marginTop = `-${settledOffset()}px`;
    };
    applyTopOffset();
    ScrollTrigger.addEventListener('refreshInit', applyTopOffset);
    // ScrollTrigger con Pinning estricto para fijar la pantalla durante la revelación
    const ctx = gsap.context(() => {
      stRef.current = ScrollTrigger.create({
        trigger: containerRef.current,
        start: 'top top',
        // Un solo pin cubre TODO: las 3 fases del Hero (HERO_DISTANCE_PCT,
        // sin cambios respecto a la versión solo-Hero) MÁS la caminata del
        // gato (CAT_DISTANCE_PCT, antes el pin de su propia sección) — ver el
        // comentario junto a HERO_PHASE_END sobre por qué se fusionaron.
        end: `+=${TOTAL_DISTANCE_PCT}%`,
        pin: true,
        pinSpacing: true,
        // Sin `scrub`: este ScrollTrigger no tiene ninguna animación asociada
        // (solo pin + onUpdate), así que scrub no tenía ningún efecto. El
        // suavizado del scroll lo da Lenis.
        anticipatePin: 1,
        invalidateOnRefresh: true,
        onUpdate: (self) => {
          // Piso duro: SOLO si ya se llegó a la pose asentada alguna vez
          // (hasReachedSettledRef, no hasEnteredOnceRef — ese último ya es
          // true desde el instante en que arranca la animación de entrada
          // del avatar, y activar el piso ahí saltaba directo a la pose
          // asentada sin dejar que esa animación se reprodujera). Ninguna
          // forma de scroll (rueda, touch, arrastrar la barra, teclado)
          // puede llevar la posición por debajo de la pose asentada DESPUÉS
          // de haber llegado ahí — pedido explícito ("ajustar la barra del
          // scroll a esta lógica"). El rebobinado asistido de más abajo
          // (triggerRewind) ya anima suave hacia ese mismo piso para el
          // GESTO discreto de scroll hacia arriba; esto es la red de
          // seguridad para cualquier OTRA forma de moverse que no pasa por
          // ese gesto (arrastrar la barra, Home, etc.).
          // Piso suave: protege contra saltos erráticos sin bloquear el rebobinado al inicio
          if (hasReachedSettledRef.current && rewindStateRef.current !== 'playing' && forwardStateRef.current === 'done') {
            const floorRaw = REWIND_FLOOR_AFTER_ENTRY * HERO_PHASE_END;
            if (self.progress < floorRaw - 0.08 && self.progress > 0.05) {
              scrollProgressRef.current = REWIND_FLOOR_AFTER_ENTRY;
              smoothScrollTo(self.start + (self.end - self.start) * floorRaw, { immediate: true, force: true });
              return;
            }
          }
          // scrollProgressRef se actualiza SIEMPRE, síncrono con el propio
          // evento de scroll — el wheel handler es un listener nativo (fuera
          // de React) que puede dispararse varias veces antes de que un
          // efecto llegue a correr; leer un ref actualizado solo en efecto
          // significaba leer un valor de un tick atrás.
          scrollProgressRef.current = Math.min(1, self.progress / HERO_PHASE_END);
          // setScrollProgress (el STATE de React) se salta si el cambio es
          // prácticamente nulo — reduce cuántas veces se re-renderiza este
          // componente (pesado) por segundo. Se probó ADEMÁS diferir la
          // llamada a un requestAnimationFrame propio (para que nunca quedara
          // "anidada" dentro de la pila del ticker de GSAP) pero eso rompió
          // el scroll asistido por completo (se quedaba trabado en la
          // cortina de números) — revertido. Este filtro por epsilon es la
          // versión que sí mantiene el scroll asistido funcionando; el
          // warning de React ("Maximum update depth exceeded") todavía puede
          // aparecer en un rebobinado muy rápido, pero es preferible a
          // romper el scroll.
          if (Math.abs(self.progress - lastScrollProgressSetRef.current) > 0.0015) {
            lastScrollProgressSetRef.current = self.progress;
            setScrollProgress(self.progress);
          }
        },
      });

      // Timelines pausadas: cada una define SU PROPIA duración y curva de
      // easing, desacoplada de la velocidad de scroll. play()/reverse() las
      // dispara según el umbral (ver el useEffect de abajo).
      screensaverTl.current = gsap.timeline({ paused: true }).to(screensaverRef.current, {
        opacity: 0,
        duration: 0.5,
        ease: 'power2.out',
      });

      // Nombre y subtítulo: tipeado real, línea por línea, como una
      // terminal — reemplaza el wipe/beam anterior (pedido explícito de la
      // usuaria, que además reportó una línea blanca residual del beam).
      // Como Press Start 2P (nombre) y JetBrains-like monospace (badge) son
      // de ancho fijo, un clip-path con easing steps(N) revela EXACTAMENTE
      // N pasos de igual ancho — coincide carácter por carácter con el
      // ancho real del texto, sin necesitar spans por letra.
      gsap.set([nameLine1Ref.current, nameLine2Ref.current], { clipPath: 'inset(0% 100% 0% 0%)' });
      gsap.set([badgeLine1Ref.current, badgeLine2Ref.current], { clipPath: 'inset(0% 100% 0% 0%)' });
      // Los cursores van DENTRO de la segunda línea de cada grupo (último
      // "caracter" del texto): el propio clip-path del tipeado los revela
      // en el momento justo, sin necesitar una animación de opacidad aparte
      // que además pelearía con el parpadeo CSS de blink-cursor.

      // Encadenado por callbacks (no por umbrales de scroll independientes),
      // orden pedido explícitamente: nombre Y subtítulo tipean EN PARALELO
      // (mismo disparador — ver el par showTypedGroup/hideTypedGroup del
      // nombre en el efecto de abajo, que ahora dispara también al badge) ->
      // ubicación sale de atrás -> ambas bios aparecen (wipe direccional) ->
      // botones sociales, uno por uno, AL FINAL. Pedido explícito: "cuando
      // sale el nombre... debería estar saliendo el subtítulo" (a la vez,
      // no uno después del otro).
      //
      // TODAS estas timelines corren SOLO hacia adelante (play(0), nunca
      // reverse()): al subir el scroll, .reverse() reproduciría el tipeado
      // completo al revés (con badge tardando ~3s en "destipearse" — el
      // reporte de "tarda mucho en desaparecer"), y además un .reverse()
      // vuelve a pasar por los .call() de la cadena en sentido contrario,
      // arriesgando que se disparen de nuevo. En su lugar, esconder usa
      // pause(0, true): salta al inicio (oculto) al instante, con
      // suppressEvents=true para NO disparar los .call() de la cadena al
      // saltar. La opacidad del contenedor sí se anima (rápido) para que la
      // salida no sea un corte seco.
      // BUG REAL ENCONTRADO (confirmado con un script de Playwright apuntando
      // al Chrome local, aislando cada paso): una timeline de GSAP construida
      // en pausa AL MONTAR (paused:true) y reproducida MUCHO DESPUÉS con
      // play(0) — el patrón que usaba TODA esta cadena — no aplicaba de forma
      // confiable el paso de OPACIDAD del contenedor (ni con .set() ni con
      // .to(), con o sin overwrite): la cadena de .call() sí terminaba de
      // reproducirse (confirmado con logs), pero el contenedor se quedaba en
      // opacity:0 para siempre — aunque una escritura directa al DOM, o una
      // timeline nueva creada recién en ese momento, sí funcionaban
      // perfectamente. La opacidad del contenedor de cada elemento ahora se
      // maneja con gsap.set()/gsap.fromTo() creados JUSTO AL DISPARARSE cada
      // paso (mismo criterio que showTypedGroup, que siempre funcionó bien
      // para el nombre) — las timelines pre-construidas (nameTl, badgeTl,
      // iconsTl) se dejan SOLO para el tipeado/stagger interno, que si
      // funciona bien reproducido más tarde.
      nameTl.current = gsap
        .timeline({ paused: true })
        .to(nameLine1Ref.current, {
          clipPath: 'inset(0% 0% 0% 0%)',
          duration: NAME_LINE_1.length * NAME_TYPE_SPEED,
          ease: `steps(${NAME_LINE_1.length})`,
        })
        .to(nameLine2Ref.current, {
          clipPath: 'inset(0% 0% 0% 0%)',
          duration: NAME_LINE_2.length * NAME_TYPE_SPEED,
          ease: `steps(${NAME_LINE_2.length})`,
        })
        .call(() => {
          if (import.meta.env?.DEV) console.log('[HeroChain] nameTl.call fired -> location');
          gsap.killTweensOf(locationRef.current);
          // Ubicación: aparece suavemente deslizándose sutilmente hacia abajo
          gsap.fromTo(
            locationRef.current,
            { opacity: 0, y: -14, scale: 0.96 },
            {
              opacity: 1,
              y: 0,
              scale: 1,
              duration: 0.35 / chainSpeedRef.current,
              ease: 'power2.out',
              onComplete: () => {
                if (import.meta.env?.DEV) console.log('[HeroChain] location onComplete -> bios');
                gsap.killTweensOf(bioRef.current);
                gsap.killTweensOf(bioRightRef.current);
                // Bios: revelación limpia y gradual
                const bioDuration = 0.55 / chainSpeedRef.current;
                gsap.fromTo(
                  bioRef.current,
                  { opacity: 0, x: -14, clipPath: 'inset(0% 100% 0% 0%)' },
                  { opacity: 1, x: 0, clipPath: 'inset(0% 0% 0% 0%)', duration: bioDuration, ease: 'power2.out' }
                );
                gsap.fromTo(
                  bioRightRef.current,
                  { opacity: 0, x: 14, clipPath: 'inset(0% 0% 0% 100%)' },
                  {
                    opacity: 1,
                    x: 0,
                    clipPath: 'inset(0% 0% 0% 0%)',
                    duration: bioDuration,
                    ease: 'power2.out',
                    onComplete: () => {
                      if (import.meta.env?.DEV) console.log('[HeroChain] bios onComplete -> iconsTl.play(0)');
                      gsap.killTweensOf(iconsRef.current);
                      gsap.set(iconsRef.current, { opacity: 1 });
                      iconsTl.current?.play(0);
                    },
                  }
                );
              },
            }
          );
        });

      // Subtítulo: tipea EN PARALELO al nombre, no encadenado a él
      badgeTl.current = gsap
        .timeline({ paused: true })
        .to(badgeLine1Ref.current, {
          clipPath: 'inset(0% 0% 0% 0%)',
          duration: BADGE_LINE_1.length * BADGE_TYPE_SPEED,
          ease: `steps(${BADGE_LINE_1.length})`,
        })
        .to(badgeLine2Ref.current, {
          clipPath: 'inset(0% 0% 0% 0%)',
          duration: BADGE_LINE_2.length * BADGE_TYPE_SPEED,
          ease: `steps(${BADGE_LINE_2.length})`,
        });

      // Botones sociales: entrada sutil desde la derecha sin sobreescalado brusco
      iconsTl.current = gsap.timeline({ paused: true });
      Array.from(iconsRef.current.children).forEach((child) => {
        iconsTl.current!.fromTo(
          child,
          { opacity: 0, scale: 1.15, x: 20 },
          { opacity: 1, scale: 1, x: 0, duration: 0.24, ease: 'power2.out' }
        );
      });
      iconsTl.current.call(() => {
        gsap.killTweensOf(seeMoreRef.current);
        gsap.fromTo(
          seeMoreRef.current,
          { opacity: 0, y: 8 },
          { opacity: 1, y: 0, duration: 0.35 / chainSpeedRef.current, ease: 'power2.out' }
        );
      });
    }, containerRef);

    return () => {
      ScrollTrigger.removeEventListener('refreshInit', applyTopOffset);
      ctx.revert();
    };
  }, []);

  // Scroll asistido, en ambas direcciones, con soporte para CAMBIO DE
  // DIRECCIÓN a mitad de camino: si el usuario invierte el gesto mientras
  // una de las dos animaciones programáticas está en curso, esa animación se
  // interrumpe donde esté (no espera a completarse) y arranca una nueva en
  // la dirección contraria desde la posición real en ese instante — no desde
  // el punto de partida original ni desde el destino original. `force: true`
  // es necesario para esto: Lenis ignora un scrollTo mientras `isLocked` es
  // true a menos que se pase force (ver node_modules/lenis/dist/lenis.mjs,
  // scrollTo). Sin esto, la animación en curso simplemente ignoraba el
  // input contrario y terminaba su recorrido original antes de reaccionar.
  useEffect(() => {
    // Todas las constantes de umbral (AUTOPLAY_TARGET_PROGRESS, 0, etc.) y
    // scrollProgressRef están en escala heroProgress (0-1 "solo Hero"), pero
    // st.start/st.end son píxeles del pin COMBINADO (Hero + gato). Hay que
    // reescalar heroProgress -> progreso raw antes de convertir a píxeles.
    const heroToRawProgress = (heroP: number) => heroP * HERO_PHASE_END;

    const triggerAutoplay = (opts: { force?: boolean } = {}) => {
      if (import.meta.env?.DEV) {
        console.log('[HeroChain] triggerAutoplay llamado', {
          force: opts.force,
          forwardState: forwardStateRef.current,
          rewindState: rewindStateRef.current,
          current: scrollProgressRef.current,
        });
      }
      if (!opts.force && forwardStateRef.current !== 'idle') return;
      const st = stRef.current;
      if (!st) return;

      const current = scrollProgressRef.current;

      // Más allá de la pose final ya no existe una secuencia de entrada que
      // reproducir hacia adelante (ese tramo es scroll normal de sostenida/
      // salida). Si esto se dispara para interrumpir un rebobinado desde
      // ahí, no hay a dónde "autoplayear": se suelta el control sin salto y
      // el scroll normal retoma justo donde iba.
      if (current > AUTOPLAY_TARGET_PROGRESS + REWIND_SETTLED_BAND) {
        hasReachedSettledRef.current = true;
        rewindStateRef.current = 'idle';
        const currentPx = st.start + (st.end - st.start) * heroToRawProgress(current);
        smoothScrollTo(currentPx, { immediate: true, force: true });
        return;
      }

      const distance = Math.abs(AUTOPLAY_TARGET_PROGRESS - current);
      if (distance < 0.005) {
        hasReachedSettledRef.current = true;
        rewindStateRef.current = 'idle';
        forwardStateRef.current = 'done';
        return;
      }

      rewindStateRef.current = 'idle';
      forwardStateRef.current = 'playing';
      // El timeScale de "repetición más rápida" (más rápido a partir de la
      // segunda vez que se entra a Perfil) se fija ACÁ, en el único punto
      // real donde arranca una entrada de verdad — no en el efecto pasivo
      // que solo sigue el scroll tick a tick (eso reaccionaba también al
      // rebobinar, reiniciando la cadena a mitad de un rebobinado en curso
      // y dejándola rota — ver el comentario junto a showTypedGroup/name).
      const chainSpeed = hasEnteredOnceRef.current ? CHAIN_REPLAY_SPEED : 1;
      chainSpeedRef.current = chainSpeed;
      [nameTl, badgeTl, iconsTl].forEach((ref) => ref.current?.timeScale(chainSpeed));
      hasEnteredOnceRef.current = true;
      const targetPx = st.start + (st.end - st.start) * heroToRawProgress(AUTOPLAY_TARGET_PROGRESS);
      const duration = Math.max(REWIND_MIN_DURATION, distance / FORWARD_SPEED);
      smoothScrollTo(targetPx, {
        duration,
        lock: true,
        force: true,
        easing: AUTOPLAY_EASING,
        onComplete: () => {
          if (forwardStateRef.current === 'playing') forwardStateRef.current = 'done';
          // Recién ACÁ (cuando la animación de entrada del avatar realmente
          // termina) se marca que ya se llegó a la pose asentada — no antes,
          // para no saltarse la animación (ver el comentario junto a
          // hasReachedSettledRef).
          hasReachedSettledRef.current = true;
        },
      });
    };

    const triggerRewind = (opts: { force?: boolean } = {}) => {
      if (import.meta.env?.DEV) {
        console.log('[HeroChain] triggerRewind llamado', {
          force: opts.force,
          rewindState: rewindStateRef.current,
          current: scrollProgressRef.current,
        });
      }
      if (!opts.force && rewindStateRef.current !== 'idle') return;
      const st = stRef.current;
      if (!st) return;

      // El DESTINO se decide con scrollProgressRef (heroProgress, clampeado a
      // 1 dentro de la fase del gato). Una vez que ya se LLEGÓ a la pose
      // asentada alguna vez (hasReachedSettledRef — no hasEnteredOnceRef, que
      // ya es true desde que ARRANCA la animación de entrada, antes de que
      // termine; usarlo acá hacía que interrumpir esa animación con un
      // scroll hacia arriba saltara directo a la pose asentada en vez de
      // dejarla terminar), el rebobinado SIEMPRE se detiene en esa pose
      // Rebobinado en dos etapas:
      // 1) Si venimos de más abajo del Hero (androide o disolución), el primer scroll arriba regresa a la pose asentada.
      // 2) Si ya estamos en o cerca de la pose asentada, el siguiente gesto hacia arriba rebobina fluidamente hasta el inicio (0).
      const current = scrollProgressRef.current;
      const isPastSettled = current > AUTOPLAY_TARGET_PROGRESS + REWIND_SETTLED_BAND;
      // Sin pantalla de bloqueo ya no hay "inicio" al que volver: el punto
      // más alto es la portada (pose asentada). Solo antes de llegar a ella
      // por primera vez se permite volver a 0.
      const targetProgress = isPastSettled || hasReachedSettledRef.current ? REWIND_FLOOR_AFTER_ENTRY : 0;

      // La DISTANCIA real, en cambio, hay que medirla con el progreso raw
      // real de ScrollTrigger (st.progress), no con el heroProgress
      // clampeado: si el rebobinado se dispara desde adentro de la caminata
      // del gato, heroProgress ya está fijo en 1 sin importar qué tan lejos
      // se esté en catProgress, así que usarlo daría siempre la misma
      // distancia (y por lo tanto la misma duración) sin importar si hay que
      // recorrer un tramo corto o uno largo — se sentiría demasiado rápido
      // rebobinando desde el final de la caminata del gato.
      const targetRaw = heroToRawProgress(targetProgress);
      const distanceRaw = st.progress - targetRaw;
      if (distanceRaw < 0.005) return; // ya está prácticamente ahí, nada que rebobinar

      forwardStateRef.current = 'idle';
      rewindStateRef.current = 'playing';
      const targetPx = st.start + (st.end - st.start) * targetRaw;
      // El multiplicador "hasta arriba" ya solo aplica en el caso 0 (antes de
      // la primerísima entrada) — de ahí en más, el destino siempre es la
      // pose asentada, que usa la velocidad normal de rebobinado.
      const effectiveSpeed =
        (targetProgress === 0 ? REWIND_SPEED * REWIND_TO_TOP_SPEED_MULTIPLIER : REWIND_SPEED) * HERO_PHASE_END;
      // volviendo a la portada desde el androide: mismo ritmo y curva que la ida
      const backToCover = targetProgress === REWIND_FLOOR_AFTER_ENTRY && current > AUTOPLAY_TARGET_PROGRESS + REWIND_SETTLED_BAND;
      const duration = backToCover
        ? Math.max(REWIND_MIN_DURATION, (distanceRaw / (HERO_PHASE_END - settledRawProgress)) * REWIND_REVEAL_DURATION)
        : Math.max(REWIND_MIN_DURATION, distanceRaw / effectiveSpeed);

      smoothScrollTo(targetPx, {
        duration,
        lock: true,
        force: true,
        easing: backToCover ? NATURAL_IN_OUT : AUTOPLAY_EASING,
        onComplete: () => {
          if (import.meta.env?.DEV) {
            console.log('[HeroChain] triggerRewind onComplete', { targetProgress });
          }
          if (rewindStateRef.current === 'playing') rewindStateRef.current = 'idle';
          // Rebobinado completo hasta el piso (0 la primera vez, o
          // REWIND_FLOOR_AFTER_ENTRY de ahí en adelante): rearma el autoplay
          // hacia adelante para que el próximo scroll hacia abajo lo
          // reproduzca de nuevo, en vez de dejarlo "crudo" solo la segunda
          // vez.
          if (targetProgress <= REWIND_FLOOR_AFTER_ENTRY) {
            forwardStateRef.current = 'idle';
            // de vuelta en la portada: se bloquea otra vez (solo el clic avanza)
            relockCoverRef.current();
          }
        },
      });
    };

    // Ya no busca un ScrollTrigger hermano: todo vive DENTRO del mismo pin
    // (ver las fracciones de fase arriba), así que el destino es simplemente
    // otro punto del progreso RAW de este mismo stRef. Genérico (recibe su
    // destino y qué ref de estado usar) porque ahora hay DOS llamadas
    // distintas: settled -> HERO_PHASE_END (revelación del androide, dentro
    // del propio tramo final del Hero) y HOLD_PHASE_END -> el final
    // (disolución + gato) — pedido explícito de que la primera se DETENGA en
    // la revelación en vez de seguir de largo.
    let bridgeDoneAt = 0;
    const triggerBridge = (
      targetRaw: number,
      stateRef: React.MutableRefObject<'idle' | 'playing' | 'done'>,
      // Si se indica, y el scroll está ANTES de este punto, se salta ahí al
      // instante (sin animar) y el recorrido animado arranca desde ahí.
      skipToRaw?: number,
      onDone?: () => void,
      fixedDuration?: number,
      easing: (t: number) => number = SOFT_IN_OUT
    ) => {
      const st = stRef.current;
      if (!st) return false;

      if (skipToRaw !== undefined && st.progress < skipToRaw) {
        smoothScrollTo(st.start + (st.end - st.start) * skipToRaw, { immediate: true, force: true });
      }
      const fromRaw = skipToRaw !== undefined ? Math.max(st.progress, skipToRaw) : st.progress;
      const distance = targetRaw - fromRaw;
      if (distance < 0.01) return false;

      stateRef.current = 'playing';
      const targetPx = st.start + (st.end - st.start) * targetRaw;
      const revealFraction = distance / (HERO_PHASE_END - settledRawProgress);
      // En móvil damos suficiente tiempo para que la transformación al androide se aprecie cinematográficamente (pedido explícito)
      const isMobileDevice = typeof window !== 'undefined' && window.innerWidth < 768;
      const duration =
        fixedDuration ??
        (stateRef === bridgeStateRef
          ? Math.max(isMobileDevice ? 3.8 : BRIDGE_MIN_DURATION, revealFraction * (isMobileDevice ? 4.8 : BRIDGE_REVEAL_DURATION))
          : Math.max(isMobileDevice ? 2.2 : BRIDGE_MIN_DURATION, distance / (isMobileDevice ? BRIDGE_SPEED_RAW * 1.2 : BRIDGE_SPEED_RAW)));

      smoothScrollTo(targetPx, {
        duration,
        lock: true,
        force: true,
        easing: stateRef === bridgeStateRef && easing === SOFT_IN_OUT ? NATURAL_IN_OUT : easing,
        onComplete: () => {
          bridgeDoneAt = performance.now();
          if (stateRef.current === 'playing') {
            stateRef.current = 'done';
            if (stateRef === bridgeStateRef && window.innerWidth >= 1024) {
              lastScrollProgressSetRef.current = targetRaw;
              setScrollProgress(targetRaw);
            }
            onDone?.();
          }
        },
      });
      return true;
    };

    // Expuestas vía ref para que los onClick de "Ver más" y "Continuar"
    // (JSX, fuera de este efecto) puedan disparar el mismo puente que el
    // gesto de scroll — se detiene de forma limpia en el androide tanto en móvil como en escritorio.
    const playHeroDescend = () => triggerBridge(HERO_PHASE_END, bridgeStateRef);
    triggerBridgeRef.current = playHeroDescend;

    // --- Portada: posición inicial, bloqueo y reacción ---
    const settledPx = () => {
      const st = stRef.current;
      return st ? st.start + (st.end - st.start) * heroToRawProgress(AUTOPLAY_TARGET_PROGRESS) : 0;
    };
    // Con la portada bloqueada se conserva la barra de scroll (ver .hero-cover-lock en
    // index.css): si no, al soltarla el ancho de la página cambia y todos los
    // ResizeObserver (incluido un ScrollTrigger.refresh() del pie) congelaban la portada
    // ~0.5-0.8 s justo al terminar el guiño. Se pone ANTES de lockScroll().
    const setCoverLockClass = (on: boolean) => document.documentElement.classList.toggle('hero-cover-lock', on);
    const unlockCover = () => {
      if (!lockedRef.current) return;
      lockedRef.current = false;
      setCoverLocked(false);
      unlockScroll();
      setCoverLockClass(false);
    };
    relockCoverRef.current = () => {
      if (lockedRef.current) return;
      frameOverrideRef.current = null;
      smilePlayingRef.current = false;
      scrollProgressRef.current = AUTOPLAY_TARGET_PROGRESS;
      forwardStateRef.current = 'done';
      lockedRef.current = true;
      setCoverLocked(true);
      setCoverLockClass(true);
      lockScroll();
    };
    const atCover = () =>
      !!stRef.current &&
      Math.abs(scrollProgressRef.current - AUTOPLAY_TARGET_PROGRESS) < 0.02 &&
      forwardStateRef.current !== 'playing' &&
      rewindStateRef.current !== 'playing' &&
      bridgeStateRef.current !== 'playing' &&
      continueStateRef.current !== 'playing' &&
      backStateRef.current !== 'playing';
    // Reacción: del fotograma final retrocede hasta la sonrisa de frente
    // (~fotograma 90), sostiene un momento y vuelve a la pose. Va por un
    // override del fotograma (no mueve el scroll ni re-renderiza React).
    const SMILE_P = 0.61;
    const SMILE_DURATION = 1.6; // guiño acelerado (~2x): así lo borroso del video no se percibe
    // thenContinue: el gesto fue de AVANZAR (rueda, deslizar, tecla): al terminar
    // la reacción se sigue directo a la transformación, sin pedir un segundo
    // scroll. Con un clic sobre la figura solo se reproduce la reacción y se
    // libera el scroll.
    playSmileRef.current = (thenContinue = false) => {
      if (smilePlayingRef.current || !atCover()) return;
      smilePlayingRef.current = true;
      // UN SOLO movimiento continuo, sin pausas: la figura va de la pose a la
      // sonrisa y vuelve a la pose en una sola pasada (sin sostener el punto de
      // la sonrisa ni frenar a mitad de camino: pedido explícito). La
      // profundidad sigue sin(πp)^1.3: arranca y termina suave y no se queda
      // clavada en el máximo. Las letras leen este mismo valor (reactRef).
      const o = { p: 0 };
      frameOverrideRef.current = 1;
      winkRef.current = 0;
      gsap.to(o, {
        p: 1,
        duration: SMILE_DURATION,
        ease: 'none',
        onUpdate: () => {
          const depth = Math.pow(Math.sin(Math.PI * o.p), 1.3);
          frameOverrideRef.current = 1 - (1 - SMILE_P) * depth;
          winkRef.current = o.p;
        },
        onComplete: () => {
          frameOverrideRef.current = null;
          winkRef.current = null;
          smilePlayingRef.current = false;
          unlockCover();
          if (thenContinue && bridgeStateRef.current === 'idle') triggerBridge(HERO_PHASE_END, bridgeStateRef);
        },
      });
    };
    // Esperar a que ScrollTrigger tenga sus medidas; luego se salta SIEMPRE a la
    // pose inicial (la de la mano en la mejilla) y se bloquea — también si el
    // navegador restauró un scroll anterior al recargar (pedido explícito: al
    // cargar, la página debe estar siempre en ese punto).
    try {
      window.history.scrollRestoration = 'manual';
    } catch {
      /* no-op */
    }
    const initAt = performance.now();
    const initTimer = window.setInterval(() => {
      const st = stRef.current;
      if (!st && performance.now() - initAt < 5000) return;
      window.clearInterval(initTimer);
      if (!st) return;
      const px = settledPx();
      smoothScrollTo(px, { immediate: true, force: true });
      scrollProgressRef.current = AUTOPLAY_TARGET_PROGRESS;
      forwardStateRef.current = 'done';
      hasReachedSettledRef.current = true;
      hasEnteredOnceRef.current = true;
      lockedRef.current = true;
      setCoverLocked(true);
      setCoverLockClass(true);
      lockScroll();
    }, 30);
    // Bajar desde la portada (rueda / deslizar / flecha abajo): NO hace falta hacer
    // clic. Libera el scroll y lanza directo la transformación en un solo scroll (pedido explícito).
    descendRef.current = () => {
      if (!lockedRef.current || smilePlayingRef.current) return;
      unlockCover();
      if (bridgeStateRef.current === 'idle') playHeroDescend();
    };
    const onHeroUnlock = () => {
      navJumpAt = performance.now();
      unlockCover();
    };
    window.addEventListener('hero-unlock', onHeroUnlock);
    const onKey = (e: KeyboardEvent) => {
      if (!lockedRef.current) return;
      const keys = [' ', 'ArrowDown', 'PageDown', 'End', 'ArrowUp', 'PageUp', 'Home'];
      if (!keys.includes(e.key)) return;
      e.preventDefault();
      if (e.key === ' ' || e.key === 'ArrowDown' || e.key === 'PageDown') descendRef.current();
    };
    window.addEventListener('keydown', onKey);
    // skipToRaw = HOLD_PHASE_END: el tramo HOLD (HERO_PHASE_END -> HOLD_PHASE_END)
    // es una PAUSA con el androide congelado; al pedir "Continuar" no tiene
    // sentido recorrerlo animado (~2.5 s muertos antes de que empiece a
    // disolverse) — se salta y la animación arranca directo en la disolución.
    // Caminata del gato sobre el manifiesto, desde donde esté hasta el final
    // del pin (CAT_END_RAW). Puente por tiempo: CAT_WALK_DURATION para la
    // caminata completa, proporcional si arranca a mitad. Al terminar NO hay
    // ningún salto: el manifiesto completo es el último cuadro del pin y la
    // página sigue con scroll normal hacia la sección siguiente.
    const walkToManifesto = () => {
      const st = stRef.current;
      if (!st) return false;
      const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
      const walkDuration = isMobile ? 1.8 : CAT_WALK_DURATION;
      const from = Math.max(st.progress, CONTINUE_PHASE_END);
      const frac = (CAT_END_RAW - from) / (CAT_END_RAW - CONTINUE_PHASE_END);
      return triggerBridge(CAT_END_RAW, continueStateRef, undefined, undefined, Math.max(0.4, walkDuration * frac), SOFT_OUT);
    };
    // Dos tramos: la disolución androide -> partículas (el manifiesto aparece
    // detrás) a la velocidad normal del puente, y la caminata del gato.
    const triggerContinue = () => {
      const st = stRef.current;
      if (!st) return false;
      const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
      backStateRef.current = 'idle';
      if (st.progress >= CONTINUE_PHASE_END - 0.005) return walkToManifesto();
      const dissolveDuration = isMobile ? 1.0 : undefined;
      return triggerBridge(CONTINUE_PHASE_END, continueStateRef, HOLD_PHASE_END, () => {
        walkToManifesto();
      }, dissolveDuration, SOFT_IN);
    };
    // Inverso de "continue": desde el manifiesto (o desde la caminata / la
    // disolución en curso) vuelve a la sección del androide. Anima hasta
    // HOLD_PHASE_END y salta al instante a HERO_PHASE_END (el tramo HOLD es
    // una pausa con el androide congelado: mismo criterio que la ida, que lo
    // salta con skipToRaw).
    const triggerBackToHold = () => {
      const st = stRef.current;
      if (!st) return false;
      const from = st.progress;
      if (from <= HOLD_PHASE_END + 0.005) return false;
      const frac = (from - HOLD_PHASE_END) / (CAT_END_RAW - HOLD_PHASE_END);
      backStateRef.current = 'playing';
      continueStateRef.current = 'idle';
      forwardStateRef.current = 'done';
      rewindStateRef.current = 'idle';
      smoothScrollTo(st.start + (st.end - st.start) * HOLD_PHASE_END, {
        duration: Math.max(0.8, BACK_TO_HOLD_DURATION * frac),
        lock: true,
        force: true,
        easing: NATURAL_IN_OUT,
        onComplete: () => {
          if (backStateRef.current !== 'playing') return;
          backStateRef.current = 'idle';
          bridgeStateRef.current = 'done';
          continueStateRef.current = 'idle';
          smoothScrollTo(st.start + (st.end - st.start) * HERO_PHASE_END, { immediate: true, force: true });
          bridgeDoneAt = performance.now();
        },
      });
      return true;
    };
    triggerContinueRef.current = triggerContinue;

    // true si el gesto fue interceptado (y por lo tanto debe hacerse
    // preventDefault); false si debe dejarse pasar como scroll normal.
    const handleDownGesture = () => {
      // Volviendo del manifiesto al androide: bajar lo invierte (retoma "continue").
      if (backStateRef.current === 'playing') {
        triggerContinue();
        return true;
      }
      if (rewindStateRef.current === 'playing') {
        triggerAutoplay({ force: true }); // invierte el rebobinado en curso
        return true;
      }

      // Un solo scroll hacia abajo lleva directamente a la revelación del androide (pedido explícito).
      // Evita requerir un doble scroll o detenerse a mitad de camino en 0.55.
      if (scrollProgressRef.current < 0.985) {
        if (bridgeStateRef.current === 'playing') return true;
        if (bridgeStateRef.current === 'idle' && playHeroDescend()) {
          return true;
        }
        return true;
      }

      // Cooldown mínimo tras llegar al androide para no encadenar inercia accidental:
      if (performance.now() - bridgeDoneAt < 250) return true;

      // Un solo scroll hacia abajo desde el androide avanza directamente hacia el manifiesto (pedido explícito).
      if (stRef.current && continueStateRef.current === 'idle') {
        return triggerContinue();
      }
      return false;
    };

    const handleUpGesture = () => {
      if (forwardStateRef.current === 'playing') {
        triggerRewind({ force: true }); // invierte el autoplay en curso
        return true;
      }
      // Rebobinado manifiesto -> androide en curso: se absorbe (la inercia de
      // la rueda no debe encadenar el rebobinado hasta la portada).
      if (backStateRef.current === 'playing') return true;
      // "Continue" (disolución o caminata) en curso: se invierte de vuelta a la
      // sección del androide (antes rebobinaba de largo hasta la portada).
      if (continueStateRef.current === 'playing') {
        continueStateRef.current = 'idle';
        if (!triggerBackToHold()) triggerRewind({ force: true });
        return true;
      }
      // Cola de inercia del gesto que acaba de completar un puente.
      if (performance.now() - bridgeDoneAt < 600) return true;
      // Desde el manifiesto (fin del pin) o cualquier punto de la disolución/
      // caminata: primero se vuelve a la sección del androide; desde ahí, el
      // siguiente gesto rebobina a la portada como siempre.
      const stNow = stRef.current;
      if (stNow && stNow.progress > HOLD_PHASE_END + 0.005 && rewindStateRef.current === 'idle') {
        if (triggerBackToHold()) return true;
      }
      if (bridgeStateRef.current === 'playing') {
        // Interrumpe el puente en curso (fuerza el rebobinado, mismo
        // criterio que interrumpir el autoplay hacia adelante) y lo deja
        // reseteado para poder volver a dispararse.
        bridgeStateRef.current = 'idle';
        triggerRewind({ force: true });
        return true;
      }
      if (rewindStateRef.current !== 'idle') return false;
      triggerRewind();
      return true;
    };

    // REENTRADA DESDE ABAJO: al subir desde la sección siguiente se vuelve a
    // entrar al pin por su último cuadro (el manifiesto completo). El MISMO
    // gesto que cruza el borde se queda ahí (no encadena el rebobinado); recién
    // un gesto nuevo vuelve a la sección del androide. Mientras dura ese gesto
    // Lenis se detiene (stop) para que su inercia no siga empujando. Se detecta
    // por la POSICIÓN real (evento scroll: de debajo del pin a dentro), no por
    // la rueda: Lenis acumula el destino por delante del scroll real y, para
    // cuando llega un evento de rueda "adentro", el scroll ya puede ir mucho
    // más arriba.
    // El motor de scroll asistido (src/lib/assistedScroll.ts) toma el control desde el final de este pin.
    (window as any).__heroPinEnd = () => (stRef.current ? manifestoEndPx() : null);
    const manifestoEndPx = () => {
      const st = stRef.current;
      return st ? st.start + (st.end - st.start) * CAT_END_RAW : 0;
    };
    const isBelowPin = () => {
      const st = stRef.current;
      return !!st && window.scrollY >= st.end - 2;
    };
    let reentryHeld = false;
    let reentryTimer: number | undefined;
    let prevScrollY = window.scrollY;
    // Navegación del menú (scrollToSection dispara 'hero-unlock'): no se
    // intercepta el cruce durante su desplazamiento programático.
    let navJumpAt = -Infinity;
    let reentryReleasedAt = -Infinity;
    const releaseReentry = () => {
      reentryHeld = false;
      reentryReleasedAt = performance.now();
      bridgeDoneAt = performance.now();
      if (!lockedRef.current) unlockScroll();
    };
    const holdAtManifesto = () => {
      if (!reentryHeld) {
        reentryHeld = true;
        lockScroll();
        smoothScrollTo(manifestoEndPx(), { immediate: true, force: true });
      }
      window.clearTimeout(reentryTimer);
      reentryTimer = window.setTimeout(releaseReentry, 280);
    };

    const UP_THRESHOLD = 40;
    let upAccum = 0;
    let upAccumAt = -Infinity;
    const handleWheel = (e: WheelEvent) => {
      if (lockedRef.current) {
        // Bloqueado: la rueda no mueve la página; un intento hacia abajo cuenta
        // como interacción y dispara la reacción.
        e.preventDefault();
        if (e.deltaY > 0) descendRef.current();
        return;
      }
      // Sigue el mismo gesto (o su cola de inercia, hasta 500 ms después de
      // soltarlo): se prolonga la retención en el manifiesto.
      if (reentryHeld || (e.deltaY < 0 && performance.now() - reentryReleasedAt < 500)) {
        e.preventDefault();
        holdAtManifesto();
        return;
      }
      if (!stRef.current?.isActive) return;
      if (e.deltaY > 0) {
        upAccum = 0;
        if (handleDownGesture()) e.preventDefault();
      } else if (e.deltaY < 0) {
        // En el manifiesto (sin ningún puente en curso), un rebote mínimo de la
        // rueda/trackpad hacia arriba no debe disparar el rebobinado de ~4 s al
        // androide: se exige un empuje acumulado (UP_THRESHOLD px en ~150 ms).
        const st = stRef.current;
        const onManifesto =
          !!st &&
          st.progress > HOLD_PHASE_END + 0.005 &&
          forwardStateRef.current !== 'playing' &&
          continueStateRef.current !== 'playing' &&
          backStateRef.current !== 'playing';
        if (onManifesto) {
          const now = performance.now();
          if (now - upAccumAt > 150) upAccum = 0;
          upAccumAt = now;
          upAccum += e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerHeight : 1);
          if (upAccum > -UP_THRESHOLD) {
            e.preventDefault();
            return;
          }
          upAccum = 0;
        }
        if (handleUpGesture()) e.preventDefault();
      }
    };

    let touchStartY: number | null = null;
    let touchFromBelow = false;
    let touchReentryDone = false;
    const handleTouchStart = (e: TouchEvent) => {
      touchStartY = e.touches[0]?.clientY ?? null;
      touchFromBelow = isBelowPin();
      touchReentryDone = false;
    };
    const handleTouchMove = (e: TouchEvent) => {
      if (lockedRef.current) {
        if (e.cancelable) e.preventDefault();
        if (touchStartY !== null && touchStartY - (e.touches[0]?.clientY ?? touchStartY) > 8) descendRef.current();
        return;
      }
      if (!stRef.current?.isActive || touchStartY === null) return;
      const dy = touchStartY - (e.touches[0]?.clientY ?? touchStartY);
      if (dy < -8 && touchFromBelow && stRef.current.progress > CONTINUE_PHASE_END) {
        // mismo criterio que la rueda: el deslizamiento que vuelve a entrar se
        // queda en el manifiesto
        if (e.cancelable) e.preventDefault();
        if (!touchReentryDone) {
          touchReentryDone = true;
          smoothScrollTo(manifestoEndPx(), { immediate: true, force: true });
          bridgeDoneAt = performance.now();
        }
        return;
      }
      if (dy > 8) {
        if (handleDownGesture() && e.cancelable) e.preventDefault();
      } else if (dy < -8) {
        if (handleUpGesture() && e.cancelable) e.preventDefault();
      }
    };

    // Red de seguridad: si el scroll se detiene en un punto intermedio por
    // cualquier otra vía (arrastrar la barra, teclado, trackpad que suelta a
    // medias), se completa solo hasta la pose estable más cercana — nunca
    // queda el video congelado a mitad de un movimiento. Poses estables:
    // inicio (0), asentada (AUTOPLAY_TARGET), androide (HERO_PHASE_END) y
    // el final de la secuencia (0.999). La espera es de 260 ms sin eventos
    // de scroll, para no pelear con el scroll asistido (esos ya marcan su
    // estado 'playing' y se saltan).
    let settleTimer: number | undefined;
    const settleToStablePose = () => {
      const st = stRef.current;
      if (!st || !st.isActive || reentryHeld || lockedRef.current || smilePlayingRef.current) return;
      if (
        forwardStateRef.current === 'playing' ||
        rewindStateRef.current === 'playing' ||
        bridgeStateRef.current === 'playing' ||
        continueStateRef.current === 'playing' ||
        backStateRef.current === 'playing'
      ) {
        return;
      }
      const raw = st.progress;
      const hp = raw / HERO_PHASE_END;
      if (hp < AUTOPLAY_TARGET_PROGRESS - 0.01) {
        // A mitad de la entrada del avatar: completar (o volver al inicio si
        // apenas arrancó y nunca se llegó a la pose asentada).
        triggerAutoplay({ force: true });
      } else if (hp > AUTOPLAY_TARGET_PROGRESS + 0.01 && hp < 0.985) {
        // A mitad de la rotación hacia el androide.
        if (hp >= 0.8) triggerBridge(HERO_PHASE_END, bridgeStateRef);
        else triggerRewind({ force: true });
      } else if (raw > HOLD_PHASE_END + 0.01 && raw < CAT_END_RAW - 0.002) {
        // A mitad de la disolución o de la caminata sobre el manifiesto (p. ej.
        // la inercia al volver a subir desde la sección siguiente): se completa
        // hasta el manifiesto final.
        triggerContinue();
      }
    };
    const handleScrollSettle = () => {
      // Reentrada desde abajo (ver holdAtManifesto): el scroll real cruzó el
      // final del pin hacia arriba sin que lo moviera ningún puente.
      const y = window.scrollY;
      const stX = stRef.current;
      if (
        stX &&
        !reentryHeld &&
        !lockedRef.current &&
        !(window as any).__assistedAnimating?.() &&
        prevScrollY >= stX.end - 2 &&
        y < stX.end - 2 &&
        performance.now() - navJumpAt > 2500 &&
        forwardStateRef.current !== 'playing' &&
        rewindStateRef.current !== 'playing' &&
        bridgeStateRef.current !== 'playing' &&
        continueStateRef.current !== 'playing' &&
        backStateRef.current !== 'playing'
      ) {
        prevScrollY = manifestoEndPx();
        holdAtManifesto();
        return;
      }
      prevScrollY = y;
      if (lockedRef.current) {
        // Arrastrar la barra de scroll o cualquier otra vía: se devuelve a la pose.
        if (Math.abs(window.scrollY - settledPx()) > 2) smoothScrollTo(settledPx(), { immediate: true, force: true });
        return;
      }
      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(settleToStablePose, 260);
    };

    window.addEventListener('scroll', handleScrollSettle, { passive: true });
    window.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    return () => {
      window.clearTimeout(settleTimer);
      window.clearTimeout(reentryTimer);
      window.clearInterval(initTimer);
      window.removeEventListener('hero-unlock', onHeroUnlock);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', handleScrollSettle);
      window.removeEventListener('wheel', handleWheel);
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      setCoverLockClass(false);
    };
  }, []);

  // Ocultar rápido en vez de reverse(): reportado que el texto tardaba mucho
  // en desaparecer al subir el scroll — con .reverse() el tipeado del badge
  // (~3s) se reproducía completo hacia atrás. pause(0, true) salta la
  // timeline a su inicio (oculto) al instante, con suppressEvents=true para
  // no disparar de nuevo los .call() de la cadena al saltar hacia atrás; la
  // opacidad del contenedor se anima aparte, rápido, para que no sea un
  // corte seco. show() usa play() SIN posición (no play(0)): este helper se
  // llama en cada tick de scroll mientras el umbral siga cruzado, y play(0)
  // reiniciaría el tipeado desde cero en cada tick.
  const EXIT_DURATION = 0.22;
  // Cuánto más rápido corre TODA la cadena de entrada (nombre -> ubicación ->
  // badge -> bios -> íconos -> "Ver más") a partir de la segunda vez que se
  // reproduce — pedido explícito ("deben aparecer más rápido... salen muy
  // lento" al volver a Perfil después de retroceder el scroll). timeScale en
  // vez de acortar las duraciones: mismo diseño visual (tipeado, wipes,
  // stagger de íconos), solo reproducido más rápido.
  const CHAIN_REPLAY_SPEED = 4;
  const showTypedGroup = (containerEl: HTMLElement | null, tl: gsap.core.Timeline | null) => {
    // Si el tipeado YA está completo (tl en progress 1 — ver hideTypedGroup
    // con resetTyping:false, usado al ocultar hacia la disolución) no hay
    // nada que "tipear" de nuevo: alcanza con un fade de opacidad del
    // contenedor. Antes esto era SIEMPRE un gsap.set() instantáneo (salto
    // seco), necesario mientras el tipeado SÍ está por correr (el contenedor
    // debe estar opaco desde el primer frame para que se vea el clip-path
    // revelándose) — pero al volver del androide al Hero, ese mismo salto
    // instantáneo se veía como un parpadeo y encima el texto se re-tipeaba
    // entero sin necesidad (reportado explícito ambos: "leve parpadeo y una
    // recarga del texto innecesaria").
    const alreadyTyped = !!tl && tl.progress() >= 1;
    if (containerEl) {
      // killTweensOf: por si queda un tween de fade-a-0 todavía corriendo
      // (ver dissolveExitFiredRef) — sin esto, un tween viejo no cancelado
      // seguía animando hacia 0 por su cuenta y terminaba "ganando".
      gsap.killTweensOf(containerEl);
      if (alreadyTyped) {
        if (parseFloat(getComputedStyle(containerEl).opacity) < 0.99) {
          gsap.to(containerEl, { opacity: 1, duration: 0.35, ease: 'power2.out' });
        }
      } else {
        gsap.set(containerEl, { opacity: 1 });
      }
    }
    tl?.play();
  };
  const hideTypedGroup = (
    containerEl: HTMLElement | null,
    lineEls: (HTMLElement | null)[],
    tl: gsap.core.Timeline | null,
    duration: number = EXIT_DURATION,
    delay: number = 0,
    // false SOLO para el paso 4 de la disolución (ver más abajo): ahí el
    // texto no se está "abandonando" (como cuando se sube hasta la cortina
    // del inicio), se está yendo temporalmente detrás del androide — debe
    // poder reaparecer con un simple fade, sin re-tipear. Con el valor por
    // defecto (true) el comportamiento es idéntico al de siempre.
    resetTyping: boolean = true
  ) => {
    // pause(0,true) es SOLO contable interno del timeline (lo deja listo
    // para un futuro play() sin re-disparar la cadena) — no cambia nada
    // visible por sí solo, así que va INMEDIATO, sin esperar el fade. Si se
    // difiere (como se hizo en un intento anterior) y el usuario revierte el
    // scroll ANTES de que el fade llegue a completar, el timeline se queda
    // atascado a mitad de tipear y un play() posterior no hace nada — la
    // cadena entera se rompe. Reportado explícito ("se queda atascado").
    if (resetTyping) tl?.pause(0, true);
    if (containerEl) {
      gsap.killTweensOf(containerEl);
      gsap.to(containerEl, {
        opacity: 0,
        duration,
        delay,
        ease: 'power1.in',
        // El clip-path (lo que realmente "tipea hacia afuera" el texto,
        // carácter por carácter) SÍ se difiere hasta que el fade de opacidad
        // termine — antes se reseteaba al instante sin importar la duración
        // del fade, cortando el texto de golpe vía clip aunque la opacidad
        // siguiera bajando de a poco por detrás. Reportado explícito
        // ("desaparece de golpe"). Con resetTyping:false no se toca el
        // clip-path en absoluto: el texto queda tipeado por detrás del fade,
        // listo para reaparecer con solo un fade (ver showTypedGroup).
        onComplete: resetTyping ? () => gsap.set(lineEls, { clipPath: 'inset(0% 100% 0% 0%)' }) : undefined,
      });
    } else if (resetTyping) {
      gsap.set(lineEls, { clipPath: 'inset(0% 100% 0% 0%)' });
    }
  };
  const hideSimple = (
    el: HTMLElement | null,
    tl: gsap.core.Timeline | null,
    duration: number = EXIT_DURATION,
    delay: number = 0
  ) => {
    if (el) {
      gsap.killTweensOf(el);
      gsap.to(el, {
        opacity: 0,
        y: -10,
        duration,
        delay,
        ease: 'power2.in',
        onComplete: () => {
          tl?.pause(0, true);
        },
      });
    } else {
      tl?.pause(0, true);
    }
  };

  const ensureShown = (el: HTMLElement | null) => {
    if (!el || gsap.isTweening(el)) return;
    if (parseFloat(getComputedStyle(el).opacity) < 0.99) {
      gsap.to(el, { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out' });
    }
  };

  // Cada elemento se dispara (play) o se oculta rápido al cruzar su umbral.
  // Todos los umbrales (SCREENSAVER_HIDE_AT, NAME_IN_AT, etc.) están en
  // escala heroProgress (0-1 "solo Hero"), no en el scrollProgress raw del
  // pin combinado — por eso se usa heroProgress acá, aunque el efecto siga
  // dependiendo de scrollProgress (heroProgress es derivado de ese mismo
  // valor, así que re-ejecutar en cada tick de scrollProgress es correcto).
  useEffect(() => {
    // El nombre es la ÚNICA cabeza de la cadena: arranca por umbral de
    // scroll en ambas direcciones. Todo lo demás (ubicación, subtítulo,
    // bios, íconos) avanza únicamente por el callback de la timeline
    // anterior — acá solo se les pide OCULTARSE si el scroll sube lo
    // suficiente, para que no queden "pegados" visibles si el usuario
    // retrocede a mitad de la cadena.
    heroProgress > SCREENSAVER_HIDE_AT ? screensaverTl.current?.play() : screensaverTl.current?.reverse();

    // < HERO_DISSOLVE_START a propósito: sin este límite superior, este
    // "show" corría en TODOS los ticks durante la disolución también (sigue
    // siendo heroProgress > NAME_IN_AT ahí), y gsap.set/killTweensOf peleaban
    // tick a tick contra el fundito de salida de más abajo, evitando que
    // llegara a completarse — ver el comentario de dissolveExitFiredRef.
    // Bug real encontrado: enganchar el timeScale de "repetición más rápida"
    // a este umbral (con una bandera de "flanco de subida") reaccionaba
    // también al REBOBINAR — al bajar heroProgress de vuelta a este mismo
    // rango DESDE la disolución (no desde abajo), se interpretaba como una
    // nueva entrada y reiniciaba TODA la cadena a mitad de un rebobinado
    // todavía en curso, que un instante después la interrumpía de nuevo al
    // seguir bajando — dejando la cadena a medio disparar y el resto del
    // texto oculto para siempre. El timeScale de repetición ahora se fija
    // en triggerAutoplay (el único punto real de "arrancar de nuevo"), y
    // acá solo se muestra/oculta según el umbral, sin lógica de flanco.
    // Nombre y badge (subtítulo) comparten el mismo umbral y disparador:
    // deben tipear EN PARALELO, "a la vez" — pedido explícito.
    if (heroProgress > NAME_IN_AT && heroProgress < HERO_DISSOLVE_START) {
      showTypedGroup(nameRef.current, nameTl.current);
      showTypedGroup(badgeRef.current, badgeTl.current);
    } else if (heroProgress <= NAME_IN_AT) {
      hideTypedGroup(nameRef.current, [nameLine1Ref.current, nameLine2Ref.current], nameTl.current);
      hideTypedGroup(badgeRef.current, [badgeLine1Ref.current, badgeLine2Ref.current], badgeTl.current);
    }

    const inVisibleRange = heroProgress < HERO_DISSOLVE_START;
    // ensureShown SOLO debe actuar como red de seguridad para un
    // rebobinado/replay ya en curso (hasReachedSettledRef true — se llegó a
    // la pose asentada al menos una vez), NUNCA durante la PRIMERA
    // reproducción de la cadena hacia adelante. Motivo (bug real
    // encontrado): heroProgress avanza LINEAL con el scroll (AUTOPLAY_
    // EASING) mientras que la cadena de callbacks avanza en tiempo real fijo
    // (tipeado + 0.3s ubicación + 0.6s bios + stagger de íconos, ~3.2s en
    // total) — con AUTOPLAY_DURATION=4.2s de scroll total hasta 0.55, cada
    // umbral (LOCATION_IN_AT, BIO_IN_AT, ICONS_IN_AT) se cruza ANTES de que
    // la cadena real llegue a ese paso. Sin este gate, ensureShown forzaba
    // opacity:1 de más adelantado (ej. ubicación visible desde t≈0.76s) y
    // cuando el paso real de la cadena por fin disparaba su gsap.fromTo()
    // (ej. a t≈1.44s), el "from" de esa tween resetaba la opacidad a 0 de
    // golpe antes de volver a animarla a 1 — un parpadeo/rebote visible,
    // sincronizado con el avance del video del avatar (reportado explícito:
    // "parpadean o rebotan... con cambios de fotogramas del avatar").
    const canSelfHeal = hasReachedSettledRef.current;

    if (heroProgress <= LOCATION_IN_AT) {
      hideSimple(locationRef.current, locationTl.current);
    } else if (inVisibleRange && canSelfHeal) {
      ensureShown(locationRef.current);
    }
    if (heroProgress <= BIO_IN_AT) {
      hideSimple(bioRef.current, bioTl.current);
      hideSimple(bioRightRef.current, bioRightTl.current);
    } else if (inVisibleRange && canSelfHeal) {
      ensureShown(bioRef.current);
      ensureShown(bioRightRef.current);
    }
    if (heroProgress <= ICONS_IN_AT) {
      hideSimple(iconsRef.current, iconsTl.current);
      hideSimple(seeMoreRef.current, seeMoreTl.current);
    } else if (inVisibleRange && canSelfHeal) {
      ensureShown(iconsRef.current);
      ensureShown(seeMoreRef.current);
      if (iconsRef.current) {
        Array.from(iconsRef.current.children).forEach((child) => ensureShown(child as HTMLElement));
      }
    }

    // Fase de salida: TODO el texto debe desaparecer para dejar la pantalla
    // vacía (fondo + partículas convirtiéndose en la luciérnaga, ver
    // MatrixFieldLayer.tsx) — pedido explícito, antes el texto se quedaba
    // visible durante toda la disolución. Va DESPUÉS de los checks de arriba
    // a propósito: son los que lo vuelven a mostrar si heroProgress cae por
    // debajo de su propio umbral, y esto necesita tener la última palabra
    // mientras estemos en la fase de salida. Usa DISSOLVE_EXIT_DURATION (no
    // EXIT_DURATION) y, además, EN SECUENCIA — pedido explícito y su orden
    // exacto: "los botones primero uno a uno, luego los textos, luego la
    // ubicación, y por último título y subtítulo" (nombre y badge juntos, al
    // final, no uno antes que el otro). dissolveExitFiredRef asegura que se
    // dispare UNA sola vez por cruce — si se recreara en cada tick de
    // scroll, ni siquiera llegaría a completarse antes de ser pisado.
    if (heroProgress >= HERO_DISSOLVE_START) {
      if (!dissolveExitFiredRef.current) {
        dissolveExitFiredRef.current = true;
        const step = DISSOLVE_EXIT_STAGGER;

        // 1) Botones sociales, uno por uno (no el grupo entero de una vez).
        // OJO: NO se pausa iconsTl acá (a diferencia de hideSimple) — cada
        // botón ya se apaga con su propia tween de opacidad (abajo). Pausar
        // el timeline en 0 reseteaba también su x/scale internos (60px/1.7,
        // el "entra grande desde la derecha" del stagger), así que al volver
        // a aparecer con solo un fade de opacidad (ensureShown) los botones
        // se veían corridos/agrandados en vez de en su posición real — bug
        // real encontrado al corregir el "recarga innecesaria" del texto.
        const iconChildren = iconsRef.current ? (Array.from(iconsRef.current.children) as HTMLElement[]) : [];
        iconChildren.forEach((child, i) => {
          gsap.killTweensOf(child);
          gsap.to(child, { opacity: 0, duration: DISSOLVE_EXIT_DURATION, delay: i * DISSOLVE_EXIT_ICON_STAGGER, ease: 'power1.in' });
        });
        const afterIcons = Math.max(0, iconChildren.length - 1) * DISSOLVE_EXIT_ICON_STAGGER + step;

        // 2) "Los textos" — las dos bios.
        hideSimple(bioRef.current, bioTl.current, DISSOLVE_EXIT_DURATION, afterIcons);
        hideSimple(bioRightRef.current, bioRightTl.current, DISSOLVE_EXIT_DURATION, afterIcons);
        const afterBios = afterIcons + step;

        // 3) Ubicación.
        hideSimple(locationRef.current, locationTl.current, DISSOLVE_EXIT_DURATION, afterBios);
        const afterLocation = afterBios + step;

        // 4) Título (nombre) y subtítulo (badge) — JUNTOS, al final.
        // resetTyping:false — acá el texto NO se está abandonando (como al
        // subir hasta la cortina del inicio), se está yendo detrás del
        // androide temporalmente: debe reaparecer con un fade simple, sin
        // re-tipear entero (ver showTypedGroup/hideTypedGroup arriba).
        hideTypedGroup(nameRef.current, [nameLine1Ref.current, nameLine2Ref.current], nameTl.current, DISSOLVE_EXIT_DURATION, afterLocation, false);
        hideTypedGroup(badgeRef.current, [badgeLine1Ref.current, badgeLine2Ref.current], badgeTl.current, DISSOLVE_EXIT_DURATION, afterLocation, false);
      }
    } else {
      dissolveExitFiredRef.current = false;
    }

    setIconsInteractive(heroProgress > ICONS_IN_AT + 0.05 && heroProgress < HERO_DISSOLVE_START);

    // Si el usuario sube de nuevo hasta cerca del inicio tras haber
    // completado (o abandonado a mitad) el scroll asistido, se rearma para
    // que un próximo gesto hacia abajo dispare la secuencia otra vez, en vez
    // de quedar "gastado" para el resto de la visita.
    if (heroProgress <= AUTOPLAY_RESET_AT && forwardStateRef.current === 'done') {
      forwardStateRef.current = 'idle';
    }

    // Simétrico al reset de forwardStateRef: si el usuario vuelve a la pose
    // asentada (o antes) tras haber completado/abandonado el primer puente
    // (hacia la revelación del androide), se rearma para que el próximo
    // scroll hacia abajo lo dispare de nuevo en vez de quedar "gastado".
    // SOLO si ya terminó ('done'), nunca mientras está 'playing': al arrancar
    // el puente desde la pose asentada, heroProgress todavía es ~0.55 (<=
    // umbral) en los primeros ticks, así que resetear también 'playing'
    // borraba el estado en pleno recorrido y onComplete ya no lo marcaba
    // 'done' — el puente quedaba 'idle' al llegar al androide y el siguiente
    // gesto (hacia el gato) se descartaba por "ya estás en HERO_PHASE_END".
    if (heroProgress <= AUTOPLAY_TARGET_PROGRESS + REWIND_SETTLED_BAND && bridgeStateRef.current === 'done') {
      bridgeStateRef.current = 'idle';
    }
    // Mismo criterio para el SEGUNDO puente (desde "Continuar" al final de
    // HOLD): si se vuelve a entrar o retroceder antes de la sección HOLD, se
    // rearma para el próximo intento.
    // Solo 'done' (no 'playing'): el salto inicial del puente deja el scroll
    // EXACTAMENTE en HOLD_PHASE_END, y resetear 'playing' acá lo borraba (misma
    // carrera que con bridgeStateRef).
    if (scrollProgress <= HOLD_PHASE_END && continueStateRef.current === 'done') {
      continueStateRef.current = 'idle';
    }
  }, [scrollProgress]);

  // El efecto de mouse (cursor personalizado + campo de circuitos + botones
  // magnéticos) solo tiene sentido en el tramo "asentado": después de que el
  // texto ya se reveló y antes de que arranque la salida (ahí el sujeto ya
  // no está nítido en pantalla). Pedido explícito de la usuaria.
  const mouseFxActive = heroProgress > NAME_IN_AT && heroProgress < HERO_DISSOLVE_START;

  // Crossfade continuo rosa (Hero) -> morado (HOLD) de las partículas de
  // fondo, atado al scroll — pedido explícito ("que las rosadas se
  // conviertan en las moradas", "que las partículas no desaparecieran
  // nunca con el scroll"). Antes cada sección montaba/activaba su propia
  // instancia de MatrixFieldLayer con un corte binario (activa/inactiva) en
  // puntos distintos, dejando un tramo en el medio (durante la disolución)
  // donde NINGUNA de las dos estaba activa — las partículas desaparecían.
  // Ahora ambas instancias están SIEMPRE montadas y activas en todo este
  // tramo (ver particlesActive), y solo su opacidad se cruza suavemente.
  const HOLD_COLOR_MIX_SPAN = 0.15;
  const holdColorMix = Math.min(1, Math.max(0, (heroProgress - HERO_DISSOLVE_START) / HOLD_COLOR_MIX_SPAN));
  // > NAME_IN_AT: mismo arranque que mouseFxActive. < 0.99 de holdProgress:
  // mismo apagado que tenía antes la instancia morada (ya entrando al
  // tramo del gato) — no se toca ese comportamiento, solo se cierra el
  // hueco del medio.
  const particlesActive = heroProgress > NAME_IN_AT && holdProgress < 0.99;

  // Progreso (0-1) de la revelación del título/párrafo de HOLD, mismo
  // criterio que ya usaba la opacidad simple (holdAutoProgress cruzando su
  // propio umbral) — ahora también maneja el "decodificado" del título
  // (ScrambleLine) y el wipe del párrafo, no solo opacidad.
  const holdTitleRevealProgress = Math.min(1, Math.max(0, (holdAutoProgress - HOLD_TITLE_IN_AT) / HOLD_FADE_SPAN));
  const holdStatementRevealProgress = Math.min(
    1,
    Math.max(0, (holdAutoProgress - HOLD_STATEMENT_IN_AT) / HOLD_FADE_SPAN)
  );
  // Holograma + tarjeta académica: aparecen como su propio "beat" después
  // del párrafo, mismo criterio de umbral que el resto de HOLD.
  const holdHologramRevealProgress = Math.min(
    1,
    Math.max(0, (holdAutoProgress - HOLD_HOLOGRAM_IN_AT) / HOLD_FADE_SPAN)
  );
  // Decodificado del título: dedicado al ENTRAR (holdTitleScrambleT). Si ya
  // se decodificó antes y se está entrando de nuevo, se muestra resuelto de
  // una (sin re-tipear) — mismo criterio ya acordado para el nombre del
  // Hero. La salida (dejar de verse) la maneja holdLeaveFade, multiplicado
  // en la opacidad final — ver comentario grande junto a esa constante.
  const holdTitleScrambleProgress = holdTitleScrambleDoneRef.current ? 1 : holdTitleScrambleT;

  // androidProgress ya se calculó arriba (junto con heroProgress/catProgress
  // y las demás fases) — controla el `progress` del clip generado con IA que
  // hace toda la transformación rostro -> androide -> partículas ->
  // luciérnaga, reemplazando la coreografía de partículas hecha a mano que
  // había antes acá (descartada por completo, pedido explícito).
  // El clip del androide es OPACO y cubre por completo al del gato (montado
  // debajo, z-order) durante toda su propia reproducción, así que no hace
  // falta ningún manejo especial de opacidad del lado del gato — el
  // problema de "se ve la luciérnaga de fondo antes de tiempo" era
  // específico del sistema de partículas viejo, no aplica a un video real.
  // Una vez la caminata del gato arranca de verdad (catProgress > 0), el
  // clip del androide ya cumplió su función y debe desaparecer casi de
  // inmediato para dejar ver el video del gato ya en movimiento debajo.
  const androidLayerOpacity = 1 - Math.min(1, catProgress / 0.04);
  const androidFrameF = androidProgress * (ANDROID_FRAME_COUNT - 1);
  // FORMACIÓN (estilo landonorris.com): el texto se arma A LA PAR del androide — empieza
  // cuando el casco neón ya cubre la cara y termina justo cuando queda de frente. Al
  // rebobinar se desarma igual (sigue el mismo progreso).
  const eduFlow = Math.min(1, Math.max(0, (androidFrameF - 95) / (ANDROID_HOLD_FRAME_INDEX - 95)));
  const eduStep = (i: number, n: number, span = 0.42) => {
    const start = n > 1 ? (i / (n - 1)) * (1 - span) : 0;
    const x = Math.min(1, Math.max(0, (eduFlow - start) / span));
    return x * x * (3 - 2 * x);
  };
  // invisible del todo hasta que arranca el revelado (si no, las palabras "apagadas" del
  // párrafo se veían tenues sobre la portada)
  const eduVis = holdExitOpacity * Math.min(1, eduFlow / 0.06);
  // LOS BOTONES DE REDES SE CONVIERTEN EN LA FICHA: con el avance de la transformación
  // los tres círculos del dock vuelan hasta la esquina de la ficha (A) y desde ahí la ficha
  // se abre (B). Al continuar (o al subir) el camino se recorre al revés.
  // Arranca APENAS empieza el scroll (pedido explícito): el primer 15 % corre mientras se
  // van las letras de la portada y el resto acompaña TODA la transformación (cuadros 0-187).
  const morphPre = Math.min(1, Math.max(0, (heroProgress - (AUTOPLAY_TARGET_PROGRESS + 0.004)) / (HERO_DISSOLVE_START - AUTOPLAY_TARGET_PROGRESS)));
  const morphVideo = Math.min(1, Math.max(0, androidFrameF / ANDROID_HOLD_FRAME_INDEX));
  const cardFlow = (0.15 * morphPre + 0.85 * morphVideo) * holdExitOpacity;
  const morphB = Math.min(1, Math.max(0, (cardFlow - 0.26) / 0.74));
  const cardStep = (i: number, n: number, span = 0.42) => {
    const start = n > 1 ? (i / (n - 1)) * (1 - span) : 0;
    const x = Math.min(1, Math.max(0, (morphB - start) / span));
    return x * x * (3 - 2 * x);
  };
  // Texto de la portada ("Ingeniería, diseño & desarrollo web"): paralaje + magnetismo con
  // el mouse. Va por rAF sobre el ref (sin re-render); tagTpRef guarda cuánto se derritió
  // (tp) para apagar la reacción mientras se funde.
  const tagMouseRef = useRef<HTMLDivElement | null>(null);
  // centro en pantalla de la mancha del texto (para que la mancha viajera arranque ahí)
  const tagBlobRef = useRef<{ x: number; y: number } | null>(null);
  if (cardFlow <= 0.088) tagBlobRef.current = null;
  useEffect(() => {
    const resetOrigin = () => { tagBlobRef.current = null; };
    window.addEventListener('resize', resetOrigin);
    return () => window.removeEventListener('resize', resetOrigin);
  }, []);
  const tagTpRef = useRef(0);
  const tagKickRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    let mx = window.innerWidth / 2, my = window.innerHeight / 2, hasMouse = false;
    let cx = 0, cy = 0, crx = 0, cry = 0, cs = 1;
    let raf = 0;
    const tick = () => {
      raf = 0;
      const el = tagMouseRef.current;
      if (!el) { cx = cy = crx = cry = 0; cs = 1; return; }
      const t = Math.min(1, Math.max(0, tagTpRef.current / 0.15));
      const w = hasMouse ? 1 - t * t * (3 - 2 * t) : 0; // se apaga al derretirse
      const W = window.innerWidth || 1, H = window.innerHeight || 1;
      const nx = (mx / W) * 2 - 1, ny = (my / H) * 2 - 1;
      // paralaje suave (máx ~10 px) + inclinación 3D (~4°)
      let tx = nx * 10, ty = ny * 6;
      const rx = -ny * 4, ry = nx * 4;
      // magnetismo: si el cursor está cerca, las letras se acercan un poco
      const r = el.getBoundingClientRect();
      const ex = r.left + r.width / 2 - cx, ey = r.top + r.height / 2 - cy;
      const dx = mx - ex, dy = my - ey;
      const d = Math.hypot(dx, dy);
      const R = Math.max(220, r.width * 0.75);
      const pull = d < R ? 1 - d / R : 0;
      const p = pull * pull * (3 - 2 * pull);
      tx += (dx / (d || 1)) * 12 * p;
      ty += (dy / (d || 1)) * 12 * p;
      const s = 1 + 0.035 * p;
      const k = 0.12;
      cx += (tx * w - cx) * k; cy += (ty * w - cy) * k;
      crx += (rx * w - crx) * k; cry += (ry * w - cry) * k;
      cs += ((1 + (s - 1) * w) - cs) * k;
      el.style.transform = `perspective(700px) translate3d(${cx.toFixed(2)}px, ${cy.toFixed(2)}px, 0) rotateX(${crx.toFixed(2)}deg) rotateY(${cry.toFixed(2)}deg) scale(${cs.toFixed(4)})`;
      const moving = Math.abs(tx * w - cx) + Math.abs(ty * w - cy) + Math.abs(rx * w - crx) + Math.abs(ry * w - cry) + Math.abs(cs - (1 + (s - 1) * w)) * 100 > 0.02;
      if (moving) raf = requestAnimationFrame(tick);
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(tick); };
    const onMove = (e: MouseEvent) => { mx = e.clientX; my = e.clientY; hasMouse = true; kick(); };
    const onLeave = () => { hasMouse = false; kick(); };
    tagKickRef.current = kick;
    window.addEventListener('mousemove', onMove, { passive: true });
    document.addEventListener('mouseleave', onLeave);
    return () => {
      tagKickRef.current = null;
      window.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseleave', onLeave);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
  const eduCardRef = useRef<HTMLDivElement | null>(null);
  // foco de las piezas 3D de IA desde el texto (hover en etiquetas / en "IA")
  const aiFocusRef = useRef<AIFocus>({ claude: 0, gpt: 0, gemini: 0 });
  // Imágenes de la ficha (se monta recién al bajar de la portada): se descargan y
  // decodifican durante la pantalla de carga, no en pleno paso al androide.
  useEffect(() => registerWarmup('hero-card-images', () => Promise.all([warmImage('/cards/unexpo-art.webp'), warmImage('/logos/unexpo.webp')]), 0.5), []);
  // Logos 3D flotantes de la zona IA: SOLO en escritorio (en móvil se retiraron
  // por pedido explícito; en escritorio se mantienen).
  const [aiFloatersOn, setAiFloatersOn] = useState(
    () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(min-width: 1024px)').matches,
  );
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia('(min-width: 1024px)');
    const on = () => setAiFloatersOn(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  const [eduCardH, setEduCardH] = useState(480);
  useEffect(() => {
    const el = eduCardRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setEduCardH(el.offsetHeight || 480));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // avisa al dock fijo (SocialDock) que sus botones están "convertidos" en la ficha.
  // También ocultos desde la disolución en adelante: reaparecen junto con el nombre
  // cuando se muestra la barra superior (SocialDock: oculto = morph && !arriba), con
  // un único fundido y ya arriba a la derecha (pedido explícito).
  const dockMorphOn = cardFlow > 0.001 || continueProgress > 0;
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('dock-morph', { detail: dockMorphOn }));
  }, [dockMorphOn]);
  useEffect(() => () => {
    window.dispatchEvent(new CustomEvent('dock-morph', { detail: false }));
  }, []);
  // 0 -> 1: el escenario pasa del vacío violeta del androide al azul noche del sitio
  // (+ suelo cian/magenta) mientras el androide se disuelve; con el gato ya es 1.
  const stageInk = catProgress > 0 ? 1 : (() => {
    const x = Math.min(1, Math.max(0, (androidProgress - 0.78) / 0.2));
    return x * x * (3 - 2 * x);
  })();

  const androidBgMorph = (() => {
    // el fondo sigue NEGRO (como la portada) hasta que ella ya gira; recién ahí se tiñe
    const x = Math.min(1, Math.max(0, (androidFrameF - 32) / 54));
    return x * x * (3 - 2 * x);
  })();

  // 0 -> 1: el manifiesto aparece DETRÁS de las partículas del androide. Empieza
  // cuando la disolución ya cubre (cuadro ~MANIFESTO_ENTER_FROM_FRAME del clip) y
  // queda completo justo al final del clip, que es el inicio de la caminata.
  const manifestoEnter = catProgress > 0 ? 1 : (() => {
    const x = Math.min(1, Math.max(0, (androidFrameF - MANIFESTO_ENTER_FROM_FRAME) / (ANDROID_FRAME_COUNT - 1 - MANIFESTO_ENTER_FROM_FRAME)));
    return x * x * (3 - 2 * x);
  })();


  // Tilt de proximidad hacia el cursor para los bloques de texto — pedido
  // explícito: además de los botones sociales (que ya se atraían al
  // cursor), el grupo nombre+ubicación (animados EN CONJUNTO, como un solo
  // bloque), el subtítulo y las dos bios deben reaccionar también.
  useProximityTilt(nameLocationGroupRef, mouseFxActive);
  useProximityTilt(badgeRef, mouseFxActive);
  useProximityTilt(bioRef, mouseFxActive);
  useProximityTilt(bioRightRef, mouseFxActive);
  useProximityTilt(seeMoreRef, mouseFxActive);

  return (
    <div id="hero" ref={containerRef} className="w-full relative z-20">
      <style>{`
        @keyframes hero-card-reveal { from { opacity: 0; } }
        @media (prefers-reduced-motion: no-preference) {
          .hero-card-reveal { animation: hero-card-reveal 300ms ease-out both; }
          .hero-card-outline { transition: opacity 300ms ease-out; }
        }
      `}</style>
      {/* Contenedor Fijo a Pantalla Completa.
          bg-cyber-dark explícito: es una capa opaca de respaldo. Si el pin
          de GSAP produce un "tear" de composición de un frame (la línea de
          ruido reportada), esto garantiza que lo que se asome detrás sea
          color sólido del tema y no la textura de scanlines del fondo
          ambiental de App.tsx (que está fixed detrás de todo el sitio). */}
      {/* transform: translateZ(0) fuerza a que este contenedor viva en su
          propia capa de composición de forma permanente. Sin esto, Chrome
          puede promover/despromover la capa justo en el instante en que
          GSAP suelta el pin, produciendo un "seam" de un frame (la franja
          de ruido horizontal reportada) porque el compositor reconstruye el
          layer exactamente ahí. */}
      <div className="h-[100dvh] w-full relative bg-cyber-dark" style={{ transform: 'translateZ(0)', backfaceVisibility: 'hidden' }}>

        {/* Secuencia del gato: MONTADA PRIMERO (queda detrás en el stacking
            de este mismo z-0, por orden de DOM) del clip del androide y del
            avatar del Hero, desde el principio — no una sección/pin aparte
            (ver HERO_PHASE_END) — así el clip ya está cargado/decodificado
            sin salto de carga. Opacidad 1 siempre: el clip del androide
            (montado encima) es opaco y la cubre por completo mientras dura,
            así que no hace falta ningún manejo de opacidad de este lado. */}
        <div className="absolute inset-0 z-0">
          {/* ESCENARIO: fondo propio y continuo detrás de toda la secuencia recortada. */}
          <HeroBackdrop opacity={1} />
          {/* vacío violeta oscuro del androide (aparece mientras ella gira) */}
          <div
            className="absolute inset-0"
            style={{
              opacity: 0 * androidBgMorph * (1 - stageInk),
              background:
                'radial-gradient(40% 55% at 50% 40%, rgba(150,70,255,0.07) 0%, rgba(150,70,255,0) 100%), linear-gradient(100deg, #0d0413 0%, #130a19 45%, #17131f 100%)',
            }}
          />
          {/* azul noche del sitio + suelo cian/magenta (gato y final del androide) */}
          <div
            className="absolute inset-0"
            style={{
              opacity: stageInk,
              background:
                'radial-gradient(70% 16% at 50% 76%, rgba(12,219,242,0.16) 0%, rgba(242,48,210,0.10) 55%, rgba(6,13,23,0) 100%), radial-gradient(55% 60% at 50% 38%, rgba(18,56,89,0.55) 0%, rgba(6,13,23,0) 100%), #060D17',
            }}
          />
        </div>

        {/* ESCENA FINAL: el manifiesto con el gato caminando encima, montada
            sobre el escenario y DEBAJO del clip del androide: mientras ella se
            disuelve en partículas (que quedan por encima) el manifiesto aparece
            detrás (manifestoEnter); luego el gato camina entre las capas de
            palabras (walk = catProgress) y al final pasa la cámara dejando el
            manifiesto completo, que es el último cuadro del pin. */}
        <div className="absolute inset-0 z-0">
          <CatManifestoStage
            enter={manifestoEnter}
            walk={catProgress}
            cat={<ScrollFrameStage progress={catProgress} framesPath={CAT_CUT_FRAMES_PATH} rectAt={catRectAt} transparent />}
          />
        </div>

        {/* Clip del androide (recortado completo): rostro -> androide -> partículas ->
            luciérnaga. Arranca en el mismo último cuadro que deja HeroAvatarStage.
            androidLayerOpacity lo apaga cuando arranca la caminata del gato. */}
        <div className="absolute inset-0 z-0" style={{ opacity: androidLayerOpacity }}>
          <div className="absolute inset-0" style={{ opacity: androidCutReady ? 1 : 0 }}>
            <ScrollFrameStage
              progress={androidProgress}
              framesPath={ANDROID_CUT_FRAMES_PATH}
              rectAt={androidRectAt}
              transparent
              desktopHoldFrame={ANDROID_HOLD_FRAME_INDEX}
              onStatus={(st) => {
                androidCutReadyRef.current = st === 'ok';
                setAndroidCutReady(st === 'ok');
                if (st === 'ok' && pendingDescendRef.current) {
                  pendingDescendRef.current = false;
                  descendRef.current();
                }
              }}
            />
          </div>
          {/* En móvil: bloque oscurecido que cubre la coronilla y llega tácticamente hasta la línea de la frente durante TODA la animación (giro, hold y partículas) */}
          <div
            aria-hidden
            className="md:hidden absolute inset-x-0 top-0 h-[34vh] pointer-events-none z-[2]"
            style={{
              background: 'linear-gradient(to bottom, #07060B 0%, #07060B 68%, rgba(7,6,11,0.92) 85%, rgba(7,6,11,0) 100%)',
            }}
          />
          {/* En móvil: bloque oscurecido inferior que disimula el corte del pecho del robot */}
          <div
            aria-hidden
            className="md:hidden absolute inset-x-0 bottom-0 h-[28vh] min-h-[160px] max-h-[220px] pointer-events-none z-[2]"
            style={{
              background: 'linear-gradient(to top, #07060B 0%, #07060B 40%, rgba(7,6,11,0.88) 72%, rgba(7,6,11,0) 100%)',
            }}
          />
        </div>

        {/* ======================================================== */}
        {/* AVATAR A PANTALLA COMPLETA (fondo del Hero, no columna)   */}
        {/* Este es el ÚNICO elemento que sigue scrubbeado 1:1 al      */}
        {/* scroll — es video real, tiene sentido que "sea" el scroll. */}
        {/* ======================================================== */}
        <div className="absolute inset-0 z-0">
          <HeroAvatarStage
            progress={heroProgress}
            frameOverrideRef={frameOverrideRef}
            winkRef={winkRef}
            onReady={() => (heroFramesReadyRef.current = true)}
          />
        </div>

        {/* grano de película: unifica la textura de la imagen nítida y del video */}
        <div aria-hidden className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="hero-grain" />
        </div>

        {/* En móvil: bloque negro con desvanecido inferior para la vista del avatar/portada (disimula el corte y destaca texto y redes) */}
        <div
          aria-hidden
          className="md:hidden absolute inset-x-0 bottom-0 h-[28vh] min-h-[160px] max-h-[240px] pointer-events-none z-[18]"
          style={{
            opacity: heroProgress < HERO_DISSOLVE_START ? 1 : Math.max(0, 1 - (heroProgress - HERO_DISSOLVE_START) / 0.05),
            background: 'linear-gradient(to top, #07060B 0%, #07060B 35%, rgba(7,6,11,0.85) 68%, rgba(7,6,11,0) 100%)',
          }}
        />

        {/* PORTADA: solo la figura y la palabra (sin textos ni scrims). Capa de
            clic sobre la figura: dispara la reacción (sonrisa) y libera el
            scroll. El indicador es un anillo que pulsa, sin texto. */}
        {heroProgress >= AUTOPLAY_TARGET_PROGRESS - 0.01 && heroProgress < HERO_DISSOLVE_START && (
          <button
            type="button"
            aria-label="Interactuar"
            onClick={() => playSmileRef.current()}
            className="absolute z-[19] top-0 bottom-0 left-[26%] right-[26%] cursor-pointer focus:outline-none"
            style={{ background: 'transparent' }}
          />
        )}
        {/* A qué se dedica (abajo a la izquierda de la portada): tipografía fina y ancha
            (Unbounded) con profundidad sutil. AL BAJAR LAS LETRAS SE DERRITEN EN UNA SOLA
            MANCHA DE PINTURA NEÓN (pedido explícito: no desaparecer y poner otra cosa, ni
            varias gotas): el mismo texto se tiñe de neón, engrosa, se junta hacia el centro
            y un filtro líquido ("gooey") cada vez más fuerte lo funde en una única mancha que
            tiembla; al final la mancha se encoge. Al subir, al revés. */}
        {heroProgress >= AUTOPLAY_TARGET_PROGRESS - 0.01 && heroProgress < 0.62 && (() => {
          const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
          const sm = (x: number) => { const t = clamp01(x); return t * t * (3 - 2 * t); };
          const lerp = (p: number, q: number, t: number) => p + (q - p) * t;
          const tp = clamp01((heroProgress - (AUTOPLAY_TARGET_PROGRESS + 0.003)) / 0.05);
          const m = sm(tp / 0.62); // derretirse
          const gone = 0; // ya no se encoge: la mancha viajera toma el relevo en el mismo punto
          const wob = Math.sin(tp * 40) * 0.07 * sm((tp - 0.45) / 0.3) * (1 - gone);
          const melting = m > 0.002;
          // paralaje/magnetismo del mouse (useEffect de arriba): se apaga al derretirse
          if (tagTpRef.current !== tp) { tagTpRef.current = tp; tagKickRef.current?.(); }
          // núcleo redondo con el MISMO degradado/brillo que la gota de los botones (#eduNeon)
          const core = sm((m - 0.25) / 0.6);
          // al final se comprime mucho en X para que la masa quede casi circular
          const sx = lerp(1, 0.14, m) * (1 - gone) * (1 + wob);
          const sy = lerp(1, 0.62, m) * (1 - gone) * (1 - wob);
          const blurDev = lerp(0.6, 9, m) + 7 * sm((tp - 0.45) / 0.35);
          return (
            <div
              ref={tagMouseRef}
              /* Rótulo inferior: en móvil y escritorio abajo a la izquierda (pedido explícito) */
              className="absolute z-[19] left-4 sm:left-12 lg:left-16 bottom-5 sm:bottom-9 max-sm:bottom-[calc(1.25rem+env(safe-area-inset-bottom,0px))] max-sm:max-w-[160px] pointer-events-none"
              style={{ transformOrigin: '30% 60%', willChange: 'transform', opacity: cardFlow > 0.088 ? 0 : 1 }}
            >
              {melting && (
                <svg width="0" height="0" className="absolute" aria-hidden>
                  <defs>
                    <filter id="tagMelt" x="-40%" y="-120%" width="180%" height="340%">
                      <feGaussianBlur in="SourceGraphic" stdDeviation={blurDev} result="b" />
                      <feColorMatrix in="b" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -9" />
                    </filter>
                  </defs>
                </svg>
              )}
              {/* el filtro líquido va POR FUERA de la escala: así la mancha se redondea en
                  pantalla (no un rectángulo aplastado) */}
              <div
                style={{
                  filter: melting
                    ? `url(#tagMelt) drop-shadow(0 0 ${lerp(0, 16, m) + 6 * core}px rgba(242,48,210,0.55))`
                    : undefined,
                  // RENDIMIENTO: con el filtro "compuesto" (capa propia) la GPU aplica el
                  // desenfoque + umbral UNA vez por cuadro sobre la capa, en vez de repetirlo
                  // en cada mosaico al re-rasterizar (medido: 100-140 ms de GPU por cuadro en
                  // el paso al androide). El resultado visual es el mismo filtro.
                  willChange: melting ? 'filter' : undefined,
                }}
              >
                <div className="relative">
                  <div style={{ transform: `scale(${sx}, ${sy})`, transformOrigin: '42% 50%' }}>
                    <p
                      className="uppercase text-[clamp(0.85rem,1.45vw,1.5rem)] leading-[1.3] sm:leading-[1.4]"
                      style={{
                        fontFamily: '"Unbounded", sans-serif',
                        fontWeight: 300,
                        letterSpacing: `${lerp(0.12, -0.02, m)}em`,
                        backgroundImage: m > 0.15
                          ? 'radial-gradient(ellipse 60% 90% at 42% 40%, #ff8ff0 0%, #F230D2 55%, #8a1ca0 100%)'
                          : 'linear-gradient(180deg, #ffffff 0%, #ffffff 45%, #ffc8f1 100%)',
                        WebkitBackgroundClip: 'text',
                        backgroundClip: 'text',
                        color: 'transparent',
                        WebkitTextStroke: `${lerp(0, 7, m)}px rgba(242,48,210,${Math.min(1, m * 3) * (1 - 0.6 * core)})`,
                        filter: melting
                          ? undefined
                          : 'drop-shadow(0 1px 0 rgba(242,48,210,0.9)) drop-shadow(0 1px 0 rgba(120,12,105,0.85)) drop-shadow(0 6px 10px rgba(0,0,0,0.75)) drop-shadow(0 0 12px rgba(242,48,210,0.25))',
                      }}
                    >
                      <span className="block">Ingeniería, diseño</span>
                      <span className="block">&amp; desarrollo web</span>
                    </p>
                  </div>
                  {core > 0.001 && (
                    <div
                      aria-hidden
                      className="absolute rounded-full"
                      style={{
                        left: '42%',
                        top: '50%',
                        width: 66,
                        height: 66,
                        transform: `translate(-50%, -50%) scale(${core * (1 - gone) * (1 + wob)}, ${core * (1 - gone) * (1 - wob)})`,
                        background: 'radial-gradient(circle at 38% 34%, #ff8ff0 0%, #F230D2 55%, #8a1ca0 100%)',
                      }}
                    />
                  )}
                </div>
              </div>
            </div>
          );
        })()}

        {/* (Las dos capas MatrixFieldLayer, rosa y morada, estaban montadas
            inactivas y con opacidad 0 — la malla de estrellitas se retiró por
            pedido explícito — así que se desmontaron para no gastar en ellas.) */}

        {/* ======================================================== */}
        {/* SECCIÓN HOLD: "de la electrónica a la Inteligencia         */}
        {/* Artificial" — pedido explícito: la parada del scroll       */}
        {/* automático en la revelación del androide "es la cara de    */}
        {/* nuestra nueva sección". El androide (ScrollFrameStage de   */}
        {/* arriba, congelado en ANDROID_HOLD_PROGRESS) queda de fondo, */}
        {/* centrado, con espacio libre a los costados — el texto va   */}
        {/* EN esos costados, no encima de la cara. Morado en vez del  */}
        {/* rosa del resto del sitio (pedido explícito), con partículas */}
        {/* propias reactivas al mouse (mouseReactive, ver             */}
        {/* MatrixFieldLayer.tsx) — esa instancia se monta más arriba,     */}
        {/* junto a la rosa del Hero, para poder cruzarlas en crossfade    */}
        {/* (holdColorMix) sin hueco entre ambas. El TEXTO SIEMPRE está    */}
        {/* montado (antes se montaba/desmontaba condicionado a            */}
        {/* heroProgress >= HERO_DISSOLVE_START — bug real encontrado: eso */}
        {/* hacía que React quitara el título/párrafo/Continuar del DOM    */}
        {/* de un tirón apenas heroProgress bajaba de ese umbral. Ahora    */}
        {/* solo cambia opacidad, nunca se desmonta). La ENTRADA la revela */}
        {/* holdAutoProgress — un tween de tiempo con delay, encadenado    */}
        {/* justo después del fundido de salida del texto del Hero —      */}
        {/* pedido explícito ("una vez desaparezca [el Hero], empiece a    */}
        {/* aparecer el otro texto"; también "no necesito scrollear para   */}
        {/* que aparezcan"). La SALIDA la maneja holdLeaveFade (ver el     */}
        {/* comentario grande junto a esa constante, arriba en el          */}
        {/* componente) — derivado directo de heroProgress en cada render, */}
        {/* sin timers, para no desincronizarse con scrolls rápidos.       */}
        {/* ======================================================== */}
        <>
          {/* Título + párrafo: arriba a la izquierda, mismo patrón absoluto
                que el bloque de nombre del Hero (top-6/10, px-6/12/16,
                items-start). El párrafo va JUSTO DEBAJO del título — pedido
                explícito de moverlo de la derecha para acá. Título en 3
                líneas y párrafo en líneas cortas, ambos con whitespace-nowrap
                — pedido explícito de que no se solapen con la cara del
                androide, respetando el espacio libre a la izquierda. */}
            {/* Logos 3D: retirados en MÓVIL por pedido explícito; en escritorio se mantienen */}
            {aiFloatersOn && (
              <AIFloaters
                active={cardFlow > 0.6}
                focusRef={aiFocusRef}
                className="absolute z-[22] left-0 top-[-10vh] w-[35vw] h-full [&_*]:!pointer-events-none"
              />
            )}
            {(() => {
              const on = cardFlow > 0.6;
              const ease = 'cubic-bezier(0.65,0.05,0,1)';
              const line = (delay: number): React.CSSProperties => ({
                transform: on ? 'translateY(0%)' : 'translateY(115%)',
                transition: `transform 900ms ${ease} ${on ? delay : 0}ms`,
              });
              const pop = (delay: number): React.CSSProperties => ({
                opacity: on ? 1 : 0,
                transform: on ? 'translateY(0) scale(1)' : 'translateY(10px) scale(0.85)',
                transition: `opacity 500ms ease ${on ? delay : 0}ms, transform 650ms ${ease} ${on ? delay : 0}ms, background-color 250ms, border-color 250ms`,
              });
              const focus = (k: keyof AIFocus | 'all', v: number) => {
                if (k === 'all') aiFocusRef.current = { claude: v, gpt: v, gemini: v, deepseek: v, ollama: v, n8n: v } as AIFocus;
                else aiFocusRef.current = { ...aiFocusRef.current, [k]: v };
              };
              const tags: { label: string; k: keyof AIFocus | 'all' | null }[] = [
                { label: 'Claude', k: 'claude' },
                { label: 'ChatGPT', k: 'gpt' },
                { label: 'Gemini', k: 'gemini' },
                { label: 'DeepSeek', k: 'deepseek' as keyof AIFocus },
                { label: 'Ollama', k: 'ollama' as keyof AIFocus },
                { label: 'Agentes', k: 'n8n' as keyof AIFocus },
              ];
              return (
                <div
                  /* En celular: el título se ubica en el bloque superior oscurecido para una lectura limpia sin ver el corte */
                  className="absolute z-[21] max-md:left-1/2 max-md:top-[5.5%] max-md:bottom-auto max-md:-translate-x-1/2 max-md:translate-y-0 max-md:w-[94vw] max-md:max-w-md left-[17.5vw] top-[40%] -translate-x-1/2 -translate-y-1/2 w-[min(30vw,30rem)] text-center pointer-events-none"
                  // oculto del todo fuera de la sección (si no, asomaba la punta de una letra: el "punto blanco")
                  style={{ opacity: on ? holdExitOpacity : 0, transition: on ? 'opacity 200ms' : 'opacity 250ms 0ms', visibility: on || holdExitOpacity < 1 ? 'visible' : 'hidden' }}
                >
                  <h3 className="font-poster uppercase leading-[0.88] text-white text-[clamp(2.3rem,9.2vw,3.6rem)] md:text-[clamp(1.15rem,2.2vw,3.2rem)] drop-shadow-[0_4px_22px_rgba(0,0,0,0.98)] drop-shadow-[0_0_32px_rgba(242,48,210,0.38)]">
                    <span className="block overflow-hidden pt-[0.24em] -mt-[0.2em] pb-[0.1em] -mb-[0.1em] pr-[0.2em]">
                      <span className="block" style={line(500)}>
                        Agentes{' '}
                        <span
                          className="font-serifItalic italic font-semibold normal-case text-[#F230D2] cursor-default"
                          style={{ pointerEvents: on ? 'auto' : 'none' }}
                          onMouseEnter={() => focus('all', 1)}
                          onMouseLeave={() => focus('all', 0)}
                        >
                          IA
                        </span>{' '}
                        &amp;
                      </span>
                    </span>
                    <span className="block overflow-hidden pt-[0.24em] -mt-[0.2em] pb-[0.1em] -mb-[0.1em] pr-[0.2em]">
                      <span className="block" style={line(620)}>automatización</span>
                    </span>
                  </h3>
                  
                  {/* Chips: colocados tácticamente dentro del bloque oscurecido antes de la línea de la frente */}
                  <div className="flex mt-3 md:mt-5 flex-wrap justify-center gap-1.5 md:gap-2 max-md:px-2">
                    {tags.map((tg, i) => (
                      <span
                        key={tg.label}
                        className="px-2.5 py-0.5 md:px-3 md:py-1 rounded-full border border-[#F230D2]/60 bg-[#F230D2]/15 text-white/95 text-[10.5px] md:text-xs font-mono tracking-wider backdrop-blur-sm shadow-[0_2px_10px_rgba(0,0,0,0.8)] hover:bg-[#F230D2] hover:border-[#F230D2] hover:text-white active:scale-95 transition-transform cursor-pointer"
                        style={{ ...pop(900 + i * 90), pointerEvents: on ? 'auto' : 'none' }}
                        onMouseEnter={() => tg.k && focus(tg.k, 1)}
                        onMouseLeave={() => tg.k && focus(tg.k, 0)}
                        onClick={() => {
                          if (!tg.k) return;
                          focus(tg.k, 1);
                          window.setTimeout(() => tg.k && focus(tg.k, 0), 900);
                        }}
                      >
                        {tg.label}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })()}
            {/* LOS BOTONES SE VUELVEN UNA FORMA Y LA FORMA SE VUELVE LA FICHA.
                1) los tres círculos del dock se juntan y se funden (filtro "gooey") en una gota;
                2) la gota de neón viaja ondulando hasta el lugar de la ficha, creciendo;
                3) la gota se deforma (punto a punto) hasta el contorno de la ficha (un
                   "squircle" de esquinas suaves) mientras se apaga el relleno neón y queda el
                   vidrio oscuro con borde neón;
                4) entra el contenido. La ficha NO lleva los botones (pedido explícito).
                Todo atado a cardFlow (la transformación); al continuar o subir, al revés. */}
            {cardFlow > 0.001 && typeof window !== 'undefined' && (() => {
              const W = window.innerWidth;
              const isMobile = W < 768;
              // SOLO EN VISTA DE TELÉFONO eliminamos la carta Pokémon ya que no cabe (pedido explícito del usuario)
              if (isMobile) return null;
              const desktopCard = W >= 1024;
              const showCard = !desktopCard || (heroProgress >= 0.995 && bridgeStateRef.current !== 'playing');
              const H = window.innerHeight;
              const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
              const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
              const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
              const fl = cardFlow;
              const dockR = W >= 640 ? 32 : 20;
              const dockB = W >= 640 ? 32 : 24; // en la portada el dock está abajo a la derecha
              const cardR = W >= 1024 ? 110 : W >= 640 ? 48 : 24;
              // En celular apilamos en vertical: androide en la mitad superior, carta anclada limpiamente abajo sin sobreponerse
              const cardW = isMobile ? (W < 380 ? Math.min(205, Math.round(W * 0.65)) : Math.min(230, Math.round(W * 0.68))) : Math.round(Math.min(330, Math.max(250, W * 0.22)));
              const fullH = Math.round(cardW / 0.716); // proporción de carta coleccionable
              const cardX = isMobile ? Math.round((W - cardW) / 2) : W - cardR - cardW;
              const cardY = isMobile ? Math.round(H - fullH - 10) : Math.round(Math.max(H * 0.13, 70)); // más arriba (pedido explícito)
              const ccx = cardX + cardW / 2;
              const ccy = cardY + fullH / 2;
              // fases
              const pMerge = ease(clamp01(fl / 0.18));
              const pTravel = ease(clamp01((fl - 0.12) / 0.4));
              const pShape = ease(clamp01((fl - 0.45) / 0.3));
              const pC = clamp01((fl - 0.68) / 0.32);
              const cs = (i: number, n = 5) => {
                const st = (i / (n - 1)) * 0.55;
                const x = clamp01((pC - st) / 0.45);
                return x * x * (3 - 2 * x);
              };
              // 1) círculos del dock -> punto de fusión (el del medio). En móvil el dock arranca en top-5 (y: 20 + 22).
              const icons = [0, 1, 2].map((i) => ({
                x: W - dockR - 22 - (2 - i) * 56,
                y: isMobile ? 20 + 22 : H - dockB - 22,
              }));
              const mx = icons[1].x;
              const my = icons[1].y;
              // 2) recorrido ondulado de la gota hasta el centro de la ficha
              const bx = lerp(mx, ccx, pTravel) + Math.sin(pTravel * Math.PI * 2.2) * 70 * (1 - pTravel);
              const by = lerp(my, ccy, pTravel);
              const br = lerp(lerp(22, 34, pMerge), 78, pTravel);
              // 3) contorno: gota con ondas -> squircle de la ficha
              const N = 120;
              const ph = fl * 16;
              const wob = (1 - pShape) * (0.1 + 0.08 * Math.sin(fl * 9));
              const hw = cardW / 2;
              const hh = fullH / 2;
              const ex = 2 / 9; // exponente del squircle (esquinas suaves)
              let d = '';
              let pathX0 = Infinity;
              let pathY0 = Infinity;
              let pathX1 = -Infinity;
              let pathY1 = -Infinity;
              for (let j = 0; j < N; j++) {
                const th = (j / N) * Math.PI * 2;
                const c = Math.cos(th);
                const sn = Math.sin(th);
                const rr = br * (1 + wob * Math.sin(3 * th + ph) + wob * 0.6 * Math.sin(5 * th - ph * 1.3));
                const px0 = bx + rr * c;
                const py0 = by + rr * sn;
                const px1 = ccx + hw * Math.sign(c) * Math.pow(Math.abs(c), ex);
                const py1 = ccy + hh * Math.sign(sn) * Math.pow(Math.abs(sn), ex);
                const px = lerp(px0, px1, pShape);
                const py = lerp(py0, py1, pShape);
                if (px < pathX0) pathX0 = px;
                if (px > pathX1) pathX1 = px;
                if (py < pathY0) pathY0 = py;
                if (py > pathY1) pathY1 = py;
                d += (j ? 'L' : 'M') + px.toFixed(1) + ' ' + py.toFixed(1);
              }
              d += 'Z';
              const neon = 1 - pShape; // relleno neón de la gota -> vidrio oscuro
              // RENDIMIENTO (paso al androide): antes era UN svg de pantalla completa con el
              // filtro "gooey" y la sombra dentro (filtros de SVG): en cada cuadro la GPU
              // re-rasterizaba los mosaicos tocados repitiendo el desenfoque en cada uno
              // (medido: picos de 100+ ms de GPU por cuadro). Ahora cada grupo es su propio
              // svg, del tamaño justo de lo que dibuja (+ margen para el desenfoque), y el
              // filtro va como CSS en el svg con will-change: filter: la GPU lo aplica una
              // vez por cuadro sobre esa capa chica. Mismas figuras, mismo filtro, mismas
              // opacidades (el contenedor conserva el orden y el z de antes).
              const merging = pMerge < 1 && pTravel < 0.35;
              const mergeCircles = merging
                ? [
                    ...icons.map((p, i) => ({
                      x: lerp(p.x, mx, pMerge),
                      y: lerp(p.y, my, pMerge) - Math.sin(Math.PI * pMerge) * 10 * (i - 1),
                      r: 22 * (1 - 0.15 * pMerge),
                    })),
                    { x: bx, y: by, r: br * pMerge },
                  ]
                : [];
              // caja del grupo de fusión: círculos + 3.5 sigma del desenfoque (9)
              const GOO_PAD = 32;
              let mX0 = Infinity;
              let mY0 = Infinity;
              let mX1 = -Infinity;
              let mY1 = -Infinity;
              for (const cc of mergeCircles) {
                mX0 = Math.min(mX0, cc.x - cc.r);
                mY0 = Math.min(mY0, cc.y - cc.r);
                mX1 = Math.max(mX1, cc.x + cc.r);
                mY1 = Math.max(mY1, cc.y + cc.r);
              }
              const mBox = merging
                ? { x: Math.floor(mX0 - GOO_PAD), y: Math.floor(mY0 - GOO_PAD), w: Math.ceil(mX1 - mX0 + 2 * GOO_PAD) + 1, h: Math.ceil(mY1 - mY0 + 2 * GOO_PAD) + 1 }
                : null;
              // caja de la gota/ficha (+ el trazo); la sombra la expande la GPU sola
              const pBox = { x: Math.floor(pathX0 - 2), y: Math.floor(pathY0 - 2), w: Math.ceil(pathX1 - pathX0 + 4) + 1, h: Math.ceil(pathY1 - pathY0 + 4) + 1 };
              return (
                <>
                  <div className="absolute inset-0 z-[30] pointer-events-none" aria-hidden>
                    <svg width="0" height="0" className="absolute" aria-hidden>
                      <defs>
                        {/* región = la caja del svg (ya incluye el margen del desenfoque) */}
                        <filter id="eduGoo" x="0" y="0" width="100%" height="100%">
                          <feGaussianBlur in="SourceGraphic" stdDeviation="9" result="b" />
                          <feColorMatrix in="b" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -9" />
                        </filter>
                        <radialGradient id="eduNeon" cx="35%" cy="30%" r="75%">
                          <stop offset="0%" stopColor="#ff8ff0" />
                          <stop offset="55%" stopColor="#F230D2" />
                          <stop offset="100%" stopColor="#8a1ca0" />
                        </radialGradient>
                      </defs>
                    </svg>
                    {/* fusión de los tres botones (solo al principio) */}
                    {mBox && (
                      <svg
                        className="absolute"
                        width={mBox.w}
                        height={mBox.h}
                        viewBox={`${mBox.x} ${mBox.y} ${mBox.w} ${mBox.h}`}
                        style={{ left: mBox.x, top: mBox.y, filter: 'url(#eduGoo)', willChange: 'filter', opacity: 1 - clamp01(pTravel / 0.35) }}
                      >
                        {mergeCircles.map((cc, i) => (
                          <circle key={i} cx={cc.x} cy={cc.y} r={cc.r} fill="url(#eduNeon)" />
                        ))}
                      </svg>
                    )}
                    {/* la gota / la ficha */}
                    {pMerge > 0.6 && (
                      <svg
                        className={desktopCard ? 'absolute overflow-visible hero-card-outline' : 'absolute overflow-visible'}
                        width={pBox.w}
                        height={pBox.h}
                        viewBox={`${pBox.x} ${pBox.y} ${pBox.w} ${pBox.h}`}
                        style={{
                          left: pBox.x,
                          top: pBox.y,
                          opacity: showCard ? 1 - clamp01(pC / 0.3) : 1,
                          filter: `drop-shadow(0 0 ${lerp(22, 14, pShape)}px rgba(242,48,210,${0.55 - 0.3 * pShape}))`,
                          willChange: 'filter',
                        }}
                      >
                        <path d={d} fill="url(#eduNeon)" opacity={neon} />
                        <path d={d} fill="rgba(8,3,12,0.78)" opacity={pShape} />
                        <path d={d} fill="none" stroke="#F230D2" strokeOpacity={0.35 + 0.35 * pShape} strokeWidth={1.2} />
                      </svg>
                    )}
                  </div>
                  {/* CARTA estilo Pokémon V de ARTE COMPLETO (referencia Eevee V): marco negro con
                      curvas plateadas, ilustración a toda la carta con el LOGO DE LA UNEXPO como
                      figura, barra de nombre plateada, ataques sobre paneles translúcidos y fila de
                      datos abajo. Textura fina (grabado + grano) y brillo holográfico. Con el mouse
                      se inclina en 3D y el fondo y el logo se desplazan a distinta profundidad.
                      Si existe /cards/unexpo-art.webp (arte de Nano Banana) se usa de fondo. */}
                  {showCard && <div
                    className={desktopCard ? 'absolute z-[31] cursor-pointer hero-card-reveal' : 'absolute z-[31] cursor-pointer'}
                    title="Toca para continuar"
                    onClick={() => {
                      if (pC > 0.6 && continueStateRef.current === 'idle') {
                        triggerContinueRef.current();
                      }
                    }}
                    style={{
                      left: cardX,
                      top: cardY,
                      width: cardW,
                      height: fullH,
                      perspective: '1100px',
                      opacity: clamp01(pC / 0.3),
                      pointerEvents: pC > 0.7 ? 'auto' : 'none',
                    }}
                    onMouseMove={(e) => {
                      const el = e.currentTarget.firstElementChild as HTMLElement | null;
                      if (!el) return;
                      const rc = e.currentTarget.getBoundingClientRect();
                      const x = (e.clientX - rc.left) / rc.width;
                      const y = (e.clientY - rc.top) / rc.height;
                      el.style.setProperty('--mx', `${x * 100}%`);
                      el.style.setProperty('--my', `${y * 100}%`);
                      el.style.setProperty('--px', String(x - 0.5));
                      el.style.setProperty('--py', String(y - 0.5));
                      el.style.setProperty('--ry', `${(x - 0.5) * 22}deg`);
                      el.style.setProperty('--rx', `${(0.5 - y) * 18}deg`);
                      el.style.setProperty('--glare', '1');
                    }}
                    onMouseLeave={(e) => {
                      const el = e.currentTarget.firstElementChild as HTMLElement | null;
                      if (!el) return;
                      ['--px', '--py'].forEach((k) => el.style.setProperty(k, '0'));
                      el.style.setProperty('--ry', '0deg');
                      el.style.setProperty('--rx', '0deg');
                      el.style.setProperty('--glare', '0');
                    }}
                    onTouchMove={(e) => {
                      const el = e.currentTarget.firstElementChild as HTMLElement | null;
                      if (!el || !e.touches[0]) return;
                      const t = e.touches[0];
                      const rc = e.currentTarget.getBoundingClientRect();
                      const x = Math.min(1, Math.max(0, (t.clientX - rc.left) / rc.width));
                      const y = Math.min(1, Math.max(0, (t.clientY - rc.top) / rc.height));
                      el.style.setProperty('--mx', `${x * 100}%`);
                      el.style.setProperty('--my', `${y * 100}%`);
                      el.style.setProperty('--px', String(x - 0.5));
                      el.style.setProperty('--py', String(y - 0.5));
                      el.style.setProperty('--ry', `${(x - 0.5) * 20}deg`);
                      el.style.setProperty('--rx', `${(0.5 - y) * 16}deg`);
                      el.style.setProperty('--glare', '1');
                    }}
                    onTouchEnd={(e) => {
                      const el = e.currentTarget.firstElementChild as HTMLElement | null;
                      if (!el) return;
                      ['--px', '--py'].forEach((k) => el.style.setProperty(k, '0'));
                      el.style.setProperty('--ry', '0deg');
                      el.style.setProperty('--rx', '0deg');
                      el.style.setProperty('--glare', '0');
                    }}
                  >
                    <div
                      className="pokev-card relative w-full h-full rounded-[18px] p-[10px] bg-[#0d0d10]"
                      style={{
                        transform: `scale(${0.94 + 0.06 * clamp01(pC / 0.3)}) rotateY(var(--ry, 0deg)) rotateX(var(--rx, 0deg))`,
                        transition: 'transform 220ms cubic-bezier(0.2,0.8,0.2,1)',
                        transformStyle: 'preserve-3d',
                        boxShadow: '0 26px 60px rgba(0,0,0,0.7), 0 0 28px rgba(242,48,210,0.3)',
                      }}
                    >
                      {/* curvas plateadas del marco */}
                      <svg className="absolute inset-0 w-full h-full pointer-events-none z-[3]" viewBox="0 0 100 140" preserveAspectRatio="none" aria-hidden>
                        <defs>
                          <linearGradient id="pkSilver" x1="0" y1="0" x2="1" y2="1">
                            <stop offset="0%" stopColor="#f5f5f5" />
                            <stop offset="45%" stopColor="#9a9aa4" />
                            <stop offset="100%" stopColor="#ffffff" />
                          </linearGradient>
                        </defs>
                        <path d="M2 6 Q 6 2 14 1.5" stroke="url(#pkSilver)" strokeWidth="1.1" fill="none" />
                        <path d="M1.6 14 Q 2.5 6 9 3.2" stroke="url(#pkSilver)" strokeWidth="0.6" fill="none" opacity="0.8" />
                        <path d="M98.4 126 Q 97.5 134 91 136.8" stroke="url(#pkSilver)" strokeWidth="0.6" fill="none" opacity="0.8" />
                        <path d="M98 134 Q 94 138.4 86 138.6" stroke="url(#pkSilver)" strokeWidth="1.1" fill="none" />
                      </svg>
                      {/* ilustración a toda la carta */}
                      <div
                        className="relative w-full h-full rounded-[10px] overflow-hidden text-[#121218]"
                        style={{ isolation: desktopCard ? 'isolate' : undefined }}
                      >
                        <div
                          className="absolute -inset-[6%]"
                          style={{
                            transform: 'translate(calc(var(--px, 0) * -14px), calc(var(--py, 0) * -14px))',
                            transition: 'transform 220ms ease-out',
                            background:
                              'radial-gradient(60% 45% at 50% 40%, rgba(255,140,230,0.55) 0%, rgba(255,140,230,0) 70%), radial-gradient(80% 60% at 20% 80%, rgba(80,210,255,0.35) 0%, rgba(80,210,255,0) 70%), linear-gradient(170deg, #2a145a 0%, #5a1f7d 35%, #b03b9b 62%, #ffb37a 88%, #ffe1a8 100%)',
                          }}
                        >
                          <img
                            src="/cards/unexpo-art.webp"
                            alt=""
                            className="absolute inset-0 w-full h-full object-cover"
                            onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')}
                          />
                          {/* estelas de luz (como el arte de la referencia) */}
                          <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 140" preserveAspectRatio="none" aria-hidden>
                            {[0, 1, 2, 3, 4].map((i) => (
                              <path
                                key={i}
                                d={`M -10 ${30 + i * 9} Q 50 ${-5 + i * 14} 115 ${18 + i * 11}`}
                                stroke={i % 2 ? '#ffd6f6' : '#a9ecff'}
                                strokeOpacity={0.35 - i * 0.05}
                                strokeWidth={0.5 + (i % 3) * 0.3}
                                fill="none"
                              />
                            ))}
                            {Array.from({ length: 16 }, (_, i) => (
                              <circle key={i} cx={(i * 37) % 100} cy={8 + ((i * 53) % 70)} r={0.35 + (i % 3) * 0.25} fill="#fff" opacity={0.5 + (i % 4) * 0.12} />
                            ))}
                          </svg>
                        </div>
                        {/* el logo (figura), con más profundidad que el fondo */}
                        <img
                          src="/logos/unexpo.webp"
                          alt="UNEXPO"
                          className="absolute left-1/2 top-[38%] sm:top-[44%] w-[68%] sm:w-[86%] h-auto max-w-none"
                          style={{
                            transform: 'translate(calc(-50% + var(--px, 0) * 18px), calc(-50% + var(--py, 0) * 18px))',
                            transition: 'transform 220ms ease-out',
                            filter: 'brightness(0.18) saturate(1.4) drop-shadow(0 0 1.5px #ffffff) drop-shadow(0 0 1.5px #ffffff) drop-shadow(0 0 12px rgba(242,48,210,0.85)) drop-shadow(0 12px 16px rgba(20,0,40,0.55))',
                            opacity: cs(0.6),
                          }}
                        />
                        {/* leyenda bajo el logo */}
                        <div className="absolute left-0 right-0 top-[51%] sm:top-[64%] flex justify-center" style={{ opacity: cs(1.2) }}>
                          <span
                            className="px-2.5 sm:px-3 py-[2px] sm:py-[3px] rounded-full text-[9.5px] sm:text-[11px] font-black tracking-[0.14em] text-[#1a0b3d]"
                            style={{ fontFamily: '"Sora", sans-serif', background: 'linear-gradient(180deg, #fff6d6, #f2c94c)', boxShadow: '0 0 0 1px rgba(26,11,61,0.6), 0 4px 10px rgba(0,0,0,0.35)' }}
                          >
                            INGENIERÍA ELECTRÓNICA
                          </span>
                        </div>
                        {/* cabecera: BÁSICO · nombre · "PS" */}
                        <div className="absolute left-0 right-0 top-0 flex items-center gap-1.5 pl-1.5 pr-2 pt-1.5" style={{ opacity: cs(0) }}>
                          <span className="px-2 py-[1px] rounded-full bg-gradient-to-b from-white to-[#b9b9c2] border border-[#555] text-[8px] font-black italic tracking-wide text-[#333]">
                            BÁSICO
                          </span>
                          <span
                            className="flex-1 flex items-baseline gap-1 rounded-r-full pl-1.5 pr-2 py-[1px] text-[0.98rem] font-black leading-none min-w-0"
                            style={{ background: 'linear-gradient(90deg, rgba(255,255,255,0.95), rgba(215,215,222,0.85) 70%, rgba(215,215,222,0))', fontFamily: '"Sora", sans-serif' }}
                          >
                            UNEXPO
                            <span className="italic font-semibold text-[0.66rem] text-[#e0187a] truncate" style={{ fontFamily: '"Playfair Display", serif' }}>Barquisimeto</span>
                          </span>
                          <span className="shrink-0 flex items-baseline gap-0.5 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                            <span className="text-[8px] font-black">PS</span>
                            <span className="text-[1.05rem] font-black leading-none" style={{ fontFamily: '"Sora", sans-serif' }}>2025</span>
                          </span>
                        </div>
                        {/* ataques sobre paneles translúcidos */}
                        <div
                          className="absolute left-0 right-0 bottom-[10%] px-2 sm:px-2.5 pt-1.5 sm:pt-3 pb-1 sm:pb-1.5"
                          style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.72) 18%, rgba(255,255,255,0.82) 100%)' }}
                        >
                          {[
                            { n: 1, name: 'Robot Educativo Interactivo', val: '', desc: 'Trabajo de grado de Ingeniería Electrónica.' },
                            { n: 3, name: 'Creatividad e Innovación', val: '', desc: 'Primer Lugar en ExpoCILARA 2025.' },
                          ].map((at, i) => (
                            <div key={at.name} className={i ? 'mt-1 sm:mt-1.5' : ''} style={{ opacity: cs(1.6 + i * 0.9), transform: `translateX(${(1 - cs(1.6 + i * 0.9)) * 10}px)` }}>
                              <div className="flex items-center gap-1 sm:gap-1.5">
                                <span className="flex gap-0.5 shrink-0">
                                  {Array.from({ length: at.n }, (_, k) => (
                                    <span key={k} className="w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full bg-gradient-to-b from-white to-[#c9c9cf] border border-[#444] flex items-center justify-center text-[6px] sm:text-[7px] text-[#444]">✦</span>
                                  ))}
                                </span>
                                <span className="font-black text-[11px] sm:text-[12.5px] leading-tight" style={{ fontFamily: '"Sora", sans-serif' }}>{at.name}</span>
                                {at.val && <span className="ml-auto font-black text-[12px] sm:text-[14px]" style={{ fontFamily: '"Sora", sans-serif' }}>{at.val}</span>}
                              </div>
                              <p className="text-[9px] sm:text-[10px] leading-snug mt-0.5 text-[#22222a]">{at.desc}</p>
                            </div>
                          ))}
                        </div>
                        {/* barra inferior negra/plateada */}
                        <div className="absolute left-0 right-0 bottom-0 h-[10%] bg-[#0d0d10] px-2 pt-1 pb-0.5 flex flex-col justify-between gap-0.5" style={{ opacity: cs(3.2) }}>
                          <div className="rounded-l-full bg-gradient-to-r from-white to-[#cfcfd6] px-2 py-[2px] flex items-center gap-2">
                            <span className="text-[8px] font-black italic text-[#111] shrink-0">
                              <span className="text-[#e0187a]">V</span> regla
                            </span>
                            <span className="text-[6.5px] leading-tight text-[#222]">Universidad Nacional Experimental Politécnica “Antonio José de Sucre”</span>
                          </div>
                          {/* Oculto en celular para evitar tipografías ilegibles menores a 11px */}
                          <div className="flex justify-between text-[6px] text-white/55 pb-0.5 max-sm:hidden">
                            <span>Ilus. Alejandra Arismendi</span>
                            <span className="font-mono">AA 001/001</span>
                          </div>
                        </div>
                        <div className="pokev-etch absolute inset-0 pointer-events-none" />
                        <div className="poke-holo absolute inset-0 pointer-events-none" />
                        <div className="poke-glare absolute inset-0 pointer-events-none" />
                      </div>
                    </div>
                  </div>}
                </>
              );
            })()}

            {/* EL TEXTO DE LA PORTADA SE CONVIERTE EN LA ZONA IA (espejo de botones -> carta):
                la mancha en que se derrite "INGENIERÍA, DISEÑO & DESARROLLO WEB" no desaparece:
                sube ondulando (con gotas de estela) hasta el centro de la zona izquierda, crece y
                revienta; de ahí salen el título "AGENTES IA & AUTOMATIZACIÓN" y los logos 3D
                (sus órbitas se abren desde ese mismo centro). Atado a cardFlow, reversible. */}
            {cardFlow > 0.088 && cardFlow < 0.82 && typeof window !== 'undefined' && (() => {
              const W = window.innerWidth;
              const H = window.innerHeight;
              const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
              const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
              const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
              const fl = cardFlow;
              const pIn = fl > 0.088 ? 1 : 0; // relevo instantáneo en el mismo punto y tamaño
              const pTravel = ease(clamp01((fl - 0.12) / 0.43));
              const pBurst = clamp01((fl - 0.55) / 0.22);
              // de: donde se derritió el texto (abajo a la izquierda) -> a: centro de la zona IA
              // En escritorio el origen se mide al despegar y se conserva en el viaje y su reversa.
              const tagEl = tagMouseRef.current;
              if (tagEl && (W < 1024 || !tagBlobRef.current)) {
                const rc = tagEl.getBoundingClientRect();
                tagBlobRef.current = { x: rc.left + rc.width * 0.42, y: rc.top + rc.height * 0.5 };
              }
              const isMobile = W < 768;
              const sx = tagBlobRef.current?.x ?? (W >= 1024 ? 64 : W >= 640 ? 48 : 24) + W * 0.11;
              const sy = tagBlobRef.current?.y ?? H - (W >= 640 ? 36 : 28) - W * 0.02;
              // En celular la zona IA está abajo en el pecho (bottom-[7%]), en escritorio a la izquierda
              const tx = isMobile ? W * 0.5 : W * 0.175;
              const ty = isMobile ? H * 0.86 : H * 0.4;
              const bx = lerp(sx, tx, pTravel) + Math.sin(pTravel * Math.PI * 2.2) * 60 * (1 - pTravel);
              const by = lerp(sy, ty, pTravel);
              const br = lerp(33, 70, pTravel) * (1 + pBurst * 1.4);
              const wob = Math.sin(fl * 60) * 0.08 * (1 - pBurst);
              const op = pIn * (1 - ease(pBurst));
              const trail = [0.06, 0.12, 0.18].map((lag, i) => {
                const tt = ease(clamp01((fl - 0.12 - lag) / 0.43));
                return {
                  x: lerp(sx, tx, tt) + Math.sin(tt * Math.PI * 2.2) * 60 * (1 - tt),
                  y: lerp(sy, ty, tt),
                  r: br * (0.42 - i * 0.1) * (1 - pBurst),
                };
              });
              // RENDIMIENTO: mismo cambio que la gota de los botones (ver "eduGoo"): antes
              // era un svg de pantalla completa con el filtro gooey + sombra dentro, que la
              // GPU re-rasterizaba por mosaicos en cada cuadro (picos de 100-370 ms medidos).
              // Ahora la mancha y el anillo son svgs del tamaño justo, con el filtro como
              // CSS compuesto (will-change: filter). La opacidad común va en el contenedor
              // (igual que antes en el svg), así el anillo y la mancha se mezclan igual.
              const blobs = [
                ...(pBurst < 1 ? trail.filter((t) => t.r > 1).map((t) => ({ x: t.x, y: t.y, rx: t.r, ry: t.r })) : []),
                { x: bx, y: by, rx: br * (1 + wob), ry: br * (1 - wob) },
              ];
              const LEFT_GOO_PAD = 36; // 3.5 sigma del desenfoque (10)
              let gX0 = Infinity;
              let gY0 = Infinity;
              let gX1 = -Infinity;
              let gY1 = -Infinity;
              for (const e of blobs) {
                gX0 = Math.min(gX0, e.x - e.rx);
                gY0 = Math.min(gY0, e.y - e.ry);
                gX1 = Math.max(gX1, e.x + e.rx);
                gY1 = Math.max(gY1, e.y + e.ry);
              }
              const gBox = { x: Math.floor(gX0 - LEFT_GOO_PAD), y: Math.floor(gY0 - LEFT_GOO_PAD), w: Math.ceil(gX1 - gX0 + 2 * LEFT_GOO_PAD) + 1, h: Math.ceil(gY1 - gY0 + 2 * LEFT_GOO_PAD) + 1 };
              const ringR = 70 + pBurst * 220;
              const rBox = { x: Math.floor(tx - ringR - 2), y: Math.floor(ty - ringR - 2), s: Math.ceil(2 * ringR + 4) + 1 };
              return (
                <div className="absolute inset-0 z-[23] pointer-events-none" aria-hidden style={{ opacity: op }}>
                  <svg width="0" height="0" className="absolute" aria-hidden>
                    <defs>
                      {/* región = la caja del svg (ya incluye el margen del desenfoque) */}
                      <filter id="leftGoo" x="0" y="0" width="100%" height="100%">
                        <feGaussianBlur in="SourceGraphic" stdDeviation="10" result="b" />
                        <feColorMatrix in="b" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -9" />
                      </filter>
                      <radialGradient id="leftNeon" cx="38%" cy="32%" r="75%">
                        <stop offset="0%" stopColor="#ff8ff0" />
                        <stop offset="55%" stopColor="#F230D2" />
                        <stop offset="100%" stopColor="#8a1ca0" />
                      </radialGradient>
                    </defs>
                  </svg>
                  <svg
                    className="absolute"
                    width={gBox.w}
                    height={gBox.h}
                    viewBox={`${gBox.x} ${gBox.y} ${gBox.w} ${gBox.h}`}
                    fill="url(#leftNeon)"
                    style={{ left: gBox.x, top: gBox.y, filter: 'url(#leftGoo) drop-shadow(0 0 18px rgba(242,48,210,0.55))', willChange: 'filter' }}
                  >
                    {blobs.map((e, i) =>
                      i < blobs.length - 1 ? <circle key={i} cx={e.x} cy={e.y} r={e.rx} /> : <ellipse key="b" cx={e.x} cy={e.y} rx={e.rx} ry={e.ry} />
                    )}
                  </svg>
                  {/* anillo del reventón que "abre" la zona IA */}
                  {pBurst > 0 && pBurst < 1 && (
                    <svg
                      className="absolute overflow-visible"
                      width={rBox.s}
                      height={rBox.s}
                      viewBox={`${rBox.x} ${rBox.y} ${rBox.s} ${rBox.s}`}
                      style={{ left: rBox.x, top: rBox.y, opacity: (1 - pBurst) * 0.8, filter: 'drop-shadow(0 0 10px rgba(242,48,210,0.7))', willChange: 'filter' }}
                    >
                      <circle cx={tx} cy={ty} r={ringR} fill="none" stroke="#F230D2" strokeWidth={2} />
                    </svg>
                  )}
                </div>
              );
            })()}

            {/* (botón "Continuar" retirado: pedido explícito; se sigue con el scroll) */}
        </>

        {/* ======================================================== */}
        {/* BADGE EDITORIAL + ACCIONES: ESQUINA SUPERIOR DERECHA      */}
        {/* Espaciado seguro sm:right-20 lg:right-24 para que nunca colisione con SectionDots */}
        {/* ======================================================== */}
        {/* REDISEÑO: reemplazado por HeroEditorial. Queda montado pero oculto
            porque la cadena de animación de GSAP todavía usa estas refs. */}
        <div className="hidden absolute top-6 right-6 sm:top-10 sm:right-20 lg:right-24 z-20 flex-col items-end gap-6 pointer-events-none">
          {/* opacity:0 de entrada, igual que nameRef: sin esto el badge se
              veía completo por un instante en cada F5, antes de que el
              efecto de React llegara a ocultarlo para el tipeado. */}
          <div ref={badgeRef} className="text-right pointer-events-none" style={{ opacity: 0, transition: 'transform 0.2s ease-out' }}>
            <span
              ref={badgeLine1Ref}
              className="block font-pixel text-[9px] sm:text-sm text-cyber-magenta tracking-wide uppercase leading-relaxed whitespace-nowrap"
              style={{ clipPath: 'inset(0% 100% 0% 0%)', textShadow: '0 0 10px rgba(224,25,133,0.7), 0 0 22px rgba(224,25,133,0.35)' }}
            >
              {BADGE_LINE_1}
            </span>
            <span
              ref={badgeLine2Ref}
              className="block font-pixel text-[9px] sm:text-sm text-cyber-magenta/70 tracking-wide uppercase leading-relaxed whitespace-nowrap"
              style={{ clipPath: 'inset(0% 100% 0% 0%)', textShadow: '0 0 8px rgba(224,25,133,0.5)' }}
            >
              {BADGE_LINE_2}
              <span
                ref={badgeCursorRef}
                className="inline-block w-[2px] h-[0.75em] ml-1 align-middle bg-cyber-magenta"
                style={{ animation: 'blink-cursor 1s steps(1) infinite', boxShadow: '0 0 6px rgba(224,25,133,0.8)' }}
              />
            </span>
          </div>

          {/* BIO (segunda mitad): triángulo invertido con saltos de línea
              fijados a mano (mismo criterio que la bio de la izquierda) — al
              estar alineado a la derecha, cada línea más corta queda más
              desplazada hacia la derecha por sí sola, sin necesitar
              shape-outside. */}
          <div ref={bioRightRef} className="max-w-[260px] sm:max-w-[300px] text-right" style={{ opacity: 0, transition: 'transform 0.2s ease-out' }}>
            {/* Antes blanco puro (text-cyber-textBright), después
                text-pink-100/85 — pedido explícito de bajar más la opacidad
                (más transparente) en vez de un blanco casi sólido. */}
            <p
              className="text-pink-100/60 text-base sm:text-lg leading-relaxed italic font-medium drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)]"
              style={{ fontFamily: '"Times New Roman", Times, serif' }}
            >
              <span className="block whitespace-nowrap">Construyo interfaces interactivas de</span>
              <span className="block whitespace-nowrap">alto impacto e integro el diseño</span>
              <span className="block whitespace-nowrap">con el código, no solo</span>
              <span className="block whitespace-nowrap">funcional sino</span>
              <span className="block whitespace-nowrap">trabajado.</span>
            </p>
          </div>

          {/* Botones de Acción, en columna vertical y con contenedor desacoplado de GSAP */}
          <div
            ref={iconsRef}
            className="flex flex-col items-end gap-4"
            style={{ opacity: 0, pointerEvents: iconsInteractive ? 'auto' : 'none' }}
          >
            <div className="social-icon-wrapper pointer-events-auto">
              <SocialIconButton
                href={profile.linkedin}
                label="LinkedIn"
                variant="cyan"
                size="xl"
                magnetic={iconsInteractive}
                icon={<Linkedin className="w-7 h-7 sm:w-9 sm:h-9" />}
              />
            </div>
            <div className="social-icon-wrapper pointer-events-auto">
              <SocialIconButton
                href={profile.whatsapp}
                label="WhatsApp"
                variant="magenta"
                size="xl"
                magnetic={iconsInteractive}
                icon={<MessageCircle className="w-7 h-7 sm:w-9 sm:h-9" />}
              />
            </div>
            <div className="social-icon-wrapper pointer-events-auto">
              <SocialIconButton
                href={profile.github}
                label="GitHub"
                variant="crimson"
                size="xl"
                magnetic={iconsInteractive}
                icon={<Github className="w-7 h-7 sm:w-9 sm:h-9" />}
              />
            </div>
          </div>
        </div>

        {/* ======================================================== */}
        {/* NOMBRE + UBICACIÓN + BIO: arriba a la izquierda.           */}
        {/* ======================================================== */}
        <div className="hidden absolute inset-x-0 top-6 sm:top-10 z-20 px-6 sm:px-12 lg:px-16 pointer-events-none">
        <div className="w-full max-w-xl sm:max-w-2xl lg:max-w-3xl flex flex-col items-start text-left pointer-events-none">

          {/* Nombre + ubicación como UN SOLO grupo interactivo: se inclinan
              juntos hacia el cursor cuando se acerca (useProximityTilt),
              pedido explícito de la usuaria — "todo esté animado en
              conjunto". */}
          <div ref={nameLocationGroupRef} className="flex flex-col items-start" style={{ transition: 'transform 0.2s ease-out' }}>
            <div className="relative overflow-visible mb-1 w-full">
              <h1
                ref={nameRef}
                className="font-pixel text-2xl sm:text-3xl md:text-4xl lg:text-5xl leading-relaxed tracking-normal text-cyber-magenta uppercase"
                // opacity:0 de entrada (no solo vía GSAP en un efecto): sin
                // esto, el PRIMER pintado del navegador —antes de que React
                // llegue a correr el efecto que oculta todo para el
                // tipeado— mostraba el nombre completo a opacidad 1 durante
                // un instante en cada F5. Reportado explícito ("por un
                // segundo cargan los títulos del hero").
                style={{ opacity: 0, textShadow: '0 0 16px rgba(224,25,133,0.65), 0 0 40px rgba(224,25,133,0.3)' }}
              >
                <span
                  ref={nameLine1Ref}
                  className="block whitespace-nowrap"
                  style={{ clipPath: 'inset(0% 100% 0% 0%)' }}
                >
                  {NAME_LINE_1}
                </span>
                <span
                  ref={nameLine2Ref}
                  className="block whitespace-nowrap text-cyber-magenta/75"
                  style={{ clipPath: 'inset(0% 100% 0% 0%)' }}
                >
                  {NAME_LINE_2}
                  <span
                    ref={nameCursorRef}
                    className="inline-block w-[3px] h-[0.7em] ml-2 align-middle bg-cyber-magenta/75"
                    style={{ animation: 'blink-cursor 1s steps(1) infinite', boxShadow: '0 0 8px rgba(224,25,133,0.7)' }}
                  />
                </span>
              </h1>
            </div>

            {/* Ubicación: solo texto, sin contenedor de botón — pedido
                explícito de quitar el fondo rosado y el borde, dejando la
                misma fuente/color pero como una etiqueta simple, no un chip. */}
            <div
              ref={locationRef}
              className="inline-flex items-center gap-2 text-cyber-magenta text-xs sm:text-sm font-mono tracking-wide uppercase"
              style={{ opacity: 0 }}
            >
              <MapPin className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-cyber-magenta" />
              <span>{profile.location}</span>
            </div>
          </div>

          {/* BIO: pegada justo debajo de la ubicación.
              Cada línea es un span con whitespace-nowrap (no un simple <br />
              dentro de un contenedor angosto): a max-w-[260/300px] la primera
              línea ("Ingeniera Electrónica con experiencia") no entraba
              completa y el navegador la envolvía ANTES del <br /> manual,
              partiéndola en dos. Con nowrap por línea, cada una se mantiene
              exactamente como se definió sin importar el ancho disponible. */}
          <div ref={bioRef} className="text-left mt-6" style={{ opacity: 0, transition: 'transform 0.2s ease-out' }}>
            <p
              className="text-pink-100/60 text-lg sm:text-xl leading-relaxed italic font-medium drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)]"
              style={{ fontFamily: '"Times New Roman", Times, serif' }}
            >
              <span className="block whitespace-nowrap">Ingeniera Electrónica con experiencia</span>
              <span className="block whitespace-nowrap">en robótica, programación</span>
              <span className="block whitespace-nowrap">orientada a objetos y</span>
              <span className="block whitespace-nowrap">desarrollo de</span>
              <span className="block whitespace-nowrap">software.</span>
            </p>
          </div>
        </div>
        </div>

        {/* "Ver más": ÚLTIMO elemento de la cadena de entrada (junto con
            todo lo demás en el frame final, no por umbral de scroll aparte
            — pedido explícito). El wrapper externo solo se encarga de
            apagarlo cuando arranca la disolución (eso sí es scroll-driven,
            tiene sentido ahí); seeMoreRef (adentro) es el que la cadena de
            GSAP muestra/oculta. Ahora también es CLICKEABLE (pointer-events-
            auto en el div interno, ya que el externo sigue con -none) y
            dispara el mismo puente automático que el scroll — pedido
            explícito de que "se le dé clic a Ver más" también arranque la
            secuencia. */}
        <div
          className={`hidden absolute bottom-8 left-6 sm:left-12 z-20 pointer-events-none transition-opacity duration-500 ${
            heroProgress < HERO_DISSOLVE_START ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <div
            ref={seeMoreRef}
            className="flex flex-col items-center gap-1 pointer-events-auto cursor-pointer"
            style={{ opacity: 0, transition: 'transform 0.2s ease-out' }}
            onClick={() => {
              if (bridgeStateRef.current === 'idle') triggerBridgeRef.current();
            }}
          >
            <span
              className="font-mono text-[10px] sm:text-xs tracking-[0.2em] uppercase text-cyber-magenta"
              style={{ textShadow: '0 0 8px rgba(224,25,133,0.6)' }}
            >
              Ver más
            </span>
            <ChevronDown
              strokeWidth={2.5}
              className="w-4 h-4 sm:w-5 sm:h-5 text-cyber-magenta"
              style={{
                filter: 'drop-shadow(0 0 6px rgba(224,25,133,0.7))',
                animation: 'chevron-cascade 1.6s ease-in-out infinite',
              }}
            />
          </div>
        </div>

        {/* ======================================================== */}
        {/* INDICADOR INICIAL: chip de circuito centrado en pantalla, es lo  */}
        {/* primero que se ve al abrir la página, antes de scrollear.       */}
        {/* Ahora se desvanece con una timeline propia (0.5s power2.out) en */}
        {/* vez de una opacidad calculada linealmente del scroll.           */}
        {/* ======================================================== */}
        {/* REDISEÑO: la pantalla de bloqueo (lluvia de números + tarjeta) se
            retiró de la primera vista — pedido explícito de no sobreponer capas;
            la portada editorial (HeroEditorial) es ahora lo primero que se ve y
            la entrada del avatar arranca sola al cargar. El div queda (vacío)
            porque la timeline del screensaver usa la ref. */}
        <div ref={screensaverRef} style={{ opacity: 1 }} />
      </div>
    </div>
  );
};
