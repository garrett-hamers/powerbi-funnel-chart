const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const JSZip = require("jszip");

const FIXED_DATE = new Date("1980-01-01T00:00:00.000Z");
const compareNames = (left, right) =>
  Buffer.compare(Buffer.from(left), Buffer.from(right));

const normalizePackage = async (packagePath) => {
  const source = fs.readFileSync(packagePath);
  const sourceZip = await JSZip.loadAsync(source);
  const normalizedZip = new JSZip();

  for (const name of Object.keys(sourceZip.files).sort(compareNames)) {
    const sourceFile = sourceZip.files[name];
    const data = await sourceFile.async("nodebuffer");
    const isDirectory = sourceFile.dir;
    normalizedZip.file(name, data, {
      date: FIXED_DATE,
      dir: isDirectory,
      createFolders: false,
      compression: "DEFLATE",
      compressionOptions: { level: 9 },
      unixPermissions: isDirectory ? 0o40755 : 0o100644,
      dosPermissions: isDirectory ? 0x10 : 0x20
    });
  }

  const normalized = await normalizedZip.generateAsync({
    type: "nodebuffer",
    platform: "DOS",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
    streamFiles: false
  });
  const temporaryPath = path.join(
    path.dirname(packagePath),
    `.${path.basename(packagePath)}.${process.pid}.${crypto.randomBytes(8).toString("hex")}.tmp`
  );

  try {
    fs.writeFileSync(temporaryPath, normalized, { flag: "wx" });
    fs.renameSync(temporaryPath, packagePath);
  } finally {
    if (fs.existsSync(temporaryPath)) {
      fs.unlinkSync(temporaryPath);
    }
  }
};

module.exports = { normalizePackage };
