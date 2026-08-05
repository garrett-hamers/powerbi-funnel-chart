/*
 * Captures the AppSource submission screenshots by really rendering the built visual.
 *
 * The bytes that ship inside dist/*.pbiviz are rendered in a headless Chromium-family
 * browser at exactly the Partner Center screenshot size, and every emitted PNG is
 * verified byte-wise before it is written into assets/screenshots. The capture fails
 * loudly instead of producing an off-specification image.
 */
const fs = require("node:fs");
const path = require("node:path");
const { writeHarnessPages } = require("./screenshot-harness.cjs");
const { readPngMetadata } = require("./png-utils.cjs");
const { findBrowser, fileUrl, runHeadless, BROWSER_HINT } = require("./headless-browser.cjs");

const root = path.resolve(__dirname, "..");
const workDirectory = path.join(root, ".tmp", "screenshots");
const outputDirectory = path.join(root, "assets", "screenshots");
const MAX_SCREENSHOT_BYTES = 1024 * 1024;

const fail = (message) => {
  process.stderr.write(`Screenshot capture failed: ${message}\n`);
  process.exit(1);
};

const capture = (browser, page, targetPath) => {
  const result = runHeadless(browser, [
    "--virtual-time-budget=5000",
    `--window-size=${page.viewport.width},${page.viewport.height}`,
    `--screenshot=${targetPath}`,
    fileUrl(page.htmlPath)
  ]);
  if (result.error) {
    fail(`unable to start ${browser}: ${result.error.message}`);
  }
  if (!fs.existsSync(targetPath)) {
    fail(`${browser} did not emit ${path.relative(root, targetPath)}\n${result.stderr ?? ""}`);
  }
};

const main = async () => {
  const browser = findBrowser();
  if (!browser) {
    fail(BROWSER_HINT);
  }

  const pages = await writeHarnessPages(workDirectory);
  fs.mkdirSync(outputDirectory, { recursive: true });
  process.stdout.write(
    `Rendering ${pages.length} screenshot(s) with ${browser} from ${pages[0].bundle.packageName}\n`
  );

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
};

main().catch((error) => fail(error.message));
