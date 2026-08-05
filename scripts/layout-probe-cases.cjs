/*
 * Declarative cases and pure assertions for the small-tile layout probe.
 *
 * Kept free of Node I/O and browser APIs so the same rules that gate CI can be
 * unit-tested against recorded measurements.
 */

// The smallest tile the visual declares support for is the floor its own stylesheet
// sets on the root element (min-width/min-height in src/style.css).
const PROBE_VIEWPORTS = [
  { id: "xl", label: "1280x620 (report page)", width: 1280, height: 620 },
  { id: "md", label: "398x298 (quarter tile)", width: 398, height: 298 },
  { id: "sm", label: "258x198 (small tile)", width: 258, height: 198 },
  { id: "xs", label: "178x138 (tiny tile)", width: 178, height: 138 },
  { id: "min", label: "160x80 (declared minimum)", width: 160, height: 80 }
];

const PROBE_DATA = {
  stage: [
    "Website visits",
    "Product tour",
    "Free trial started",
    "Qualified demo",
    "Proposal sent",
    "Closed won"
  ],
  stageOrder: [1, 2, 3, 4, 5, 6],
  value: [128400, 74900, 31250, 12880, 6240, 2860],
  target: [120000, 78000, 34000, 12000, 6500, 3000]
};

const DIAGNOSTIC_DATA = {
  stage: [
    "Site sessions",
    "Product viewed",
    "Added to cart",
    "Checkout started",
    "Payment attempted",
    "Order completed"
  ],
  stageOrder: null,
  value: [84300, 41250, 27150, null, 9720, 11050],
  target: null
};

/*
 * A fixture built to overflow rather than to fit. Content that fits never scrolls, and
 * a region that never scrolls hides every defect that only appears once it does, so a
 * probe run only against fitting content can report a clean bill of health it has not
 * earned. Twelve stages across six segments puts far more rows in every scrollable
 * region than any tile can show.
 */
const OVERFLOW_STAGES = [
  "Website visits",
  "Product tour",
  "Pricing viewed",
  "Free trial started",
  "Trial activated",
  "Feature adopted",
  "Qualified demo",
  "Security review",
  "Proposal sent",
  "Negotiation",
  "Contract sent",
  "Closed won"
];
const OVERFLOW_GROUPS = ["North America", "EMEA", "APAC", "LATAM", "ANZ", "Japan"];

const buildOverflowData = () => {
  const stage = [];
  const group = [];
  const value = [];
  const stageOrder = [];
  const target = [];
  OVERFLOW_GROUPS.forEach((segment, segmentIndex) => {
    OVERFLOW_STAGES.forEach((label, stageIndex) => {
      stage.push(label);
      group.push(segment);
      stageOrder.push(stageIndex + 1);
      const seed = 120000 - segmentIndex * 9000;
      value.push(Math.round(seed * Math.pow(0.78, stageIndex)));
      target.push(Math.round(seed * Math.pow(0.8, stageIndex)));
    });
  });
  return { stage, group, value, stageOrder, target };
};

const page = (viewport) => ({ width: viewport.width + 40, height: viewport.height + 40 });

