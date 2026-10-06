import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const assets = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../assets');
mkdirSync(assets, { recursive: true });

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

function png(width, height, paint) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < width; x += 1) {
      raw.set(paint(x + 0.5, y + 0.5, width, height), row + 1 + x * 4);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function rgb(hex) {
  return [Number.parseInt(hex.slice(1, 3), 16), Number.parseInt(hex.slice(3, 5), 16), Number.parseInt(hex.slice(5, 7), 16), 255];
}

function inCircle(x, y, cx, cy, radius) {
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
}

function inEllipse(x, y, cx, cy, rx, ry) {
  return ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
}

function inRoundRect(x, y, size, inset, radius) {
  const px = Math.max(inset + radius, Math.min(size - inset - radius, x));
  const py = Math.max(inset + radius, Math.min(size - inset - radius, y));
  return (x - px) ** 2 + (y - py) ** 2 <= radius ** 2;
}

function iconPixel(x, y, size) {
  const scale = size / 1024;
  x /= scale;
  y /= scale;
  if (inRoundRect(x, y, 1024, 40, 225)) return rgb('#285943');
  if (inCircle(x, y, 512, 512, 365)) return rgb('#D8DDD3');
  if (inCircle(x, y, 512, 512, 334)) return rgb('#F4F2EA');
  const dumplings = [[400, 442], [624, 442], [512, 626]];
  for (const [cx, cy] of dumplings) {
    if (inEllipse(x, y, cx, cy - 18, 100, 30)) return rgb('#F4E3BE');
    if (inEllipse(x, y, cx, cy, 132, 82)) return rgb('#E6C995');
    if (inEllipse(x, y, cx, cy + 40, 125, 35)) return rgb('#B78B4A');
  }
  if (inCircle(x, y, 512, 512, 10)) return rgb('#285943');
  return [0, 0, 0, 0];
}

const icons = [
  [16, 'icp4'], [32, 'icp5'], [64, 'icp6'], [128, 'ic07'],
  [256, 'ic08'], [512, 'ic09'], [1024, 'ic10'],
].map(([size, type]) => chunk(type, png(size, size, iconPixel)));
const iconLength = 8 + icons.reduce((sum, item) => sum + item.length, 0);
const iconHeader = Buffer.alloc(8);
iconHeader.write('icns', 0, 'ascii');
iconHeader.writeUInt32BE(iconLength, 4);
writeFileSync(path.join(assets, 'icon.icns'), Buffer.concat([iconHeader, ...icons]));

const paper = rgb('#F4F2EA');
function backgroundPixel(x, y, width, height) {
  const sx = x * 1600 / width;
  const sy = y * 1000 / height;
  for (const [cx, cy] of [[1180, 430], [1360, 430], [1270, 585]]) {
    if (inEllipse(sx, sy, cx, cy - 10, 70, 18)) return rgb('#F4E3BE');
    if (inEllipse(sx, sy, cx, cy, 92, 52)) return rgb('#E6C995');
    if (inEllipse(sx, sy, cx, cy + 24, 86, 25)) return rgb('#B78B4A');
  }
  if (inCircle(sx, sy, 1270, 500, 330)) return rgb('#D8DDD3');
  if (inCircle(sx, sy, 1270, 500, 300)) return rgb('#F4F2EA');
  if (inEllipse(sx, sy, 1270, 500, 360, 390)) return rgb('#E5E8E2');
  if (Math.abs(sx - 60) < 2 || Math.abs(sx - 1540) < 2) return rgb('#B78B4A');
  return paper;
}
writeFileSync(path.join(assets, 'dmg-background.png'), png(1600, 1000, backgroundPixel));
