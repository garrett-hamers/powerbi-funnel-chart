/*
 * Renders the tracked assets/icon.svg into the 20x20 assets/icon.png that Power BI
 * requires for the visualization pane.
 *
 * The icon is straight-line polygons only, so this rasterises and encodes the PNG in
 * plain Node rather than shelling out to a browser: a headless Chrome window is not
 * reliable at 20 pixels, and a pure rasteriser produces identical bytes on every machine
 * and in CI. The PNG encoder here is the mirror image of the decoder in png-utils.cjs.
 */
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const { readPngContentProfile } = require("./png-utils.cjs");

const root = path.resolve(__dirname, "..");
const sourcePath = path.join(root, "assets", "icon.svg");
const targetPath = path.join(root, "assets", "icon.png");
const ICON_SIZE = 20;
const SAMPLES_PER_AXIS = 16;

const fail = (message) => {
  process.stderr.write(`Icon generation failed: ${message}\n`);
  process.exit(1);
};

const readSvg = () => {
  const svg = fs.readFileSync(sourcePath, "utf8");
  const viewBox = /viewBox\s*=\s*"([^"]+)"/.exec(svg);
  const definition = /<path\b[^>]*\bd\s*=\s*"([^"]+)"/.exec(svg);
  const fill = /<path\b[^>]*\bfill\s*=\s*"#([0-9a-f]{6})"/i.exec(svg);
  if (!viewBox || !definition || !fill) {
    fail("assets/icon.svg must declare a viewBox and a single filled path");
  }
  const [minX, minY, width, height] = viewBox[1].trim().split(/[\s,]+/).map(Number);
  if (![minX, minY, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
    fail("assets/icon.svg has an unusable viewBox");
  }
  return {
    minX,
    minY,
    width,
    height,
    definition: definition[1],
    color: [
      Number.parseInt(fill[1].slice(0, 2), 16),
      Number.parseInt(fill[1].slice(2, 4), 16),
      Number.parseInt(fill[1].slice(4, 6), 16)
    ]
  };
};

/*
 * Supports only the straight-line subset the tracked icon uses. Anything else fails
 * loudly rather than silently rendering the wrong shape.
 */
const parseSubpaths = (definition) => {
  const tokens = definition.match(/[MmLlHhVvZz]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) ?? [];
  const subpaths = [];
  let current;
  let command;
  let index = 0;
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  const next = () => {
    const value = Number(tokens[index]);
    index += 1;
    if (!Number.isFinite(value)) {
      fail(`assets/icon.svg path has a malformed number near token ${index}`);
    }
    return value;
  };

  while (index < tokens.length) {
    if (/^[MmLlHhVvZz]$/.test(tokens[index])) {
      command = tokens[index];
      index += 1;
    } else if (command === "M") {
      command = "L";
    } else if (command === "m") {
      command = "l";
    }
    switch (command) {
      case "M":
      case "m": {
        const dx = next();
        const dy = next();
        x = command === "M" ? dx : x + dx;
        y = command === "M" ? dy : y + dy;
        startX = x;
        startY = y;
        current = [[x, y]];
        subpaths.push(current);
        break;
      }
      case "L":
      case "l": {
        const dx = next();
        const dy = next();
        x = command === "L" ? dx : x + dx;
        y = command === "L" ? dy : y + dy;
        current.push([x, y]);
        break;
      }
      case "H":
      case "h": {
        const dx = next();
        x = command === "H" ? dx : x + dx;
        current.push([x, y]);
        break;
      }
      case "V":
      case "v": {
        const dy = next();
        y = command === "V" ? dy : y + dy;
        current.push([x, y]);
        break;
      }
      case "Z":
      case "z": {
        x = startX;
        y = startY;
        current = undefined;
        break;
      }
      default:
        fail(`assets/icon.svg uses unsupported path command "${command ?? tokens[index]}"`);
    }
  }
  if (subpaths.length === 0) {
    fail("assets/icon.svg produced no drawable subpaths");
  }
  return subpaths;
};

const windingAt = (subpaths, x, y) => {
  let winding = 0;
  subpaths.forEach((points) => {
    for (let index = 0; index < points.length; index += 1) {
      const [x1, y1] = points[index];
      const [x2, y2] = points[(index + 1) % points.length];
      const side = (x2 - x1) * (y - y1) - (x - x1) * (y2 - y1);
      if (y1 <= y) {
        if (y2 > y && side > 0) {
          winding += 1;
        }
      } else if (y2 <= y && side < 0) {
        winding -= 1;
      }
    }
  });
  return winding;
};

const rasterize = (svg, subpaths) => {
  const pixels = Buffer.alloc(ICON_SIZE * ICON_SIZE * 4);
  const scaleX = svg.width / ICON_SIZE;
  const scaleY = svg.height / ICON_SIZE;
  const total = SAMPLES_PER_AXIS * SAMPLES_PER_AXIS;
  for (let row = 0; row < ICON_SIZE; row += 1) {
    for (let column = 0; column < ICON_SIZE; column += 1) {
      let covered = 0;
      for (let sampleY = 0; sampleY < SAMPLES_PER_AXIS; sampleY += 1) {
        const userY = svg.minY + (row + (sampleY + 0.5) / SAMPLES_PER_AXIS) * scaleY;
        for (let sampleX = 0; sampleX < SAMPLES_PER_AXIS; sampleX += 1) {
          const userX = svg.minX + (column + (sampleX + 0.5) / SAMPLES_PER_AXIS) * scaleX;
          if (windingAt(subpaths, userX, userY) !== 0) {
            covered += 1;
          }
        }
      }
      const offset = (row * ICON_SIZE + column) * 4;
      pixels[offset] = svg.color[0];
      pixels[offset + 1] = svg.color[1];
      pixels[offset + 2] = svg.color[2];
      pixels[offset + 3] = Math.round((covered / total) * 255);
    }
  }
  return pixels;
};

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

const crc32 = (buffer) => {
  let crc = 0xffffffff;
  for (let index = 0; index < buffer.length; index += 1) {
    crc = CRC_TABLE[(crc ^ buffer[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const chunk = (type, data) => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, checksum]);
};

const encodePng = (pixels, size) => {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;
  const scanlineBytes = size * 4;
  const raw = Buffer.alloc((scanlineBytes + 1) * size);
  for (let row = 0; row < size; row += 1) {
    raw[row * (scanlineBytes + 1)] = 0;
    pixels.copy(raw, row * (scanlineBytes + 1) + 1, row * scanlineBytes, (row + 1) * scanlineBytes);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
};

const svg = readSvg();
const subpaths = parseSubpaths(svg.definition);
const png = encodePng(rasterize(svg, subpaths), ICON_SIZE);
fs.writeFileSync(targetPath, png);

const profile = readPngContentProfile(targetPath);
if (profile.width !== ICON_SIZE || profile.height !== ICON_SIZE) {
  fs.rmSync(targetPath, { force: true });
  fail(`rendered ${profile.width}x${profile.height} but Power BI requires exactly ${ICON_SIZE}x${ICON_SIZE}`);
}
if (profile.distinctColors < 8 || profile.opaqueRatio <= 0.01) {
  fs.rmSync(targetPath, { force: true });
  fail("the rendered icon has no real artwork");
}

process.stdout.write(
  `assets/icon.png written: ${profile.width}x${profile.height}, ${profile.bytes} bytes, ` +
  `${profile.distinctColors} colours, ${Math.round(profile.opaqueRatio * 100)}% covered.\n`
);
