/*
 * The screenshot content expectations are the only thing standing between a broken
 * render and a committed submission asset, so they need their own tests: an assertion
 * that silently never fires is worse than no assertion, because it reports success.
 *
 * Each case feeds evaluateScene a measurement shaped like the ones the headless
 * browser really produces, breaks one property of it, and asserts the matching rule
 * fires. The fixtures mirror the measured geometry of the committed screenshots.
 */
import * as fs from "node:fs";

const {
  SCENE_EXPECTATIONS,
  expectationFor,
  evaluateScene
} = require("../scripts/screenshot-scene-expectations.cjs") as {
  SCENE_EXPECTATIONS: Record<string, Record<string, unknown>>;
  expectationFor: (sceneId: string) => Record<string, unknown>;
  evaluateScene: (
    expectation: Record<string, unknown>,
    report: Record<string, unknown>
  ) => Array<{ scene: string; rule: string; detail: string }>;
};

type Box = { left: number; top: number; right: number; bottom: number; width: number; height: number };
type Report = Record<string, unknown>;

const scenarios = JSON.parse(
  fs.readFileSync("assets/sample-data/screenshot-scenarios.json", "utf8")
) as { scenarios: Array<{ id: string }> };

const boxOf = (left: number, top: number, width: number, height: number): Box => ({
  left,
  top,
  right: left + width,
  bottom: top + height,
  width,
  height
});

const inside = (box: Box) => ({
  visibleWidth: box.width,
  visibleHeight: box.height,
  lostLeft: 0,
  lostTop: 0,
  lostRight: 0,
  lostBottom: 0
});

const region = (selector: string, box: Box) => ({
  selector,
  box,
  display: "block",
  visibility: "visible",
  opacity: "1",
  inMount: inside(box),
  inPage: inside(box)
});

const textEntry = (text: string, width = 120, height = 14) => ({
  text,
  box: boxOf(100, 100, width, height)
});

const bar = (state: string, drawnWidth: number, index: number) => {
  const box = boxOf(500, 160 + index * 42, drawnWidth, 34);
  return {
    state,
    stageKey: `stage-${index}`,
    drawnWidth,
    box,
    inChart: inside(box),
    inPage: inside(box)
  };
};

const stageButton = (text: string, index: number) => {
  const box = boxOf(42, 420 + index * 40, 1282, 36);
  return { text, box, inStageList: inside(box), inPage: inside(box) };
};

