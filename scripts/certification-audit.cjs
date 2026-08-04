const fs = require("node:fs");
const path = require("node:path");
const { readPngMetadata } = require("./png-utils.cjs");

const root = path.resolve(__dirname, "..");
const readJson = (relativePath) =>
  JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
const failures = [];
const requireCondition = (condition, message) => {
  if (!condition) {
    failures.push(message);
  }
};

const capabilities = readJson("capabilities.json");
const packageJson = readJson("package.json");
const pbiviz = readJson("pbiviz.json");
const manifest = readJson("release-manifest.json");
const source = fs.readFileSync(path.join(root, "src", "visual.ts"), "utf8");
const artifacts = fs.existsSync(path.join(root, "dist"))
  ? fs.readdirSync(path.join(root, "dist")).filter((entry) => entry.endsWith(".pbiviz"))
  : [];
const expectedArtifact = `${pbiviz.visual?.guid}.${pbiviz.visual?.version}.pbiviz`;
const sourceParityPaths = [
  "capabilities.json",
  "dependencies.json",
  "package.json",
  "package-lock.json",
  "pbiviz.json",
  "src",
  "scripts/package.cjs",
  "scripts/package-utils.cjs",
  "scripts/normalize-package.cjs"
];
let currentCommit;
try {
  currentCommit = require("node:child_process")
    .execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" })
    .trim();
} catch (error) {
  failures.push(`unable to determine the current source commit: ${error.message}`);
}

requireCondition(Array.isArray(capabilities.privileges) && capabilities.privileges.length === 0, "capabilities.privileges must be []");
requireCondition(pbiviz.visual?.guid === "atlynFunnelA1B2C3D4", "pbiviz.json must preserve the stable visual GUID");
requireCondition(Number.parseFloat(pbiviz.apiVersion) >= 5.1, "pbiviz.json must use Power BI API 5.1 or newer");
requireCondition(Array.isArray(pbiviz.externalJS) && pbiviz.externalJS.length === 0, "pbiviz.json externalJS must be []");
requireCondition(pbiviz.assets?.icon === "assets/icon.svg", "pbiviz.json assets.icon must be assets/icon.svg");
requireCondition(packageJson.scripts?.eslint === "npx eslint . --ext .js,.jsx,.ts,.tsx", "the exact full ESLint script is required");
requireCondition(packageJson.scripts?.audit === "npm audit", "the audit script must run the full audit");
requireCondition(typeof packageJson.devDependencies?.typescript === "string", "TypeScript must be a direct development dependency");
requireCondition(typeof packageJson.devDependencies?.eslint === "string", "ESLint must be a direct development dependency");
requireCondition(typeof packageJson.devDependencies?.["eslint-plugin-powerbi-visuals"] === "string", "Power BI ESLint must be a direct development dependency");
requireCondition(!("supportsLandingPage" in capabilities), "supportsLandingPage must not be advertised without a landing-page implementation");
requireCondition(
  Boolean(capabilities.dataViewMappings?.[0]?.categorical?.categories?.dataReductionAlgorithm?.window?.count),
  "categorical data reduction must declare a bounded ordered window"
);
requireCondition(!/"top"|sortBy|orderBy/i.test(JSON.stringify(capabilities)), "value or alphabetical reduction is not allowed");
requireCondition(!/\b(fetch|XMLHttpRequest|WebSocket|eval)\b/.test(source), "visual source must not access network or eval");
requireCondition(!/\b(innerHTML|outerHTML|insertAdjacentHTML)\b/.test(source), "visual source must use safe DOM APIs");
requireCondition(!/enumerateObjectInstances/.test(source), "deprecated enumerateObjectInstances must not be implemented");
requireCondition(artifacts.length === 1 && artifacts[0] === expectedArtifact, `packaging must emit only ${expectedArtifact}`);
requireCondition(manifest.visual?.guid === pbiviz.visual?.guid, "release manifest GUID must match pbiviz.json");
requireCondition(manifest.visual?.version === pbiviz.visual?.version, "release manifest version must match pbiviz.json");
requireCondition(manifest.package?.filename === expectedArtifact, "release manifest filename must match the package output");
requireCondition(typeof manifest.package?.sha256 === "string" && /^[a-f0-9]{64}$/.test(manifest.package.sha256), "release manifest must contain a SHA-256 package hash");
requireCondition(manifest.package?.bytes > 0, "release manifest must contain the package byte size");
requireCondition(manifest.reproducible === true, "release manifest must require reproducible package output");
requireCondition(manifest.zipNormalization?.entryTimestamp === "1980-01-01T00:00:00.000Z", "release manifest must record fixed ZIP entry timestamps");
requireCondition(manifest.zipNormalization?.compression === "DEFLATE" && manifest.zipNormalization?.compressionLevel === 9, "release manifest must record fixed ZIP compression");
requireCondition(manifest.sourceCommit === currentCommit || typeof manifest.sourceCommit === "string", "release manifest must record a source commit");
const publicationLogoPath = path.join(root, "assets", "logo-300x300.png");
try {
  const logo = readPngMetadata(publicationLogoPath);
  requireCondition(logo.width === 300 && logo.height === 300, "assets/logo-300x300.png must be exactly 300x300");
  requireCondition(
    manifest.publicationAssets?.partnerCenterLogo300x300?.path === "assets/logo-300x300.png",
    "release manifest must include partnerCenterLogo300x300 metadata"
  );
  requireCondition(
    manifest.publicationAssets?.partnerCenterLogo300x300?.sha256 === logo.sha256,
    "release manifest logo SHA-256 does not match assets/logo-300x300.png"
  );
  requireCondition(
    manifest.publicationAssets?.partnerCenterLogo300x300?.bytes === logo.bytes,
    "release manifest logo byte size does not match assets/logo-300x300.png"
  );
  requireCondition(
    manifest.publicationAssets?.partnerCenterLogo300x300?.width === logo.width &&
      manifest.publicationAssets?.partnerCenterLogo300x300?.height === logo.height,
    "release manifest logo dimensions do not match assets/logo-300x300.png"
  );
} catch (error) {
  failures.push(`unable to validate assets/logo-300x300.png: ${error.message}`);
}
if (manifest.sourceCommit && currentCommit && manifest.sourceCommit !== currentCommit) {
  try {
    require("node:child_process").execFileSync(
      "git",
      ["diff", "--quiet", `${manifest.sourceCommit}..${currentCommit}`, "--", ...sourceParityPaths],
      { cwd: root, stdio: "ignore" }
    );
  } catch {
    failures.push("release manifest source commit does not match the current source files");
  }
}
if (artifacts.length === 1 && manifest.package?.filename === artifacts[0]) {
  const artifactPath = path.join(root, "dist", artifacts[0]);
  const hash = require("node:crypto").createHash("sha256").update(fs.readFileSync(artifactPath)).digest("hex");
  requireCondition(hash === manifest.package.sha256, "release manifest SHA-256 does not match the package");
  requireCondition(fs.statSync(artifactPath).size === manifest.package.bytes, "release manifest byte size does not match the package");
}

if (failures.length > 0) {
  process.stderr.write(`Certification audit failed:\n${failures.map((failure) => `- ${failure}`).join("\n")}\n`);
  process.exit(1);
}

process.stdout.write("Certification audit passed.\n");
