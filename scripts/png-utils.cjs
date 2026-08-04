const crypto = require("node:crypto");
const fs = require("node:fs");

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

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
    bytes: buffer.length,
    sha256: crypto.createHash("sha256").update(buffer).digest("hex")
  };
};

module.exports = { readPngMetadata };
