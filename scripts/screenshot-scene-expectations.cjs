/*
 * Per-scene content expectations for the AppSource submission screenshots.
 *
 * A screenshot pipeline that only checks pixel dimensions and byte size will happily
 * ship an empty chart, a chart that failed to bind its data, or a chart whose content
 * rendered outside the captured frame. No static property of the resulting PNG tells
 * those apart from a correct render: this repository's funnels are a flat design and
 * legitimately carry only a few hundred distinct colours, so any blankness or colour
 * threshold loose enough to pass them would also pass a nearly-blank wrong render.
 * Only an assertion made at capture time can tell, because only then is it known what
 * was supposed to be drawn.
 *
 * So every scene declares what it must contain, and the declarations are deliberately
 * different from one another. `02-segment-comparison` has to fail when the second
 * segment is missing even though the first funnel rendered perfectly, and
 * `03-diagnostics` has to fail when the diagnostics are absent even though the funnel
 * itself is fine. One generic check shared by all three would catch neither.
 *
 * Kept free of Node I/O and browser APIs so the same rules that gate the capture can
 * be unit-tested against recorded measurements.
 */

// Chrome reports fractional pixels, and text metrics differ between the font stack on
// a developer machine and the one on a Linux CI runner. Every threshold below is a
// floor on visible geometry rather than an exact size, so it survives that drift while
// still failing on a region that collapsed or slid out of frame.
const EPSILON = 0.5;

const STAGE_LABELS = [
  "Website visits",
  "Product tour",
  "Free trial started",
  "Qualified demo",
  "Proposal sent",
  "Closed won"
];

const DIAGNOSTIC_LABELS = [
  "Site sessions",
  "Product viewed",
  "Added to cart",
  "Checkout started",
  "Payment attempted",
  "Order completed"
];

// Regions that have to be present, measurably drawn, and inside the captured frame.
// `withinMount` is the tile Power BI hands the visual; the chart canvas is exempt
// because it legitimately scrolls inside .atlyn-chart-scroll.
const REGION_RULES = {
  summary: { selectorHint: ".atlyn-summary", minWidth: 120, minHeight: 12, withinMount: true },
  warnings: { selectorHint: ".atlyn-warnings", minWidth: 120, minHeight: 16, withinMount: true },
  chartScroll: { selectorHint: ".atlyn-chart-scroll", minWidth: 240, minHeight: 80, withinMount: true },
  chart: { selectorHint: "svg.atlyn-chart", minWidth: 240, minHeight: 80, withinMount: false },
  stageList: { selectorHint: ".atlyn-stage-list", minWidth: 240, minHeight: 24, withinMount: true }
};

