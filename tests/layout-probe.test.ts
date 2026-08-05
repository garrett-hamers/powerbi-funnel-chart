/*
 * The layout probe is the gate that catches small-tile clipping, so its rules need
 * their own tests: a probe that silently reports nothing is worse than no probe.
 *
 * Each case feeds evaluateReport a measurement shaped like the ones the headless
 * browser produced against the broken build, and asserts the matching rule fires.
 */
const {
  PROBE_VIEWPORTS,
  buildProbeScenarios,
  evaluateReport
} = require("../scripts/layout-probe-cases.cjs") as {
  PROBE_VIEWPORTS: Array<{ id: string; width: number; height: number }>;
  buildProbeScenarios: () => Array<Record<string, unknown>>;
  evaluateReport: (
    scenario: Record<string, unknown>,
    report: Record<string, unknown>
  ) => Array<{ scenario: string; rule: string; detail: string }>;
};

const scenario = { id: "case", title: "case", visual: { width: 258, height: 198 } };

const cleanReport = (): Record<string, unknown> => ({
  ok: true,
  renderState: "ready",
  viewport: { width: 258, height: 198 },
  escapes: [],
  collapsed: [],
  clipped: [],
  ellipsisWithoutNowrap: [],
  chartLabelEscapes: [],
  scrollContainers: [
    {
      element: "div.atlyn-funnel",
      clientWidth: 258,
      clientHeight: 198,
      scrollWidth: 258,
      scrollHeight: 198,
      hiddenX: 0,
      hiddenY: 0
    }
  ],
  regions: {
    chartScroll: {
      box: { left: 0, top: 0, right: 258, bottom: 160, width: 258, height: 160 },
      visibleFraction: 1,
      visibleHeight: 160
    }
  },
  focusChecks: [
    {
      element: "rect.atlyn-bar",
      focused: true,
      wasFullyVisible: true,
      resizedOnFocus: false,
      scrolledRootBy: { top: 0, left: 0 },
      scrolledChartBy: 0,
      ringEscapesRoot: false,
      insideScroller: "div.atlyn-chart-scroll"
    }
  ],
  focusRestore: { requestedKey: "stage-1", restoredKey: "stage-1", restoredElement: "rect.atlyn-bar" },
  selection: { dimmedBars: 3, dimmedOpacity: "0.35", shiftedRegions: [] },
  media: { reducedMotion: false, forcedColors: false },
  barStyle: { transitionDuration: "0.12s, 0.12s", fill: "rgb(37, 99, 235)", opacity: "0.9" },
  highContrastAttribute: null,
  dir: "ltr",
  funnelStyle: { direction: "ltr", minWidth: "0px", minHeight: "0px" }
});

const rules = (report: Record<string, unknown>, override = scenario): string[] =>
  evaluateReport(override, report).map((finding) => finding.rule);

describe("layout probe cases", () => {
  test("probes the tile sizes the report asks about, down to the declared minimum", () => {
    expect(PROBE_VIEWPORTS.map((viewport) => `${viewport.width}x${viewport.height}`)).toEqual([
      "1280x620",
      "398x298",
      "258x198",
      "178x138",
      "160x80"
    ]);
    const ids = buildProbeScenarios().map((probe) => probe.id);
    expect(ids).toContain("diagnostics-sm");
    expect(ids).toContain("rtl-md");
    expect(ids).toContain("high-contrast-md");
    expect(ids).toContain("reduced-motion-xl");
  });

  test("a clean measurement reports nothing", () => {
    expect(evaluateReport(scenario, cleanReport())).toEqual([]);
  });
});

