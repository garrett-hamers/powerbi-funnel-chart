const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const JSZip = require("jszip");
const { isPackageSuccess } = require("./package-utils.cjs");

const isWindows = process.platform === "win32";
const executable = isWindows ? process.env.ComSpec ?? "cmd.exe" : "npx";
const args = isWindows
  ? ["/d", "/s", "/c", "npx.cmd pbiviz package --no-stats"]
  : ["pbiviz", "package", "--no-stats"];
const dist = path.resolve(__dirname, "..", "dist");
const beforeArtifacts = new Map(
  fs.existsSync(dist)
    ? fs.readdirSync(dist)
      .filter((entry) => entry.endsWith(".pbiviz"))
      .map((entry) => {
        const stats = fs.statSync(path.join(dist, entry));
        return [entry, { mtimeMs: stats.mtimeMs, size: stats.size }];
      })
    : []
);
const result = spawnSync(executable, args, {
  stdio: "inherit",
  shell: false
});
const freshArtifacts = fs.existsSync(dist)
  ? fs.readdirSync(dist)
    .filter((entry) => entry.endsWith(".pbiviz"))
    .filter((entry) => {
      const stats = fs.statSync(path.join(dist, entry));
      const previous = beforeArtifacts.get(entry);
      return !previous || previous.mtimeMs !== stats.mtimeMs || previous.size !== stats.size;
    })
  : [];

if (result.error) {
  process.stderr.write(`pbiviz failed to start: ${result.error.message}\n`);
  process.exit(1);
}
if (!isPackageSuccess(result.status, freshArtifacts.length > 0)) {
  process.exit(result.status ?? 1);
}

const normalizePackage = async (entry) => {
  const artifactPath = path.join(dist, entry);
  const zip = await JSZip.loadAsync(fs.readFileSync(artifactPath));
  zip.forEach((_relativePath, file) => {
    file.date = new Date("1980-01-01T00:00:00.000Z");
  });
  const normalized = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
    platform: "DOS"
  });
  fs.writeFileSync(artifactPath, normalized);
};

Promise.all(freshArtifacts.map(normalizePackage)).catch((error) => {
  process.stderr.write(`PBIVIZ normalization failed: ${error.message}\n`);
  process.exitCode = 1;
});