const buildProbeScenarios = () => {
  const scenarios = PROBE_VIEWPORTS.map((viewport) => ({
    id: `size-${viewport.id}`,
    title: viewport.label,
    locale: "en-US",
    visual: { width: viewport.width, height: viewport.height },
    page: page(viewport),
    ...PROBE_DATA
  }));

  const md = PROBE_VIEWPORTS.find((viewport) => viewport.id === "md");
  const sm = PROBE_VIEWPORTS.find((viewport) => viewport.id === "sm");
  const xl = PROBE_VIEWPORTS.find((viewport) => viewport.id === "xl");

  scenarios.push({
    id: "diagnostics-sm",
    title: "258x198 diagnostics",
    locale: "en-US",
    visual: { width: sm.width, height: sm.height },
    page: page(sm),
    ...DIAGNOSTIC_DATA
  });
  scenarios.push({
    id: "rtl-md",
    title: "398x298 right-to-left",
    locale: "ar-SA",
    expectDirection: "rtl",
    visual: { width: md.width, height: md.height },
    page: page(md),
    ...PROBE_DATA
  });
  scenarios.push({
    id: "high-contrast-md",
    title: "398x298 high contrast",
    locale: "en-US",
    highContrast: true,
    visual: { width: md.width, height: md.height },
    page: page(md),
    ...PROBE_DATA
  });
  scenarios.push({
    id: "reduced-motion-xl",
    title: "1280x620 reduced motion",
    locale: "en-US",
    forceReducedMotion: true,
    visual: { width: xl.width, height: xl.height },
    page: page(xl),
    ...PROBE_DATA
  });

  // Overflowing fixtures. These exist to make regions actually scroll; expectOverflow
  // makes the run fail loudly if they ever stop doing so, rather than quietly passing
  // every scroll assertion by never scrolling.
  const overflow = buildOverflowData();
  scenarios.push({
    id: "overflow-xl",
    title: "1280x620 overflowing (72 rows)",
    locale: "en-US",
    expectOverflow: true,
    visual: { width: xl.width, height: xl.height },
    page: page(xl),
    ...overflow
  });
  scenarios.push({
    id: "overflow-md",
    title: "398x298 overflowing (72 rows)",
    locale: "en-US",
    expectOverflow: true,
    visual: { width: md.width, height: md.height },
    page: page(md),
    ...overflow
  });
  scenarios.push({
    id: "overflow-sm",
    title: "258x198 overflowing (72 rows)",
    locale: "en-US",
    expectOverflow: true,
    visual: { width: sm.width, height: sm.height },
    page: page(sm),
    ...overflow
  });
  scenarios.push({
    id: "overflow-rtl-md",
    title: "398x298 overflowing right-to-left",
    locale: "ar-SA",
    expectDirection: "rtl",
    expectOverflow: true,
    visual: { width: md.width, height: md.height },
    page: page(md),
    ...overflow
  });

  return scenarios;
};

const finding = (scenario, rule, detail) => ({
  scenario: typeof scenario === "string" ? scenario : scenario.id,
  rule,
  detail
});

const rootScroller = (report) =>
  (report.scrollContainers ?? []).find((entry) => entry.element.indexOf("atlyn-funnel") >= 0);

