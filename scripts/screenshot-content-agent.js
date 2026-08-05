/*
 * In-page content probe for the Atlyn Funnel screenshot harness.
 *
 * This runs inside the very browser invocation that writes the PNG, so what it
 * measures is what the screenshot shows. It counts the elements each scene is
 * supposed to contain and measures their rendered boxes, then serialises the
 * findings into a marked <script> tag that the Node driver reads back out of
 * --dump-dom.
 *
 * Two properties matter and neither is optional:
 *
 *  - It is strictly read-only. It never focuses, scrolls, or re-renders anything,
 *    because any mutation would make the assertions describe a DOM the screenshot
 *    never contained. The one node it appends is a <script>, which the UA
 *    stylesheet renders display: none, so the captured pixels are unchanged.
 *
 *  - It measures geometry, not just presence. A region can sit in the DOM the
 *    whole time it is broken and still render at zero height or outside the
 *    captured frame, so every box is measured and clipped against both the tile
 *    Power BI hands the visual and the screenshot frame itself.
 */
/* global window, document, getComputedStyle */
(function () {
  var round = function (value) {
    return Math.round(value * 100) / 100;
  };

  var boxOf = function (element) {
    var rect = element.getBoundingClientRect();
    return {
      left: round(rect.left),
      top: round(rect.top),
      right: round(rect.right),
      bottom: round(rect.bottom),
      width: round(rect.width),
      height: round(rect.height)
    };
  };

  // The visible interior of a scroll container: content past clientWidth/clientHeight
  // is scrolled out of frame and therefore absent from the screenshot.
  var clientBoxOf = function (element) {
    var rect = element.getBoundingClientRect();
    return {
      left: round(rect.left),
      top: round(rect.top),
      right: round(rect.left + element.clientWidth),
      bottom: round(rect.top + element.clientHeight),
      width: element.clientWidth,
      height: element.clientHeight
    };
  };

  var containment = function (box, frame) {
    if (!frame) {
      return null;
    }
    var visibleWidth = Math.max(0, Math.min(box.right, frame.right) - Math.max(box.left, frame.left));
    var visibleHeight = Math.max(0, Math.min(box.bottom, frame.bottom) - Math.max(box.top, frame.top));
    return {
      visibleWidth: round(visibleWidth),
      visibleHeight: round(visibleHeight),
      lostLeft: round(Math.max(0, frame.left - box.left)),
      lostTop: round(Math.max(0, frame.top - box.top)),
      lostRight: round(Math.max(0, box.right - frame.right)),
      lostBottom: round(Math.max(0, box.bottom - frame.bottom))
    };
  };

  var textOf = function (element) {
    return (element.textContent || "").replace(/\s+/g, " ").trim();
  };

  var list = function (nodes) {
    return Array.prototype.slice.call(nodes);
  };

  var REGION_SELECTORS = {
    root: ".atlyn-funnel",
    summary: ".atlyn-summary",
    warnings: ".atlyn-warnings",
    chartScroll: ".atlyn-chart-scroll",
    chart: "svg.atlyn-chart",
    stageList: ".atlyn-stage-list",
    empty: ".atlyn-empty",
    accessibleTable: ".atlyn-accessible-table"
  };

  var measure = function (harness, report) {
    var shadow = harness.shadow;
    var mountBox = boxOf(harness.mount);

    /*
     * The screenshot frame. Anything outside it is simply not in the PNG, however
     * healthy it looks in the DOM.
     *
     * This is the document's rendered box, not window.innerWidth/innerHeight: headless
     * Chromium captures the full content area, and the layout viewport is smaller than
     * the window because it excludes chrome and scrollbar gutters. Using innerHeight
     * here reported a 673px frame for a PNG that is really 768px tall, which would
     * have condemned rows that are plainly in the committed screenshot. The Node
     * driver cross-checks these numbers against the emitted PNG so a future divergence
     * fails the run instead of silently measuring against the wrong frame.
     */
    var documentElement = document.documentElement;
    var frameWidth = Math.max(
      documentElement.scrollWidth,
      document.body ? document.body.scrollWidth : 0,
      window.innerWidth
    );
    var frameHeight = Math.max(
      documentElement.scrollHeight,
      document.body ? document.body.scrollHeight : 0,
      window.innerHeight
    );
    var pageFrame = {
      left: 0,
      top: 0,
      right: frameWidth,
      bottom: frameHeight,
      width: frameWidth,
      height: frameHeight
    };

    report.page = { width: frameWidth, height: frameHeight };
    // Every box below is in client coordinates, which only line up with the captured
    // frame while the document is unscrolled.
    report.scroll = { x: round(window.scrollX || 0), y: round(window.scrollY || 0) };
    report.mountBox = mountBox;

    var regions = {};
    Object.keys(REGION_SELECTORS).forEach(function (name) {
      var element = shadow.querySelector(REGION_SELECTORS[name]);
      if (!element) {
        regions[name] = null;
        return;
      }
      var style = getComputedStyle(element);
      var box = boxOf(element);
      regions[name] = {
        selector: REGION_SELECTORS[name],
        box: box,
        display: style.display,
        visibility: style.visibility,
        opacity: style.opacity,
        inMount: containment(box, mountBox),
        inPage: containment(box, pageFrame)
      };
    });
    report.regions = regions;

    var chartScroll = shadow.querySelector(".atlyn-chart-scroll");
    var chartFrame = chartScroll ? clientBoxOf(chartScroll) : null;
    report.chartClientBox = chartFrame;

    var bars = list(shadow.querySelectorAll(".atlyn-bar"));
    report.bars = bars.map(function (bar) {
      var box = boxOf(bar);
      return {
        state: bar.getAttribute("data-value-state"),
        stageKey: bar.getAttribute("data-stage-key"),
        // The drawn width is the datum: a funnel bar is the value made visible, so a
        // bar whose geometry says one thing and whose data says another is a wrong
        // render even when every element is present.
        drawnWidth: round(parseFloat(bar.getAttribute("width")) || 0),
        box: box,
        inChart: containment(box, chartFrame),
        inPage: containment(box, pageFrame)
      };
    });

    var markers = list(shadow.querySelectorAll(".atlyn-state-marker"));
    report.markers = markers.map(function (marker) {
      return { state: marker.getAttribute("data-value-state"), box: boxOf(marker) };
    });

    var buttons = list(shadow.querySelectorAll(".atlyn-stage-button"));
    var stageListElement = shadow.querySelector(".atlyn-stage-list");
    var stageFrame = stageListElement ? clientBoxOf(stageListElement) : null;
    report.stageListClientBox = stageFrame;
    report.stageButtons = buttons.map(function (button) {
      var box = boxOf(button);
      return {
        text: textOf(button),
        box: box,
        inStageList: containment(box, stageFrame),
        inPage: containment(box, pageFrame)
      };
    });

    report.chartLabels = list(shadow.querySelectorAll(".atlyn-chart-label")).map(function (label) {
      return { text: textOf(label), box: boxOf(label) };
    });
    report.summaryMetrics = list(shadow.querySelectorAll(".atlyn-summary-metric")).map(function (metric) {
      return { text: textOf(metric), box: boxOf(metric) };
    });
    report.summaryIntake = list(shadow.querySelectorAll(".atlyn-summary-intake")).map(function (intake) {
      return { text: textOf(intake), box: boxOf(intake) };
    });
    report.warnings = list(shadow.querySelectorAll(".atlyn-warnings li")).map(function (item) {
      return { text: textOf(item), box: boxOf(item) };
    });
    report.tableRows = shadow.querySelectorAll(".atlyn-accessible-table tbody tr").length;
    report.warningPanels = shadow.querySelectorAll(".atlyn-warnings").length;
  };

  var scenario = window.__ATLYN_SCENARIO__;
  var report = {
    id: scenario ? scenario.id : "unknown",
    renderState: document.documentElement.getAttribute("data-atlyn-render"),
    renderError: document.documentElement.getAttribute("data-atlyn-error"),
    ok: false
  };

  var harness = window.__ATLYN_HARNESS__;
  if (!harness) {
    report.fatal = "the harness never mounted the visual";
  } else {
    try {
      measure(harness, report);
      report.ok = true;
    } catch (error) {
      report.fatal = String((error && error.stack) || error);
    }
  }

  var node = document.createElement("script");
  node.type = "application/json";
  node.id = "atlyn-scene-report";
  // Built from fragments so this file's own source can never match the marker the
  // Node driver scans for in the dumped DOM.
  node.textContent = "@@ATLYN" + "_SCENE@@" + JSON.stringify(report) + "@@END_ATLYN" + "_SCENE@@";
  document.body.appendChild(node);
})();