const SCENE_EXPECTATIONS = {
  "01-conversion-funnel": {
    id: "01-conversion-funnel",
    demonstrates:
      "a single ungrouped six-stage funnel where every stage carries a real value, " +
      "targets are bound, and no data-quality diagnostics fire",
    requiredRegions: ["summary", "chartScroll", "chart", "stageList"],
    // The clean scene claiming a warning-free funnel while a warning panel is on
    // screen would be a misleading listing asset, so its absence is asserted.
    forbiddenRegions: ["warnings", "empty"],
    bars: 6,
    barStates: { value: 6 },
    barsWithWidth: 6,
    zeroWidthBarIndexes: [],
    // A funnel that does not narrow is not a funnel. This is the geometry of the
    // scene's own claim, and it fails on data that bound in the wrong order.
    monotonicRuns: [[0, 1, 2, 3, 4, 5]],
    increasingBarPairs: [],
    stateMarkers: 0,
    markerStates: {},
    chartLabels: 6,
    labelsMustContain: STAGE_LABELS,
    summaryMetrics: 1,
    summaryMustContain: ["Overall conversion"],
    // One ungrouped funnel: a group caption here means the wrong scene rendered.
    summaryMustNotContain: ["Group"],
    summaryIntake: 1,
    stageButtons: 6,
    minVisibleStageButtons: 3,
    stageButtonsMustContain: ["Target"],
    stageButtonsMustNotContain: ["North America", "EMEA"],
    warningItems: 0,
    warningsMustContain: [],
    tableRows: 6
  },

  "02-segment-comparison": {
    id: "02-segment-comparison",
    demonstrates:
      "two segments compared side by side through the Group field, each with its own " +
      "four-stage funnel and its own overall conversion",
    requiredRegions: ["summary", "chartScroll", "chart", "stageList"],
    forbiddenRegions: ["warnings", "empty"],
    bars: 8,
    barStates: { value: 8 },
    barsWithWidth: 8,
    zeroWidthBarIndexes: [],
    // Each segment narrows on its own; the series restarts at the boundary, so a
    // single run across all eight bars would be the wrong assertion here.
    monotonicRuns: [[0, 1, 2, 3], [4, 5, 6, 7]],
    increasingBarPairs: [],
    stateMarkers: 0,
    markerStates: {},
    chartLabels: 8,
    labelsMustContain: ["Website visits", "Free trial started", "Qualified demo", "Closed won"],
    // The load-bearing assertion for this scene. Losing the second segment leaves a
    // perfectly healthy four-bar funnel behind, which every generic check passes.
    labelGroupCounts: { "North America": 4, EMEA: 4 },
    summaryMetrics: 2,
    summaryMustContain: ["North America", "EMEA"],
    summaryMustNotContain: [],
    summaryIntake: 1,
    stageButtons: 8,
    minVisibleStageButtons: 3,
    stageButtonsMustContain: ["Target"],
    stageButtonsMustNotContain: [],
    stageButtonGroupCounts: { "North America": 4, EMEA: 4 },
    warningItems: 0,
    warningsMustContain: [],
    tableRows: 8
  },

  "03-diagnostics": {
    id: "03-diagnostics",
    demonstrates:
      "the data-quality diagnostics for an unordered, incomplete funnel: the warning " +
      "panel, the dashed marker on the blank stage, and the stage that increases",
    // The warning panel is the subject of this scene, so it is required rather than
    // forbidden. That inversion is the whole point of per-scene expectations.
    requiredRegions: ["summary", "warnings", "chartScroll", "chart", "stageList"],
    forbiddenRegions: ["empty"],
    bars: 6,
    barStates: { value: 5, blank: 1 },
    barsWithWidth: 5,
    // The blank stage draws no bar. Asserting the index pins the diagnostic to the
    // stage that is actually missing data.
    zeroWidthBarIndexes: [3],
    monotonicRuns: [[0, 1, 2]],
    // The nonmonotonic warning has to be visible in the drawing, not just in prose.
    increasingBarPairs: [[4, 5]],
    stateMarkers: 1,
    markerStates: { blank: 1 },
    chartLabels: 6,
    labelsMustContain: DIAGNOSTIC_LABELS,
    summaryMetrics: 1,
    summaryMustContain: ["Overall conversion"],
    summaryMustNotContain: ["Group"],
    summaryIntake: 1,
    stageButtons: 6,
    minVisibleStageButtons: 3,
    stageButtonsMustContain: [],
    // No Target role is bound in this scene, so a target caption would mean the
    // diagnostics scenario is not the one that rendered.
    stageButtonsMustNotContain: ["Target"],
    minWarningItems: 3,
    warningsMustContain: ["inferred order", "blank", "nonmonotonic"],
    tableRows: 6
  }
};

const finding = (scene, rule, detail) => ({ scene, rule, detail });

const countStates = (entries) =>
  entries.reduce((totals, entry) => {
    const key = entry.state ?? "unknown";
    totals[key] = (totals[key] ?? 0) + 1;
    return totals;
  }, {});

const describeStates = (totals) => {
  const keys = Object.keys(totals).sort();
  return keys.length === 0 ? "none" : keys.map((key) => `${key}x${totals[key]}`).join(", ");
};

const fullyInside = (containment) =>
  Boolean(containment) &&
  containment.lostLeft <= EPSILON &&
  containment.lostTop <= EPSILON &&
  containment.lostRight <= EPSILON &&
  containment.lostBottom <= EPSILON;

const lostDescription = (containment) =>
  containment
    ? `${containment.lostLeft}/${containment.lostTop}/${containment.lostRight}/${containment.lostBottom}px (l/t/r/b)`
    // fullyInside() treats an unmeasurable containment as a failure, so this has to
    // describe one rather than throw and lose every finding collected so far.
    : "an unmeasurable amount (the reference box never rendered)";

