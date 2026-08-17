// Small, dependency-free QR encoder for BusOps ticket URLs.
// It emits QR Model 2, version 6, error correction level L, byte mode.
// Version 6-L stores up to 134 UTF-8 bytes, which covers our signed ticket URL.

const VERSION = 6;
const SIZE = 17 + VERSION * 4;
const DATA_CODEWORDS = 136;
const BLOCKS = 2;
const DATA_PER_BLOCK = 68;
const ECC_PER_BLOCK = 18;
const FORMAT_L_MASK_0 = 0x77c4;

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
let value = 1;
for (let index = 0; index < 255; index += 1) {
  GF_EXP[index] = value;
  GF_LOG[value] = index;
  value <<= 1;
  if (value & 0x100) value ^= 0x11d;
}
for (let index = 255; index < GF_EXP.length; index += 1) GF_EXP[index] = GF_EXP[index - 255];

function gfMultiply(left, right) {
  return left && right ? GF_EXP[GF_LOG[left] + GF_LOG[right]] : 0;
}

function generatorPolynomial(degree) {
  let polynomial = [1];
  for (let root = 0; root < degree; root += 1) {
    const next = new Array(polynomial.length + 1).fill(0);
    for (let index = 0; index < polynomial.length; index += 1) {
      next[index] ^= polynomial[index];
      next[index + 1] ^= gfMultiply(polynomial[index], GF_EXP[root]);
    }
    polynomial = next;
  }
  return polynomial;
}

const ECC_GENERATOR = generatorPolynomial(ECC_PER_BLOCK);

function reedSolomon(data) {
  const remainder = new Array(ECC_PER_BLOCK).fill(0);
  for (const byte of data) {
    const factor = byte ^ remainder[0];
    remainder.shift();
    remainder.push(0);
    for (let index = 0; index < ECC_PER_BLOCK; index += 1) {
      remainder[index] ^= gfMultiply(ECC_GENERATOR[index + 1], factor);
    }
  }
  return remainder;
}

function appendBits(bits, number, length) {
  for (let index = length - 1; index >= 0; index -= 1) bits.push((number >>> index) & 1);
}

function makeCodewords(text) {
  const bytes = [...Buffer.from(String(text), 'utf8')];
  if (bytes.length > 134) throw new Error('QR-billetlinket er for langt');
  const bits = [];
  appendBits(bits, 0b0100, 4);
  appendBits(bits, bytes.length, 8);
  for (const byte of bytes) appendBits(bits, byte, 8);
  const capacity = DATA_CODEWORDS * 8;
  appendBits(bits, 0, Math.min(4, capacity - bits.length));
  while (bits.length % 8) bits.push(0);
  const data = [];
  for (let index = 0; index < bits.length; index += 8) {
    data.push(bits.slice(index, index + 8).reduce((byte, bit) => (byte << 1) | bit, 0));
  }
  for (let pad = 0; data.length < DATA_CODEWORDS; pad += 1) data.push(pad % 2 ? 0x11 : 0xec);

  const dataBlocks = Array.from({ length: BLOCKS }, (_, index) => data.slice(index * DATA_PER_BLOCK, (index + 1) * DATA_PER_BLOCK));
  const eccBlocks = dataBlocks.map(reedSolomon);
  const codewords = [];
  for (let index = 0; index < DATA_PER_BLOCK; index += 1) for (const block of dataBlocks) codewords.push(block[index]);
  for (let index = 0; index < ECC_PER_BLOCK; index += 1) for (const block of eccBlocks) codewords.push(block[index]);
  return codewords;
}

function createQrMatrix(text) {
  const modules = Array.from({ length: SIZE }, () => Array(SIZE).fill(false));
  const reserved = Array.from({ length: SIZE }, () => Array(SIZE).fill(false));
  const setFunction = (row, column, dark) => {
    if (row < 0 || column < 0 || row >= SIZE || column >= SIZE) return;
    modules[row][column] = Boolean(dark);
    reserved[row][column] = true;
  };
  const finder = (centerRow, centerColumn) => {
    for (let rowOffset = -4; rowOffset <= 4; rowOffset += 1) {
      for (let columnOffset = -4; columnOffset <= 4; columnOffset += 1) {
        const distance = Math.max(Math.abs(rowOffset), Math.abs(columnOffset));
        setFunction(centerRow + rowOffset, centerColumn + columnOffset, distance !== 2 && distance !== 4);
      }
    }
  };
  finder(3, 3);
  finder(3, SIZE - 4);
  finder(SIZE - 4, 3);

  for (let index = 8; index < SIZE - 8; index += 1) {
    setFunction(6, index, index % 2 === 0);
    setFunction(index, 6, index % 2 === 0);
  }

  const alignment = (centerRow, centerColumn) => {
    for (let rowOffset = -2; rowOffset <= 2; rowOffset += 1) {
      for (let columnOffset = -2; columnOffset <= 2; columnOffset += 1) {
        setFunction(centerRow + rowOffset, centerColumn + columnOffset, Math.max(Math.abs(rowOffset), Math.abs(columnOffset)) !== 1);
      }
    }
  };
  alignment(6, 34);
  alignment(34, 6);
  alignment(34, 34);

  // Reserve and write format information for L / mask pattern 0.
  for (let bit = 0; bit < 15; bit += 1) {
    const dark = ((FORMAT_L_MASK_0 >>> bit) & 1) !== 0;
    if (bit < 6) setFunction(bit, 8, dark);
    else if (bit === 6) setFunction(7, 8, dark);
    else if (bit === 7) setFunction(8, 8, dark);
    else if (bit === 8) setFunction(8, 7, dark);
    else setFunction(8, 14 - bit, dark);

    if (bit < 8) setFunction(8, SIZE - 1 - bit, dark);
    else setFunction(SIZE - 15 + bit, 8, dark);
  }
  setFunction(SIZE - 8, 8, true);

  const codewords = makeCodewords(text);
  const dataBits = [];
  for (const byte of codewords) appendBits(dataBits, byte, 8);
  let bitIndex = 0;
  let upward = true;
  for (let right = SIZE - 1; right >= 1; right -= 2) {
    if (right === 6) right -= 1;
    for (let vertical = 0; vertical < SIZE; vertical += 1) {
      const row = upward ? SIZE - 1 - vertical : vertical;
      for (let offset = 0; offset < 2; offset += 1) {
        const column = right - offset;
        if (reserved[row][column]) continue;
        const bit = bitIndex < dataBits.length ? dataBits[bitIndex] : 0;
        modules[row][column] = Boolean(bit ^ ((row + column) % 2 === 0));
        bitIndex += 1;
      }
    }
    upward = !upward;
  }
  return modules;
}

function qrSvg(text, { scale = 6, border = 4, dark = '#071a3d', light = '#ffffff' } = {}) {
  const matrix = createQrMatrix(text);
  const dimension = matrix.length + border * 2;
  const rectangles = [];
  matrix.forEach((row, rowIndex) => row.forEach((isDark, columnIndex) => {
    if (isDark) rectangles.push(`<rect x="${columnIndex + border}" y="${rowIndex + border}" width="1" height="1"/>`);
  }));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dimension} ${dimension}" width="${dimension * scale}" height="${dimension * scale}" role="img" aria-label="QR-kode til billet"><rect width="${dimension}" height="${dimension}" fill="${light}"/><g fill="${dark}">${rectangles.join('')}</g></svg>`;
}

module.exports = { createQrMatrix, qrSvg };
