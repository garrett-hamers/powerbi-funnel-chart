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

  /*
   * Regions that must genuinely overflow at these tiles. Declared rather than inferred
   * so that a fixture which quietly stops overflowing is reported instead of silently
   * turning every scroll-time assertion below it into a vacuous pass.
   */
  scenarios.forEach((scenario) => {
    if (scenario.id === "size-md") {
      scenario.expectOverflow = ["atlyn-chart-scroll", "atlyn-stage-list"];
    }
    if (scenario.id === "size-min" || scenario.id === "size-xs") {
      scenario.expectOverflow = ["atlyn-chart-scroll"];
    }
  });

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

  return scenarios;
};

const finding = (scenario, rule, detail) => ({
  scenario: typeof scenario === "string" ? scenario : scenario.id,
  rule,
  detail
});

const rootScroller = (report) =>
  (report.scrollContainers ?? []).find((entry) => entry.element.indexOf("atlyn-funnel") >= 0);

/*
 * Rules for the states the probe now deliberately enters: scrolled, and focused.
 *
 * Kept here, pure, so a test can drive them with deliberately bad measurements. A rule
 * that has never been seen to fire is indistinguishable from one that cannot.
 */
const evaluatePositioning = (scenario, report, findings) => {
  const positioning = report.positioning;
  if (!positioning) {
    findings.push(finding(scenario, "positioning", "the probe reported no positioning triage"));
    return;
  }
  (positioning.elements ?? []).forEach((entry) => {
    if (entry.position === "absolute" || entry.position === "fixed") {
      /*
       * A box whose containing block is above the visual root belongs to the page, not
       * to the tile: the root's overflow cannot clip it and the root's scrolling cannot
       * move it. The escape walk treats a scrolling ancestor as containment, which is
       * true for in-flow boxes and false for this one, so it has to be caught here.
       */
      if (!entry.containingBlockInsideRoot) {
        findings.push(finding(
          scenario,
          "positioned-outside-root",
          `${entry.element} is position: ${entry.position} but resolves against ` +
          `${entry.containingBlock ?? "the initial containing block"}, which is outside the visual, ` +
          "so the root cannot clip or scroll it"
        ));
      }
    }
  });
};

const evaluateScrollSweep = (scenario, report, findings) => {
  const sweep = report.scrollSweep;
  if (!Array.isArray(sweep)) {
    findings.push(finding(scenario, "scroll-sweep", "the probe never scrolled any region"));
    return;
  }
  const expected = scenario.expectOverflow ?? [];
  expected.forEach((selectorFragment) => {
    const container = sweep.find((entry) => entry.element.indexOf(selectorFragment) >= 0);
    if (!container) {
      findings.push(finding(
        scenario,
        "scroll-region-missing",
        `${selectorFragment} was expected to be a scroll container at this tile but none was measured`
      ));
      return;
    }
    /*
     * Reported rather than skipped. A fixture whose content quietly stops overflowing
     * makes every scroll-time assertion below it pass vacuously, which reads as green.
     */
    if (!container.overflows) {
      findings.push(finding(
        scenario,
        "scroll-region-no-longer-overflows",
        `${container.element} was expected to overflow but scrollHeight ${container.scrollHeight} ` +
        `fits clientHeight ${container.clientHeight}, so every scroll-time assertion here is vacuous`
      ));
    }
  });

  sweep.forEach((container) => {
    (container.offsets ?? []).forEach((offset) => {
      if (container.maxScrollTop > 0 && Math.abs(offset.applied - offset.requested) > 1) {
        findings.push(finding(
          scenario,
          "scroll-refused",
          `${container.element} would not scroll to ${offset.requested}px (settled at ${offset.applied}px)`
        ));
      }
      (offset.escapes ?? []).forEach((escape) => {
        findings.push(finding(
          scenario,
          "escapes-root-when-scrolled",
          `at ${container.element} scrollTop ${offset.applied}px, ${escape.element} escapes the tile by ` +
          `${escape.overflowLeft}/${escape.overflowTop}/${escape.overflowRight}/${escape.overflowBottom}px ` +
          "(l/t/r/b) with no scrollable ancestor"
        ));
      });
      const sticky = offset.stickyOffsets ?? [];
      sticky.forEach((entry) => {
        // getComputedStyle().zIndex reports the specified value even when the element is
        // not positioned, so a stacking order must never be read without this check.
        if (entry.computedPosition !== "sticky") {
          findings.push(finding(
            scenario,
            "sticky-not-positioned",
            `${entry.element} declares a stacking order but computes position: ${entry.computedPosition}, ` +
            "so that order describes a context that does not exist"
          ));
        }
      });
      const tops = sticky.map((entry) => entry.top);
      if (tops.length > 1) {
        const distinct = new Set(tops.map((value) => Math.round(value)));
        if (distinct.size !== tops.length) {
          findings.push(finding(
            scenario,
            "sticky-offsets-collapsed",
            `sticky elements pinned onto one another at ${container.element} scrollTop ` +
            `${offset.applied}px (offsets ${tops.join(", ")})`
          ));
        }
        for (let index = 1; index < tops.length; index += 1) {
          if (tops[index] <= tops[index - 1]) {
            findings.push(finding(
              scenario,
              "sticky-offsets-not-increasing",
              `sticky offsets are not strictly increasing at ${container.element} scrollTop ` +
              `${offset.applied}px (${tops.join(", ")})`
            ));
            break;
          }
        }
      }
    });
  });
};

