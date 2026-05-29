import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

const __dirname = dirname(fileURLToPath(import.meta.url))
const publicDir = join(__dirname, '..', 'public')

function createSVGIcon(size, safeZone = false) {
  const bgRadius = safeZone ? 0 : Math.round(size * 0.15)

  const boltSize = safeZone ? size * 0.45 : size * 0.5
  const cx = size / 2
  const cy = size / 2
  const half = boltSize / 2

  const points = [
    `${cx + half * 0.2},${cy - half}`,
    `${cx - half * 0.5},${cy + half * 0.05}`,
    `${cx - half * 0.05},${cy + half * 0.05}`,
    `${cx - half * 0.2},${cy + half}`,
    `${cx + half * 0.5},${cy - half * 0.05}`,
    `${cx + half * 0.05},${cy - half * 0.05}`,
  ].join(' ')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#667eea" />
      <stop offset="100%" stop-color="#764ba2" />
    </linearGradient>
    <linearGradient id="bolt" x1="30%" y1="0%" x2="70%" y2="100%">
      <stop offset="0%" stop-color="#FFD700" />
      <stop offset="100%" stop-color="#FF8C00" />
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${bgRadius}" fill="url(#bg)"/>
  <polygon points="${points}" fill="url(#bolt)" stroke="#E8A000" stroke-width="${Math.max(1, size * 0.008)}" stroke-linejoin="round"/>
</svg>`
}

async function generate() {
  console.log('Generating PWA icons...')

  const svg192 = createSVGIcon(192)
  const svg512 = createSVGIcon(512)
  const svgMask512 = createSVGIcon(512, true)
  const svg180 = createSVGIcon(180)

  console.log('SVG preview (192):', svg192.substring(0, 200), '...')

  await sharp(Buffer.from(svg192)).png().toFile(join(publicDir, 'pwa-192x192.png'))
  console.log('✓ pwa-192x192.png')

  await sharp(Buffer.from(svg512)).png().toFile(join(publicDir, 'pwa-512x512.png'))
  console.log('✓ pwa-512x512.png')

  await sharp(Buffer.from(svgMask512)).png().toFile(join(publicDir, 'pwa-mask-512.png'))
  console.log('✓ pwa-mask-512.png (maskable)')

  await sharp(Buffer.from(svg180)).png().toFile(join(publicDir, 'apple-touch-icon.png'))
  console.log('✓ apple-touch-icon.png')

  await sharp(Buffer.from(svg192)).toFile(join(publicDir, 'test-icon.png'))
  console.log('✓ test-icon.png (for debugging)')

  console.log('\nAll icons generated successfully!')
}

generate().catch(console.error)