const checkRegions = (expectation, report, findings) => {
  const scene = expectation.id;
  expectation.requiredRegions.forEach((name) => {
    const rule = REGION_RULES[name];
    const region = report.regions?.[name] ?? null;
    if (!region) {
      findings.push(finding(
        scene,
        "region-missing",
        `${name} (${rule.selectorHint}) never rendered, so the scene cannot show what it claims`
      ));
      return;
    }
    if (region.display === "none" || region.visibility === "hidden" || Number(region.opacity) === 0) {
      findings.push(finding(
        scene,
        "region-invisible",
        `${region.selector} is in the DOM but computed ` +
        `display: ${region.display}, visibility: ${region.visibility}, opacity: ${region.opacity}`
      ));
      return;
    }
    // Presence is not enough: the failure this exists to catch was an element that
    // sat in the DOM the entire time it was broken while rendering at zero height.
    if (region.box.width < rule.minWidth || region.box.height < rule.minHeight) {
      findings.push(finding(
        scene,
        "region-not-drawn",
        `${region.selector} rendered at ${region.box.width}x${region.box.height}px, ` +
        `below the ${rule.minWidth}x${rule.minHeight}px floor for a region that has to be visible`
      ));
      return;
    }
    if (!fullyInside(region.inPage)) {
      findings.push(finding(
        scene,
        "region-outside-frame",
        `${region.selector} falls ${lostDescription(region.inPage)} outside the ` +
        `${report.page?.width}x${report.page?.height} captured frame, so it is not in the screenshot`
      ));
    }
    if (rule.withinMount && !fullyInside(region.inMount)) {
      findings.push(finding(
        scene,
        "region-outside-tile",
        `${region.selector} spills ${lostDescription(region.inMount)} outside the tile the host gave the visual`
      ));
    }
  });

  (expectation.forbiddenRegions ?? []).forEach((name) => {
    const region = report.regions?.[name] ?? null;
    if (region) {
      findings.push(finding(
        scene,
        "region-unexpected",
        `${region.selector} rendered at ${region.box.width}x${region.box.height}px, but this ` +
        `scene is supposed to show no ${name}`
      ));
    }
  });
};

const checkBars = (expectation, report, findings) => {
  const scene = expectation.id;
  const bars = report.bars ?? [];
  if (bars.length !== expectation.bars) {
    findings.push(finding(
      scene,
      "bar-count",
      `${bars.length} funnel bar(s) rendered but the scene depicts ${expectation.bars}`
    ));
  }

  const states = countStates(bars);
  Object.keys(expectation.barStates).forEach((state) => {
    const actual = states[state] ?? 0;
    if (actual !== expectation.barStates[state]) {
      findings.push(finding(
        scene,
        "bar-state",
        `${actual} bar(s) in the "${state}" state but the scene depicts ` +
        `${expectation.barStates[state]} (measured ${describeStates(states)})`
      ));
    }
  });

  const drawn = bars.filter((bar) => bar.drawnWidth > 0);
  if (drawn.length !== expectation.barsWithWidth) {
    findings.push(finding(
      scene,
      "bars-not-drawn",
      `${drawn.length} bar(s) have a drawn width but the scene depicts ${expectation.barsWithWidth}`
    ));
  }

  (expectation.zeroWidthBarIndexes ?? []).forEach((index) => {
    const bar = bars[index];
    if (bar && bar.drawnWidth > 0) {
      findings.push(finding(
        scene,
        "bar-should-be-blank",
        `stage ${index + 1} drew a ${bar.drawnWidth}px bar but its value is blank in this scene`
      ));
    }
  });

  bars.forEach((bar, index) => {
    // Zero-width blank bars are deliberate; zero *height* never is.
    if (bar.box.height < 4) {
      findings.push(finding(
        scene,
        "bar-collapsed",
        `stage ${index + 1} bar rendered ${bar.box.width}x${bar.box.height}px, so nothing is visible`
      ));
    }
    if (!fullyInside(bar.inChart)) {
      findings.push(finding(
        scene,
        "bar-outside-chart",
        `stage ${index + 1} bar sits ${lostDescription(bar.inChart)} outside the visible chart area, ` +
        `so it is scrolled or clipped out of the screenshot`
      ));
    }
  });

  (expectation.monotonicRuns ?? []).forEach((run) => {
    for (let position = 1; position < run.length; position += 1) {
      const previous = bars[run[position - 1]];
      const current = bars[run[position]];
      if (!previous || !current) {
        return;
      }
      if (current.drawnWidth > previous.drawnWidth - EPSILON) {
        findings.push(finding(
          scene,
          "funnel-does-not-narrow",
          `stage ${run[position] + 1} draws ${current.drawnWidth}px against stage ` +
          `${run[position - 1] + 1}'s ${previous.drawnWidth}px, so the funnel does not narrow`
        ));
      }
    }
  });

  (expectation.increasingBarPairs ?? []).forEach(([lower, higher]) => {
    const first = bars[lower];
    const second = bars[higher];
    if (!first || !second) {
      return;
    }
    if (second.drawnWidth <= first.drawnWidth + EPSILON) {
      findings.push(finding(
        scene,
        "increase-not-shown",
        `stage ${higher + 1} draws ${second.drawnWidth}px against stage ${lower + 1}'s ` +
        `${first.drawnWidth}px, so the increase this scene is meant to diagnose is not visible`
      ));
    }
  });

  const markers = report.markers ?? [];
  if (markers.length !== expectation.stateMarkers) {
    findings.push(finding(
      scene,
      "state-marker-count",
      `${markers.length} data-state marker(s) rendered but the scene depicts ${expectation.stateMarkers}`
    ));
  }
  const markerStates = countStates(markers);
  Object.keys(expectation.markerStates ?? {}).forEach((state) => {
    const actual = markerStates[state] ?? 0;
    if (actual !== expectation.markerStates[state]) {
      findings.push(finding(
        scene,
        "state-marker-state",
        `${actual} "${state}" marker(s) but the scene depicts ${expectation.markerStates[state]} ` +
        `(measured ${describeStates(markerStates)})`
      ));
    }
  });
};

