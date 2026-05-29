import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

const __dirname = dirname(fileURLToPath(import.meta.url))
const publicDir = join(__dirname, '..', 'public')

function createSVGIcon(size, safeZone = false) {
  if (safeZone) {
    const iconSize = size * 0.6
    const offset = (size - iconSize) / 2
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="#667eea"/>
  <text x="${size / 2}" y="${offset + iconSize * 0.65}" font-size="${iconSize * 0.7}" text-anchor="middle" fill="white" font-family="Arial, Helvetica, sans-serif" font-weight="bold">⚡</text>
</svg>`
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#667eea;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#764ba2;stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${size * 0.15}" fill="url(#bg)"/>
  <text x="${size / 2}" y="${size * 0.62}" font-size="${size * 0.45}" text-anchor="middle" fill="white" font-family="Arial, Helvetica, sans-serif" font-weight="bold">⚡</text>
</svg>`
}

async function generate() {
  console.log('Generating PWA icons...')

  const svg192 = createSVGIcon(192)
  const svg512 = createSVGIcon(512)
  const svgMask512 = createSVGIcon(512, true)
  const svg180 = createSVGIcon(180)

  await sharp(Buffer.from(svg192)).png().toFile(join(publicDir, 'pwa-192x192.png'))
  console.log('✓ pwa-192x192.png')

  await sharp(Buffer.from(svg512)).png().toFile(join(publicDir, 'pwa-512x512.png'))
  console.log('✓ pwa-512x512.png')

  await sharp(Buffer.from(svgMask512)).png().toFile(join(publicDir, 'pwa-mask-512.png'))
  console.log('✓ pwa-mask-512.png (maskable)')

  await sharp(Buffer.from(svg180)).png().toFile(join(publicDir, 'apple-touch-icon.png'))
  console.log('✓ apple-touch-icon.png')

  console.log('\nAll icons generated successfully!')
}

generate().catch(console.error)