const BASE = {
  "01-conversion-funnel": {
    barWidths: [420, 245, 102.22, 42.13, 20.41, 9.36],
    barStates: ["value", "value", "value", "value", "value", "value"],
    markers: [] as Array<{ state: string; box: Box }>,
    labels: [
      "Website visits · 128,400",
      "Product tour · 74,900",
      "Free trial started · 31,250",
      "Qualified demo · 12,880",
      "Proposal sent · 6,240",
      "Closed won · 2,860"
    ],
    metrics: ["Overall conversion: 2.2%"],
    buttons: [
      "Stage: Website visits; Value: 128,400; Target: 120,000",
      "Stage: Product tour; Value: 74,900; Target: 78,000",
      "Stage: Free trial started; Value: 31,250; Target: 34,000",
      "Stage: Qualified demo; Value: 12,880; Target: 12,000",
      "Stage: Proposal sent; Value: 6,240; Target: 6,500",
      "Stage: Closed won; Value: 2,860; Target: 3,000"
    ],
    warnings: [] as string[],
    hasWarningPanel: false
  },
  "02-segment-comparison": {
    barWidths: [420, 104.08, 44.33, 10.38, 368.42, 87.81, 34.75, 7.18],
    barStates: ["value", "value", "value", "value", "value", "value", "value", "value"],
    markers: [] as Array<{ state: string; box: Box }>,
    labels: [
      "North America · Website visits · 68,…",
      "North America · Free trial started ·…",
      "North America · Qualified demo · 7,2…",
      "North America · Closed won · 1,690",
      "EMEA · Website visits · 60,000",
      "EMEA · Free trial started · 14,300",
      "EMEA · Qualified demo · 5,660",
      "EMEA · Closed won · 1,170"
    ],
    metrics: [
      "Overall conversion (Group North America): 2.5%",
      "Overall conversion (Group EMEA): 2%"
    ],
    buttons: [
      "Stage: North America · Website visits; Value: 68,400; Target: 64,000",
      "Stage: North America · Free trial started; Value: 16,950; Target: 18,000",
      "Stage: North America · Qualified demo; Value: 7,220; Target: 7,000",
      "Stage: North America · Closed won; Value: 1,690; Target: 1,800",
      "Stage: EMEA · Website visits; Value: 60,000; Target: 56,000",
      "Stage: EMEA · Free trial started; Value: 14,300; Target: 16,000",
      "Stage: EMEA · Qualified demo; Value: 5,660; Target: 5,000",
      "Stage: EMEA · Closed won; Value: 1,170; Target: 1,200"
    ],
    warnings: [] as string[],
    hasWarningPanel: false
  },
  "03-diagnostics": {
    barWidths: [420, 205.52, 135.27, 0, 48.43, 55.05],
    barStates: ["value", "value", "value", "blank", "value", "value"],
    markers: [{ state: "blank", box: boxOf(683, 314, 8, 2) }],
    labels: [
      "Site sessions · 84,300",
      "Product viewed · 41,250",
      "Added to cart · 27,150",
      "Checkout started · Not available",
      "Payment attempted · 9,720",
      "Order completed · 11,050"
    ],
    metrics: ["Overall conversion: 13.1%"],
    buttons: [
      "Stage: Site sessions; Value: 84,300",
      "Stage: Product viewed; Value: 41,250",
      "Stage: Added to cart; Value: 27,150",
      "Stage: Checkout started; Value: Not available",
      "Stage: Payment attempted; Value: 9,720",
      "Stage: Order completed; Value: 11,050"
    ],
    warnings: [
      "Inferred order: model order is preserved.",
      "Blank value",
      "Nonmonotonic values: a later stage increases."
    ],
    hasWarningPanel: true
  }
};

const cleanReport = (sceneId: keyof typeof BASE): Report => {
  const base = BASE[sceneId];
  const regions: Record<string, unknown> = {
    root: region(".atlyn-funnel", boxOf(32, 113, 1302, 542)),
    summary: region(".atlyn-summary", boxOf(42, 123, 1282, 21)),
    warnings: base.hasWarningPanel ? region(".atlyn-warnings", boxOf(42, 104, 1282, 72)) : null,
    chartScroll: region(".atlyn-chart-scroll", boxOf(42, 150, 1282, 258)),
    chart: region("svg.atlyn-chart", boxOf(42, 150, 1282, 264)),
    stageList: region(".atlyn-stage-list", boxOf(42, 414, 1282, 230)),
    empty: null,
    accessibleTable: region(".atlyn-accessible-table", boxOf(0, 0, 1, 1))
  };

  return {
    id: sceneId,
    ok: true,
    renderState: "ready",
    renderError: null,
    page: { width: 1366, height: 768 },
    scroll: { x: 0, y: 0 },
    mountBox: boxOf(32, 113, 1302, 542),
    regions,
    chartClientBox: { left: 42, top: 150, right: 1324, bottom: 700, width: 1282, height: 550 },
    stageListClientBox: { left: 42, top: 414, right: 1324, bottom: 644, width: 1282, height: 230 },
    bars: base.barWidths.map((width, index) => bar(base.barStates[index], width, index)),
    markers: base.markers,
    stageButtons: base.buttons.map(stageButton),
    chartLabels: base.labels.map((text) => textEntry(text)),
    summaryMetrics: base.metrics.map((text) => textEntry(text)),
    summaryIntake: [textEntry("Website visits: 128,400")],
    warnings: base.warnings.map((text) => textEntry(text, 400, 18)),
    warningPanels: base.hasWarningPanel ? 1 : 0,
    tableRows: base.barWidths.length
  };
};

const rulesFor = (sceneId: keyof typeof BASE, mutate: (report: Report) => void): string[] => {
  const report = cleanReport(sceneId);
  mutate(report);
  return evaluateScene(expectationFor(sceneId), report).map((finding) => finding.rule);
};

