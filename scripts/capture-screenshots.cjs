/*
 * Captures the AppSource submission screenshots by really rendering the built visual.
 *
 * The bytes that ship inside dist/*.pbiviz are rendered in a headless Chromium-family
 * browser at exactly the Partner Center screenshot size, and every emitted PNG is
 * verified before it is written into assets/screenshots. The capture fails loudly
 * instead of producing an off-specification image.
 *
 * Dimensions and byte size are necessary but nowhere near sufficient. An empty chart,
 * a chart that failed to bind its data, and a chart whose content rendered outside the
 * visible area are all correctly sized PNGs under the size cap, so a pipeline that
 * stops there will happily commit any of them as a submission asset. Static analysis
 * of the finished PNG cannot close that gap either: these funnels are a flat design
 * carrying only a few hundred distinct colours, so any colour or blankness floor loose
 * enough to pass a correct render here would also pass a nearly-blank wrong one.
 *
 * So the content is asserted at capture time, while it is still known what was
 * supposed to be drawn. Chromium writes the PNG and dumps the DOM in the same
 * invocation, which means the counts and the measured geometry describe the very
 * render the screenshot shows, and a scene that fails its own expectations never
 * reaches assets/screenshots.
 *
 * Pass --verify to run every assertion without touching assets/screenshots.
 */
const fs = require("node:fs");
const path = require("node:path");
const { writeHarnessPages } = require("./screenshot-harness.cjs");
const { readPngMetadata } = require("./png-utils.cjs");
const { findBrowser, fileUrl, runHeadless, BROWSER_HINT } = require("./headless-browser.cjs");
const { expectationFor, evaluateScene, describeScene } = require("./screenshot-scene-expectations.cjs");
const { RECORD_PATH, buildRecord, sha256Of } = require("./screenshot-capture-record.cjs");

const root = path.resolve(__dirname, "..");
const workDirectory = path.join(root, ".tmp", "screenshots");
const outputDirectory = path.join(root, "assets", "screenshots");
const agentPath = path.join(__dirname, "screenshot-content-agent.js");
const MAX_SCREENSHOT_BYTES = 1024 * 1024;

// Assembled from fragments so this file's own source never matches the marker it
// scans for in the dumped DOM.
const REPORT_START = "@@ATLYN" + "_SCENE@@";
const REPORT_END = "@@END_ATLYN" + "_SCENE@@";

const verifyOnly = process.argv.includes("--verify");

const fail = (message) => {
  process.stderr.write(`Screenshot capture failed: ${message}\n`);
  process.exit(1);
};

const extractReport = (dom) => {
  const end = dom.lastIndexOf(REPORT_END);
  if (end < 0) {
    return null;
  }
  const start = dom.lastIndexOf(REPORT_START, end);
  if (start < 0) {
    return null;
  }
  try {
    return JSON.parse(dom.slice(start + REPORT_START.length, end));
  } catch (error) {
    return { ok: false, fatal: `the content report was not valid JSON: ${error.message}` };
  }
};

/*
 * One invocation writes the PNG and dumps the DOM. Two runs would let the assertions
 * describe a render the screenshot never contained, which is the hole this closes.
 *
 * A browser that will not start is a tooling failure and stops the run outright. A
 * browser that starts but produces no image or no report for a scene is a failure of
 * that scene, so it is reported as one: it has to reach the same path that removes the
 * scene's stale asset, or a screenshot from an earlier build would survive a render
 * that produced nothing at all.
 */
const capture = (browser, page, targetPath) => {
  const result = runHeadless(browser, [
    "--virtual-time-budget=5000",
    "--dump-dom",
    `--window-size=${page.viewport.width},${page.viewport.height}`,
    `--screenshot=${targetPath}`,
    fileUrl(page.htmlPath)
  ]);
  if (result.error) {
    fail(`unable to start ${browser}: ${result.error.message}`);
  }
  if (!fs.existsSync(targetPath)) {
    return {
      image: false,
      report: {
        ok: false,
        fatal:
          `${browser} emitted no image for this scene\n${(result.stderr ?? "").slice(0, 2000)}`
      }
    };
  }
  const report = extractReport(result.stdout ?? "");
  if (!report) {
    return {
      image: true,
      report: {
        ok: false,
        fatal:
          "the render produced no content report, so nothing about the screenshot's " +
          `contents is known\n${(result.stderr ?? "").slice(0, 2000)}`
      }
    };
  }
  return { image: true, report };
};

const summarise = (report) =>
  `${report.bars.length} bars, ${report.chartLabels.length} labels, ` +
  `${report.summaryMetrics.length} summary metric(s), ${report.warnings.length} diagnostic(s), ` +
  `${report.stageButtons.length} stage rows, ${report.tableRows} table rows`;