describe("layout probe assertions", () => {
  test("catches a box that escapes the tile with no scrollable ancestor", () => {
    const report = cleanReport();
    report.escapes = [{
      element: "div.atlyn-funnel",
      box: { left: 0, top: 0, right: 260, bottom: 210, width: 260, height: 210 },
      overflowLeft: 0,
      overflowTop: 0,
      overflowRight: 2,
      overflowBottom: 12
    }];
    expect(rules(report)).toContain("escapes-root");
  });

  test("catches a region collapsed to nothing while it still holds content", () => {
    const report = cleanReport();
    report.collapsed = [{
      element: "div.atlyn-summary",
      box: { left: 0, top: 0, right: 246, bottom: 2, width: 246, height: 2 }
    }];
    expect(rules(report)).toContain("collapsed");
  });

  test("catches content clipped behind overflow: hidden with no route to it", () => {
    const report = cleanReport();
    report.clipped = [{
      element: "div.atlyn-summary",
      box: { left: 0, top: 0, right: 246, bottom: 7, width: 246, height: 7 },
      lostX: 0,
      lostY: 9,
      scrollHeight: 16,
      clientHeight: 7
    }];
    expect(rules(report)).toContain("clipped-content");
  });

  test("catches text-overflow: ellipsis that can never truncate", () => {
    const report = cleanReport();
    report.ellipsisWithoutNowrap = [{ element: "h2", whiteSpace: "normal" }];
    expect(rules(report)).toContain("ellipsis-without-nowrap");
  });

  test("catches the funnel being pushed out of the tile", () => {
    const report = cleanReport();
    (report.regions as Record<string, unknown>).chartScroll = {
      box: { left: 0, top: 226, right: 258, bottom: 376, width: 258, height: 150 },
      visibleFraction: 0,
      visibleHeight: 0
    };
    expect(rules(report)).toContain("chart-clipped");
  });

  test("catches a visual root that overflows its own tile", () => {
    const report = cleanReport();
    report.scrollContainers = [{
      element: "div.atlyn-funnel",
      clientWidth: 258,
      clientHeight: 198,
      scrollWidth: 258,
      scrollHeight: 745,
      hiddenX: 0,
      hiddenY: 547
    }];
    expect(rules(report)).toContain("root-overflows");
  });

  test("catches horizontal scrolling of the whole visual", () => {
    const report = cleanReport();
    report.scrollContainers = [{
      element: "div.atlyn-chart-scroll",
      clientWidth: 246,
      clientHeight: 150,
      scrollWidth: 420,
      scrollHeight: 150,
      hiddenX: 174,
      hiddenY: 0
    }];
    expect(rules(report)).toContain("horizontal-scroll");
  });

  test("catches a chart label anchored off the canvas", () => {
    const report = cleanReport();
    report.chartLabelEscapes = [{ text: "Website visits", box: { left: -40 }, lostPx: 46 }];
    expect(rules(report)).toContain("chart-label-clipped");
  });

  test("catches focus that is lost across a re-render", () => {
    const report = cleanReport();
    report.focusRestore = { requestedKey: "stage-1", restoredKey: null, restoredElement: null };
    expect(rules(report)).toContain("focus-not-restored");
  });

  test("catches a focus ring drawn outside the tile", () => {
    const report = cleanReport();
    (report.focusChecks as Array<Record<string, unknown>>)[0].ringEscapesRoot = true;
    expect(rules(report)).toContain("focus-ring-clipped");
  });

  test("catches a gratuitous scroll when focusing an already visible control", () => {
    const report = cleanReport();
    (report.focusChecks as Array<Record<string, unknown>>)[0].scrolledRootBy = { top: 84, left: 0 };
    expect(rules(report)).toContain("focus-scrolls-root");
  });

  test("allows focus to scroll a control that was off screen or that expands", () => {
    const report = cleanReport();
    Object.assign((report.focusChecks as Array<Record<string, unknown>>)[0], {
      wasFullyVisible: false,
      scrolledRootBy: { top: 84, left: 0 }
    });
    expect(rules(report)).not.toContain("focus-scrolls-root");

    const expanding = cleanReport();
    Object.assign((expanding.focusChecks as Array<Record<string, unknown>>)[0], {
      resizedOnFocus: true,
      scrolledRootBy: { top: 84, left: 0 }
    });
    expect(rules(expanding)).not.toContain("focus-scrolls-root");
  });

  test("catches a selection highlight that moves the layout", () => {
    const report = cleanReport();
    report.selection = {
      dimmedBars: 3,
      dimmedOpacity: "0.35",
      shiftedRegions: [{
        region: "chartScroll",
        before: { top: 52, height: 268 },
        after: { top: 60, height: 268 }
      }]
    };
    expect(rules(report)).toContain("selection-shifts-layout");
  });

  test("catches animation that survives prefers-reduced-motion", () => {
    const report = cleanReport();
    report.media = { reducedMotion: true, forcedColors: false };
    expect(rules(report, { ...scenario, forceReducedMotion: true } as never)).toContain("reduced-motion");
    (report.barStyle as Record<string, unknown>).transitionDuration = "0s, 0s";
    expect(rules(report, { ...scenario, forceReducedMotion: true } as never)).not.toContain("reduced-motion");
  });

  test("catches a missing high-contrast state and a missing RTL direction", () => {
    const report = cleanReport();
    expect(rules(report, { ...scenario, highContrast: true } as never)).toContain("high-contrast");
    expect(rules(report, { ...scenario, expectDirection: "rtl" } as never)).toContain("rtl");
  });

  test("catches a render that never completed", () => {
    expect(rules({ ok: false, fatal: "harness did not mount" })).toEqual(["render"]);
    const unfinished = cleanReport();
    unfinished.renderState = "failed";
    expect(rules(unfinished)).toContain("render");
  });
});
