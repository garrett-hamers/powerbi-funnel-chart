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
  evaluateReport,
  collectSuppressions,
  exemptingAncestor
} = require("../scripts/layout-probe-cases.cjs") as {
  PROBE_VIEWPORTS: Array<{ id: string; width: number; height: number }>;
  buildProbeScenarios: () => Array<Record<string, unknown>>;
  evaluateReport: (
    scenario: Record<string, unknown>,
    report: Record<string, unknown>
  ) => Array<{ scenario: string; rule: string; detail: string }>;
  collectSuppressions: (
    scenario: Record<string, unknown>,
    report: Record<string, unknown>
  ) => Array<{ scenario: string; rule: string; reason: string; detail: string }>;
  exemptingAncestor: (
    chain: Array<Record<string, unknown>> | undefined,
    outOfFlow?: boolean
  ) => Record<string, unknown> | null;
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
  funnelStyle: { direction: "ltr", minWidth: "0px", minHeight: "0px" },
  positioning: {
    rootPosition: "static",
    funnelPosition: "static",
    counts: { sticky: 0, fixed: 0, absolute: 0 },
    elements: []
  },
  scrollSweep: [
    {
      element: "div.atlyn-chart-scroll",
      overflows: true,
      maxScrollTop: 84,
      clientHeight: 48,
      scrollHeight: 132,
      offsets: [
        { requested: 0, applied: 0, escapes: [], stickyOffsets: [] },
        { requested: 42, applied: 42, escapes: [], stickyOffsets: [] },
        { requested: 84, applied: 84, escapes: [], stickyOffsets: [] }
      ]
    }
  ],
  focusState: {
    focusable: true,
    focused: true,
    expandsAttribute: "true",
    tableBox: { width: 246, height: 84, left: 0, top: 0, right: 246, bottom: 84 },
    tableRows: 6,
    scroller: {
      element: "div.atlyn-accessible-table-scroll",
      display: "block",
      overflowY: "auto",
      clientHeight: 84,
      scrollHeight: 288,
      isRealScrollContainer: true,
      scrollProof: { requested: 9999, reached: 204, moved: true },
      box: { width: 246, height: 84, left: 0, top: 0, right: 246, bottom: 84 }
    },
    chartHeightBefore: 160,
    chartHeightAfter: 77,
    chartWidthBefore: 246,
    chartWidthAfter: 246,
    stageListHeightBefore: null,
    stageListHeightAfter: null,
    rootScrolledBy: 0,
    rootHiddenY: 0,
    collapsed: [],
    positioned: [],
    escapes: []
  }
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

/*
 * The probe used to measure one state: at rest, nothing scrolled, nothing focused.
 * These rules exist for the states it now enters deliberately, and each is driven here
 * with a deliberately bad measurement — a rule that has never been seen to fire is
 * indistinguishable from one that cannot.
 */
describe("scroll-time and focus-time assertions", () => {
  const focusState = (report: Record<string, unknown>) =>
    report.focusState as Record<string, unknown>;
  const sweep = (report: Record<string, unknown>) =>
    report.scrollSweep as Array<Record<string, unknown>>;

  test("catches a box that only escapes the tile once a region is scrolled", () => {
    // Invisible at rest: the offending box is below the fold until something scrolls.
    const report = cleanReport();
    (sweep(report)[0].offsets as Array<Record<string, unknown>>)[2].escapes = [{
      element: "text.atlyn-chart-label",
      box: { left: 0, top: 300, right: 258, bottom: 340, width: 258, height: 40 },
      overflowLeft: 0,
      overflowTop: 0,
      overflowRight: 0,
      overflowBottom: 142
    }];
    expect(rules(report)).toContain("escapes-root-when-scrolled");
  });

  test("reports rather than skips a region that has stopped overflowing", () => {
    // A fixture that quietly stops overflowing makes every scroll-time assertion below
    // it pass vacuously, which reads as green.
    const report = cleanReport();
    sweep(report)[0].overflows = false;
    sweep(report)[0].scrollHeight = 48;
    expect(rules(report, { ...scenario, expectOverflow: ["atlyn-chart-scroll"] } as never))
      .toContain("scroll-region-no-longer-overflows");
  });

  test("reports a region that was expected to scroll but was never measured", () => {
    const report = cleanReport();
    report.scrollSweep = [];
    expect(rules(report, { ...scenario, expectOverflow: ["atlyn-stage-list"] } as never))
      .toContain("scroll-region-missing");
  });

  test("catches a probe that never scrolled anything, and a region that refused to", () => {
    const missing = cleanReport();
    delete missing.scrollSweep;
    expect(rules(missing)).toContain("scroll-sweep");

    const refused = cleanReport();
    (sweep(refused)[0].offsets as Array<Record<string, unknown>>)[2].applied = 0;
    expect(rules(refused)).toContain("scroll-refused");
  });

  test("catches an absolutely positioned box that resolves outside the visual", () => {
    // It escapes the root's overflow entirely, so the at-rest escape walk — which
    // treats a scrolling ancestor as containment — never sees it.
    const report = cleanReport();
    (report.positioning as Record<string, unknown>).elements = [{
      element: "table.atlyn-accessible-table",
      position: "absolute",
      zIndexSpecified: "auto",
      participatesInStacking: true,
      containingBlock: null,
      containingBlockInsideRoot: false,
      box: { width: 428, height: 288, left: 0, top: 0, right: 428, bottom: 288 }
    }];
    expect(rules(report)).toContain("positioned-outside-root");
  });

  test("checks containing blocks in the focused state as well as at rest", () => {
    // Opening the table moves it between in-flow and out-of-flow, so the two states
    // resolve against different containing blocks. Correcting only one is half a fix.
    const report = cleanReport();
    focusState(report).positioned = [{
      element: "div.atlyn-accessible-table-scroll",
      position: "absolute",
      zIndexSpecified: "auto",
      participatesInStacking: true,
      containingBlock: null,
      containingBlockInsideRoot: false,
      box: { width: 428, height: 288, left: 0, top: 0, right: 428, bottom: 288 }
    }];
    const found = evaluateReport(scenario, report);
    expect(found.map((entry) => entry.rule)).toContain("positioned-outside-root");
    expect(found.find((entry) => entry.rule === "positioned-outside-root")?.detail)
      .toContain("with the accessible table open");
  });

  test("accepts a positioned box that resolves inside the visual", () => {
    const report = cleanReport();
    (report.positioning as Record<string, unknown>).elements = [{
      element: "div.atlyn-badge",
      position: "absolute",
      zIndexSpecified: "1",
      participatesInStacking: true,
      containingBlock: "div.atlyn-funnel",
      containingBlockInsideRoot: true,
      box: { width: 20, height: 20, left: 0, top: 0, right: 20, bottom: 20 }
    }];
    expect(rules(report)).not.toContain("positioned-outside-root");
  });

  test("catches a stacking order read out of a context that does not exist", () => {
    // getComputedStyle().zIndex returns the specified value even when the element is
    // not positioned, so an order can look correct while nothing is stacking.
    const report = cleanReport();
    (sweep(report)[0].offsets as Array<Record<string, unknown>>)[1].stickyOffsets = [
      { element: "th.atlyn-row-header", computedPosition: "static", zIndexSpecified: "2", top: 10, height: 20 }
    ];
    expect(rules(report)).toContain("sticky-not-positioned");
  });

  test("catches sticky headers pinning onto one another under scroll", () => {
    const collapsed = cleanReport();
    (sweep(collapsed)[0].offsets as Array<Record<string, unknown>>)[2].stickyOffsets = [
      { element: "th.a", computedPosition: "sticky", zIndexSpecified: "2", top: 40, height: 20 },
      { element: "th.b", computedPosition: "sticky", zIndexSpecified: "1", top: 40, height: 20 }
    ];
    expect(rules(collapsed)).toContain("sticky-offsets-collapsed");

    const unordered = cleanReport();
    (sweep(unordered)[0].offsets as Array<Record<string, unknown>>)[2].stickyOffsets = [
      { element: "th.a", computedPosition: "sticky", zIndexSpecified: "2", top: 80, height: 20 },
      { element: "th.b", computedPosition: "sticky", zIndexSpecified: "1", top: 40, height: 20 }
    ];
    expect(rules(unordered)).toContain("sticky-offsets-not-increasing");
  });

  test("catches the funnel being destroyed when the accessible table is focused", () => {
    // Degrade chrome, never data. This is the defect that shipped here: the table
    // cannot shrink, so every pixel of shrinkage lands on the chart.
    const destroyed = cleanReport();
    focusState(destroyed).chartHeightAfter = 0;
    expect(rules(destroyed)).toContain("focus-destroys-chart");

    const shrunk = cleanReport();
    focusState(shrunk).chartHeightAfter = 12;
    expect(rules(shrunk)).toContain("focus-shrinks-chart");
  });

  test("catches the funnel being destroyed horizontally, which the height rule cannot see", () => {
    /*
     * The same defect on the axis the rule never measured. A column flex cannot squeeze a
     * sibling horizontally, so this is not reachable in the current stylesheet - but the
     * height-only version could not have reported that it had not looked, and the width
     * was already being measured on both sides and discarded.
     *
     * A chart at full height and zero width is exactly as gone as one at zero height. The
     * rule's own message says "the data is gone while the chrome remains", which is true
     * of both.
     */
    const flattened = cleanReport();
    focusState(flattened).chartWidthAfter = 0;
    expect(focusState(flattened).chartHeightAfter).toBeGreaterThan(4);
    expect(rules(flattened)).toContain("focus-destroys-chart");
  });

  test("catches an accessible table that nothing bounds", () => {
    const unbounded = cleanReport();
    focusState(unbounded).scroller = null;
    expect(rules(unbounded)).toContain("focus-no-scroll-container");
  });

  test("catches overflow declared on a display: table box, where it is ignored", () => {
    const asTable = cleanReport();
    (focusState(asTable).scroller as Record<string, unknown>).display = "table";
    expect(rules(asTable)).toContain("focus-scroll-container-is-a-table");

    const notScrollable = cleanReport();
    (focusState(notScrollable).scroller as Record<string, unknown>).overflowY = "visible";
    expect(rules(notScrollable)).toContain("focus-scroll-container-not-scrollable");
  });

  test("catches an opened table that renders at no height at all", () => {
    const report = cleanReport();
    (focusState(report).scroller as Record<string, unknown>).box =
      { width: 246, height: 0, left: 0, top: 0, right: 246, bottom: 0 };
    expect(rules(report)).toContain("focus-region-collapsed");
  });

  test("catches an opened table that renders at no width, which makes it taller", () => {
    /*
     * The same rule, in the other axis. Measured in headless Chrome, a scroll wrapper
     * holding the accessible table:
     *
     *   healthy wrapper       420x64
     *   width: 0 wrapper        0x96   <- TALLER than healthy, and unreadable
     *   max-height: 0 wrapper 420x0    <- the shape the rule was written for
     *
     * The table wraps when the wrapper collapses horizontally, so a height floor is not
     * just incomplete here: the measured height moves *away* from the threshold as the
     * failure worsens. This rule guards the defect the probe was built for - the table
     * opening to `.atlyn-chart-scroll` at exactly 0px - and its own message is "present,
     * focused and unreadable", which describes 0x96 precisely.
     */
    const report = cleanReport();
    (focusState(report).scroller as Record<string, unknown>).box =
      { width: 0, height: 96, left: 0, top: 0, right: 0, bottom: 96 };
    expect(rules(report)).toContain("focus-region-collapsed");
  });

  test("catches a container that overflows but will not actually scroll", () => {
    // Proven by writing an offset and reading it back. Deriving this from scrollHeight
    // and clientHeight would only restate the definition of overflow.
    const report = cleanReport();
    (focusState(report).scroller as Record<string, unknown>).scrollProof =
      { requested: 9999, reached: 0, moved: false };
    expect(rules(report)).toContain("focus-scroll-container-vacuous");

    const healthy = cleanReport();
    expect(rules(healthy)).not.toContain("focus-scroll-container-vacuous");
  });

  test("allows a table left out of the tab order on a tile that cannot open it", () => {
    // A tab stop whose focus ring is clipped away is one a sighted keyboard user cannot
    // see, so not being a tab stop there is the accessible choice, not a defect.
    const report = cleanReport();
    focusState(report).focusable = false;
    focusState(report).focused = false;
    focusState(report).expandsAttribute = null;
    expect(rules(report)).toEqual([]);
  });

  test("catches a table dropped from the tab order on a tile that does open it", () => {
    const report = cleanReport();
    focusState(report).focusable = false;
    focusState(report).focused = false;
    expect(rules(report)).toContain("focus-region-lost");
  });

  test("still requires the rows when the table is out of the tab order", () => {
    // Leaving the tab order is not permission to leave the accessibility tree.
    const report = cleanReport();
    focusState(report).focusable = false;
    focusState(report).focused = false;
    focusState(report).expandsAttribute = null;
    focusState(report).tableRows = 0;
    expect(rules(report)).toContain("focus-region-empty");
  });

  test("allows a table that is deliberately left screen-reader-only on a tiny tile", () => {
    // Honestly hidden beats visible-but-empty, so a 1px wrapper is not a defect when
    // this tile never opens the table.
    const report = cleanReport();
    focusState(report).expandsAttribute = null;
    focusState(report).tableBox = { width: 1, height: 1, left: 0, top: 0, right: 1, bottom: 1 };
    (focusState(report).scroller as Record<string, unknown>).box =
      { width: 1, height: 1, left: 0, top: 0, right: 1, bottom: 1 };
    (focusState(report).scroller as Record<string, unknown>).overflowY = "hidden";
    expect(rules(report)).toEqual([]);
  });

  test("catches focus scrolling or overflowing the embedded tile", () => {
    const scrolled = cleanReport();
    focusState(scrolled).rootScrolledBy = 31;
    expect(rules(scrolled)).toContain("focus-scrolls-root");

    const overflowing = cleanReport();
    focusState(overflowing).rootHiddenY = 127;
    expect(rules(overflowing)).toContain("focus-overflows-root");
  });

  test("catches a box escaping the tile only while the table is open", () => {
    const report = cleanReport();
    focusState(report).escapes = [{
      element: "table.atlyn-accessible-table",
      box: { left: 0, top: 0, right: 428, bottom: 288, width: 428, height: 288 },
      overflowLeft: 0,
      overflowTop: 0,
      overflowRight: 170,
      overflowBottom: 90
    }];
    expect(rules(report)).toContain("escapes-root-when-focused");
  });

  test("catches a region that collapses only once the table is open", () => {
    // The collapse walk only ever ran at rest, so a chart that dies on focus was
    // structurally invisible to it: `collapsed` came back empty while the funnel was
    // being crushed to nothing.
    const report = cleanReport();
    focusState(report).collapsed = [{
      element: "div.atlyn-chart-scroll",
      box: { left: 0, top: 0, right: 246, bottom: 0, width: 246, height: 0 }
    }];
    expect(rules(report)).toContain("collapsed-when-focused");
  });

  test("catches an accessible table that lost its rows or its focus", () => {
    const empty = cleanReport();
    focusState(empty).tableRows = 0;
    expect(rules(empty)).toContain("focus-region-empty");

    const unfocusable = cleanReport();
    focusState(unfocusable).focused = false;
    expect(rules(unfocusable)).toContain("focus-region-lost");
  });
});

/*
 * A gate that quietly drops a measurement makes the probe grow *quieter* as the visual
 * grows worse. That is what happened here: the root-scroll rule measured the scroll and
 * discarded it, because its precondition was invalidated by a different, co-present
 * defect. Silence and cleanliness must not look the same.
 */
describe("suppressed findings", () => {
  const suppressions = (report: Record<string, unknown>) =>
    collectSuppressions(scenario, report);

  test("a clean measurement suppresses nothing", () => {
    expect(suppressions(cleanReport())).toEqual([]);
  });

  test("reports a root scroll that a precondition stopped it reporting", () => {
    // The exact shape measured on the broken build: the scroll was recorded, then
    // dropped because the element had not been fully visible beforehand — which was
    // true only because a second defect had it hanging outside the tile.
    const report = cleanReport();
    Object.assign((report.focusChecks as Array<Record<string, unknown>>)[0], {
      wasFullyVisible: false,
      scrolledRootBy: { top: 31, left: 0 }
    });

    // It is still not reported as a defect: the precondition is legitimate.
    expect(rules(report)).not.toContain("focus-scrolls-root");
    // But it is no longer invisible.
    const found = suppressions(report);
    expect(found.map((entry) => entry.rule)).toContain("focus-scrolls-root");
    expect(found[0].detail).toContain("31");
    expect(found[0].reason).toContain("not fully visible");
  });

  test("names every precondition that blocked the report", () => {
    const report = cleanReport();
    Object.assign((report.focusChecks as Array<Record<string, unknown>>)[0], {
      wasFullyVisible: false,
      resizedOnFocus: true,
      scrolledRootBy: { top: 31, left: 0 }
    });
    report.scrollContainers = [{
      element: "div.atlyn-funnel",
      clientWidth: 258,
      clientHeight: 198,
      scrollWidth: 258,
      scrollHeight: 325,
      hiddenX: 0,
      hiddenY: 127
    }];
    const reason = suppressions(report)[0].reason;
    expect(reason).toContain("already overflows");
    expect(reason).toContain("not fully visible");
    expect(reason).toContain("changes size when focused");
  });

  test("says nothing about a focus that did not scroll the root", () => {
    const report = cleanReport();
    Object.assign((report.focusChecks as Array<Record<string, unknown>>)[0], {
      wasFullyVisible: false,
      scrolledRootBy: { top: 0, left: 0 }
    });
    expect(suppressions(report)).toEqual([]);
  });
});

/*
 * Which ancestor legitimately excuses a box from leaving the tile.
 *
 * This decision used to live in-page, where it could not be driven by a test. The
 * measurements below are the real ones from headless Chrome, so the rule is exercised
 * against what browsers actually report rather than against what the CSS says.
 */
describe("containment is decided by effect, not by declaration", () => {
  const ancestor = (overrides: Record<string, unknown> = {}) => ({
    element: "div.atlyn-funnel",
    overflowX: "auto",
    overflowY: "auto",
    display: "block",
    clientWidth: 258,
    clientHeight: 198,
    scrollWidth: 258,
    scrollHeight: 420,
    isContainingBlock: false,
    containsContainingBlock: false,
    ...overrides
  });

  test("a real scroll container excuses an in-flow box", () => {
    expect(exemptingAncestor([ancestor()], false)).not.toBeNull();
  });

  test("a scroll container with nothing currently to scroll still excuses it", () => {
    /*
     * The case that disproves the tempting predicate. Measured in Chrome: a block with
     * `overflow: auto` holding 5px of content in a 50px box reports
     * clientHeight === scrollHeight and genuinely clips. Requiring
     * `scrollHeight > clientHeight` would reject it and the probe would start reporting
     * escapes for content it actually contains — wrong in the direction that generates
     * noise, which is how a probe gets distrusted and then ignored.
     *
     * This test fails if anyone reintroduces that predicate, which is the point of
     * recording scroll geometry on the chain at all.
     */
    const noScrollGeometry = ancestor({ clientHeight: 50, scrollHeight: 50, clientWidth: 258, scrollWidth: 258 });
    expect(noScrollGeometry.scrollHeight).toBe(noScrollGeometry.clientHeight);
    expect(exemptingAncestor([noScrollGeometry], false)).not.toBeNull();
  });

  test("a display: table ancestor excuses nothing, because its overflow computes away", () => {
    // Measured: `display: table` + `overflow: auto` computes to overflow-y: visible in
    // Chrome, for both a styled div and a real <table>. Reading the computed value is
    // what makes this safe; a probe reading the declaration would be fooled.
    expect(exemptingAncestor([
      ancestor({ element: "table.atlyn-accessible-table", display: "table", overflowX: "visible", overflowY: "visible", clientHeight: 288, clientWidth: 428, scrollHeight: 288, scrollWidth: 428 })
    ], false)).toBeNull();
  });

  test("an inline ancestor excuses nothing, though its overflow computes to auto", () => {
    // Measured: `display: inline` + `overflow: auto` computes to overflow-y: auto with a
    // 0x0 client box. It reads as a scroller and clips nothing, so it must not exempt
    // the boxes beneath it. Chrome normalises the table case and does not normalise
    // this one, which is why the computed value alone is not sufficient.
    expect(exemptingAncestor([
      ancestor({ element: "span.badge", display: "inline", clientWidth: 0, clientHeight: 0, scrollWidth: 0, scrollHeight: 0 })
    ], false)).toBeNull();
  });

  test("an ancestor that paints nothing excuses nothing, however well it scrolls", () => {
    /*
     * The gap the 0x0 case above does not close. Measured in headless Chrome, a block
     * with `overflow: auto` and one zero extent:
     *
     *   400x0 box, 900x500 content   scrollTop reaches 500   painted area 400x0
     *   0x60 box,  900x500 content   scrollTop reaches 440   painted area   0x60
     *
     * Both report a computed scrolling overflow *and* a real, non-degenerate scroll
     * range, so neither the declaration nor scroll geometry distinguishes them from a
     * working scroller. They paint zero pixels, so no amount of scrolling reveals their
     * content and they cannot excuse a box for leaving the tile.
     *
     * This is the failure mode that motivated the probe: `.atlyn-chart-scroll` collapsed
     * to exactly 0px on focus. Had it recurred beneath the escape walk, an area-blind
     * rule would have excused everything under it and reported the tile as clean.
     */
    const zeroHeight = ancestor({ clientWidth: 400, clientHeight: 0, scrollWidth: 900, scrollHeight: 500 });
    expect(zeroHeight.scrollHeight).toBeGreaterThan(zeroHeight.clientHeight);
    expect(exemptingAncestor([zeroHeight], false)).toBeNull();

    const zeroWidth = ancestor({ clientWidth: 0, clientHeight: 60, scrollWidth: 900, scrollHeight: 500 });
    expect(exemptingAncestor([zeroWidth], false)).toBeNull();

    // Control, measured alongside them: the same box with both extents non-zero does
    // contain, and must keep exempting. The rule has to reject zero area without
    // rejecting small area.
    expect(exemptingAncestor([
      ancestor({ clientWidth: 400, clientHeight: 60, scrollWidth: 900, scrollHeight: 500 })
    ], false)).not.toBeNull();
  });

  test("an out-of-flow box is only excused by a scroller that holds its containing block", () => {
    const unrelated = [ancestor()];
    expect(exemptingAncestor(unrelated, true)).toBeNull();

    expect(exemptingAncestor([ancestor({ isContainingBlock: true })], true)).not.toBeNull();
    expect(exemptingAncestor([ancestor({ containsContainingBlock: true })], true)).not.toBeNull();
  });

  test("no chain excuses nothing", () => {
    expect(exemptingAncestor(undefined, false)).toBeNull();
    expect(exemptingAncestor([], false)).toBeNull();
  });

  test("an escape with an excusing chain is not reported as a defect", () => {
    const report = cleanReport();
    report.escapes = [{
      element: "svg.atlyn-chart",
      box: { left: 0, top: 0, right: 258, bottom: 400, width: 258, height: 400 },
      overflowLeft: 0,
      overflowTop: 0,
      overflowRight: 0,
      overflowBottom: 202,
      outOfFlow: false,
      chain: [ancestor({ element: "div.atlyn-chart-scroll" })]
    }];
    expect(rules(report)).not.toContain("escapes-root");

    // The same escape behind an inline ancestor is a defect, because nothing clips it.
    const inline = cleanReport();
    inline.escapes = [{
      ...(report.escapes as Array<Record<string, unknown>>)[0],
      chain: [ancestor({ element: "span.badge", display: "inline", clientWidth: 0, clientHeight: 0 })]
    }];
    expect(rules(inline)).toContain("escapes-root");
  });
});