const countContaining = (entries, needle) =>
  entries.filter((entry) => entry.text.toLowerCase().indexOf(needle.toLowerCase()) >= 0).length;

const checkLabels = (expectation, report, findings) => {
  const scene = expectation.id;
  const labels = report.chartLabels ?? [];
  if (labels.length !== expectation.chartLabels) {
    findings.push(finding(
      scene,
      "chart-label-count",
      `${labels.length} chart label(s) rendered but the scene depicts ${expectation.chartLabels}`
    ));
  }
  (expectation.labelsMustContain ?? []).forEach((needle) => {
    if (countContaining(labels, needle) === 0) {
      findings.push(finding(
        scene,
        "chart-label-missing",
        `no chart label mentions "${needle}", so that stage is not on screen`
      ));
    }
  });
  Object.keys(expectation.labelGroupCounts ?? {}).forEach((group) => {
    const actual = countContaining(labels, group);
    if (actual !== expectation.labelGroupCounts[group]) {
      findings.push(finding(
        scene,
        "segment-missing",
        `${actual} chart label(s) belong to the "${group}" segment but the scene compares ` +
        `${expectation.labelGroupCounts[group]} stages per segment`
      ));
    }
  });
  labels.forEach((label) => {
    if (label.box.width < 1 || label.box.height < 1) {
      findings.push(finding(
        scene,
        "chart-label-collapsed",
        `chart label "${label.text}" rendered ${label.box.width}x${label.box.height}px, so it is invisible`
      ));
    }
  });
};

const checkSummary = (expectation, report, findings) => {
  const scene = expectation.id;
  const metrics = report.summaryMetrics ?? [];
  if (metrics.length !== expectation.summaryMetrics) {
    findings.push(finding(
      scene,
      "summary-metric-count",
      `${metrics.length} overall-conversion metric(s) rendered but the scene depicts ` +
      `${expectation.summaryMetrics} (measured: ${metrics.map((metric) => metric.text).join(" | ") || "none"})`
    ));
  }
  (expectation.summaryMustContain ?? []).forEach((needle) => {
    if (countContaining(metrics, needle) === 0) {
      findings.push(finding(
        scene,
        "summary-missing",
        `no summary metric mentions "${needle}"`
      ));
    }
  });
  (expectation.summaryMustNotContain ?? []).forEach((needle) => {
    if (countContaining(metrics, needle) > 0) {
      findings.push(finding(
        scene,
        "summary-unexpected",
        `a summary metric mentions "${needle}", which this scene is not supposed to show`
      ));
    }
  });
  const intake = report.summaryIntake ?? [];
  if (intake.length !== expectation.summaryIntake) {
    findings.push(finding(
      scene,
      "summary-intake-count",
      `${intake.length} intake figure(s) rendered but the scene depicts ${expectation.summaryIntake}`
    ));
  }
};

