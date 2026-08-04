const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { readPngMetadata } = require("./png-utils.cjs");

const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");
const manifestPath = path.join(root, "release-manifest.json");

const readJson = (relativePath) =>
  JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));

const fail = (message) => {
  process.stderr.write(`Release manifest failed: ${message}\n`);
  process.exit(1);
};

const pbiviz = readJson("pbiviz.json");
const capabilities = readJson("capabilities.json");
const packageJson = readJson("package.json");
const visual = pbiviz.visual;
const publicationLogoPath = path.join(root, "assets", "logo-300x300.png");

if (!visual?.name || !visual.guid || !visual.version) {
  fail("pbiviz.json must declare a visual name, GUID, and version");
}
if (!Array.isArray(capabilities.privileges) || capabilities.privileges.length !== 0) {
  fail("capabilities.privileges must be []");
}
if (!Array.isArray(pbiviz.externalJS) || pbiviz.externalJS.length !== 0) {
  fail("pbiviz.json externalJS must be []");
}
if (pbiviz.assets?.icon !== "assets/icon.svg") {
  fail("pbiviz.json assets.icon must be assets/icon.svg");
}
if (!fs.existsSync(publicationLogoPath)) {
  fail("assets/logo-300x300.png must exist for Partner Center packaging");
}
let publicationLogo;
try {
  publicationLogo = readPngMetadata(publicationLogoPath);
} catch (error) {
  fail(`unable to read assets/logo-300x300.png metadata: ${error.message}`);
}
if (publicationLogo.width !== 300 || publicationLogo.height !== 300) {
  fail("assets/logo-300x300.png must be exactly 300x300 pixels");
}

const expectedFilename = `${visual.guid}.${visual.version}.pbiviz`;
const artifacts = fs.existsSync(dist)
  ? fs.readdirSync(dist).filter((entry) => entry.endsWith(".pbiviz"))
  : [];

if (artifacts.length !== 1 || artifacts[0] !== expectedFilename) {
  fail(`dist must contain only the fresh artifact ${expectedFilename}`);
}

const artifactPath = path.join(dist, expectedFilename);
const stats = fs.statSync(artifactPath);
const sha256 = crypto.createHash("sha256").update(fs.readFileSync(artifactPath)).digest("hex");
const sourceCommit = process.env.RELEASE_SOURCE_COMMIT ??
  execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();

const manifest = {
  schemaVersion: 1,
  visual: {
    name: visual.name,
    displayName: visual.displayName,
    guid: visual.guid,
    version: visual.version,
    apiVersion: pbiviz.apiVersion
  },
  package: {
    filename: expectedFilename,
    sha256,
    bytes: stats.size
  },
  reproducible: true,
  zipNormalization: {
    entryTimestamp: "1980-01-01T00:00:00.000Z",
    compression: "DEFLATE",
    compressionLevel: 9
  },
  sourceCommit,
  packageVersion: packageJson.version,
  privileges: capabilities.privileges,
  externalJS: pbiviz.externalJS,
  publicationAssets: {
    partnerCenterLogo300x300: {
      path: "assets/logo-300x300.png",
      format: "png",
      width: publicationLogo.width,
      height: publicationLogo.height,
      bytes: publicationLogo.bytes,
      sha256: publicationLogo.sha256
    }
  }
};

fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(`Release manifest written for ${expectedFilename} (${sha256}).\n`);