const evaluateFocusState = (scenario, report, findings) => {
  const focusState = report.focusState;
  if (!focusState) {
    return;
  }
  const expands = focusState.expandsAttribute === "true";
  /*
   * A tile too small to open the table deliberately leaves it out of the tab order,
   * because a tab stop whose focus ring is clipped away is a stop a sighted keyboard
   * user cannot see. The rows still have to be there — dropping out of the tab order is
   * not permission to drop out of the accessibility tree.
   */
  if (focusState.focusable === false) {
    if (expands) {
      findings.push(finding(
        scenario,
        "focus-region-lost",
        "this tile opens the accessible table but the table is not in the tab order"
      ));
    }
    if (focusState.tableRows === 0) {
      findings.push(finding(scenario, "focus-region-empty", "the accessible table carries no rows"));
    }
    return;
  }
  if (!focusState.focused) {
    findings.push(finding(scenario, "focus-region-lost", "the accessible table did not accept focus"));
    return;
  }
  if (focusState.tableRows === 0) {
    findings.push(finding(scenario, "focus-region-empty", "the accessible table carries no rows"));
  }

  const scroller = focusState.scroller;
  const tableOccupiesSpace = (focusState.tableBox?.height ?? 0) > 4;

  /*
   * `overflow` and `max-height` are ignored on a display: table box, so a <table> that
   * is meant to bound itself silently does not: it grows to its content and pushes the
   * rest of the visual out of the tile. Whenever the table occupies space, something
   * that is genuinely a block container has to bound it — checked by measurement rather
   * than inferred from the stylesheet, and independent of whether this tile is large
   * enough to open the table, because an unbounded table is a defect either way.
   */
  if (tableOccupiesSpace) {
    if (!scroller) {
      findings.push(finding(
        scenario,
        "focus-no-scroll-container",
        `the accessible table lays out ${focusState.tableBox.width}x${focusState.tableBox.height}px with no ` +
        "bounding wrapper; overflow and max-height are ignored on a table, so nothing contains it"
      ));
    } else if (scroller.display === "table") {
      findings.push(finding(
        scenario,
        "focus-scroll-container-is-a-table",
        `${scroller.element} computes display: table, where overflow and max-height are ignored, ` +
        "so it can never be a scroll container"
      ));
    } else if (!/(auto|scroll|hidden)/.test(scroller.overflowY)) {
      findings.push(finding(
        scenario,
        "focus-scroll-container-not-scrollable",
        `${scroller.element} computes overflow-y: ${scroller.overflowY}, so the table is unbounded`
      ));
    }
  }

  if (expands && scroller) {
    if (scroller.box.height < 4) {
      findings.push(finding(
        scenario,
        "focus-region-collapsed",
        `the opened accessible table rendered ${scroller.box.width}x${scroller.box.height}px: ` +
        "present, focused and unreadable"
      ));
    }
    if (scroller.scrollHeight > scroller.clientHeight + 1 && scroller.scrollProof &&
      scroller.scrollProof.moved !== true) {
      findings.push(finding(
        scenario,
        "focus-scroll-container-vacuous",
        `${scroller.element} overflows by ${scroller.scrollHeight - scroller.clientHeight}px but would ` +
        "not scroll when asked, so the content past the fold is unreachable"
      ));
    }
  }

  // Degrade chrome, never data. Opening a table must not cost the funnel.
  if (focusState.chartHeightBefore !== null && focusState.chartHeightAfter !== null) {
    if (focusState.chartHeightAfter < 4) {
      findings.push(finding(
        scenario,
        "focus-destroys-chart",
        `focusing the accessible table collapsed the funnel from ${focusState.chartHeightBefore}px ` +
        `to ${focusState.chartHeightAfter}px, so the data is gone while the chrome remains`
      ));
    } else if (focusState.chartHeightAfter < focusState.chartHeightBefore * 0.25) {
      findings.push(finding(
        scenario,
        "focus-shrinks-chart",
        `focusing the accessible table cut the funnel from ${focusState.chartHeightBefore}px to ` +
        `${focusState.chartHeightAfter}px, below a quarter of its resting height`
      ));
    }
  }

  if (Math.abs(focusState.rootScrolledBy) > 1) {
    findings.push(finding(
      scenario,
      "focus-scrolls-root",
      `focusing the accessible table scrolled the visual root by ${focusState.rootScrolledBy}px; ` +
      "in an embedded tile there is nothing to scroll it back"
    ));
  }
  if (focusState.rootHiddenY > 1) {
    findings.push(finding(
      scenario,
      "focus-overflows-root",
      `with the accessible table open the visual root hides ${focusState.rootHiddenY}px of content`
    ));
  }
  (focusState.escapes ?? []).forEach((escape) => {
    findings.push(finding(
      scenario,
      "escapes-root-when-focused",
      `with the accessible table open, ${escape.element} escapes the tile by ` +
      `${escape.overflowLeft}/${escape.overflowTop}/${escape.overflowRight}/${escape.overflowBottom}px (l/t/r/b)`
    ));
  });
};

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

  evaluatePositioning(scenario, report, findings);
  evaluateScrollSweep(scenario, report, findings);
  evaluateFocusState(scenario, report, findings);

  return findings;
};

module.exports = {
  PROBE_VIEWPORTS,
  PROBE_DATA,
  DIAGNOSTIC_DATA,
  buildProbeScenarios,
  evaluateReport,
  evaluatePositioning,
  evaluateScrollSweep,
  evaluateFocusState
};
