const fs = require("node:fs");
const path = require("node:path");

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
const source = fs.readFileSync(path.join(root, "src", "visual.ts"), "utf8");
const artifacts = fs.existsSync(path.join(root, "dist"))
  ? fs.readdirSync(path.join(root, "dist")).filter((entry) => entry.endsWith(".pbiviz"))
  : [];

requireCondition(Array.isArray(capabilities.privileges) && capabilities.privileges.length === 0, "capabilities.privileges must be []");
requireCondition(pbiviz.visual?.guid === "atlynFunnelA1B2C3D4", "pbiviz.json must preserve the stable visual GUID");
requireCondition(Number.parseFloat(pbiviz.apiVersion) >= 5.1, "pbiviz.json must use Power BI API 5.1 or newer");
requireCondition(Array.isArray(pbiviz.externalJS) && pbiviz.externalJS.length === 0, "pbiviz.json externalJS must be []");
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
requireCondition(artifacts.some((entry) => entry.startsWith("atlynFunnelA1B2C3D4.")), "packaging must emit a stable-GUID PBIVIZ artifact");

if (failures.length > 0) {
  process.stderr.write(`Certification audit failed:\n${failures.map((failure) => `- ${failure}`).join("\n")}\n`);
  process.exit(1);
}

process.stdout.write("Certification audit passed.\n");