const checkStageList = (expectation, report, findings) => {
  const scene = expectation.id;
  const buttons = report.stageButtons ?? [];
  if (buttons.length !== expectation.stageButtons) {
    findings.push(finding(
      scene,
      "stage-button-count",
      `${buttons.length} stage row(s) rendered but the scene depicts ${expectation.stageButtons}`
    ));
  }
  buttons.forEach((button, index) => {
    if (button.box.width < 40 || button.box.height < 16) {
      findings.push(finding(
        scene,
        "stage-button-collapsed",
        `stage row ${index + 1} rendered ${button.box.width}x${button.box.height}px, so its text is not visible`
      ));
    }
  });
  // The list scrolls, so trailing rows may legitimately sit below the fold. What may
  // never happen is every row being out of frame while the list looks healthy.
  const visible = buttons.filter((button) => fullyInside(button.inStageList) && fullyInside(button.inPage));
  if (visible.length < expectation.minVisibleStageButtons) {
    findings.push(finding(
      scene,
      "stage-list-out-of-frame",
      `only ${visible.length} of ${buttons.length} stage row(s) are fully inside the visible ` +
      `stage list; the scene needs at least ${expectation.minVisibleStageButtons}`
    ));
  }
  (expectation.stageButtonsMustContain ?? []).forEach((needle) => {
    if (countContaining(buttons, needle) === 0) {
      findings.push(finding(
        scene,
        "stage-text-missing",
        `no stage row mentions "${needle}", so that field is not bound in the captured render`
      ));
    }
  });
  (expectation.stageButtonsMustNotContain ?? []).forEach((needle) => {
    if (countContaining(buttons, needle) > 0) {
      findings.push(finding(
        scene,
        "stage-text-unexpected",
        `a stage row mentions "${needle}", which this scene is not supposed to show`
      ));
    }
  });
  Object.keys(expectation.stageButtonGroupCounts ?? {}).forEach((group) => {
    const actual = countContaining(buttons, group);
    if (actual !== expectation.stageButtonGroupCounts[group]) {
      findings.push(finding(
        scene,
        "segment-missing",
        `${actual} stage row(s) belong to the "${group}" segment but the scene compares ` +
        `${expectation.stageButtonGroupCounts[group]} stages per segment`
      ));
    }
  });
};

const checkWarnings = (expectation, report, findings) => {
  const scene = expectation.id;
  const items = report.warnings ?? [];
  if (typeof expectation.warningItems === "number" && items.length !== expectation.warningItems) {
    findings.push(finding(
      scene,
      "warning-count",
      `${items.length} diagnostic(s) rendered but the scene depicts ${expectation.warningItems}`
    ));
  }
  if (typeof expectation.minWarningItems === "number" && items.length < expectation.minWarningItems) {
    findings.push(finding(
      scene,
      "diagnostics-missing",
      `${items.length} diagnostic(s) rendered but this scene exists to show at least ` +
      `${expectation.minWarningItems}`
    ));
  }
  (expectation.warningsMustContain ?? []).forEach((needle) => {
    if (countContaining(items, needle) === 0) {
      findings.push(finding(
        scene,
        "diagnostics-missing",
        `no diagnostic mentions "${needle}", so the finding this scene demonstrates is not on screen ` +
        `(measured: ${items.map((item) => item.text).join(" | ") || "none"})`
      ));
    }
  });
  items.forEach((item) => {
    if (item.box.height < 4) {
      findings.push(finding(
        scene,
        "diagnostics-collapsed",
        `diagnostic "${item.text}" rendered ${item.box.width}x${item.box.height}px, so it is invisible`
      ));
    }
  });
};

