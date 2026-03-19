import { createCanvas } from 'canvas'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const publicDir = path.join(__dirname, '..', 'public')
const iconsDir = path.join(publicDir, 'icons')

// Ensure icons directory exists
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true })
}

function generateIcon(size) {
  const canvas = createCanvas(size, size)
  const ctx = canvas.getContext('2d')

  // Background with rounded corners
  const radius = size * 0.22
  ctx.fillStyle = '#0f1117'
  ctx.beginPath()
  ctx.roundRect(0, 0, size, size, radius)
  ctx.fill()

  // Gold gradient for S
  const gradient = ctx.createLinearGradient(size * 0.3, size * 0.2, size * 0.7, size * 0.8)
  gradient.addColorStop(0, '#f0d78c')
  gradient.addColorStop(0.5, '#d4af64')
  gradient.addColorStop(1, '#b8934a')

  ctx.fillStyle = gradient
  ctx.font = `bold ${size * 0.55}px Georgia, serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('S', size / 2, size / 2 + size * 0.02)

  return canvas.toBuffer('image/png')
}

// Generate icons
console.log('Generating PWA icons...')

fs.writeFileSync(path.join(iconsDir, 'icon-192.png'), generateIcon(192))
console.log('Created icon-192.png')

fs.writeFileSync(path.join(iconsDir, 'icon-512.png'), generateIcon(512))
console.log('Created icon-512.png')

// Also create apple-touch-icon
fs.writeFileSync(path.join(iconsDir, 'apple-touch-icon.png'), generateIcon(180))
console.log('Created apple-touch-icon.png')

console.log('Done!')