const main = async () => {
  const browser = findBrowser();
  if (!browser) {
    fail(BROWSER_HINT);
  }

  const extraScript = fs.readFileSync(agentPath, "utf8");
  const pages = await writeHarnessPages(workDirectory, { extraScript });
  // Resolved up front: a new scene with no declared expectation stops the run before
  // any file is written rather than silently capturing unverified content.
  const expectations = pages.map((page) => expectationFor(page.id));
  fs.mkdirSync(outputDirectory, { recursive: true });
  process.stdout.write(
    `Rendering ${pages.length} screenshot(s) with ${browser} from ${pages[0].bundle.packageName}\n`
  );

  const staged = [];
  const failures = [];

  pages.forEach((page, index) => {
    const expectation = expectations[index];
    const stagedPath = path.join(workDirectory, `${page.id}.png`);
    fs.rmSync(stagedPath, { force: true });
    const { image, report } = capture(browser, page, stagedPath);

    const problems = [];
    // Without an image there is no metadata to read, so the scene fails on the report
    // alone rather than throwing on a file that was never written.
    const metadata = image ? readPngMetadata(stagedPath) : null;
    if (metadata) {
      if (metadata.width !== page.viewport.width || metadata.height !== page.viewport.height) {
        problems.push({
          rule: "viewport",
          detail:
            `rendered at ${metadata.width}x${metadata.height} but Partner Center requires exactly ` +
            `${page.viewport.width}x${page.viewport.height}`
        });
      }
      if (metadata.bytes > MAX_SCREENSHOT_BYTES) {
        problems.push({
          rule: "size",
          detail: `is ${metadata.bytes} bytes; Partner Center allows at most ${MAX_SCREENSHOT_BYTES}`
        });
      }
    }
    /*
     * The in-page geometry assertions are only meaningful if the frame they clip
     * against is the frame that was captured. Chromium's layout viewport is smaller
     * than the emitted PNG, so this is checked rather than assumed: a mismatch would
     * quietly turn every containment rule into nonsense.
     */
    if (report.ok === true && metadata) {
      if (report.page?.width !== metadata.width || report.page?.height !== metadata.height) {
        problems.push({
          rule: "frame-mismatch",
          detail:
            `the content probe measured against a ${report.page?.width}x${report.page?.height} frame ` +
            `but the PNG is ${metadata.width}x${metadata.height}, so its geometry checks do not ` +
            "describe the captured image"
        });
      }
      if (Math.abs(report.scroll?.x ?? 0) > 0.5 || Math.abs(report.scroll?.y ?? 0) > 0.5) {
        problems.push({
          rule: "frame-scrolled",
          detail:
            `the document was scrolled to ${report.scroll?.x}/${report.scroll?.y} when it was measured, ` +
            "so the measured boxes are offset from the captured image"
        });
      }
    }
    problems.push(...evaluateScene(expectation, report));

    if (problems.length > 0) {
      failures.push({ page, expectation, problems });
      process.stdout.write(`  ${page.id}.png FAILED ${problems.length} content assertion(s)\n`);
      return;
    }

    staged.push({ page, stagedPath, metadata, report, expectation });
    process.stdout.write(
      `  ${page.id}.png ${metadata.width}x${metadata.height} ${metadata.bytes} bytes ` +
      `- ${summarise(report)}\n`
    );
  });

  if (failures.length > 0) {
    process.stderr.write(
      `\n${failures.length} scene(s) did not render what they claim to show, ` +
      "so no screenshot was written.\n"
    );
    failures.forEach(({ page, expectation, problems }) => {
      process.stderr.write(`\n${page.id} should show ${expectation.demonstrates}:\n`);
      problems.forEach((problem) => {
        process.stderr.write(`  [${problem.rule}] ${problem.detail}\n`);
      });
      // A stale asset left in place would let the failure hide behind a screenshot
      // that was correct for some earlier build, so the scene's output goes with it.
      const finalPath = path.join(outputDirectory, `${page.id}.png`);
      if (!verifyOnly && fs.existsSync(finalPath)) {
        fs.rmSync(finalPath, { force: true });
        process.stderr.write(`  removed the stale ${path.relative(root, finalPath)}\n`);
      }
    });
    process.exit(1);
  }

  if (verifyOnly) {
    process.stdout.write(
      "\nVerification only: every scene rendered what it claims to show, " +
      "and assets/screenshots was left untouched.\n"
    );
    return;
  }

  // Publishing happens only once every scene has passed, so a single broken scene can
  // never leave a half-updated set behind.
  const recordedScenes = staged.map(({ page, stagedPath, metadata, report, expectation }) => {
    const finalPath = path.join(outputDirectory, `${page.id}.png`);
    fs.copyFileSync(stagedPath, finalPath);
    process.stdout.write(`  wrote ${path.relative(root, finalPath)} (${metadata.bytes} bytes)\n`);
    return {
      ...describeScene(expectation, report),
      screenshot: {
        path: path.relative(root, finalPath).split(path.sep).join("/"),
        /*
         * Hashes the bytes that were just written, so the record vouches for exactly
         * the file that the assertions above were applied to.
         *
         * This pins committed bytes. It is NOT a golden image and must never become
         * one: browser renders are not bit-stable, and this repository's own CI proves
         * it loudly — the identical scenes render 55-58% larger on the Linux runner
         * than on Windows purely because the font stack differs, while every content
         * assertion passes identically on both. A re-render comparison here would fail
         * constantly for reasons that have nothing to do with correctness.
         */
        sha256: sha256Of(fs.readFileSync(finalPath)),
        bytes: metadata.bytes,
        width: metadata.width,
        height: metadata.height
      }
    };
  });

  const bundle = pages[0].bundle;
  if (!bundle.packageSha256) {
    fail(
      "the harness did not render the packaged artifact, so there is no build to record; " +
      "screenshots must depict the .pbiviz the customer receives"
    );
  }
  const recordPath = path.join(root, RECORD_PATH);
  fs.writeFileSync(
    recordPath,
    `${JSON.stringify(
      buildRecord({
        bundle,
        viewport: { width: pages[0].viewport.width, height: pages[0].viewport.height },
        scenes: recordedScenes
      }),
      null,
      2
    )}\n`
  );
  const assertionCount = recordedScenes.reduce((total, scene) => total + scene.assertions.length, 0);
  process.stdout.write(
    `  wrote ${RECORD_PATH} (${assertionCount} recorded assertion(s) across ` +
    `${recordedScenes.length} scene(s), rendered from ${bundle.packageName} ${bundle.packageSha256})\n`
  );

  process.stdout.write("Screenshot capture completed.\n");
};

module.exports = { extractReport, MAX_SCREENSHOT_BYTES };

if (require.main === module) {
  main().catch((error) => fail(error.stack ?? error.message));
}