const evaluateScene = (expectation, report) => {
  const scene = expectation.id;
  const findings = [];
  if (!report || report.ok !== true) {
    findings.push(finding(scene, "probe", `the content probe did not complete: ${report?.fatal ?? "no report"}`));
    return findings;
  }
  if (report.id !== scene) {
    findings.push(finding(scene, "probe", `the report describes "${report.id}" instead of "${scene}"`));
    return findings;
  }
  if (report.renderState !== "ready") {
    findings.push(finding(
      scene,
      "render",
      `renderingFinished never fired (state: ${report.renderState ?? "none"}) ${report.renderError ?? ""}`.trim()
    ));
  }

  checkRegions(expectation, report, findings);
  checkBars(expectation, report, findings);
  checkLabels(expectation, report, findings);
  checkSummary(expectation, report, findings);
  checkStageList(expectation, report, findings);
  checkWarnings(expectation, report, findings);

  if (report.tableRows !== expectation.tableRows) {
    findings.push(finding(
      scene,
      "table-row-count",
      `the accessible table has ${report.tableRows} row(s) but the scene depicts ${expectation.tableRows} stages`
    ));
  }

  return findings;
};

const expectationFor = (sceneId) => {
  const expectation = SCENE_EXPECTATIONS[sceneId];
  if (!expectation) {
    throw new Error(
      `no content expectation is declared for screenshot scene "${sceneId}". ` +
      "Every scene must say what it depicts before it can be captured; add it to " +
      "scripts/screenshot-scene-expectations.cjs."
    );
  }
  return expectation;
};

/*
 * Turns a scene's measurements into the values that get committed alongside the
 * screenshot.
 *
 * evaluateScene answers "did this pass", which is worth nothing once the run ends: a
 * screenshot that is hand-edited, reverted, or swapped afterwards still satisfies every
 * remaining gate. What survives has to be the measured values themselves, because "the
 * funnel drew six stages narrowing from 420px to 9px with an overall conversion of
 * 2.2%" can be reviewed months later and "assertions passed" cannot.
 *
 * Every entry in `assertions` corresponds to a rule evaluateScene actually applies, and
 * carries both what the scene declared and what was measured. `observations` holds the
 * measured context that has no single declared value. A record whose assertions are
 * empty, or whose measured values are absent, is refused elsewhere: an entry that
 * vouches for nothing looks exactly like coverage.
 */
