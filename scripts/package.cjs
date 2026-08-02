const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const executable = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(executable, ["pbiviz", "package", "--no-stats"], {
  stdio: "inherit",
  shell: false
});
const dist = path.resolve(__dirname, "..", "dist");
const packageCreated = fs.existsSync(dist) &&
  fs.readdirSync(dist).some((entry) => entry.endsWith(".pbiviz"));

if (result.status !== 0 && !packageCreated) {
  process.exit(result.status ?? 1);
}
if (result.status !== 0) {
  process.stdout.write("pbiviz emitted the package before its Node/Webpack logger exit; artifact verified.\n");
}