const evaluateReport = (scenario, report) => {
  const findings = [];
  if (!report || report.ok !== true) {
    findings.push(finding(scenario, "render", `probe did not complete: ${report?.fatal ?? "no report"}`));
    return findings;
  }
  if (report.renderState !== "ready") {
    findings.push(finding(scenario, "render", `renderingFinished never fired (${report.renderState ?? "none"}) ${report.renderError ?? ""}`));
  }

  (report.escapes ?? []).forEach((escape) => {
    findings.push(finding(
      scenario,
      "escapes-root",
      `${escape.element} escapes the tile by ` +
      `${escape.overflowLeft}/${escape.overflowTop}/${escape.overflowRight}/${escape.overflowBottom}px ` +
      `(l/t/r/b) with no scrollable ancestor`
    ));
  });

  (report.collapsed ?? []).forEach((entry) => {
    findings.push(finding(
      scenario,
      "collapsed",
      `${entry.element} collapsed to ${entry.box.width}x${entry.box.height}px while holding content`
    ));
  });

  (report.clipped ?? []).forEach((entry) => {
    findings.push(finding(
      scenario,
      "clipped-content",
      `${entry.element} hides ${entry.lostY}px vertically and ${entry.lostX}px horizontally behind ` +
      `overflow: hidden (scrollHeight ${entry.scrollHeight} in a ${entry.clientHeight}px box), so it is unreachable`
    ));
  });

  (report.ellipsisWithoutNowrap ?? []).forEach((entry) => {
    findings.push(finding(
      scenario,
      "ellipsis-without-nowrap",
      `${entry.element} sets text-overflow: ellipsis with white-space: ${entry.whiteSpace}, so it never truncates`
    ));
  });

  (report.scrollContainers ?? []).forEach((entry) => {
    if (entry.hiddenX > 1) {
      findings.push(finding(
        scenario,
        "horizontal-scroll",
        `${entry.element} hides ${entry.hiddenX}px horizontally (scrollWidth ${entry.scrollWidth} > clientWidth ${entry.clientWidth})`
      ));
    }
  });

  (report.chartLabelEscapes ?? []).forEach((entry) => {
    findings.push(finding(
      scenario,
      "chart-label-clipped",
      `chart label "${entry.text}" hangs ${entry.lostPx}px outside the canvas and is clipped away`
    ));
  });

  // An absolutely or fixed positioned element whose containing block sits outside the
  // visual root resolves against the initial containing block, so the root's overflow
  // cannot clip it and it only appears contained by luck. Relative and sticky elements
  // stay in flow and are clipped normally, so they are not subject to this.
  (report.positioned ?? []).forEach((entry) => {
    if ((entry.position === "absolute" || entry.position === "fixed") && !entry.containingBlockInsideRoot) {
      findings.push(finding(
        scenario,
        "containing-block-escapes-root",
        `${entry.element} is position: ${entry.position} but resolves against ${entry.containingBlock}, ` +
        `outside the visual root, so the root cannot clip or scroll it`
      ));
    }
  });

  // Content that fits never scrolls, and a region that never scrolls silently passes
  // every scroll assertion. Fail loudly when a fixture built to overflow stops doing so.
  if (scenario.expectOverflow && report.anyScrollable !== true) {
    findings.push(finding(
      scenario,
      "fixture-not-overflowing",
      "no region overflowed, so every scrolled measurement below was vacuous: " +
      (report.scrollProbes ?? [])
        .map((probe) => `${probe.element} scrollHeight ${probe.scrollHeight} vs clientHeight ${probe.clientHeight}`)
        .join("; ")
    ));
  }

  (report.scrollProbes ?? []).forEach((probe) => {
    (probe.offsets ?? []).forEach((offset) => {
      (offset.escapes ?? []).forEach((escape) => {
        findings.push(finding(
          scenario,
          "escapes-root-scrolled",
          `${escape.element} leaves the tile by ${escape.overflowPx}px once ${probe.element} ` +
          `is scrolled to ${offset.scrollTop}px, with no scrollable ancestor`
        ));
      });
      if (offset.stickyTops.length > 1 && (!offset.stickyStrictlyIncreasing || !offset.stickyAllDistinct)) {
        findings.push(finding(
          scenario,
          "sticky-collapse",
          `sticky offsets in ${probe.element} collapse at scrollTop ${offset.scrollTop}: ` +
          `tops ${JSON.stringify(offset.stickyTops.map((entry) => entry.top))}`
        ));
      }
      if (offset.absoluteAnchoredOutside > 0) {
        findings.push(finding(
          scenario,
          "absolute-anchored-outside-scroller",
          `${offset.absoluteAnchoredOutside} absolutely positioned child of ${probe.element} ` +
          `did not move with the scroll (drift ${JSON.stringify(offset.absoluteDrift)} at scrollTop ${offset.scrollTop})`
        ));
      }
    });
  });

  (report.focusedTableEscapes ?? []).forEach((escape) => {
    findings.push(finding(
      scenario,
      "focused-table-escapes",
      `${escape.element} leaves the tile by ${escape.overflowPx}px while the accessible table has focus`
    ));
  });

  // Expanding the accessible table on focus may make the root scroll; that is fine.
  // Being clipped away with no scroll route is not.
  const reachable = report.focusedTableReachable;
  if (reachable && reachable.shellScrollHeight > reachable.shellClientHeight + 1) {
    if (!/(auto|scroll)/.test(reachable.shellOverflowY ?? "")) {
      findings.push(finding(
        scenario,
        "focused-table-unreachable",
        `the focused accessible table overflows its shell by ` +
        `${reachable.shellScrollHeight - reachable.shellClientHeight}px with overflow-y: ${reachable.shellOverflowY}`
      ));
    }
  }
  if (reachable && reachable.rootScrollHeight > reachable.rootClientHeight + 1 &&
    !/(auto|scroll)/.test(reachable.rootOverflowY ?? "")) {
    findings.push(finding(
      scenario,
      "focused-table-unreachable",
      `focusing the accessible table pushes the root ${reachable.rootScrollHeight - reachable.rootClientHeight}px ` +
      `past its tile with overflow-y: ${reachable.rootOverflowY}`
    ));
  }

  const chart = report.regions?.chartScroll;
  if (!chart) {
    findings.push(finding(scenario, "chart-missing", "no .atlyn-chart-scroll was rendered"));
  } else if (chart.visibleFraction < 0.999) {
    findings.push(finding(
      scenario,
      "chart-clipped",
      `the funnel chart is only ${Math.round(chart.visibleFraction * 100)}% inside the tile ` +
      `(${chart.visibleHeight}px of ${chart.box.height}px tall)`
    ));
  }

  const root = rootScroller(report);
  const rootFits = !root || (root.hiddenY <= 1 && root.hiddenX <= 1);
  (report.focusChecks ?? []).forEach((check) => {
    if (!check.focused) {
      findings.push(finding(scenario, "focus-lost", `${check.element} did not accept focus`));
    }
    if (check.ringEscapesRoot) {
      findings.push(finding(scenario, "focus-ring-clipped", `${check.element} focus ring is drawn outside the tile`));
    }
    const gratuitous = rootFits &&
      check.wasFullyVisible &&
      check.resizedOnFocus === false &&
      (Math.abs(check.scrolledRootBy.top) > 1 || Math.abs(check.scrolledRootBy.left) > 1);
    if (gratuitous) {
      findings.push(finding(
        scenario,
        "focus-scrolls-root",
        `focusing ${check.element} scrolled the visual root by ` +
        `${check.scrolledRootBy.top}/${check.scrolledRootBy.left}px even though it was already fully visible`
      ));
    }
  });
  if (!rootFits) {
    findings.push(finding(
      scenario,
      "root-overflows",
      `the visual root hides ${root.hiddenY}px vertically and ${root.hiddenX}px horizontally ` +
      `(scrollHeight ${root.scrollHeight} in a ${root.clientHeight}px tile)`
    ));
  }

  if (report.focusRestore && report.focusRestore.requestedKey) {
    if (report.focusRestore.restoredKey !== report.focusRestore.requestedKey) {
      findings.push(finding(
        scenario,
        "focus-not-restored",
        `after a re-render focus landed on ${report.focusRestore.restoredElement ?? "nothing"} ` +
        `instead of the stage that had it`
      ));
    }
  }

  (report.selection?.shiftedRegions ?? []).forEach((shift) => {
    findings.push(finding(
      scenario,
      "selection-shifts-layout",
      `${shift.region} moved from ${shift.before.top}/${shift.before.height} to ${shift.after.top}/${shift.after.height} when a highlight was applied`
    ));
  });

  if (scenario.forceReducedMotion) {
    if (report.media?.reducedMotion !== true) {
      findings.push(finding(scenario, "reduced-motion", "the browser did not report prefers-reduced-motion: reduce"));
    } else if (report.barStyle && !/^0s(,\s*0s)*$/.test(report.barStyle.transitionDuration)) {
      findings.push(finding(
        scenario,
        "reduced-motion",
        `bars still animate for ${report.barStyle.transitionDuration} under prefers-reduced-motion: reduce`
      ));
    }
  }

  if (scenario.highContrast && report.highContrastAttribute !== "true") {
    findings.push(finding(scenario, "high-contrast", "data-high-contrast was not set on the root"));
  }

  if (scenario.expectDirection === "rtl") {
    if (report.dir !== "rtl") {
      findings.push(finding(scenario, "rtl", `root dir is ${report.dir ?? "unset"} instead of rtl`));
    }
    if (report.funnelStyle && report.funnelStyle.direction !== "rtl") {
      findings.push(finding(scenario, "rtl", `computed direction is ${report.funnelStyle.direction} instead of rtl`));
    }
  }

  return findings;
};

module.exports = {
  PROBE_VIEWPORTS,
  PROBE_DATA,
  DIAGNOSTIC_DATA,
  buildProbeScenarios,
  evaluateReport
};