const bars = (report: Report) => report.bars as Array<Record<string, unknown>>;

describe("screenshot scene expectations", () => {
  test("every declared scene has an expectation, and an undeclared one is refused", () => {
    scenarios.scenarios.forEach((scenario) => {
      expect(expectationFor(scenario.id)).toBeTruthy();
    });
    expect(Object.keys(SCENE_EXPECTATIONS).sort()).toEqual(
      scenarios.scenarios.map((scenario) => scenario.id).sort()
    );
    // A new scene must stop the capture rather than be waved through unverified.
    expect(() => expectationFor("04-unspecified")).toThrow(/no content expectation is declared/);
  });

  test("the expectations are per-scene rather than one generic check", () => {
    const one = SCENE_EXPECTATIONS["01-conversion-funnel"];
    const two = SCENE_EXPECTATIONS["02-segment-comparison"];
    const three = SCENE_EXPECTATIONS["03-diagnostics"];

    // The comparison scene is the only one that demands two segments.
    expect(two.labelGroupCounts).toEqual({ "North America": 4, EMEA: 4 });
    expect(two.summaryMetrics).toBe(2);
    expect(one.summaryMetrics).toBe(1);
    expect(three.summaryMetrics).toBe(1);

    // The diagnostics scene requires the warning panel the other two forbid.
    expect(three.requiredRegions).toContain("warnings");
    expect(one.forbiddenRegions).toContain("warnings");
    expect(two.forbiddenRegions).toContain("warnings");

    // Only the diagnostics scene expects a blank stage and an increase.
    expect(three.barStates).toEqual({ value: 5, blank: 1 });
    expect(three.increasingBarPairs).toEqual([[4, 5]]);
    expect(one.increasingBarPairs).toEqual([]);

    // Targets are bound in the first two scenes and absent from the third.
    expect(one.stageButtonsMustContain).toContain("Target");
    expect(two.stageButtonsMustContain).toContain("Target");
    expect(three.stageButtonsMustNotContain).toContain("Target");
  });

  test.each(Object.keys(BASE))("a faithful render of %s reports nothing", (sceneId) => {
    expect(evaluateScene(expectationFor(sceneId), cleanReport(sceneId as keyof typeof BASE))).toEqual([]);
  });
});

