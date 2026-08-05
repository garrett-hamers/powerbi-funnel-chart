/*
 * Reads the JS and CSS that actually ship inside dist/*.pbiviz.
 *
 * `pbiviz package` runs its own webpack build and embeds the result in
 * resources/<guid>.pbiviz.json, so the packaged bundle is not byte-identical to
 * dist/visual.js. Layout probes and screenshots must exercise the packaged
 * bytes, otherwise they describe a build the customer never receives.
 */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const JSZip = require("jszip");

const root = path.resolve(__dirname, "..");
const distDirectory = path.join(root, "dist");

const findPackagePath = () => {
  let entries = [];
  try {
    entries = fs.readdirSync(distDirectory).filter((entry) => entry.endsWith(".pbiviz"));
  } catch {
    entries = [];
  }
  if (entries.length !== 1) {
    throw new Error(
      `expected exactly one dist/*.pbiviz, found ${entries.length}; run \`npm run build && npm run package\` first`
    );
  }
  return path.join(distDirectory, entries[0]);
};

const readPackagedBundle = async (packagePath = findPackagePath()) => {
  const packageBytes = fs.readFileSync(packagePath);
  const zip = await JSZip.loadAsync(packageBytes);
  const resourceName = Object.keys(zip.files).find(
    (name) => name.startsWith("resources/") && name.endsWith(".pbiviz.json")
  );
  if (!resourceName) {
    throw new Error(`${path.basename(packagePath)} does not contain resources/*.pbiviz.json`);
  }
  const resource = JSON.parse(await zip.file(resourceName).async("string"));
  const js = resource?.content?.js;
  const css = resource?.content?.css;
  if (typeof js !== "string" || js.length === 0) {
    throw new Error(`${resourceName} carries no content.js`);
  }
  if (typeof css !== "string" || css.length === 0) {
    throw new Error(`${resourceName} carries no content.css`);
  }
  return {
    js,
    css,
    guid: resource?.visual?.guid,
    version: resource?.visual?.version,
    packagePath,
    packageName: path.basename(packagePath),
    // Identifies the exact artifact these bytes came out of. Screenshots record it so
    // a committed image can be tied back to the build it depicts: the version string
    // alone is far too coarse, because the packaged bytes can move more than once
    // within a single version.
    packageSha256: crypto.createHash("sha256").update(packageBytes).digest("hex"),
    packageBytes: packageBytes.length,
    jsBytes: Buffer.byteLength(js, "utf8"),
    cssBytes: Buffer.byteLength(css, "utf8")
  };
};

module.exports = { findPackagePath, readPackagedBundle };

if (require.main === module) {
  readPackagedBundle()
    .then((bundle) => {
      process.stdout.write(
        `${bundle.packageName} guid=${bundle.guid} version=${bundle.version} ` +
        `js=${bundle.jsBytes} bytes css=${bundle.cssBytes} bytes\n`
      );
    })
    .catch((error) => {
      process.stderr.write(`Packaged bundle read failed: ${error.message}\n`);
      process.exit(1);
    });
}
