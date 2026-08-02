const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { isPackageSuccess } = require("./package-utils.cjs");

const isWindows = process.platform === "win32";
const executable = isWindows ? process.env.ComSpec ?? "cmd.exe" : "npx";
const args = isWindows
  ? ["/d", "/s", "/c", "npx.cmd pbiviz package --no-stats"]
  : ["pbiviz", "package", "--no-stats"];
const result = spawnSync(executable, args, {
  stdio: "inherit",
  shell: false
});
const dist = path.resolve(__dirname, "..", "dist");
const packageCreated = fs.existsSync(dist) &&
  fs.readdirSync(dist).some((entry) => entry.endsWith(".pbiviz"));

if (result.error) {
  process.stderr.write(`pbiviz failed to start: ${result.error.message}\n`);
  process.exit(1);
}
if (!isPackageSuccess(result.status, packageCreated)) {
  process.exit(result.status ?? 1);
}
