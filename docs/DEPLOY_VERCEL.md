# Despliegue en Vercel

Guía detallada para desplegar el portafolio (sitio estático hecho con Vite) en Vercel. El resumen corto está en el
[README](../README.md#despliegue-en-vercel).

## 1. Configuración del proyecto en el panel

Al importar el repositorio (**Add New... > Project > Import Git Repository**, rama `main`):

| Campo | Valor |
| --- | --- |
| Framework Preset | **Vite** |
| Root Directory | `./` (la raíz del repositorio) |
| Build Command | `npm run build` (ejecuta `tsc && vite build`) |
| Output Directory | `dist` |
| Install Command | `npm ci` |
| Node.js Version | **22.x** (20.x también sirve) |

`vercel.json` ya declara `framework`, `buildCommand` y `outputDirectory`, así que normalmente el panel los
detecta solo; revisa que coincidan.

### Versión de Node

`package.json` no declara `engines`. Las dependencias exigen como mínimo Node 20.9 (por ejemplo `sharp`) y Vite 6
admite Node 18, 20 o 22 y superiores. Recomendación: elegir **22.x** en *Settings > General > Node.js Version*.
No hace falta añadir `engines` al `package.json`: si se pone un rango abierto como `">=20"`, Vercel ignora la
versión del panel y puede subir de versión sin avisar; si se quiere fijar, usa `"node": "22.x"`.

## 2. Variables de entorno

Ninguna es obligatoria.

| Variable | Para qué | Cuándo definirla |
| --- | --- | --- |
| `VITE_SITE_URL` | URL pública absoluta del sitio, sin barra final: `https://tu-dominio.com`. Se usa en `canonical`, `og:url`, `og:image`, `twitter:image`, `robots.txt` y `sitemap.xml`. | Opcional. Solo si usas dominio propio. Se define en *Settings > Environment Variables* (Production) y se vuelve a desplegar. |
| `VERCEL_PROJECT_PRODUCTION_URL` | La inyecta Vercel sola (dominio de producción más corto, sin `https://`, por ejemplo `mi-proyecto.vercel.app`). | No se define a mano. Requiere que esté activo *Automatically expose System Environment Variables* (viene activado por defecto). |

Orden de prioridad en `vite.config.ts`: `VITE_SITE_URL` > `VERCEL_PROJECT_PRODUCTION_URL` > `http://localhost:3000`.
Si en el build aparece `localhost:3000` en las etiquetas Open Graph, ninguna de las dos variables llegó al build.

Estas URLs se "hornean" durante el build: si cambias la variable o añades un dominio, hay que **redesplegar**.

## 3. Dominio personalizado

1. *Settings > Domains > Add* e indica el dominio (por ejemplo `tu-dominio.com`).
2. Crea en tu proveedor de DNS el registro que Vercel indique (normalmente `A` a `76.76.21.21` para el dominio raíz
   y `CNAME` a `cname.vercel-dns.com` para `www`; usa los valores que muestre el panel, son los vigentes).
3. Define `VITE_SITE_URL=https://tu-dominio.com` y redespliega.
4. Opcional: marca un dominio como principal para que el otro redirija.

## 4. Comprobaciones tras el despliegue

Sustituye `TU-DOMINIO` por tu URL.

- **Página**: abre la URL en una ventana de incógnito en móvil y escritorio; sin errores en la consola.
- **robots.txt**: `curl https://TU-DOMINIO/robots.txt` debe terminar con `Sitemap: https://TU-DOMINIO/sitemap.xml`.
- **sitemap.xml**: `curl https://TU-DOMINIO/sitemap.xml` debe tener `<loc>https://TU-DOMINIO/</loc>`.
- **Open Graph**: `curl -s https://TU-DOMINIO/ | grep -E "og:|canonical|twitter:"` debe mostrar URLs absolutas
  con tu dominio. Para ver la vista previa real usa los depuradores:
  - Facebook: <https://developers.facebook.com/tools/debug/>
  - LinkedIn: <https://www.linkedin.com/post-inspector/>
  - WhatsApp no tiene depurador: copia el enlace en un chat.

  Todas **cachean** la vista previa (WhatsApp y LinkedIn durante días). Si cambias `og-image.jpg` o los textos,
  vuelve a "raspar" la URL en el depurador; en WhatsApp a veces solo ayuda añadir `?v=2` al enlace.
- **Cabeceras de caché**: `curl -I https://TU-DOMINIO/assets/<un-archivo-con-hash>.js` debe mostrar
  `cache-control: public, max-age=31536000, immutable`. Lo mismo para `/hero-frames/poster.webp` y el resto de carpetas
  de imágenes. `curl -I https://TU-DOMINIO/` debe mostrar `max-age=0, must-revalidate` (así el HTML siempre es fresco).
- **Cabeceras de seguridad**: en `curl -I https://TU-DOMINIO/` deben aparecer `x-content-type-options: nosniff`,
  `x-frame-options: DENY`, `referrer-policy` y `permissions-policy`.
- **Reescritura SPA**: `curl -I https://TU-DOMINIO/cualquier-ruta` devuelve `200` con el HTML de la página.
- **CV**: `https://TU-DOMINIO/Alejandra_Arismendi_CV.pdf` descarga el PDF (`content-type: application/pdf`).

### Por qué `cleanUrls` y las reescrituras no rompen archivos estáticos

En Vercel, los archivos que existen en el output (`dist/`) tienen prioridad sobre las reescrituras: la regla
`/(.*) -> /index.html` solo se aplica cuando no existe un archivo con esa ruta. Por eso `/Alejandra_Arismendi_CV.pdf`,
`/robots.txt`, `/sitemap.xml` y `/assets/...` se sirven tal cual. `cleanUrls` solo quita la extensión `.html` de las páginas.

## 5. Aviso sobre la caché inmutable

`vercel.json` sirve con `Cache-Control: public, max-age=31536000, immutable` (un año, sin revalidar):

- `/assets/*`: seguro, Vite les pone un hash en el nombre y cambia cuando cambia el contenido.
- Carpetas de `public/` con nombre fijo: `transform-frames-cut`, `cat-frames-cut`, `cover-frames-cut`, `hero-frames`,
  `wink-frames-cut`, `hero-still`, `lettering`, `poses`, `poker`, `space`, `footer`, `cards`, `logos`, `experience`,
  `contact`, `office`.

**Esas carpetas no llevan hash.** Si reemplazas una imagen conservando el mismo nombre, quien ya la visitó seguirá
viendo la antigua hasta un año. **Si cambias una imagen, renómbrala** (`pose-1.webp` a `pose-1-v2.webp`) y actualiza
la referencia en el código. Los íconos y `og-image.jpg` tienen caché de 1 día.

Si se añade una carpeta nueva de imágenes en `public/` y se quiere el mismo comportamiento, hay que añadirla a la
expresión de la segunda regla de `headers` en `vercel.json`.

## 6. Regenerar íconos e imagen para redes

`node scripts/make-brand-assets.mjs` regenera `favicon.ico`, `favicon-32x32.png`, `apple-touch-icon.png`,
`icon-192.png`, `icon-512.png` y `og-image.jpg` (1200x630) a partir de `public/hero-still/smile.webp`.
Si cambias `og-image.jpg`, recuerda refrescar la caché de los depuradores (sección 4).

## 7. Solución de problemas

- **El build falla en `tsc`**: ejecuta `npm run build` en local; el error de tipos es el mismo.
- **`npm ci` falla por el lockfile**: no se debe modificar `package.json` sin actualizar `package-lock.json`.
- **La vista previa al compartir no cambia**: es la caché de la plataforma (sección 4).
- **Las etiquetas Open Graph apuntan a `localhost:3000`**: define `VITE_SITE_URL` o revisa que estén expuestas las variables
  de sistema, y redespliega.
- **Una imagen "no se actualiza"**: caché inmutable, renombra el archivo (sección 5).
