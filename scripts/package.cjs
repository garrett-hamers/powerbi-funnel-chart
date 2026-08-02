const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { isPackageSuccess } = require("./package-utils.cjs");
const { normalizePackage } = require("./normalize-package.cjs");

const isWindows = process.platform === "win32";
const executable = isWindows ? process.env.ComSpec ?? "cmd.exe" : "npx";
const args = isWindows
  ? ["/d", "/s", "/c", "npx.cmd pbiviz package --no-stats"]
  : ["pbiviz", "package", "--no-stats"];
const dist = path.resolve(__dirname, "..", "dist");
const pbiviz = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "pbiviz.json"), "utf8"));
const expectedArtifact = `${pbiviz.visual.guid}.${pbiviz.visual.version}.pbiviz`;
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
const artifactPath = path.join(dist, expectedArtifact);
const packageCreated = fs.existsSync(artifactPath) && (() => {
  const stats = fs.statSync(artifactPath);
  const previous = beforeArtifacts.get(expectedArtifact);
  return !previous || previous.mtimeMs !== stats.mtimeMs || previous.size !== stats.size;
})();

if (result.error) {
  process.stderr.write(`pbiviz failed to start: ${result.error.message}\n`);
  process.exit(1);
}
if (!isPackageSuccess(result.status, packageCreated)) {
  process.exit(result.status ?? 1);
}

normalizePackage(artifactPath).catch((error) => {
  process.stderr.write(`PBIVIZ normalization failed: ${error.message}\n`);
  process.exit(1);
});
