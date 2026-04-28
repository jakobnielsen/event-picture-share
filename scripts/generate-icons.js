#!/usr/bin/env node
// Generates simple placeholder PWA icons using only Node.js built-ins (no canvas dep).
// Replace the output PNGs with your own artwork any time.
//
// Usage:  node scripts/generate-icons.js

import { writeFileSync, mkdirSync } from 'fs'
import { fileURLToPath } from 'url'
import { join, dirname } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = join(__dirname, '..', 'public', 'icons')

mkdirSync(OUT_DIR, { recursive: true })

// Minimal PNG encoder (no dependencies) ─────────────────────────────
// Encodes a 32-bit RGBA image as a valid PNG.

function crc32(buf) {
  let crc = 0xffffffff
  const table = crc32.table || (crc32.table = (() => {
    const t = new Uint32Array(256)
    for (let i = 0; i < 256; i++) {
      let c = i
      for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      t[i] = c
    }
    return t
  })())
  for (const byte of buf) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function adler32(data) {
  let a = 1, b = 0
  for (const byte of data) { a = (a + byte) % 65521; b = (b + a) % 65521 }
  return (b << 16) | a
}

function deflateRaw(data) {
  // Stored (uncompressed) deflate block — simplest valid deflate
  const out = []
  let offset = 0
  while (offset < data.length) {
    const blockLen = Math.min(data.length - offset, 65535)
    const last = offset + blockLen >= data.length ? 1 : 0
    out.push(last, blockLen & 0xff, (blockLen >> 8) & 0xff, (~blockLen) & 0xff, (~blockLen >> 8) & 0xff)
    for (let i = 0; i < blockLen; i++) out.push(data[offset + i])
    offset += blockLen
  }
  return new Uint8Array(out)
}

function zlib(data) {
  const raw = deflateRaw(data)
  const chk = adler32(data)
  return new Uint8Array([
    0x78, 0x01,           // zlib header (deflate, default compression)
    ...raw,
    (chk >> 24) & 0xff, (chk >> 16) & 0xff, (chk >> 8) & 0xff, chk & 0xff,
  ])
}

function uint32BE(n) {
  return [(n >> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]
}

function chunk(type, data) {
  const typeBytes = Array.from(type).map(c => c.charCodeAt(0))
  const all = [...typeBytes, ...data]
  const c = crc32(new Uint8Array(all))
  return [...uint32BE(data.length), ...typeBytes, ...data, ...uint32BE(c)]
}

function encodePNG(width, height, getPixel) {
  // Build raw image data with filter byte 0 per row
  const rowBytes = width * 4
  const raw = new Uint8Array(height * (rowBytes + 1))
  for (let y = 0; y < height; y++) {
    raw[y * (rowBytes + 1)] = 0  // filter type: None
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = getPixel(x, y)
      const off = y * (rowBytes + 1) + 1 + x * 4
      raw[off] = r; raw[off + 1] = g; raw[off + 2] = b; raw[off + 3] = a
    }
  }

  const ihdr = chunk('IHDR', [...uint32BE(width), ...uint32BE(height), 8, 6, 0, 0, 0])
  const idat = chunk('IDAT', [...zlib(raw)])
  const iend = chunk('IEND', [])

  return Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,  // PNG signature
    ...ihdr, ...idat, ...iend,
  ])
}

// Icon renderer ──────────────────────────────────────────────────────
// Draws a blue rounded-square background with a white camera emoji stand-in.

function renderIcon(size) {
  const bg = { r: 26, g: 115, b: 232 }   // --blue: #1a73e8
  const fg = { r: 255, g: 255, b: 255 }

  const radius = Math.round(size * 0.22)

  function inRoundedRect(x, y) {
    const cx = Math.min(Math.max(x, radius), size - 1 - radius)
    const cy = Math.min(Math.max(y, radius), size - 1 - radius)
    return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2
  }

  // Simple camera body shape (filled rectangles)
  const camW = Math.round(size * 0.52), camH = Math.round(size * 0.38)
  const camX = Math.round((size - camW) / 2), camY = Math.round(size * 0.33)
  const lensR = Math.round(size * 0.13)
  const lensX = Math.round(size / 2), lensY = Math.round(camY + camH / 2)
  // Viewfinder bump
  const bumpW = Math.round(size * 0.15), bumpH = Math.round(size * 0.09)
  const bumpX = Math.round(size / 2 - bumpW / 2), bumpY = camY - bumpH

  function isCameraPixel(x, y) {
    if (x >= camX && x < camX + camW && y >= camY && y < camY + camH) return true
    if (x >= bumpX && x < bumpX + bumpW && y >= bumpY && y < bumpY + bumpH) return true
    return false
  }

  function isLensPixel(x, y) {
    return (x - lensX) ** 2 + (y - lensY) ** 2 <= lensR ** 2
  }

  function isInnerLens(x, y) {
    const innerR = Math.round(lensR * 0.55)
    return (x - lensX) ** 2 + (y - lensY) ** 2 <= innerR ** 2
  }

  return encodePNG(size, size, (x, y) => {
    if (!inRoundedRect(x, y)) return [0, 0, 0, 0]  // transparent outside

    if (isCameraPixel(x, y)) {
      if (isInnerLens(x, y)) return [bg.r, bg.g, bg.b, 255]  // lens opening = bg colour
      if (isLensPixel(x, y)) return [fg.r, fg.g, fg.b, 230]  // lens ring
      return [fg.r, fg.g, fg.b, 255]  // camera body
    }

    return [bg.r, bg.g, bg.b, 255]  // background
  })
}

for (const size of [192, 512]) {
  const png = renderIcon(size)
  const outPath = join(OUT_DIR, `icon-${size}.png`)
  writeFileSync(outPath, png)
  console.log(`✓ ${outPath}  (${png.length} bytes)`)
}
