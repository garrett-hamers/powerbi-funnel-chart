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
  positioned: [
    {
      element: "div.atlyn-accessible-shell",
      position: "absolute",
      box: { width: 1, height: 1 },
      containingBlock: "div.atlyn-funnel",
      containingBlockInsideRoot: true
    },
    {
      element: "div.atlyn-funnel",
      position: "relative",
      box: { width: 258, height: 198 },
      containingBlock: "initial containing block",
      containingBlockInsideRoot: false
    }
  ],
  anyScrollable: true,
  stickyCount: 0,
  scrollProbes: [
    {
      element: "div.atlyn-chart-scroll",
      scrollHeight: 1452,
      clientHeight: 117,
      scrollWidth: 246,
      clientWidth: 246,
      verticallyScrollable: true,
      horizontallyScrollable: false,
      offsets: [
        {
          scrollTop: 0,
          scrollLeft: 0,
          escapes: [],
          stickyTops: [],
          stickyStrictlyIncreasing: true,
          stickyAllDistinct: true,
          absoluteDrift: [],
          absoluteAnchoredOutside: 0
        },
        {
          scrollTop: 1335,
          scrollLeft: 0,
          escapes: [],
          stickyTops: [],
          stickyStrictlyIncreasing: true,
          stickyAllDistinct: true,
          absoluteDrift: [],
          absoluteAnchoredOutside: 0
        }
      ]
    }
  ],
  focusedTableEscapes: [],
  focusedTableReachable: {
    shellOverflowY: "auto",
    shellScrollHeight: 4082,
    shellClientHeight: 73,
    rootScrollHeight: 198,
    rootClientHeight: 198,
    rootOverflowY: "auto"
  },
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

describe("layout probe assertions that only exist once content overflows", () => {
  test("probes overflowing fixtures, not only small tiles", () => {
    const overflowing = buildProbeScenarios().filter((probe) => probe.expectOverflow === true);
    expect(overflowing.length).toBeGreaterThanOrEqual(3);
    // Enough stages and segments that a scrollable region cannot possibly fit.
    overflowing.forEach((probe) => {
      expect((probe.stage as string[]).length).toBeGreaterThanOrEqual(60);
      expect(new Set(probe.group as string[]).size).toBeGreaterThanOrEqual(4);
    });
  });

  test("fails loudly when a fixture built to overflow stops overflowing", () => {
    // Content that fits never scrolls, and a region that never scrolls passes every
    // scroll assertion vacuously. That silence is the failure mode being guarded here.
    const report = cleanReport();
    report.anyScrollable = false;
    (report.scrollProbes as Array<Record<string, unknown>>)[0].verticallyScrollable = false;
    expect(rules(report, { ...scenario, expectOverflow: true } as never)).toContain("fixture-not-overflowing");
    expect(rules(cleanReport(), { ...scenario, expectOverflow: true } as never))
      .not.toContain("fixture-not-overflowing");
  });

  test("catches a box that only leaves the tile once a region is scrolled", () => {
    const report = cleanReport();
    const probe = (report.scrollProbes as Array<Record<string, unknown>>)[0];
    (probe.offsets as Array<Record<string, unknown>>)[1].escapes = [
      { element: "div.atlyn-warnings", box: { top: -40 }, overflowPx: 40 }
    ];
    expect(rules(report)).toContain("escapes-root-scrolled");
  });

  test("catches sticky offsets collapsing onto each other after a scroll", () => {
    const report = cleanReport();
    const probe = (report.scrollProbes as Array<Record<string, unknown>>)[0];
    const offset = (probe.offsets as Array<Record<string, unknown>>)[1];
    offset.stickyTops = [
      { element: "th", top: 67 },
      { element: "th", top: 67 },
      { element: "th", top: 67 },
      { element: "th", top: 110 }
    ];
    offset.stickyStrictlyIncreasing = false;
    offset.stickyAllDistinct = false;
    expect(rules(report)).toContain("sticky-collapse");
  });

  test("catches an absolutely positioned child anchored outside its scroller", () => {
    const report = cleanReport();
    const probe = (report.scrollProbes as Array<Record<string, unknown>>)[0];
    const offset = (probe.offsets as Array<Record<string, unknown>>)[1];
    offset.absoluteDrift = [0];
    offset.absoluteAnchoredOutside = 1;
    expect(rules(report)).toContain("absolute-anchored-outside-scroller");
  });

  test("catches a positioned element resolving against the initial containing block", () => {
    const report = cleanReport();
    (report.positioned as Array<Record<string, unknown>>)[0].containingBlockInsideRoot = false;
    (report.positioned as Array<Record<string, unknown>>)[0].containingBlock = "initial containing block";
    expect(rules(report)).toContain("containing-block-escapes-root");
  });

  test("does not flag relative or sticky elements, which stay in flow and are clipped normally", () => {
    // Only absolute and fixed resolve against a containing block; the root itself is
    // relative and its containing block is legitimately outside the root.
    expect(rules(cleanReport())).not.toContain("containing-block-escapes-root");
    const sticky = cleanReport();
    (sticky.positioned as Array<Record<string, unknown>>).push({
      element: "th.header",
      position: "sticky",
      containingBlock: "initial containing block",
      containingBlockInsideRoot: false
    });
    expect(rules(sticky)).not.toContain("containing-block-escapes-root");
  });

  test("catches the expanded accessible table being clipped with no scroll route", () => {
    const report = cleanReport();
    (report.focusedTableReachable as Record<string, unknown>).shellOverflowY = "hidden";
    expect(rules(report)).toContain("focused-table-unreachable");

    const rootClipped = cleanReport();
    Object.assign(rootClipped.focusedTableReachable as Record<string, unknown>, {
      rootScrollHeight: 900,
      rootClientHeight: 198,
      rootOverflowY: "hidden"
    });
    expect(rules(rootClipped)).toContain("focused-table-unreachable");
  });

  test("catches a box leaving the tile while the accessible table has focus", () => {
    const report = cleanReport();
    report.focusedTableEscapes = [{ element: "div.atlyn-funnel", box: { top: 0 }, overflowPx: 65 }];
    expect(rules(report)).toContain("focused-table-escapes");
  });
});
