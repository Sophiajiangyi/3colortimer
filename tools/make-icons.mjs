#!/usr/bin/env node
// tools/make-icons.mjs — 一次性生成 PWA 图标 PNG，只用 Node 内置 zlib，不装任何依赖。
// 用法：node tools/make-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'icons');

const BG = [0x14, 0x16, 0x1a, 0xff];      // 深色背景 #14161a
const RING = [0x4f, 0x9d, 0xff, 0xff];    // 表环 accent #4f9dff
const HAND = [0xee, 0xf0, 0xf2, 0xff];    // 指针 浅色 #eef0f2

function makeCanvas(size) {
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    data[i * 4] = BG[0];
    data[i * 4 + 1] = BG[1];
    data[i * 4 + 2] = BG[2];
    data[i * 4 + 3] = BG[3];
  }
  return data;
}

function setPixel(data, size, x, y, rgba) {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || y < 0 || x >= size || y >= size) return;
  const idx = (y * size + x) * 4;
  data[idx] = rgba[0]; data[idx + 1] = rgba[1]; data[idx + 2] = rgba[2]; data[idx + 3] = rgba[3];
}

function fillCircle(data, size, cx, cy, r, rgba) {
  const r2 = r * r;
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy <= r2) setPixel(data, size, x, y, rgba);
    }
  }
}

function ringCircle(data, size, cx, cy, rOuter, rInner, rgba) {
  const rO2 = rOuter * rOuter, rI2 = rInner * rInner;
  for (let y = Math.floor(cy - rOuter); y <= Math.ceil(cy + rOuter); y++) {
    for (let x = Math.floor(cx - rOuter); x <= Math.ceil(cx + rOuter); x++) {
      const dx = x - cx, dy = y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 <= rO2 && d2 >= rI2) setPixel(data, size, x, y, rgba);
    }
  }
}

function strokeLine(data, size, x0, y0, x1, y1, thickness, rgba) {
  const dist = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(1, Math.ceil(dist * 2));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = x0 + (x1 - x0) * t;
    const y = y0 + (y1 - y0) * t;
    fillCircle(data, size, x, y, thickness / 2, rgba);
  }
}

function drawIcon(size) {
  const data = makeCanvas(size);
  const cx = size / 2, cy = size / 2;
  const outerR = size * 0.34;
  const ringThickness = size * 0.045;
  ringCircle(data, size, cx, cy, outerR, outerR - ringThickness, RING);
  // 时针（短，指向上偏右，约 11 点方向）
  strokeLine(data, size, cx, cy, cx + outerR * 0.28, cy - outerR * 0.42, size * 0.035, HAND);
  // 分针（长，指向右上，约 2 点方向）
  strokeLine(data, size, cx, cy, cx + outerR * 0.62, cy + outerR * 0.15, size * 0.03, HAND);
  // 中心点
  fillCircle(data, size, cx, cy, size * 0.03, RING);
  return data;
}

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      table[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function encodePng(rgbaData, size) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0);
  ihdrData.writeUInt32BE(size, 4);
  ihdrData.writeUInt8(8, 8);   // bit depth
  ihdrData.writeUInt8(6, 9);   // color type: RGBA
  ihdrData.writeUInt8(0, 10);  // compression
  ihdrData.writeUInt8(0, 11);  // filter
  ihdrData.writeUInt8(0, 12);  // interlace
  const ihdr = chunk('IHDR', ihdrData);

  const rowBytes = size * 4;
  const raw = Buffer.alloc((rowBytes + 1) * size);
  for (let y = 0; y < size; y++) {
    const srcOffset = y * rowBytes;
    const dstOffset = y * (rowBytes + 1);
    raw[dstOffset] = 0; // filter type: none
    Buffer.from(rgbaData.buffer, srcOffset, rowBytes).copy(raw, dstOffset + 1);
  }
  const compressed = deflateSync(raw, { level: 9 });
  const idat = chunk('IDAT', compressed);

  const iend = chunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  for (const size of [192, 512]) {
    const pixels = drawIcon(size);
    const png = encodePng(pixels, size);
    const outPath = join(OUT_DIR, `icon-${size}.png`);
    writeFileSync(outPath, png);
    console.log(`已生成 ${outPath} (${png.length} bytes)`);
  }
}

main();
