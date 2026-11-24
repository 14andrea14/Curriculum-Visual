import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// URL pública del sitio (para canonical, Open Graph, robots y sitemap, que exigen URLs absolutas).
// Prioridad: VITE_SITE_URL (dominio propio, se define en Vercel > Settings > Environment Variables)
// → VERCEL_PROJECT_PRODUCTION_URL (la URL .vercel.app que Vercel inyecta sola) → localhost.
const siteUrl = (): string => {
  const own = process.env.VITE_SITE_URL;
  if (own) return own.replace(/\/+$/, '');
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return `https://${vercel}`;
  return 'http://localhost:3000';
};

// Sustituye %SITE_URL% en index.html y genera robots.txt + sitemap.xml con la URL real.
const siteMeta = (): Plugin => ({
  name: 'site-meta',
  transformIndexHtml: (html) => html.replace(/%SITE_URL%/g, siteUrl()),
  generateBundle() {
    const url = siteUrl();
    this.emitFile({ type: 'asset', fileName: 'robots.txt', source: `User-agent: *\nAllow: /\n\nSitemap: ${url}/sitemap.xml\n` });
    this.emitFile({
      type: 'asset',
      fileName: 'sitemap.xml',
      source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url>\n    <loc>${url}/</loc>\n    <changefreq>monthly</changefreq>\n    <priority>1.0</priority>\n  </url>\n</urlset>\n`,
    });
  },
});

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), siteMeta()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    // Los vendors van en chunks propios y estables: el navegador los cachea y solo
    // vuelve a bajar el código de la página cuando ésta cambia. Se descargan en
    // paralelo (HTTP/2) en lugar de un único archivo de 1.6 MB.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/[\/]node_modules[\/](react|react-dom|scheduler)[\/]/.test(id)) return 'react';
          if (/[\/]node_modules[\/](gsap|lenis)[\/]/.test(id)) return 'motion';
          if (/[\/]node_modules[\/](three|@react-three|three-stdlib|three-mesh-bvh|troika-[^\/]+|meshline|maath|camera-controls|detect-gpu|suspend-react|zustand|its-fine|react-reconciler|react-use-measure|@mediapipe|stats-gl|stats\.js|tunnel-rat|hls\.js|bidi-js|webgl-sdf-generator|utility-types|potpack|@monogrid|glsl-noise|use-sync-external-store)[\/]/.test(id))
            return 'three';
          return undefined;
        },
      },
    },
    chunkSizeWarningLimit: 900,
  },
  server: {
    port: 3000,
    open: false,
    watch: {
      ignored: [
        '**/*.pdf',
        '**/*.mp4',
        '**/*.webm',
        '**/*.mov',
        '**/*.avi',
        '**/*.png',
        '**/*.jpg',
        '**/*.webp',
        '**/*.glb',
        '**/*.gltf',
        '**/scratch/**',
        '**/node_modules/**',
        '**/.git/**',
      ],
    },
  },
});
