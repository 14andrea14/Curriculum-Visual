/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Paleta del rediseño (elegida por la usuaria, 2026-11-17, referencia
        // "neón japonés": pagodas iluminadas sobre noche azul). Roles:
        //  - ink/night/navy: fondos y superficies (de más oscuro a más claro)
        //  - rose:    acento principal — CTAs, palabras clave de titulares
        //  - magenta: brillos/glow, objeto protagonista de cada sección
        //  - cyan:    lo técnico — datos, enlaces, etiquetas de stack
        //  - gold:    destacado puntual y escaso — premios, cifras
        neo: {
          ink: '#060D17',
          night: '#0A1A2B',
          navy: '#123859',
          rose: '#F2075D',
          magenta: '#F230D2',
          cyan: '#0CDBF2',
          gold: '#F2CE16',
        },
        cyber: {
          // Paleta "Cyberpunk Neón" — ver ANALISIS_Y_PLAN_V2.md
          cyan: '#00E5FF',      // Cian Eléctrico — luces de contorno, reflejos, acento primario
          magenta: '#E01985',   // Magenta Neón — brillos, acento secundario
          crimson: '#FF2D55',   // Rojo Carmesí Neón — acentos puntuales, tercer color de contraste
          amber: '#FFB703',     // Ámbar Radiante — reservado EXCLUSIVAMENTE para el punto focal principal
          purple: '#211951',    // Índigo Synthwave — tonos medios / volumen (superficies, no texto)
          dark: '#07060B',      // Negro Abisal — fondo base
          darker: '#040308',
          card: 'rgba(255, 255, 255, 0.06)',
          cardHover: 'rgba(255, 255, 255, 0.1)',
          border: 'rgba(255, 255, 255, 0.2)',
          borderMagenta: 'rgba(255, 255, 255, 0.2)',
          textDim: '#a3a3a3',
          textBright: '#f5f5f5',
        },
      },
      fontFamily: {
        display: ['Sora', 'sans-serif'],
        outfit: ['Outfit', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
        // Fuente pixel/8-bit para el nombre + subtítulo del Hero —
        // referencia: el lettering "HELLO AND WELCOME" que mandó la usuaria.
        // Reemplaza a Anton (usado antes ahí para una referencia distinta,
        // "FLIXXO").
        pixel: ['"Press Start 2P"', 'monospace'],
        // Condensada gruesa para los titulares gigantes del rediseño editorial
        // ("PORTAFOLIO" detrás de la silueta del Hero).
        poster: ['Anton', 'Impact', 'sans-serif'],
        // Manuscrita de acento (frases tipo "Ideas that leave a mark").
        script: ['Caveat', 'cursive'],
        // Fuente retro de terminal CRT para el aviso de scroll — pedido
        // explícito de la usuaria referenciando la estética "hacker
        // manifesto" (texto rosa plano, sin caja, sobre negro).
        terminal: ['"VT323"', 'monospace'],
        // Giro editorial para el Hero (referencia: ricardochance.com) —
        // serif itálica elegante para el titular/nombre, y una sans neutra
        // y limpia para el cuerpo (bio), en vez del mono/geométrico técnico
        // que se usaba antes en esos dos lugares específicos.
        serifItalic: ['"Playfair Display"', 'serif'],
        clean: ['Inter', 'sans-serif'],
      },
      // Todos los glows se neutralizaron a blanco — sin acentos de color en la UI.
      boxShadow: {
        'neon-cyan': '0 0 15px rgba(255, 255, 255, 0.35), 0 0 30px rgba(255, 255, 255, 0.18)',
        'neon-magenta': '0 0 15px rgba(255, 255, 255, 0.35), 0 0 30px rgba(255, 255, 255, 0.18)',
        'neon-crimson': '0 0 15px rgba(255, 255, 255, 0.35), 0 0 30px rgba(255, 255, 255, 0.18)',
        'neon-amber': '0 0 15px rgba(255, 255, 255, 0.4), 0 0 30px rgba(255, 255, 255, 0.2)',
        'neon-purple': '0 0 15px rgba(255, 255, 255, 0.3), 0 0 30px rgba(255, 255, 255, 0.15)',
        'card-glow': '0 8px 32px 0 rgba(0, 0, 0, 0.3), inset 0 0 0 1px rgba(255, 255, 255, 0.12)',
        'card-glow-magenta': '0 8px 32px 0 rgba(0, 0, 0, 0.3), inset 0 0 0 1px rgba(255, 255, 255, 0.12)',
      },
      backgroundImage: {
        'cyber-gradient': 'linear-gradient(135deg, rgba(255, 255, 255, 0.06) 0%, rgba(255, 255, 255, 0.02) 50%, rgba(7, 6, 11, 0.95) 100%)',
        'radial-glow': 'radial-gradient(circle at 50% 50%, rgba(255, 255, 255, 0.08) 0%, rgba(7, 6, 11, 0) 70%)',
        'scanlines': 'repeating-linear-gradient(0deg, rgba(0, 0, 0, 0.15), rgba(0, 0, 0, 0.15) 1px, transparent 1px, transparent 2px)',
      },
      animation: {
        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'float': 'float 6s ease-in-out infinite',
        'glitch': 'glitch 1s linear infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
      },
    },
  },
  plugins: [],
}
