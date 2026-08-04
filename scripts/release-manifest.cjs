const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { readPngMetadata, readPngContentProfile } = require("./png-utils.cjs");

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
const publication = readJson("publication.json");
const visual = pbiviz.visual;
const publicationLogoPath = path.join(root, "assets", "logo-300x300.png");
const visualIconPath = path.join(root, "assets", "icon.png");

if (!visual?.name || !visual.guid || !visual.version) {
  fail("pbiviz.json must declare a visual name, GUID, and version");
}
if (!Array.isArray(capabilities.privileges) || capabilities.privileges.length !== 0) {
  fail("capabilities.privileges must be []");
}
if (!Array.isArray(pbiviz.externalJS) || pbiviz.externalJS.length !== 0) {
  fail("pbiviz.json externalJS must be []");
}
if (pbiviz.assets?.icon !== "assets/icon.png") {
  fail("pbiviz.json assets.icon must be assets/icon.png");
}
if (publication.assets?.logo !== "assets/logo-300x300.png") {
  fail("publication.json must declare assets/logo-300x300.png as the Partner Center logo");
}
if (!fs.existsSync(publicationLogoPath)) {
  fail("assets/logo-300x300.png must exist for Partner Center packaging");
}
let publicationLogo;
try {
  publicationLogo = readPngContentProfile(publicationLogoPath);
} catch (error) {
  fail(`unable to read assets/logo-300x300.png metadata: ${error.message}`);
}
if (
  publicationLogo.width !== publication.constraints.logo.width ||
  publicationLogo.height !== publication.constraints.logo.height
) {
  fail("assets/logo-300x300.png must be exactly 300x300 pixels");
}

if (publication.assets?.icon !== "assets/icon.png") {
  fail("publication.json must declare assets/icon.png as the visual icon");
}
if (!fs.existsSync(visualIconPath)) {
  fail("assets/icon.png must exist; run `npm run icons`");
}
let visualIcon;
try {
  visualIcon = readPngContentProfile(visualIconPath);
} catch (error) {
  fail(`unable to read assets/icon.png metadata: ${error.message}`);
}
if (
  visualIcon.width !== publication.constraints.icon.width ||
  visualIcon.height !== publication.constraints.icon.height
) {
  fail("assets/icon.png must be exactly 20x20 pixels");
}

const screenshotPaths = publication.assets?.screenshots ?? [];
const screenshotRules = publication.constraints.screenshot;
if (screenshotPaths.length < screenshotRules.minCount || screenshotPaths.length > screenshotRules.maxCount) {
  fail(`publication.json must declare between ${screenshotRules.minCount} and ${screenshotRules.maxCount} screenshots`);
}
const screenshots = screenshotPaths.map((relativePath) => {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) {
    fail(`${relativePath} is missing; run \`npm run build\` then \`npm run screenshots\``);
  }
  let metadata;
  try {
    metadata = readPngMetadata(absolutePath);
  } catch (error) {
    fail(`unable to read ${relativePath} metadata: ${error.message}`);
  }
  if (metadata.width !== screenshotRules.width || metadata.height !== screenshotRules.height) {
    fail(`${relativePath} must be exactly ${screenshotRules.width}x${screenshotRules.height} pixels`);
  }
  if (metadata.bytes > screenshotRules.maxBytes) {
    fail(`${relativePath} is ${metadata.bytes} bytes; Partner Center allows at most ${screenshotRules.maxBytes}`);
  }
  return {
    path: relativePath,
    format: "png",
    width: metadata.width,
    height: metadata.height,
    bytes: metadata.bytes,
    sha256: metadata.sha256
  };
});

const hashFile = (relativePath) => {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) {
    fail(`${relativePath} is missing`);
  }
  const contents = fs.readFileSync(absolutePath);
  return {
    path: relativePath,
    bytes: contents.length,
    sha256: crypto.createHash("sha256").update(contents).digest("hex")
  };
};

const listFiles = (absoluteDirectory, prefix = "") =>
  fs.readdirSync(absoluteDirectory, { withFileTypes: true })
    .sort((left, right) => (left.name < right.name ? -1 : 1))
    .flatMap((entry) => {
      const relative = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      return entry.isDirectory()
        ? listFiles(path.join(absoluteDirectory, entry.name), relative)
        : [relative];
    });

/*
 * The sample report is a folder, so it is summarised as one order-independent digest
 * over every tracked file path and its content hash.
 */
const hashProject = (relativePath) => {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) {
    fail(`${relativePath} is missing; run \`npm run sample-report\` after packaging`);
  }
  const files = listFiles(absolutePath);
  const digest = crypto.createHash("sha256");
  let bytes = 0;
  files.forEach((file) => {
    const contents = fs.readFileSync(path.join(absolutePath, ...file.split("/")));
    bytes += contents.length;
    digest.update(`${file}\n${crypto.createHash("sha256").update(contents).digest("hex")}\n`);
  });
  return {
    path: relativePath,
    format: "pbip",
    files: files.length,
    bytes,
    sha256: digest.digest("hex")
  };
};

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
  schemaVersion: 2,
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
    visualIcon20x20: {
      path: "assets/icon.png",
      format: "png",
      width: visualIcon.width,
      height: visualIcon.height,
      bytes: visualIcon.bytes,
      sha256: visualIcon.sha256
    },
    partnerCenterLogo300x300: {
      path: "assets/logo-300x300.png",
      format: "png",
      width: publicationLogo.width,
      height: publicationLogo.height,
      bytes: publicationLogo.bytes,
      sha256: publicationLogo.sha256
    },
    partnerCenterScreenshots1366x768: screenshots,
    eula: hashFile(publication.assets.eula),
    submissionDossier: hashFile(publication.assets.dossier),
    sampleReportProject: hashProject(publication.assets.sampleReportProject)
  },
  publication: {
    displayName: publication.listing.displayName,
    publisher: publication.listing.publisher,
    author: pbiviz.author,
    description: visual.description,
    pricing: publication.listing.pricing,
    transactable: publication.listing.transactable,
    supportUrl: publication.listing.supportUrl,
    privacyPolicyUrl: publication.listing.privacyPolicyUrl,
    termsOfUseUrl: publication.listing.termsOfUseUrl,
    supportEmail: publication.listing.supportEmail,
    sampleReport: publication.sampleReport
  }
};

fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(`Release manifest written for ${expectedFilename} (${sha256}).\n`);