describe("screenshot content assertions", () => {
  test("catches a region that is in the DOM but rendered at zero height", () => {
    // The sibling failure this exists for: querySelector found the element the whole
    // time it was broken, and it rendered 0px tall in every committed screenshot.
    const found = rulesFor("01-conversion-funnel", (report) => {
      const regions = report.regions as Record<string, Record<string, unknown>>;
      regions.stageList = region(".atlyn-stage-list", boxOf(42, 414, 1282, 0));
    });
    expect(found).toContain("region-not-drawn");
  });

  test("catches a region that never rendered at all", () => {
    expect(rulesFor("03-diagnostics", (report) => {
      (report.regions as Record<string, unknown>).warnings = null;
    })).toContain("region-missing");
  });

  test("catches a region hidden by computed style", () => {
    expect(rulesFor("01-conversion-funnel", (report) => {
      const regions = report.regions as Record<string, Record<string, unknown>>;
      regions.chartScroll = { ...regions.chartScroll, display: "none" };
    })).toContain("region-invisible");
  });

  test("catches content that rendered outside the captured frame", () => {
    expect(rulesFor("01-conversion-funnel", (report) => {
      const regions = report.regions as Record<string, Record<string, unknown>>;
      regions.stageList = {
        ...regions.stageList,
        inPage: { visibleWidth: 1282, visibleHeight: 100, lostLeft: 0, lostTop: 0, lostRight: 0, lostBottom: 130 }
      };
    })).toContain("region-outside-frame");
  });

  test("catches content that spills outside the tile the host gave the visual", () => {
    expect(rulesFor("01-conversion-funnel", (report) => {
      const regions = report.regions as Record<string, Record<string, unknown>>;
      regions.summary = {
        ...regions.summary,
        inMount: { visibleWidth: 1200, visibleHeight: 21, lostLeft: 0, lostTop: 0, lostRight: 82, lostBottom: 0 }
      };
    })).toContain("region-outside-tile");
  });

  test("catches a warning panel on a scene that claims to be clean", () => {
    expect(rulesFor("01-conversion-funnel", (report) => {
      (report.regions as Record<string, unknown>).warnings =
        region(".atlyn-warnings", boxOf(42, 104, 1282, 72));
    })).toContain("region-unexpected");
  });

  test("catches the empty state being screenshotted as if it were a chart", () => {
    expect(rulesFor("02-segment-comparison", (report) => {
      (report.regions as Record<string, unknown>).empty =
        region(".atlyn-empty", boxOf(42, 150, 1282, 40));
    })).toContain("region-unexpected");
  });

  test("catches the second segment going missing while the first funnel is fine", () => {
    // The whole point of per-scene expectations: four healthy bars, one healthy
    // funnel, and a screenshot that no longer shows the comparison it advertises.
    const found = rulesFor("02-segment-comparison", (report) => {
      report.bars = bars(report).slice(0, 4);
      report.chartLabels = (report.chartLabels as unknown[]).slice(0, 4);
      report.stageButtons = (report.stageButtons as unknown[]).slice(0, 4);
      report.summaryMetrics = (report.summaryMetrics as unknown[]).slice(0, 1);
      report.tableRows = 4;
    });
    expect(found).toContain("segment-missing");
    expect(found).toContain("bar-count");
    expect(found).toContain("summary-metric-count");
    expect(found).toContain("summary-missing");
    expect(found).toContain("table-row-count");
  });

  test("catches the diagnostics content being absent from the diagnostics scene", () => {
    const found = rulesFor("03-diagnostics", (report) => {
      report.warnings = [];
      report.warningPanels = 0;
      (report.regions as Record<string, unknown>).warnings = null;
    });
    expect(found).toContain("diagnostics-missing");
    expect(found).toContain("region-missing");
  });

  test("catches a diagnostics scene that lost one specific finding", () => {
    expect(rulesFor("03-diagnostics", (report) => {
      report.warnings = (report.warnings as Array<{ text: string }>).filter(
        (item) => !/nonmonotonic/i.test(item.text)
      );
    })).toContain("diagnostics-missing");
  });

  test("catches a diagnostic list that rendered at zero height", () => {
    expect(rulesFor("03-diagnostics", (report) => {
      report.warnings = (report.warnings as Array<{ text: string }>).map((item) => ({
        ...item,
        box: boxOf(42, 104, 400, 0)
      }));
    })).toContain("diagnostics-collapsed");
  });

  test("catches a funnel that stopped narrowing", () => {
    expect(rulesFor("01-conversion-funnel", (report) => {
      bars(report)[3].drawnWidth = 900;
    })).toContain("funnel-does-not-narrow");
  });

  test("catches each segment failing to narrow on its own", () => {
    expect(rulesFor("02-segment-comparison", (report) => {
      bars(report)[6].drawnWidth = 500;
    })).toContain("funnel-does-not-narrow");
  });

  test("catches the increase the diagnostics scene exists to show going flat", () => {
    expect(rulesFor("03-diagnostics", (report) => {
      bars(report)[5].drawnWidth = 10;
    })).toContain("increase-not-shown");
  });

  test("catches a bar drawn where the scene expects a blank stage", () => {
    const found = rulesFor("03-diagnostics", (report) => {
      bars(report)[3].drawnWidth = 90;
      bars(report)[3].state = "value";
    });
    expect(found).toContain("bar-should-be-blank");
    expect(found).toContain("bar-state");
    expect(found).toContain("bars-not-drawn");
  });

  test("catches bars collapsed to no height and bars scrolled out of the chart", () => {
    expect(rulesFor("01-conversion-funnel", (report) => {
      bars(report)[2].box = boxOf(500, 240, 102, 0);
    })).toContain("bar-collapsed");

    expect(rulesFor("01-conversion-funnel", (report) => {
      bars(report)[5].inChart = {
        visibleWidth: 9,
        visibleHeight: 0,
        lostLeft: 0,
        lostTop: 0,
        lostRight: 0,
        lostBottom: 34
      };
    })).toContain("bar-outside-chart");
  });

  test("reports rather than throws when the chart frame itself never rendered", () => {
    // The agent cannot measure containment when .atlyn-chart-scroll is absent, so it
    // reports null. That is the case the rule exists for, and it must survive it.
    const found = rulesFor("01-conversion-funnel", (report) => {
      (report.regions as Record<string, unknown>).chartScroll = null;
      report.chartClientBox = null;
      report.bars = bars(report).map((entry) => ({ ...entry, inChart: null }));
    });
    expect(found).toContain("region-missing");
    expect(found).toContain("bar-outside-chart");
  });

  test("catches a missing data-state marker", () => {
    expect(rulesFor("03-diagnostics", (report) => {
      report.markers = [];
    })).toContain("state-marker-count");
    expect(rulesFor("03-diagnostics", (report) => {
      report.markers = [{ state: "zero", box: boxOf(683, 314, 8, 2) }];
    })).toContain("state-marker-state");
  });

  test("catches missing and collapsed chart labels", () => {
    expect(rulesFor("01-conversion-funnel", (report) => {
      report.chartLabels = (report.chartLabels as Array<{ text: string }>).map((label, index) =>
        index === 4 ? { ...label, text: "" } : label
      );
    })).toContain("chart-label-missing");

    expect(rulesFor("01-conversion-funnel", (report) => {
      report.chartLabels = (report.chartLabels as Array<{ text: string }>).map((label) => ({
        ...label,
        box: boxOf(100, 100, 0, 0)
      }));
    })).toContain("chart-label-collapsed");
  });

  test("catches a group caption on a scene that has no Group field bound", () => {
    expect(rulesFor("01-conversion-funnel", (report) => {
      report.summaryMetrics = [textEntry("Overall conversion (Group EMEA): 2%")];
    })).toContain("summary-unexpected");
  });

  test("catches a missing intake figure", () => {
    expect(rulesFor("01-conversion-funnel", (report) => {
      report.summaryIntake = [];
    })).toContain("summary-intake-count");
  });

  test("catches stage rows collapsed to nothing and a stage list scrolled out of frame", () => {
    expect(rulesFor("01-conversion-funnel", (report) => {
      report.stageButtons = (report.stageButtons as Array<Record<string, unknown>>).map((button) => ({
        ...button,
        box: boxOf(42, 414, 1282, 0)
      }));
    })).toContain("stage-button-collapsed");

    expect(rulesFor("01-conversion-funnel", (report) => {
      report.stageButtons = (report.stageButtons as Array<Record<string, unknown>>).map((button) => ({
        ...button,
        inStageList: { visibleWidth: 1282, visibleHeight: 0, lostLeft: 0, lostTop: 0, lostRight: 0, lostBottom: 36 }
      }));
    })).toContain("stage-list-out-of-frame");
  });

  test("catches the Target field silently failing to bind", () => {
    expect(rulesFor("01-conversion-funnel", (report) => {
      report.stageButtons = (report.stageButtons as Array<{ text: string }>).map((button) => ({
        ...button,
        text: button.text.replace(/; Target: [\d,]+/, "")
      }));
    })).toContain("stage-text-missing");
  });

  test("catches a target appearing in the scene that binds no target", () => {
    expect(rulesFor("03-diagnostics", (report) => {
      report.stageButtons = (report.stageButtons as Array<{ text: string }>).map((button) => ({
        ...button,
        text: `${button.text}; Target: 100`
      }));
    })).toContain("stage-text-unexpected");
  });

  test("catches a render that never finished and a probe that never ran", () => {
    expect(rulesFor("01-conversion-funnel", (report) => {
      report.renderState = "failed";
      report.renderError = "ATLYN_RENDER_FAILED";
    })).toContain("render");

    expect(
      evaluateScene(expectationFor("01-conversion-funnel"), { ok: false, fatal: "the harness never mounted the visual" })
        .map((finding) => finding.rule)
    ).toEqual(["probe"]);

    expect(rulesFor("01-conversion-funnel", (report) => {
      report.id = "03-diagnostics";
    })).toEqual(["probe"]);
  });
});
