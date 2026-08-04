const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { readPngContentProfile } = require("./png-utils.cjs");

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
const publication = readJson("publication.json");
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
  const logo = readPngContentProfile(publicationLogoPath);
  requireCondition(logo.width === 300 && logo.height === 300, "assets/logo-300x300.png must be exactly 300x300");
  requireCondition(
    logo.distinctColors >= 8 && logo.opaqueRatio > 0.01,
    "assets/logo-300x300.png must contain real artwork rather than a placeholder fill"
  );
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

const isHttps = (value) => typeof value === "string" && value.startsWith("https://");
const listing = publication.listing ?? {};
const screenshotRules = publication.constraints?.screenshot ?? {};
const descriptionRules = publication.constraints?.description ?? {};
const description = pbiviz.visual?.description ?? "";

requireCondition(typeof pbiviz.visual?.name === "string" && pbiviz.visual.name.length > 0, "pbiviz.json must declare visual.name");
requireCondition(
  typeof pbiviz.visual?.displayName === "string" && pbiviz.visual.displayName.length > 0,
  "pbiviz.json must declare visual.displayName"
);
requireCondition(
  /^\d+\.\d+\.\d+\.\d+$/.test(pbiviz.visual?.version ?? ""),
  "pbiviz.json visual.version must be a four-part x.x.x.x version"
);
requireCondition(
  description.length >= (descriptionRules.minLength ?? 1) && description.length <= (descriptionRules.maxLength ?? 200),
  `pbiviz.json visual.description must be ${descriptionRules.minLength}-${descriptionRules.maxLength} characters for the AppSource listing`
);
requireCondition(isHttps(pbiviz.visual?.supportUrl), "pbiviz.json visual.supportUrl must be an https URL");
requireCondition(
  pbiviz.visual?.supportUrl === listing.supportUrl,
  "pbiviz.json visual.supportUrl must match publication.json listing.supportUrl"
);
requireCondition(pbiviz.author?.name === listing.publisher, "pbiviz.json author.name must match the Atlyn publisher identity");
requireCondition(
  pbiviz.author?.email === listing.supportEmail,
  "pbiviz.json author.email must match the published support email"
);
requireCondition(isHttps(listing.privacyPolicyUrl), "publication.json listing.privacyPolicyUrl must be an https URL");
requireCondition(isHttps(listing.termsOfUseUrl), "publication.json listing.termsOfUseUrl must be an https URL");
requireCondition(
  manifest.publication?.supportUrl === listing.supportUrl &&
    manifest.publication?.privacyPolicyUrl === listing.privacyPolicyUrl &&
    manifest.publication?.termsOfUseUrl === listing.termsOfUseUrl,
  "release manifest publication URLs do not match publication.json"
);
requireCondition(
  manifest.publication?.description === description,
  "release manifest publication description does not match pbiviz.json"
);
requireCondition(
  manifest.publication?.sampleReport?.provided === false,
  "the sample .pbix is an owner-controlled manual step and must not be reported as provided"
);

const screenshotPaths = publication.assets?.screenshots ?? [];
requireCondition(
  screenshotPaths.length >= (screenshotRules.minCount ?? 1) &&
    screenshotPaths.length <= (screenshotRules.maxCount ?? 5),
  `publication.json must declare ${screenshotRules.minCount}-${screenshotRules.maxCount} Partner Center screenshots`
);
const recordedScreenshots = manifest.publicationAssets?.partnerCenterScreenshots1366x768 ?? [];
requireCondition(
  recordedScreenshots.length === screenshotPaths.length,
  "release manifest must record every declared Partner Center screenshot"
);
screenshotPaths.forEach((relativePath, index) => {
  try {
    const screenshot = readPngContentProfile(path.join(root, relativePath));
    const recorded = recordedScreenshots[index];
    requireCondition(
      screenshot.width === screenshotRules.width && screenshot.height === screenshotRules.height,
      `${relativePath} must be exactly ${screenshotRules.width}x${screenshotRules.height}`
    );
    requireCondition(
      screenshot.bytes <= screenshotRules.maxBytes,
      `${relativePath} must be at most ${screenshotRules.maxBytes} bytes`
    );
    requireCondition(
      screenshot.distinctColors >= 32,
      `${relativePath} must be a real render rather than a flat placeholder image`
    );
    requireCondition(recorded?.path === relativePath, `release manifest must record ${relativePath}`);
    requireCondition(recorded?.sha256 === screenshot.sha256, `release manifest SHA-256 does not match ${relativePath}`);
    requireCondition(recorded?.bytes === screenshot.bytes, `release manifest byte size does not match ${relativePath}`);
    requireCondition(
      recorded?.width === screenshot.width && recorded?.height === screenshot.height,
      `release manifest dimensions do not match ${relativePath}`
    );
  } catch (error) {
    failures.push(`unable to validate ${relativePath}: ${error.message}`);
  }
});

const requireTrackedDocument = (relativePath, recorded, requiredText) => {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) {
    failures.push(`${relativePath} is required for the AppSource submission`);
    return;
  }
  const contents = fs.readFileSync(absolutePath);
  const sha256 = crypto.createHash("sha256").update(contents).digest("hex");
  requireCondition(contents.length > 1000, `${relativePath} must contain real submission content`);
  requireCondition(recorded?.path === relativePath, `release manifest must record ${relativePath}`);
  requireCondition(recorded?.sha256 === sha256, `release manifest SHA-256 does not match ${relativePath}`);
  requireCondition(recorded?.bytes === contents.length, `release manifest byte size does not match ${relativePath}`);
  const text = contents.toString("utf8");
  requiredText.forEach((needle) => {
    requireCondition(text.includes(needle), `${relativePath} must reference ${needle}`);
  });
};

requireTrackedDocument(publication.assets?.eula ?? "EULA.md", manifest.publicationAssets?.eula, [
  listing.privacyPolicyUrl,
  listing.termsOfUseUrl,
  listing.supportUrl,
  listing.supportEmail
]);
requireTrackedDocument(
  publication.assets?.dossier ?? "docs/partner-center-submission.md",
  manifest.publicationAssets?.submissionDossier,
  [
    listing.privacyPolicyUrl,
    listing.supportUrl,
    pbiviz.visual?.guid,
    ...screenshotPaths
  ]
);
(publication.assets?.sampleData ?? []).forEach((relativePath) => {
  requireCondition(
    fs.existsSync(path.join(root, relativePath)),
    `${relativePath} must exist so the sample report can be rebuilt offline`
  );
});
requireCondition(
  packageJson.scripts?.screenshots === "node scripts/capture-screenshots.cjs",
  "the screenshot capture script must stay wired into npm scripts"
);

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
