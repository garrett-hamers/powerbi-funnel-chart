/*
 * Captures the AppSource submission screenshots by really rendering the built visual.
 *
 * The bundle is rendered in a headless Chromium-family browser at exactly the Partner
 * Center screenshot size, and every emitted PNG is verified byte-wise before it is
 * written into assets/screenshots. The capture fails loudly instead of producing an
 * off-specification image.
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { writeHarnessPages } = require("./screenshot-harness.cjs");
const { readPngMetadata } = require("./png-utils.cjs");

const root = path.resolve(__dirname, "..");
const workDirectory = path.join(root, ".tmp", "screenshots");
const outputDirectory = path.join(root, "assets", "screenshots");
const MAX_SCREENSHOT_BYTES = 1024 * 1024;

const fail = (message) => {
  process.stderr.write(`Screenshot capture failed: ${message}\n`);
  process.exit(1);
};

const existing = (candidates) => candidates.filter((candidate) => {
  try {
    return Boolean(candidate) && fs.statSync(candidate).isFile();
  } catch {
    return false;
  }
});

const playwrightChromium = () => {
  const cacheRoot = process.platform === "win32"
    ? path.join(process.env.LOCALAPPDATA ?? "", "ms-playwright")
    : process.platform === "darwin"
      ? path.join(os.homedir(), "Library", "Caches", "ms-playwright")
      : path.join(os.homedir(), ".cache", "ms-playwright");
  let entries = [];
  try {
    entries = fs.readdirSync(cacheRoot).filter((entry) => entry.startsWith("chromium"));
  } catch {
    return [];
  }
  return entries.flatMap((entry) => [
    path.join(cacheRoot, entry, "chrome-win", "chrome.exe"),
    path.join(cacheRoot, entry, "chrome-linux", "chrome"),
    path.join(cacheRoot, entry, "chrome-mac", "Chromium.app", "Contents", "MacOS", "Chromium")
  ]);
};

const fromPath = (names) => {
  const locator = process.platform === "win32" ? "where" : "which";
  return names.flatMap((name) => {
    const result = spawnSync(locator, [name], { encoding: "utf8" });
    return result.status === 0
      ? result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
      : [];
  });
};

const findBrowser = () => {
  const programFiles = process.env.ProgramFiles ?? "C:\\Program Files";
  const programFilesX86 = process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)";
  const localAppData = process.env.LOCALAPPDATA ?? "";
  const candidates = [
    process.env.CHROME_PATH,
    process.env.EDGE_PATH,
    path.join(programFiles, "Google", "Chrome", "Application", "chrome.exe"),
    path.join(programFilesX86, "Google", "Chrome", "Application", "chrome.exe"),
    path.join(localAppData, "Google", "Chrome", "Application", "chrome.exe"),
    path.join(programFiles, "Microsoft", "Edge", "Application", "msedge.exe"),
    path.join(programFilesX86, "Microsoft", "Edge", "Application", "msedge.exe"),
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    ...playwrightChromium()
  ];
  const found = existing(candidates);
  if (found.length > 0) {
    return found[0];
  }
  const onPath = existing(fromPath([
    "google-chrome",
    "google-chrome-stable",
    "chromium",
    "chromium-browser",
    "microsoft-edge"
  ]));
  return onPath[0];
};

const fileUrl = (filePath) =>
  `file:///${filePath.replace(/\\/g, "/").replace(/^\//, "")}`;

const capture = (browser, page, targetPath) => {
  const profileDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "atlyn-funnel-shot-"));
  try {
    const result = spawnSync(browser, [
      "--headless=new",
      "--disable-gpu",
      "--disable-extensions",
      "--disable-lcd-text",
      "--no-first-run",
      "--no-default-browser-check",
      "--hide-scrollbars",
      "--force-device-scale-factor=1",
      "--force-color-profile=srgb",
      "--font-render-hinting=none",
      "--virtual-time-budget=5000",
      `--user-data-dir=${profileDirectory}`,
      `--window-size=${page.viewport.width},${page.viewport.height}`,
      `--screenshot=${targetPath}`,
      fileUrl(page.htmlPath)
    ], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    if (result.error) {
      fail(`unable to start ${browser}: ${result.error.message}`);
    }
    if (!fs.existsSync(targetPath)) {
      fail(`${browser} did not emit ${path.relative(root, targetPath)}\n${result.stderr ?? ""}`);
    }
  } finally {
    fs.rmSync(profileDirectory, { recursive: true, force: true });
  }
};

const browser = findBrowser();
if (!browser) {
  fail(
    "no Chromium-family browser was found. Set CHROME_PATH to a Chrome, Edge, or Chromium " +
    "executable, or install one, then re-run `npm run screenshots`."
  );
}

const pages = writeHarnessPages(workDirectory);
fs.mkdirSync(outputDirectory, { recursive: true });
process.stdout.write(`Rendering ${pages.length} screenshot(s) with ${browser}\n`);

pages.forEach((page) => {
  const stagedPath = path.join(workDirectory, `${page.id}.png`);
  fs.rmSync(stagedPath, { force: true });
  capture(browser, page, stagedPath);

  const metadata = readPngMetadata(stagedPath);
  if (metadata.width !== page.viewport.width || metadata.height !== page.viewport.height) {
    fail(
      `${page.id}.png rendered at ${metadata.width}x${metadata.height} but Partner Center ` +
      `requires exactly ${page.viewport.width}x${page.viewport.height}`
    );
  }
  if (metadata.bytes > MAX_SCREENSHOT_BYTES) {
    fail(`${page.id}.png is ${metadata.bytes} bytes; Partner Center allows at most ${MAX_SCREENSHOT_BYTES}`);
  }

  const finalPath = path.join(outputDirectory, `${page.id}.png`);
  fs.copyFileSync(stagedPath, finalPath);
  process.stdout.write(
    `  ${path.relative(root, finalPath)} ${metadata.width}x${metadata.height} ${metadata.bytes} bytes\n`
  );
});

process.stdout.write("Screenshot capture completed.\n");
