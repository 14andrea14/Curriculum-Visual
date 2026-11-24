# Portafolio interactivo de Alejandra Arismendi

Portafolio web de una sola página con animación guiada por el scroll: portada con secuencia de fotogramas,
secciones con escenas 3D, una mano de póker para los proyectos, un mapa de niveles para la experiencia y
un pie de página con efectos de cristal.

El contenido (perfil, experiencia, proyectos, formación y datos de contacto) vive en
[`src/data/portfolioData.ts`](src/data/portfolioData.ts).

## Stack

- React 18 + TypeScript
- Vite 6
- Tailwind CSS 3
- three.js con `@react-three/fiber` y `@react-three/drei`
- GSAP (ScrollTrigger) y Lenis para el scroll suave
- Despliegue pensado para Vercel (sitio estático)

## Requisitos

- Node.js 20 o superior (se recomienda 22.x)
- npm (incluido con Node)

## Comandos

```bash
npm ci            # instala las dependencias exactas del package-lock.json
npm run dev       # servidor de desarrollo en http://localhost:3000
npm run build     # comprueba tipos (tsc) y genera la carpeta dist/
npm run preview   # sirve dist/ en local para probar el build
```

## Estructura

```
index.html          Entrada, metadatos SEO y Open Graph
vercel.json         Reescritura SPA, caché y cabeceras de seguridad
vite.config.ts      Configuración de Vite (+ plugin que genera robots.txt y sitemap.xml)
public/             Imágenes, secuencias de fotogramas, íconos, og-image y el PDF del CV
src/                Código de la aplicación
scripts/make-brand-assets.mjs   Regenera íconos y og-image a partir de public/hero-still/smile.webp
docs/DEPLOY_VERCEL.md           Guía detallada de despliegue
```

## Despliegue en Vercel

Guía detallada, con comprobaciones y solución de problemas: [`docs/DEPLOY_VERCEL.md`](docs/DEPLOY_VERCEL.md).
Resumen de los pasos para quien despliega:

1. En Vercel: **Add New... > Project > Import Git Repository** y elige este repositorio (rama `main`).
2. En **Configure Project** deja o ajusta:

   | Campo | Valor |
   | --- | --- |
   | Framework Preset | Vite |
   | Root Directory | `./` (raíz) |
   | Build Command | `npm run build` |
   | Output Directory | `dist` |
   | Install Command | `npm ci` |
   | Node.js Version | 22.x (o 20.x), en *Settings > General* |

   El archivo `vercel.json` ya declara el framework, el build y el directorio de salida.
3. **Variables de entorno:** no hay ninguna obligatoria.
   Opcional: `VITE_SITE_URL=https://tu-dominio.com` (sin barra final) para que el `canonical`, las etiquetas
   Open Graph/Twitter, `robots.txt` y `sitemap.xml` usen tu dominio propio. Si no la defines, el build usa
   automáticamente la URL `.vercel.app` del proyecto (variable `VERCEL_PROJECT_PRODUCTION_URL` que Vercel inyecta).
   Si añades un dominio propio después, define `VITE_SITE_URL` y vuelve a desplegar.
4. Pulsa **Deploy**.

### Cómo verificar el despliegue

- La página carga y no muestra errores en la consola del navegador.
- `https://TU-DOMINIO/robots.txt` y `https://TU-DOMINIO/sitemap.xml` devuelven texto con tu URL.
- `https://TU-DOMINIO/Alejandra_Arismendi_CV.pdf` descarga el CV.
- Archivos con hash: `curl -I https://TU-DOMINIO/assets/<archivo>.js` debe mostrar
  `Cache-Control: public, max-age=31536000, immutable`.
- Al compartir el enlace (WhatsApp, LinkedIn, Facebook) aparece la imagen y el título. Estas plataformas
  guardan en caché la vista previa: usa su depurador para refrescarla si cambias la imagen.

### Aviso sobre la caché inmutable

Las carpetas de imágenes de `public/` (`hero-frames`, `transform-frames-cut`, `cat-frames-cut`, `poses`, etc.)
se sirven con `Cache-Control: immutable` durante un año. Si reemplazas una imagen conservando el mismo nombre,
los visitantes que ya la tengan seguirán viendo la anterior. **Si cambias una imagen, renómbrala**
(por ejemplo `pose-1.webp` a `pose-1-v2.webp`) y actualiza la referencia en el código.

## Licencia y contenido

El código es el de este portafolio. Textos, imágenes y el CV pertenecen a su autora; no los reutilices sin permiso.
