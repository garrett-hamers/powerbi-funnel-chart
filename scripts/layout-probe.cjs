/*
 * Small-tile layout probe.
 *
 * Renders the bytes that ship inside dist/*.pbiviz in a headless Chromium-family
 * browser, at a matrix of tile sizes, and measures the real geometry of every box.
 * Asserting that the stylesheet is non-empty would pass on a badly broken layout;
 * only measured boxes catch clipping, so this probe measures.
 *
 * Exit code 1 when a defect is measured, so CI fails on a regression.
 */
const fs = require("node:fs");
const path = require("node:path");
const { writeHarnessPages } = require("./screenshot-harness.cjs");
const { findBrowser, fileUrl, runHeadless, BROWSER_HINT } = require("./headless-browser.cjs");
const { PROBE_VIEWPORTS, PROBE_DATA, buildProbeScenarios, evaluateReport } = require("./layout-probe-cases.cjs");

const root = path.resolve(__dirname, "..");
const workDirectory = path.join(root, ".tmp", "layout-probe");
const agentPath = path.join(__dirname, "layout-probe-agent.js");

const fail = (message) => {
  process.stderr.write(`Layout probe failed: ${message}\n`);
  process.exit(1);
};

const PROBE_START = "@@ATLYN_PROBE@@";
const PROBE_END = "@@END_ATLYN_PROBE@@";

const extractReport = (dom) => {
  const end = dom.lastIndexOf(PROBE_END);
  if (end < 0) {
    return null;
  }
  const start = dom.lastIndexOf(PROBE_START, end);
  if (start < 0) {
    return null;
  }
  return JSON.parse(dom.slice(start + PROBE_START.length, end));
};

const runProbe = (browser, page) => {
  const args = [
    "--virtual-time-budget=6000",
    "--dump-dom",
    `--window-size=${page.viewport.width},${page.viewport.height}`
  ];
  if (page.forceReducedMotion) {
    args.push("--force-prefers-reduced-motion=reduce");
  }
  args.push(fileUrl(page.htmlPath));
  const result = runHeadless(browser, args);
  if (result.error) {
    fail(`unable to start ${browser}: ${result.error.message}`);
  }
  const report = extractReport(result.stdout ?? "");
  if (!report) {
    fail(`${page.id} produced no probe report\n${(result.stderr ?? "").slice(0, 2000)}`);
  }
  return report;
};

const pad = (value, width) => String(value).padEnd(width);

const printTable = (rows) => {
  const headers = [
    "Scenario",
    "Tile",
    "Root content",
    "Root hidden",
    "Escapes",
    "Chart visible",
    "Scrollable",
    "Scrolled escapes",
    "Sticky",
    "Collapsed"
  ];
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => String(row[index]).length))
  );
  process.stdout.write(`| ${headers.map((header, index) => pad(header, widths[index])).join(" | ")} |\n`);
  process.stdout.write(`| ${widths.map((width) => "-".repeat(width)).join(" | ")} |\n`);
  rows.forEach((row) => {
    process.stdout.write(`| ${row.map((cell, index) => pad(cell, widths[index])).join(" | ")} |\n`);
  });
};

const main = async () => {
  const browser = findBrowser();
  if (!browser) {
    fail(BROWSER_HINT);
  }

  const scenarios = buildProbeScenarios();
  const extraScript = fs.readFileSync(agentPath, "utf8");
  const pages = await writeHarnessPages(workDirectory, { scenarios, extraScript });
  const bundle = pages[0].bundle;
  process.stdout.write(
    `Probing ${pages.length} case(s) from ${bundle.packageName} ` +
    `(js ${bundle.jsBytes} bytes, css ${bundle.cssBytes} bytes) with ${browser}\n\n`
  );

  const rows = [];
  const findings = [];
  const reports = [];
  pages.forEach((page) => {
    const scenario = scenarios.find((candidate) => candidate.id === page.id);
    const report = runProbe(browser, {
      ...page,
      forceReducedMotion: Boolean(scenario.forceReducedMotion)
    });
    reports.push({ scenario, report });
    const chart = report.regions?.chartScroll;
    const scrollers = report.scrollContainers ?? [];
    const rootScroller = scrollers.find((entry) => entry.element.indexOf("atlyn-funnel") >= 0);
    const probes = report.scrollProbes ?? [];
    const scrollable = probes.filter((probe) => probe.verticallyScrollable || probe.horizontallyScrollable);
    const scrolledEscapes = probes.reduce(
      (total, probe) =>
        total + (probe.offsets ?? []).reduce((count, offset) => count + (offset.escapes ?? []).length, 0),
      0
    );
    const tile = report.viewport ?? scenario.visual;
    rows.push([
      scenario.title,
      `${tile.width}x${tile.height}`,
      report.ok ? `${report.contentHeight}px` : "n/a",
      report.ok ? `${rootScroller ? rootScroller.hiddenY : 0}px` : "n/a",
      report.ok ? String((report.escapes ?? []).length) : "n/a",
      chart ? `${Math.round((chart.visibleFraction ?? 0) * 100)}%` : "-",
      report.ok ? `${scrollable.length}/${probes.length}` : "n/a",
      report.ok ? String(scrolledEscapes) : "n/a",
      report.ok ? String(report.stickyCount ?? 0) : "n/a",
      report.ok ? String((report.collapsed ?? []).length) : "n/a"
    ]);
    findings.push(...evaluateReport(scenario, report));
  });

  printTable(rows);

  const detailPath = path.join(workDirectory, "layout-probe-report.json");
  fs.writeFileSync(detailPath, `${JSON.stringify(reports, null, 2)}\n`);
  process.stdout.write(`\nFull measurements: ${path.relative(root, detailPath)}\n`);

  if (findings.length === 0) {
    process.stdout.write("\nNo layout defects measured.\n");
    return;
  }
  process.stdout.write(`\n${findings.length} layout defect(s) measured:\n`);
  findings.forEach((finding) => {
    process.stdout.write(`  [${finding.scenario}] ${finding.rule}: ${finding.detail}\n`);
  });
  process.exitCode = 1;
};

module.exports = { extractReport, PROBE_VIEWPORTS, PROBE_DATA };

if (require.main === module) {
  main().catch((error) => fail(error.stack ?? error.message));
}
