/*
 * Shared discovery and launch helpers for the headless Chromium-family browser used
 * by the screenshot capture and the layout probe. Nothing here ever opens a window:
 * every launch runs with --headless=new.
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

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

const BROWSER_HINT =
  "no Chromium-family browser was found. Set CHROME_PATH to a Chrome, Edge, or Chromium " +
  "executable, or install one, then re-run the command.";

const fileUrl = (filePath) =>
  `file:///${filePath.replace(/\\/g, "/").replace(/^\//, "")}`;

const BASE_ARGS = [
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
  // CI runners have no usable sandbox and a small /dev/shm; the pages are local files
  // this repository generates itself, so there is nothing untrusted to contain.
  ...(process.env.CI ? ["--no-sandbox", "--disable-dev-shm-usage"] : [])
];

const runHeadless = (browser, args, options = {}) => {
  const profileDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "atlyn-funnel-headless-"));
  try {
    return spawnSync(browser, [...BASE_ARGS, `--user-data-dir=${profileDirectory}`, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: options.maxBuffer ?? 256 * 1024 * 1024
    });
  } finally {
    fs.rmSync(profileDirectory, { recursive: true, force: true });
  }
};

module.exports = { findBrowser, fileUrl, runHeadless, BASE_ARGS, BROWSER_HINT };
