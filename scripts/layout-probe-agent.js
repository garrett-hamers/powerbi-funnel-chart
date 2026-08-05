/*
 * In-page geometry probe for the Atlyn Funnel harness.
 *
 * Runs after the harness has mounted the packaged bundle into a shadow root, walks
 * the rendered tree (shadow DOM included), measures every box with
 * getBoundingClientRect(), and serialises the findings into a marked <script> tag so
 * the Node driver can read them back out of --dump-dom.
 *
 * The core assertion is: no box may escape the element Power BI hands the visual,
 * unless it sits inside an ancestor that legitimately scrolls (overflow auto/scroll).
 */
/* global window, document, getComputedStyle, Node */
(function () {
  var EPSILON = 0.5;
  var COLLAPSE_PX = 4;

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

  var describe = function (element) {
    var classAttribute = element.getAttribute ? element.getAttribute("class") : null;
    return element.tagName.toLowerCase() +
      (classAttribute ? "." + String(classAttribute).trim().split(/\s+/).join(".") : "");
  };

  var parentOf = function (node) {
    if (node.parentNode) {
      return node.parentNode;
    }
    return node.host || null;
  };

  var scrollsBetween = function (element, stopAt) {
    var node = parentOf(element);
    while (node && node !== stopAt) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        var style = getComputedStyle(node);
        if (/(auto|scroll)/.test(style.overflowX) || /(auto|scroll)/.test(style.overflowY)) {
          return describe(node);
        }
      }
      node = parentOf(node);
    }
    return null;
  };

  var walk = function (element, visit) {
    visit(element);
    var children = element.children || [];
    for (var index = 0; index < children.length; index += 1) {
      walk(children[index], visit);
    }
  };

  var REGION_SELECTORS = {
    summary: ".atlyn-summary",
    warnings: ".atlyn-warnings",
    chartScroll: ".atlyn-chart-scroll",
    chart: ".atlyn-chart",
    stageList: ".atlyn-stage-list",
    firstStageButton: ".atlyn-stage-button",
    empty: ".atlyn-empty"
  };

  // An ancestor only clips, or anchors, a positioned descendant when it is part of that
  // descendant's containing block chain. A root that computes position: static anchors
  // nothing, so an absolutely positioned child resolves against the initial containing
  // block and escapes the root's overflow entirely.
  var establishesContainingBlock = function (style, forFixed) {
    if (!forFixed && style.position !== "static") {
      return true;
    }
    return (style.transform && style.transform !== "none") ||
      (style.perspective && style.perspective !== "none") ||
      (style.filter && style.filter !== "none") ||
      (style.willChange || "").indexOf("transform") >= 0 ||
      /(paint|layout|strict|content)/.test(style.contain || "");
  };

  var containingBlockOf = function (element, position) {
    var node = parentOf(element);
    while (node) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        if (establishesContainingBlock(getComputedStyle(node), position === "fixed")) {
          return node;
        }
      }
      node = parentOf(node);
    }
    return null;
  };

  var contains = function (ancestor, element) {
    var node = element;
    while (node) {
      if (node === ancestor) {
        return true;
      }
      node = parentOf(node);
    }
    return false;
  };

  var measure = function (harness, report) {
    var mount = harness.mount;
    var shadow = harness.shadow;
    var rootBox = boxOf(mount);
    report.viewport = harness.viewport;
    report.rootBox = rootBox;
    report.containerBox = boxOf(harness.container);

    var funnel = shadow.querySelector(".atlyn-funnel");
    report.funnelBox = funnel ? boxOf(funnel) : null;
    if (funnel) {
      var funnelStyle = getComputedStyle(funnel);
      report.funnelStyle = {
        minWidth: funnelStyle.minWidth,
        minHeight: funnelStyle.minHeight,
        overflowX: funnelStyle.overflowX,
        overflowY: funnelStyle.overflowY,
        direction: funnelStyle.direction,
        padding: funnelStyle.paddingTop
      };
    } else {
      report.funnelStyle = null;
    }

    var escapes = [];
    var collapsed = [];
    var clipped = [];
    var ellipsisWithoutNowrap = [];
    var scrollContainers = [];
    var positioned = [];

    var inAccessibleTable = function (element) {
      var node = element;
      while (node && node !== mount) {
        if (
          node.nodeType === Node.ELEMENT_NODE &&
          node.classList &&
          (node.classList.contains("atlyn-accessible-table") ||
            node.classList.contains("atlyn-accessible-shell"))
        ) {
          return true;
        }
        node = parentOf(node);
      }
      return false;
    };

    walk(mount, function (element) {
      if (element === mount) {
        return;
      }
      var style = getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden") {
        return;
      }
      var box = boxOf(element);
      var scroller = scrollsBetween(element, mount);

      if (/(auto|scroll)/.test(style.overflowX) || /(auto|scroll)/.test(style.overflowY)) {
        scrollContainers.push({
          element: describe(element),
          clientWidth: element.clientWidth,
          clientHeight: element.clientHeight,
          scrollWidth: element.scrollWidth,
          scrollHeight: element.scrollHeight,
          hiddenX: Math.max(0, element.scrollWidth - element.clientWidth),
          hiddenY: Math.max(0, element.scrollHeight - element.clientHeight)
        });
      }

      if (!scroller) {
        var overLeft = round(rootBox.left - box.left);
        var overTop = round(rootBox.top - box.top);
        var overRight = round(box.right - rootBox.right);
        var overBottom = round(box.bottom - rootBox.bottom);
        if (overLeft > EPSILON || overTop > EPSILON || overRight > EPSILON || overBottom > EPSILON) {
          escapes.push({
            element: describe(element),
            box: box,
            overflowLeft: Math.max(0, overLeft),
            overflowTop: Math.max(0, overTop),
            overflowRight: Math.max(0, overRight),
            overflowBottom: Math.max(0, overBottom)
          });
        }
      }

      var hasContent = Boolean((element.textContent || "").trim()) ||
        element.tagName.toLowerCase() === "svg";
      if (
        hasContent &&
        element.getAttribute("aria-hidden") !== "true" &&
        !inAccessibleTable(element) &&
        (box.height < COLLAPSE_PX || box.width < COLLAPSE_PX)
      ) {
        collapsed.push({ element: describe(element), box: box });
      }

      if (style.textOverflow === "ellipsis" && style.whiteSpace !== "nowrap" && style.whiteSpace !== "pre") {
        ellipsisWithoutNowrap.push({ element: describe(element), whiteSpace: style.whiteSpace });
      }

      if (style.position !== "static") {
        var containingBlock = containingBlockOf(element, style.position);
        positioned.push({
          element: describe(element),
          position: style.position,
          top: style.top,
          left: style.left,
          zIndex: style.zIndex,
          box: box,
          containingBlock: containingBlock ? describe(containingBlock) : "initial containing block",
          // When the containing block sits outside the visual root, no amount of
          // overflow on the root can clip this element.
          containingBlockInsideRoot: Boolean(containingBlock) && contains(mount, containingBlock),
          scrollerBetween: scroller
        });
      }

      // Content clipped by overflow: hidden is unreachable: there is no scrollbar and
      // no keyboard route to it. Single-line ellipsis truncation, the visually hidden
      // accessible table and SVG canvases are deliberate and excluded.
      var deliberateTruncation = style.textOverflow === "ellipsis" ||
        inAccessibleTable(element) ||
        element.namespaceURI === "http://www.w3.org/2000/svg";
      if (!deliberateTruncation) {
        var clipsY = style.overflowY === "hidden" || style.overflowY === "clip";
        var clipsX = style.overflowX === "hidden" || style.overflowX === "clip";
        var lostY = clipsY ? Math.max(0, element.scrollHeight - element.clientHeight) : 0;
        var lostX = clipsX ? Math.max(0, element.scrollWidth - element.clientWidth) : 0;
        if (lostY > 1 || lostX > 1) {
          clipped.push({
            element: describe(element),
            box: box,
            lostX: lostX,
            lostY: lostY,
            scrollHeight: element.scrollHeight,
            clientHeight: element.clientHeight
          });
        }
      }
    });

    report.escapes = escapes;
    report.collapsed = collapsed;
    report.clipped = clipped;
    report.ellipsisWithoutNowrap = ellipsisWithoutNowrap;
    report.scrollContainers = scrollContainers;
    report.positioned = positioned;


    var visibleFraction = function (box) {
      var width = Math.max(0, Math.min(box.right, rootBox.right) - Math.max(box.left, rootBox.left));
      var height = Math.max(0, Math.min(box.bottom, rootBox.bottom) - Math.max(box.top, rootBox.top));
      var area = box.width * box.height;
      return area > 0 ? round((width * height) / area) : 0;
    };

    var regions = {};
    Object.keys(REGION_SELECTORS).forEach(function (name) {
      var element = shadow.querySelector(REGION_SELECTORS[name]);
      if (!element) {
        regions[name] = null;
        return;
      }
      var box = boxOf(element);
      regions[name] = {
        box: box,
        visibleFraction: visibleFraction(box),
        visibleHeight: round(
          Math.max(0, Math.min(box.bottom, rootBox.bottom) - Math.max(box.top, rootBox.top))
        )
      };
    });
    report.regions = regions;
    report.stageButtonCount = shadow.querySelectorAll(".atlyn-stage-button").length;
    report.barCount = shadow.querySelectorAll(".atlyn-bar").length;
    report.contentHeight = funnel ? funnel.scrollHeight : 0;

    var chartLabel = shadow.querySelector(".atlyn-chart-label");
    report.chartLabelBox = chartLabel ? boxOf(chartLabel) : null;

    // SVG text is clipped by the canvas, and the canvas sits inside a scroll region,
    // so a mis-anchored label disappears without tripping the escape rule.
    var svgBox = report.regions && report.regions.chart ? report.regions.chart.box : null;
    var labelEscapes = [];
    var labels = shadow.querySelectorAll(".atlyn-chart-label");
    for (var labelIndex = 0; labelIndex < labels.length; labelIndex += 1) {
      var labelBox = boxOf(labels[labelIndex]);
      if (!svgBox || labelBox.width === 0) {
        continue;
      }
      var lost = Math.max(
        0,
        round(svgBox.left - labelBox.left),
        round(labelBox.right - svgBox.right)
      );
      if (lost > EPSILON) {
        labelEscapes.push({
          text: (labels[labelIndex].textContent || "").slice(0, 40),
          box: labelBox,
          lostPx: lost
        });
      }
    }
    report.chartLabelEscapes = labelEscapes;
    report.chartLabelCount = labels.length;

    report.media = {
      reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      forcedColors: window.matchMedia("(forced-colors: active)").matches
    };
    var firstBar = shadow.querySelector(".atlyn-bar");
    if (firstBar) {
      var barStyle = getComputedStyle(firstBar);
      report.barStyle = {
        transitionDuration: barStyle.transitionDuration,
        fill: barStyle.fill,
        opacity: barStyle.opacity
      };
    } else {
      report.barStyle = null;
    }
    report.highContrastAttribute = funnel ? funnel.getAttribute("data-high-contrast") : null;
    report.compactAttribute = funnel ? funnel.getAttribute("data-compact") : null;
    report.narrowAttribute = funnel ? funnel.getAttribute("data-narrow") : null;
    report.shortAttribute = funnel ? funnel.getAttribute("data-short") : null;
    report.tinyAttribute = funnel ? funnel.getAttribute("data-tiny") : null;
    report.dir = funnel ? funnel.getAttribute("dir") : null;

    // Selection state runs before the focus checks so no expanded-on-focus region is
    // still open when the boxes are compared. Highlighting must dim bars without
    // moving anything.
    var valueColumn = harness.dataView &&
      harness.dataView.categorical &&
      harness.dataView.categorical.values &&
      harness.dataView.categorical.values[0];
    if (valueColumn) {
      var beforeRegions = {};
      Object.keys(REGION_SELECTORS).forEach(function (name) {
        var element = shadow.querySelector(REGION_SELECTORS[name]);
        beforeRegions[name] = element ? boxOf(element) : null;
      });
      valueColumn.highlights = valueColumn.values.map(function (value, index) {
        return index % 2 === 0 ? value : null;
      });
      harness.update({});
      var shifted = [];
      Object.keys(REGION_SELECTORS).forEach(function (name) {
        var element = shadow.querySelector(REGION_SELECTORS[name]);
        var after = element ? boxOf(element) : null;
        var before = beforeRegions[name];
        if (before && after && (
          Math.abs(before.top - after.top) > EPSILON ||
          Math.abs(before.left - after.left) > EPSILON ||
          Math.abs(before.height - after.height) > EPSILON ||
          Math.abs(before.width - after.width) > EPSILON
        )) {
          shifted.push({ region: name, before: before, after: after });
        }
      });
      var dimmed = shadow.querySelectorAll(".atlyn-bar.atlyn-dimmed");
      report.selection = {
        dimmedBars: dimmed.length,
        dimmedOpacity: dimmed.length > 0 ? getComputedStyle(dimmed[0]).opacity : null,
        shiftedRegions: shifted
      };
      delete valueColumn.highlights;
      harness.update({});
    } else {
      report.selection = null;
    }

    // Content that fits never scrolls, and a region that never scrolls hides every bug
    // that only appears once it does: sticky offsets that collapse onto each other,
    // absolutely positioned children anchored outside the scroller, boxes that leave
    // the tile only at a non-zero scroll offset. So scroll everything that can scroll
    // and measure again at each offset.
    var scanEscapes = function () {
      var found = [];
      // Re-read the root box: focusing or scrolling can move the page underneath us,
      // and comparing fresh rects against a stale root would invent escapes.
      var currentRoot = boxOf(mount);
      walk(mount, function (element) {
        if (element === mount) {
          return;
        }
        var style = getComputedStyle(element);
        if (style.display === "none" || style.visibility === "hidden") {
          return;
        }
        if (scrollsBetween(element, mount)) {
          return;
        }
        var box = boxOf(element);
        var over = Math.max(
          round(currentRoot.left - box.left),
          round(currentRoot.top - box.top),
          round(box.right - currentRoot.right),
          round(box.bottom - currentRoot.bottom)
        );
        if (over > EPSILON) {
          found.push({ element: describe(element), box: box, overflowPx: over });
        }
      });
      return found;
    };

    var stickyTopsIn = function (container) {
      var tops = [];
      walk(container, function (element) {
        if (getComputedStyle(element).position === "sticky") {
          tops.push({ element: describe(element), top: boxOf(element).top });
        }
      });
      return tops;
    };

    var absoluteChildrenIn = function (container) {
      var found = [];
      walk(container, function (element) {
        if (element !== container && getComputedStyle(element).position === "absolute") {
          found.push(element);
        }
      });
      return found;
    };

    var scrollProbes = [];
    var scrollers = [];
    walk(mount, function (element) {
      var style = getComputedStyle(element);
      if (/(auto|scroll)/.test(style.overflowX) || /(auto|scroll)/.test(style.overflowY)) {
        scrollers.push(element);
      }
    });

    scrollers.forEach(function (container) {
      var maxY = Math.max(0, container.scrollHeight - container.clientHeight);
      var maxX = Math.max(0, container.scrollWidth - container.clientWidth);
      var probe = {
        element: describe(container),
        scrollHeight: container.scrollHeight,
        clientHeight: container.clientHeight,
        scrollWidth: container.scrollWidth,
        clientWidth: container.clientWidth,
        verticallyScrollable: maxY > 1,
        horizontallyScrollable: maxX > 1,
        offsets: []
      };
      if (maxY <= 1 && maxX <= 1) {
        scrollProbes.push(probe);
        return;
      }
      var absolutes = absoluteChildrenIn(container);
      var absoluteBefore = absolutes.map(function (element) {
        return boxOf(element).top;
      });
      [0, 0.25, 0.5, 1].forEach(function (fraction) {
        var targetY = Math.round(maxY * fraction);
        var targetX = Math.round(maxX * fraction);
        container.scrollTop = targetY;
        container.scrollLeft = targetX;
        var stickyTops = stickyTopsIn(container);
        var strictlyIncreasing = true;
        var allDistinct = true;
        for (var index = 1; index < stickyTops.length; index += 1) {
          if (stickyTops[index].top <= stickyTops[index - 1].top) {
            strictlyIncreasing = false;
          }
          if (Math.abs(stickyTops[index].top - stickyTops[index - 1].top) <= EPSILON) {
            allDistinct = false;
          }
        }
        var absoluteDrift = absolutes.map(function (element, absoluteIndex) {
          return round(absoluteBefore[absoluteIndex] - boxOf(element).top);
        });
        probe.offsets.push({
          scrollTop: container.scrollTop,
          scrollLeft: container.scrollLeft,
          requestedTop: targetY,
          escapes: scanEscapes(),
          stickyTops: stickyTops,
          stickyStrictlyIncreasing: strictlyIncreasing,
          stickyAllDistinct: allDistinct,
          // An absolutely positioned child anchored outside the scroller stays put
          // while everything around it moves; it should drift by the scroll amount.
          absoluteDrift: absoluteDrift,
          absoluteAnchoredOutside: absoluteDrift.filter(function (drift) {
            return container.scrollTop > 1 && Math.abs(drift - container.scrollTop) > 1;
          }).length
        });
      });
      container.scrollTop = 0;
      container.scrollLeft = 0;
      scrollProbes.push(probe);
    });
    report.scrollProbes = scrollProbes;
    report.anyScrollable = scrollProbes.some(function (probe) {
      return probe.verticallyScrollable || probe.horizontallyScrollable;
    });
    report.stickyCount = stickyTopsIn(mount).length;

    // The accessible table is the one absolutely positioned element in the visual, and
    // on focus it returns to flow at full width. Under overflow that is exactly when a
    // mis-anchored box would blow out of the tile, so measure it there too.
    var tableUnderOverflow = shadow.querySelector(".atlyn-accessible-table");
    if (tableUnderOverflow) {
      tableUnderOverflow.focus();
      report.focusedTableEscapes = scanEscapes();
      report.focusedTableBox = boxOf(tableUnderOverflow);
      var shell = shadow.querySelector(".atlyn-accessible-shell");
      // Expanding on demand may make the root scroll, which is fine: the root is a
      // scroll container, so the content stays reachable. What would not be fine is
      // the expansion being clipped away with no route to it.
      report.focusedTableReachable = {
        shellOverflowY: shell ? getComputedStyle(shell).overflowY : null,
        shellScrollHeight: shell ? shell.scrollHeight : 0,
        shellClientHeight: shell ? shell.clientHeight : 0,
        rootScrollHeight: funnel ? funnel.scrollHeight : 0,
        rootClientHeight: funnel ? funnel.clientHeight : 0,
        rootOverflowY: funnel ? getComputedStyle(funnel).overflowY : null
      };
      tableUnderOverflow.blur();
      if (funnel) {
        funnel.scrollTop = 0;
        funnel.scrollLeft = 0;
      }
    } else {
      report.focusedTableEscapes = [];
      report.focusedTableBox = null;
      report.focusedTableReachable = null;
    }

    // Keyboard focus: the ring must stay inside the tile and focusing must not scroll
    // the visual root, which in Power BI would push the funnel out of view.
    var focusChecks = [];
    var focusTargets = [];
    var buttons = shadow.querySelectorAll(".atlyn-stage-button");
    for (var buttonIndex = 0; buttonIndex < buttons.length; buttonIndex += 1) {
      focusTargets.push(buttons[buttonIndex]);
    }
    var bars = shadow.querySelectorAll(".atlyn-bar");
    if (buttons.length === 0) {
      for (var barIndex = 0; barIndex < bars.length; barIndex += 1) {
        focusTargets.push(bars[barIndex]);
      }
    }
    var accessibleTable = shadow.querySelector(".atlyn-accessible-table");
    if (accessibleTable) {
      focusTargets.push(accessibleTable);
    }
    var chartScroll = shadow.querySelector(".atlyn-chart-scroll");
    focusTargets.forEach(function (target) {
      var beforeTop = funnel ? funnel.scrollTop : 0;
      var beforeLeft = funnel ? funnel.scrollLeft : 0;
      var beforeChartScroll = chartScroll ? chartScroll.scrollTop : 0;
      var beforeBox = boxOf(target);
      var wasFullyVisible = beforeBox.left >= rootBox.left - EPSILON &&
        beforeBox.top >= rootBox.top - EPSILON &&
        beforeBox.right <= rootBox.right + EPSILON &&
        beforeBox.bottom <= rootBox.bottom + EPSILON;
      target.focus();
      var style = getComputedStyle(target);
      var ring = (parseFloat(style.outlineWidth) || 0) + (parseFloat(style.outlineOffset) || 0);
      var box = boxOf(target);
      var ringBox = {
        left: round(box.left - ring),
        top: round(box.top - ring),
        right: round(box.right + ring),
        bottom: round(box.bottom + ring)
      };
      var scroller = scrollsBetween(target, mount);
      focusChecks.push({
        element: describe(target),
        focused: shadow.activeElement === target,
        // Focus is allowed to scroll a region into view, and the accessible table is
        // meant to expand when it takes focus. Only a scroll triggered by focusing an
        // element that was already fully visible and did not change size is a defect.
        wasFullyVisible: wasFullyVisible,
        resizedOnFocus: Math.abs(beforeBox.height - box.height) > EPSILON ||
          Math.abs(beforeBox.width - box.width) > EPSILON,
        scrolledRootBy: {
          top: round((funnel ? funnel.scrollTop : 0) - beforeTop),
          left: round((funnel ? funnel.scrollLeft : 0) - beforeLeft)
        },
        scrolledChartBy: round((chartScroll ? chartScroll.scrollTop : 0) - beforeChartScroll),
        ringEscapesRoot: !scroller && (
          ringBox.left < rootBox.left - EPSILON ||
          ringBox.top < rootBox.top - EPSILON ||
          ringBox.right > rootBox.right + EPSILON ||
          ringBox.bottom > rootBox.bottom + EPSILON
        ),
        insideScroller: scroller
      });
      if (funnel) {
        funnel.scrollTop = 0;
        funnel.scrollLeft = 0;
      }
    });
    report.focusChecks = focusChecks;

    // Focus must survive a re-render, otherwise keyboard users lose their place every
    // time Power BI pushes an update. document.activeElement resolves to the shadow
    // host, so a naive activeElement check silently fails here.
    var liveTargets = shadow.querySelectorAll(".atlyn-stage-button");
    if (liveTargets.length === 0) {
      liveTargets = shadow.querySelectorAll(".atlyn-bar");
    }
    if (liveTargets.length > 1) {
      liveTargets[1].focus();
      var focusedKey = liveTargets[1].getAttribute("data-stage-key");
      harness.update({});
      var restored = shadow.activeElement;
      report.focusRestore = {
        requestedKey: focusedKey,
        restoredKey: restored && restored.getAttribute ? restored.getAttribute("data-stage-key") : null,
        restoredElement: restored ? describe(restored) : null
      };
    } else {
      report.focusRestore = null;
    }
  };

  var harness = window.__ATLYN_HARNESS__;
  var report = {
    id: window.__ATLYN_SCENARIO__ ? window.__ATLYN_SCENARIO__.id : "unknown",
    renderState: document.documentElement.getAttribute("data-atlyn-render"),
    renderError: document.documentElement.getAttribute("data-atlyn-error"),
    ok: false
  };

  if (!harness) {
    report.fatal = "harness did not mount";
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
  node.id = "atlyn-probe-results";
  // Built from fragments so this file's own source never matches the marker the
  // Node driver scans for in the dumped DOM.
  node.textContent = "@@ATLYN" + "_PROBE@@" + JSON.stringify(report) + "@@END_ATLYN" + "_PROBE@@";
  document.body.appendChild(node);
})();