const describeScene = (expectation, report) => {
  const assertions = [];
  const assert = (name, expected, measured) => {
    assertions.push({ name, expected, measured });
  };

  const bars = report.bars ?? [];
  const markers = report.markers ?? [];
  const labels = report.chartLabels ?? [];
  const metrics = report.summaryMetrics ?? [];
  const buttons = report.stageButtons ?? [];
  const diagnostics = report.warnings ?? [];

  assert("renderState", "ready", report.renderState);
  assert("bars", expectation.bars, bars.length);
  assert("barStates", expectation.barStates, countStates(bars));
  assert(
    "barsWithDrawnWidth",
    expectation.barsWithWidth,
    bars.filter((entry) => entry.drawnWidth > 0).length
  );
  assert("stateMarkers", expectation.stateMarkers, markers.length);
  // Only recorded when the scene actually expects a marker state: an empty map on both
  // sides asserts nothing, and stateMarkers above already pins the count.
  if (Object.keys(expectation.markerStates ?? {}).length > 0) {
    assert("markerStates", expectation.markerStates, countStates(markers));
  }
  assert("chartLabels", expectation.chartLabels, labels.length);
  assert("summaryMetrics", expectation.summaryMetrics, metrics.length);
  assert("summaryIntake", expectation.summaryIntake, (report.summaryIntake ?? []).length);
  assert("stageRows", expectation.stageButtons, buttons.length);
  assert(
    "visibleStageRows",
    { atLeast: expectation.minVisibleStageButtons },
    buttons.filter((button) => fullyInside(button.inStageList) && fullyInside(button.inPage)).length
  );
  assert("tableRows", expectation.tableRows, report.tableRows);

  if (typeof expectation.warningItems === "number") {
    assert("diagnostics", expectation.warningItems, diagnostics.length);
  }
  if (typeof expectation.minWarningItems === "number") {
    assert("diagnostics", { atLeast: expectation.minWarningItems }, diagnostics.length);
  }
  (expectation.warningsMustContain ?? []).forEach((needle) => {
    assert(`diagnosticMentions:${needle}`, { atLeast: 1 }, countContaining(diagnostics, needle));
  });

  // The load-bearing assertion for a comparison scene: losing one segment leaves a
  // perfectly healthy funnel behind, so the per-segment counts are what prove the
  // screenshot still shows the comparison it advertises.
  Object.keys(expectation.labelGroupCounts ?? {}).forEach((group) => {
    assert(`chartLabelsInSegment:${group}`, expectation.labelGroupCounts[group], countContaining(labels, group));
  });
  Object.keys(expectation.stageButtonGroupCounts ?? {}).forEach((group) => {
    assert(
      `stageRowsInSegment:${group}`,
      expectation.stageButtonGroupCounts[group],
      countContaining(buttons, group)
    );
  });

  (expectation.zeroWidthBarIndexes ?? []).forEach((index) => {
    assert(`blankStageDrawsNoBar:${index + 1}`, 0, bars[index]?.drawnWidth ?? null);
  });
  (expectation.monotonicRuns ?? []).forEach((run, position) => {
    assert(
      `funnelNarrows:${position + 1}`,
      { strictlyDecreasingAcrossStages: run.map((index) => index + 1) },
      run.map((index) => bars[index]?.drawnWidth ?? null)
    );
  });
  (expectation.increasingBarPairs ?? []).forEach(([lower, higher]) => {
    assert(
      `stageIncreases:${lower + 1}->${higher + 1}`,
      { greaterThanPreviousStage: true },
      { from: bars[lower]?.drawnWidth ?? null, to: bars[higher]?.drawnWidth ?? null }
    );
  });

  (expectation.stageButtonsMustContain ?? []).forEach((needle) => {
    assert(`stageRowMentions:${needle}`, { atLeast: 1 }, countContaining(buttons, needle));
  });
  (expectation.stageButtonsMustNotContain ?? []).forEach((needle) => {
    assert(`stageRowOmits:${needle}`, 0, countContaining(buttons, needle));
  });
  (expectation.summaryMustContain ?? []).forEach((needle) => {
    assert(`summaryMentions:${needle}`, { atLeast: 1 }, countContaining(metrics, needle));
  });
  (expectation.summaryMustNotContain ?? []).forEach((needle) => {
    assert(`summaryOmits:${needle}`, 0, countContaining(metrics, needle));
  });

  // Region geometry, not just presence: the failure worth recording is a region that
  // sat in the DOM the whole time it rendered at zero visible height.
  expectation.requiredRegions.forEach((name) => {
    const measured = report.regions?.[name] ?? null;
    const rule = REGION_RULES[name];
    assert(
      `region:${name}`,
      {
        visible: true,
        atLeast: `${rule.minWidth}x${rule.minHeight}`,
        // The chart canvas legitimately overflows the tile because it scrolls inside
        // .atlyn-chart-scroll, so the record carries which regions containment is
        // actually required for rather than assuming it applies to every one of them.
        insideTile: rule.withinMount === true
      },
      measured
        ? {
          width: measured.box.width,
          height: measured.box.height,
          visible: measured.display !== "none" &&
            measured.visibility !== "hidden" &&
            Number(measured.opacity) !== 0,
          insideTile: fullyInside(measured.inMount),
          insideFrame: fullyInside(measured.inPage)
        }
        : null
    );
  });
  (expectation.forbiddenRegions ?? []).forEach((name) => {
    assert(`regionAbsent:${name}`, { rendered: false }, { rendered: Boolean(report.regions?.[name]) });
  });

  return {
    id: expectation.id,
    demonstrates: expectation.demonstrates,
    frame: report.page ?? null,
    visual: report.mountBox
      ? { width: report.mountBox.width, height: report.mountBox.height }
      : null,
    assertions,
    observations: {
      barDrawnWidths: bars.map((entry) => entry.drawnWidth),
      barStates: bars.map((entry) => entry.state),
      chartLabelText: labels.map((label) => label.text),
      summaryMetricText: metrics.map((metric) => metric.text),
      summaryIntakeText: (report.summaryIntake ?? []).map((intake) => intake.text),
      diagnosticText: diagnostics.map((item) => item.text),
      stageRowText: buttons.map((button) => button.text)
    }
  };
};

module.exports = {
  SCENE_EXPECTATIONS,
  REGION_RULES,
  expectationFor,
  evaluateScene,
  describeScene
};
