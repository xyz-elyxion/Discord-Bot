import { randomInt } from 'node:crypto';
import { deflateSync } from 'node:zlib';

// 5x7 bitmap font. Ambiguous characters (0/O, 1/I) are left out of the alphabet.
const FONT = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01110'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  J: ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  2: ['01110', '10001', '00001', '00110', '01000', '10000', '11111'],
  3: ['11111', '00010', '00100', '00010', '00001', '10001', '01110'],
  4: ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  5: ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  6: ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  7: ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  8: ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  9: ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
};

// Letters only: digits such as 8/5/2/6 look too close to B/S/Z/G in a small font.
export const CAPTCHA_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

const SCALE = 7;
const GLYPH_WIDTH = 5 * SCALE;
const GLYPH_HEIGHT = 7 * SCALE;
const GAP = 10;
const PADDING_X = 16;
const PADDING_Y = 18;

const BACKGROUND = [247, 248, 252];
const INK = [
  [31, 41, 84],
  [74, 32, 74],
  [20, 82, 70],
  [92, 54, 20],
  [38, 40, 46],
];
const NOISE = [
  [186, 190, 202],
  [205, 210, 220],
  [160, 168, 186],
];

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const typeBuffer = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);

  return Buffer.concat([length, typeBuffer, data, crc]);
}

/** Minimal RGBA PNG encoder (no dependencies). */
export function encodePng(width, height, pixels) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);

  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0; // filter: none
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // colour type: RGBA
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function makeCanvas(width, height, color) {
  const pixels = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    pixels[i * 4] = color[0];
    pixels[i * 4 + 1] = color[1];
    pixels[i * 4 + 2] = color[2];
    pixels[i * 4 + 3] = 255;
  }
  return pixels;
}

function fillRect(pixels, width, height, x, y, w, h, color) {
  for (let dy = 0; dy < h; dy += 1) {
    for (let dx = 0; dx < w; dx += 1) {
      const px = Math.round(x) + dx;
      const py = Math.round(y) + dy;
      if (px < 0 || py < 0 || px >= width || py >= height) continue;

      const index = (py * width + px) * 4;
      pixels[index] = color[0];
      pixels[index + 1] = color[1];
      pixels[index + 2] = color[2];
      pixels[index + 3] = 255;
    }
  }
}

function drawLine(pixels, width, height, x0, y0, x1, y1, color, thickness = 1) {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= steps; i += 1) {
    const x = x0 + ((x1 - x0) * i) / steps;
    const y = y0 + ((y1 - y0) * i) / steps;
    fillRect(pixels, width, height, x, y, thickness, thickness, color);
  }
}

function drawGlyph(pixels, width, height, glyph, x, y, color, skew) {
  const rows = FONT[glyph];
  if (!rows) return;

  for (let row = 0; row < rows.length; row += 1) {
    for (let column = 0; column < rows[row].length; column += 1) {
      if (rows[row][column] !== '1') continue;
      fillRect(
        pixels,
        width,
        height,
        x + column * SCALE + row * skew,
        y + row * SCALE,
        SCALE + 1,
        SCALE + 1,
        color,
      );
    }
  }
}

/** Render a captcha image for the given code. */
export function renderCaptcha(code) {
  const width = PADDING_X * 2 + code.length * GLYPH_WIDTH + (code.length - 1) * GAP;
  const height = PADDING_Y * 2 + GLYPH_HEIGHT + 6;
  const pixels = makeCanvas(width, height, BACKGROUND);

  // Background streaks make simple threshold/OCR tricks less reliable.
  for (let i = 0; i < 3; i += 1) {
    const startY = randomInt(8, height - 8);
    drawLine(
      pixels,
      width,
      height,
      -10,
      startY,
      width + 10,
      randomInt(8, height - 8),
      NOISE[randomInt(NOISE.length)],
      randomInt(1, 3),
    );
  }

  code.split('').forEach((glyph, index) => {
    const x = PADDING_X + index * (GLYPH_WIDTH + GAP);
    const y = PADDING_Y + randomInt(-4, 5);
    const skew = randomInt(-1, 2); // px of horizontal drift per row, kept small so glyphs stay whole
    drawGlyph(pixels, width, height, glyph, x, y, INK[randomInt(INK.length)], skew);
  });

  // Speckle over the glyphs.
  for (let i = 0; i < 70; i += 1) {
    fillRect(pixels, width, height, randomInt(0, width), randomInt(0, height), 2, 2, NOISE[randomInt(NOISE.length)]);
  }

  return { png: encodePng(width, height, pixels), width, height };
}

/** Create a random code and its captcha image. */
export function createCaptcha(length = 6) {
  const code = Array.from({ length }, () => CAPTCHA_ALPHABET[randomInt(CAPTCHA_ALPHABET.length)]).join('');
  return { code, ...renderCaptcha(code) };
}
