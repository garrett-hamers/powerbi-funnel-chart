const crypto = require("node:crypto");
const fs = require("node:fs");
const zlib = require("node:zlib");

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

const readPngMetadata = (filePath) => {
  const buffer = fs.readFileSync(filePath);
  if (buffer.length < 33) {
    throw new Error(`PNG file is too small: ${filePath}`);
  }
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error(`file is not a PNG: ${filePath}`);
  }
  const ihdrLength = buffer.readUInt32BE(8);
  const ihdrType = buffer.toString("ascii", 12, 16);
  if (ihdrType !== "IHDR" || ihdrLength !== 13) {
    throw new Error(`PNG header is missing IHDR metadata: ${filePath}`);
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    bitDepth: buffer[24],
    colorType: buffer[25],
    interlace: buffer[28],
    bytes: buffer.length,
    sha256: crypto.createHash("sha256").update(buffer).digest("hex")
  };
};

const readChunks = (buffer) => {
  const chunks = [];
  let offset = 8;
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    chunks.push({ type, data: buffer.subarray(offset + 8, offset + 8 + length) });
    offset += 12 + length;
    if (type === "IEND") {
      break;
    }
  }
  return chunks;
};

const paeth = (left, up, upperLeft) => {
  const estimate = left + up - upperLeft;
  const distanceLeft = Math.abs(estimate - left);
  const distanceUp = Math.abs(estimate - up);
  const distanceUpperLeft = Math.abs(estimate - upperLeft);
  if (distanceLeft <= distanceUp && distanceLeft <= distanceUpperLeft) {
    return left;
  }
  return distanceUp <= distanceUpperLeft ? up : upperLeft;
};

const unfilter = (raw, width, height, bytesPerPixel) => {
  const scanlineBytes = width * bytesPerPixel;
  const output = Buffer.alloc(scanlineBytes * height);
  let position = 0;
  for (let row = 0; row < height; row += 1) {
    const filterType = raw[position];
    position += 1;
    const target = row * scanlineBytes;
    const previous = (row - 1) * scanlineBytes;
    for (let index = 0; index < scanlineBytes; index += 1) {
      const value = raw[position + index];
      const left = index >= bytesPerPixel ? output[target + index - bytesPerPixel] : 0;
      const up = row > 0 ? output[previous + index] : 0;
      const upperLeft = row > 0 && index >= bytesPerPixel ? output[previous + index - bytesPerPixel] : 0;
      let restored;
      switch (filterType) {
        case 0: restored = value; break;
        case 1: restored = value + left; break;
        case 2: restored = value + up; break;
        case 3: restored = value + Math.floor((left + up) / 2); break;
        case 4: restored = value + paeth(left, up, upperLeft); break;
        default: throw new Error(`unsupported PNG scanline filter ${filterType}`);
      }
      output[target + index] = restored & 0xff;
    }
    position += scanlineBytes;
  }
  return output;
};

/*
 * Decodes the image data far enough to prove a PNG carries real artwork rather than a
 * placeholder. Only the non-interlaced 8-bit forms that real export tools emit are
 * supported; anything else fails loudly instead of silently passing a gate.
 */
const readPngContentProfile = (filePath) => {
  const buffer = fs.readFileSync(filePath);
  const metadata = readPngMetadata(filePath);
  if (metadata.bitDepth !== 8) {
    throw new Error(`unsupported PNG bit depth ${metadata.bitDepth}: ${filePath}`);
  }
  if (metadata.interlace !== 0) {
    throw new Error(`interlaced PNG files are not supported: ${filePath}`);
  }
  const channels = CHANNELS[metadata.colorType];
  if (!channels) {
    throw new Error(`unsupported PNG colour type ${metadata.colorType}: ${filePath}`);
  }

  const chunks = readChunks(buffer);
  const palette = chunks.find((chunk) => chunk.type === "PLTE")?.data;
  const transparency = chunks.find((chunk) => chunk.type === "tRNS")?.data;
  const compressed = Buffer.concat(
    chunks.filter((chunk) => chunk.type === "IDAT").map((chunk) => chunk.data)
  );
  if (compressed.length === 0) {
    throw new Error(`PNG has no image data: ${filePath}`);
  }
  if (metadata.colorType === 3 && !palette) {
    throw new Error(`palette PNG is missing its PLTE chunk: ${filePath}`);
  }

  const pixels = unfilter(
    zlib.inflateSync(compressed),
    metadata.width,
    metadata.height,
    channels
  );

  const colors = new Set();
  let opaquePixels = 0;
  const totalPixels = metadata.width * metadata.height;
  for (let index = 0; index < totalPixels; index += 1) {
    const offset = index * channels;
    let red;
    let green;
    let blue;
    let alpha = 255;
    if (metadata.colorType === 3) {
      const paletteIndex = pixels[offset];
      red = palette[paletteIndex * 3];
      green = palette[paletteIndex * 3 + 1];
      blue = palette[paletteIndex * 3 + 2];
      alpha = transparency && paletteIndex < transparency.length ? transparency[paletteIndex] : 255;
    } else if (metadata.colorType === 0 || metadata.colorType === 4) {
      red = pixels[offset];
      green = red;
      blue = red;
      alpha = metadata.colorType === 4 ? pixels[offset + 1] : 255;
    } else {
      red = pixels[offset];
      green = pixels[offset + 1];
      blue = pixels[offset + 2];
      alpha = metadata.colorType === 6 ? pixels[offset + 3] : 255;
    }
    if (alpha > 0) {
      opaquePixels += 1;
    }
    colors.add(((red << 24) | (green << 16) | (blue << 8) | alpha) >>> 0);
  }

  return {
    ...metadata,
    totalPixels,
    opaquePixels,
    opaqueRatio: totalPixels === 0 ? 0 : opaquePixels / totalPixels,
    distinctColors: colors.size
  };
};

module.exports = { readPngMetadata, readPngContentProfile };
