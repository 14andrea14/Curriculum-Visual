// Genera los íconos y la imagen para redes (Open Graph) a partir de public/hero-still/smile.webp.
// Uso: node scripts/make-brand-assets.mjs   (requiere sharp: npm i)
import sharp from 'sharp';
import fs from 'node:fs';

const SRC = 'public/hero-still/smile.webp'; // recorte de la cara con fondo transparente (1600x900)
const NAVY = '#0A1A2B';
const MAGENTA = '#F230D2';

// ── Ícono cuadrado: cara recortada sobre azul noche ──────────────────────────────────────
const face = await sharp(SRC).extract({ left: 640, top: 40, width: 640, height: 640 }).toBuffer();
const icon = async (size, radiusPct = 0.22) => {
  const r = Math.round(size * radiusPct);
  const mask = Buffer.from(`<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${r}" fill="#fff"/></svg>`);
  const bg = Buffer.from(
    `<svg width="${size}" height="${size}"><defs><radialGradient id="g" cx="50%" cy="45%" r="70%"><stop offset="0" stop-color="#3a1550"/><stop offset="1" stop-color="${NAVY}"/></radialGradient></defs><rect width="${size}" height="${size}" fill="url(#g)"/></svg>`,
  );
  const f = await sharp(face).resize(size, size).toBuffer();
  return sharp(bg)
    .composite([{ input: f }])
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer();
};
const [p32, p180, p192, p512] = await Promise.all([icon(32), icon(180, 0.2), icon(192), icon(512)]);
fs.writeFileSync('public/favicon-32x32.png', p32);
fs.writeFileSync('public/apple-touch-icon.png', p180);
fs.writeFileSync('public/icon-192.png', p192);
fs.writeFileSync('public/icon-512.png', p512);

// favicon.ico (contenedor ICO con un PNG de 32x32 adentro)
const hdr = Buffer.alloc(22);
hdr.writeUInt16LE(0, 0); hdr.writeUInt16LE(1, 2); hdr.writeUInt16LE(1, 4);
hdr[6] = 32; hdr[7] = 32; hdr[8] = 0; hdr[9] = 0;
hdr.writeUInt16LE(1, 10); hdr.writeUInt16LE(32, 12);
hdr.writeUInt32LE(p32.length, 14); hdr.writeUInt32LE(22, 18);
fs.writeFileSync('public/favicon.ico', Buffer.concat([hdr, p32]));

// ── Imagen para compartir (1200x630) ─────────────────────────────────────────────────────
const W = 1200, H = 630;
const bg = Buffer.from(
  `<svg width="${W}" height="${H}"><defs>
    <radialGradient id="a" cx="78%" cy="40%" r="65%"><stop offset="0" stop-color="#5a1a6e"/><stop offset="0.55" stop-color="#14203a"/><stop offset="1" stop-color="${NAVY}"/></radialGradient>
    <linearGradient id="l" x1="0" x2="1"><stop offset="0" stop-color="${MAGENTA}"/><stop offset="1" stop-color="#ff7ae8"/></linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#a)"/>
  <rect x="70" y="330" width="120" height="6" rx="3" fill="url(#l)"/>
  <text x="70" y="200" font-family="Arial Black, Impact, Arial, sans-serif" font-size="74" font-weight="900" fill="#ECE8F2">ALEJANDRA</text>
  <text x="70" y="282" font-family="Arial Black, Impact, Arial, sans-serif" font-size="74" font-weight="900" fill="#ECE8F2">ARISMENDI</text>
  <text x="70" y="400" font-family="Arial, Helvetica, sans-serif" font-size="27" fill="${MAGENTA}" letter-spacing="3">INGENIERÍA ELECTRÓNICA · IA</text>
  <text x="70" y="445" font-family="Arial, Helvetica, sans-serif" font-size="27" fill="#ECE8F2" letter-spacing="3">DISEÑO &amp; DESARROLLO WEB</text>
  </svg>`,
);
// el sujeto ocupa la mitad derecha del recorte: se corta el aire de la izquierda y se ajusta al alto
const portrait = await sharp(SRC).extract({ left: 690, top: 0, width: 880, height: 900 }).resize({ height: H }).toBuffer();
const pm = await sharp(portrait).metadata(); // ~756 x 630
await sharp(bg)
  .composite([{ input: portrait, left: W - pm.width + 30, top: 0 }])
  .jpeg({ quality: 86, mozjpeg: true })
  .toFile('public/og-image.jpg');
console.log('listo: favicon.ico, favicon-32x32.png, apple-touch-icon.png, icon-192/512.png, og-image.jpg');
