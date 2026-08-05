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

  var containingBlockElementOf = function (element) {
    var node = parentOf(element);
    while (node) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        var style = getComputedStyle(node);
        if (
          style.position !== "static" ||
          (style.transform && style.transform !== "none") ||
          (style.filter && style.filter !== "none") ||
          (style.perspective && style.perspective !== "none") ||
          (style.contain && /paint|layout|strict|content/.test(style.contain))
        ) {
          return node;
        }
      }
      node = node.nodeType === 11 ? node.host : parentOf(node);
    }
    // The initial containing block: nothing inside the visual contains this box.
    return null;
  };

  /*
   * The nearest ancestor that genuinely scrolls this element into reach.
   *
   * DOM ancestry alone is not containment. A scroll container only clips an
   * out-of-flow box when that box's containing block is the scroller or lives inside
   * it; otherwise the box is positioned against something further up and the scroller
   * neither clips it nor can scroll to it. Treating every ancestor scroller as
   * containment made this walk blind to exactly that case — and since the visual root
   * itself declares `overflow: auto`, every element had such an ancestor, so no escape
   * could ever be reported.
   */
  /*
   * Retained only for the informational `insideScroller` field on focus checks. It uses
   * the same corrected predicate as exemptingAncestor() in
   * scripts/layout-probe-cases.cjs — a declared overflow is not a scroll box unless the
   * element actually has a non-zero client *area* — so the two cannot report different
   * answers. Zero on either axis paints nothing and therefore contains nothing.
   */
  var scrollsBetween = function (element, stopAt) {
    var measured = ancestorChainOf(element, stopAt);
    for (var index = 0; index < measured.chain.length; index += 1) {
      var entry = measured.chain[index];
      var scrolls = /(auto|scroll)/.test(entry.overflowX) || /(auto|scroll)/.test(entry.overflowY);
      if (!scrolls || entry.clientWidth <= 0 || entry.clientHeight <= 0) {
        continue;
      }
      if (!measured.outOfFlow || entry.isContainingBlock || entry.containsContainingBlock) {
        return entry.element;
      }
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

  /*
   * Sticky elements, measured wherever the page currently is.
   *
   * The computed position is carried alongside the offset because a sticky rule that
   * has been dropped, or overridden to static, still reports a z-index: comparing
   * stacking order without checking that the element is positioned reads an order out
   * of a context that does not exist. There is nothing sticky in this visual today, so
   * this returns an empty list; the rules exist so that stops being true silently.
   */
  var stickyOffsets = function (mount) {
    var found = [];
    var visit = function (element) {
      var style = getComputedStyle(element);
      if (style.position === "sticky") {
        var rect = element.getBoundingClientRect();
        found.push({
          element: element.tagName.toLowerCase() +
            (element.getAttribute("class") ? "." + String(element.getAttribute("class")).trim().split(/\s+/).join(".") : ""),
          computedPosition: style.position,
          zIndexSpecified: style.zIndex,
          top: Math.round(rect.top * 100) / 100,
          height: Math.round(rect.height * 100) / 100
        });
      }
      var children = element.children || [];
      for (var index = 0; index < children.length; index += 1) {
        visit(children[index]);
      }
    };
    visit(mount);
    return found;
  };

  /*
   * The measured ancestor chain between an element and the visual root.
   *
   * The escape walk used to decide containment in-page, which made the decision
   * untestable and hid a wrong predicate: it asked whether an ancestor *declared* a
   * scrolling overflow, when the question is whether that ancestor actually clips. Those
   * come apart. A `display: table` box declaring `overflow: auto` computes to `visible`,
   * so reading the computed value already handles that case — but a non-replaced inline
   * box computes `overflow: auto` while having no principal box at all, reports a 0x0
   * client area, and clips nothing. Measured here, decided in
   * scripts/layout-probe-cases.cjs, so the rule can be driven by a test.
   */
  var ancestorChainOf = function (element, stopAt) {
    var elementStyle = getComputedStyle(element);
    var outOfFlow = elementStyle.position === "absolute" || elementStyle.position === "fixed";
    var containingBlock = outOfFlow ? containingBlockElementOf(element) : null;
    var chain = [];
    var node = parentOf(element);
    while (node && node !== stopAt) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        var style = getComputedStyle(node);
        chain.push({
          element: describe(node),
          overflowX: style.overflowX,
          overflowY: style.overflowY,
          display: style.display,
          // A box with no client area has no scroll box and cannot clip, however its
          // overflow computes.
          clientWidth: node.clientWidth,
          clientHeight: node.clientHeight,
          /*
           * Recorded so the rule can be tested against the case that disproves the
           * tempting predicate, and never so the rule can use it. A scroll container
           * whose content currently fits reports scrollHeight === clientHeight and
           * still clips; requiring scroll geometry here would start reporting escapes
           * that are genuinely contained.
           */
          scrollWidth: node.scrollWidth,
          scrollHeight: node.scrollHeight,
          isContainingBlock: Boolean(containingBlock) && node === containingBlock,
          containsContainingBlock: Boolean(containingBlock) && node.contains(containingBlock)
        });
      }
      node = parentOf(node);
    }
    return { outOfFlow: outOfFlow, chain: chain };
  };

  var escapeOf = function (element, frame) {
    var box = boxOf(element);
    var overLeft = round(frame.left - box.left);
    var overTop = round(frame.top - box.top);
    var overRight = round(box.right - frame.right);
    var overBottom = round(box.bottom - frame.bottom);
    if (overLeft <= EPSILON && overTop <= EPSILON && overRight <= EPSILON && overBottom <= EPSILON) {
      return null;
    }
    return {
      element: describe(element),
      box: box,
      overflowLeft: Math.max(0, overLeft),
      overflowTop: Math.max(0, overTop),
      overflowRight: Math.max(0, overRight),
      overflowBottom: Math.max(0, overBottom)
    };
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

    var inAccessibleTable = function (element) {
      var node = element;
      while (node && node !== mount) {
        if (
          node.nodeType === Node.ELEMENT_NODE &&
          node.classList &&
          (node.classList.contains("atlyn-accessible-table") ||
            node.classList.contains("atlyn-accessible-table-scroll"))
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

      /*
       * Geometry first, containment second. The walk records every box that has left
       * the tile along with the measured chain that might excuse it, and the rules
       * module decides. Deciding here is what previously let a wrong predicate silently
       * exempt boxes and report nothing.
       */
      var escape = escapeOf(element, rootBox);
      if (escape) {
        var chain = ancestorChainOf(element, mount);
        escape.outOfFlow = chain.outOfFlow;
        escape.chain = chain.chain;
        escapes.push(escape);
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
    // Only a focus target where it is a tab stop: on a tile too small to open it the
    // table is deliberately left out of the tab order, so demanding that it take focus
    // would report the accessible choice as a defect.
    if (accessibleTable && accessibleTable.hasAttribute("tabindex")) {
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
    /*
     * Everything above is measured at rest, with nothing scrolled and nothing focused.
     * That is only one of the states the visual is actually used in, and it is the one
     * state where a defect is least likely to show: content scrolled past the fold, and
     * content that only enters the flow on focus, are invisible to it.
     *
     * The three passes below enter those states deliberately.
     */

    // A cheap re-walk that answers only "does anything escape the tile from here",
    // which is the assertion that has to hold in every state, not just at rest.
    var escapesNow = function () {
      var found = [];
      // Recomputed on every call: focusing or scrolling shifts viewport-relative
      // coordinates, so a root box captured earlier would make every box look displaced.
      var liveRoot = boxOf(mount);
      walk(mount, function (element) {
        if (element === mount) {
          return;
        }
        var style = getComputedStyle(element);
        if (style.display === "none" || style.visibility === "hidden") {
          return;
        }
        var escape = escapeOf(element, liveRoot);
        if (escape) {
          var chain = ancestorChainOf(element, mount);
          escape.outOfFlow = chain.outOfFlow;
          escape.chain = chain.chain;
          found.push(escape);
        }
      });
      return found;
    };

    /*
     * The collapse walk, re-run wherever the visual currently is. It only ever ran at
     * rest, so a region that dies when something is focused was structurally invisible
     * to it: `collapsed` came back empty while the funnel was being crushed to nothing.
     */
    var collapsedNow = function () {
      var found = [];
      walk(mount, function (element) {
        if (element === mount) {
          return;
        }
        var style = getComputedStyle(element);
        if (style.display === "none" || style.visibility === "hidden") {
          return;
        }
        var box = boxOf(element);
        var hasContent = Boolean((element.textContent || "").trim()) ||
          element.tagName.toLowerCase() === "svg";
        if (
          hasContent &&
          element.getAttribute("aria-hidden") !== "true" &&
          !inAccessibleTable(element) &&
          (box.height < COLLAPSE_PX || box.width < COLLAPSE_PX)
        ) {
          found.push({ element: describe(element), box: box });
        }
      });
      return found;
    };

    /*
     * Pass 1: positioning triage.
     *
     * An absolutely positioned box whose containing block sits above the visual root
     * belongs to the page, not to the tile, and the root's overflow does not clip it —
     * so the escape walk's "is there a scrolling ancestor" test wrongly treats it as
     * contained. z-index is recorded with the computed position beside it because
     * getComputedStyle().zIndex returns the specified value regardless of whether the
     * element is positioned at all, so a stacking order read without checking position
     * describes a context that may not exist.
     */
    var establishesContainingBlock = function (element) {
      if (!element || element.nodeType !== Node.ELEMENT_NODE) {
        return false;
      }
      var style = getComputedStyle(element);
      if (style.position !== "static") {
        return true;
      }
      if (style.transform && style.transform !== "none") {
        return true;
      }
      if (style.filter && style.filter !== "none") {
        return true;
      }
      if (style.perspective && style.perspective !== "none") {
        return true;
      }
      if (style.contain && /paint|layout|strict|content/.test(style.contain)) {
        return true;
      }
      return false;
    };

    var positioned = [];
    var collectPositioned = function () {
      var entries = [];
      walk(mount, function (element) {
        if (element === mount) {
          return;
        }
        var style = getComputedStyle(element);
        if (style.position === "static" || style.position === "relative") {
          return;
        }
        var node = parentOf(element);
        var containingBlockElement = null;
        while (node) {
          if (node.nodeType === Node.ELEMENT_NODE && establishesContainingBlock(node)) {
            containingBlockElement = node;
            break;
          }
          node = node.nodeType === 11 ? node.host : parentOf(node);
        }
        entries.push({
          element: describe(element),
          position: style.position,
          zIndexSpecified: style.zIndex,
          // Only meaningful when the element is positioned; recorded together so a rule
          // can refuse to compare stacking order in a context that does not exist.
          participatesInStacking: style.position !== "static",
          containingBlock: containingBlockElement ? describe(containingBlockElement) : null,
          /*
           * The containing block has to be the visual root or something inside it. If it
           * is not, the box belongs to the page: the root cannot clip it and the root's
           * scrolling cannot move it, so the escape walk's "has a scrolling ancestor"
           * test — true for in-flow boxes — wrongly treats it as contained.
           */
          containingBlockInsideRoot: Boolean(containingBlockElement) &&
            (containingBlockElement === mount || mount.contains(containingBlockElement)),
          box: boxOf(element)
        });
      });
      return entries;
    };
    positioned = collectPositioned();
    report.positioning = {
      rootPosition: getComputedStyle(mount).position,
      funnelPosition: funnel ? getComputedStyle(funnel).position : null,
      counts: {
        sticky: positioned.filter(function (entry) { return entry.position === "sticky"; }).length,
        fixed: positioned.filter(function (entry) { return entry.position === "fixed"; }).length,
        absolute: positioned.filter(function (entry) { return entry.position === "absolute"; }).length
      },
      elements: positioned
    };

    /*
     * Pass 2: scroll every scrollable region to top, middle and maximum, re-running the
     * escape walk at each offset. A defect halfway down a scroll region is invisible at
     * rest, and a region that quietly stops overflowing makes every scroll-time
     * assertion pass vacuously, so the sweep records what it found rather than skipping.
     */
    var sweep = [];
    scrollContainers.forEach(function (container) {
      var element = null;
      walk(mount, function (candidate) {
        if (!element && describe(candidate) === container.element) {
          element = candidate;
        }
      });
      if (!element) {
        return;
      }
      var maxScrollTop = Math.max(0, element.scrollHeight - element.clientHeight);
      var offsets = maxScrollTop > 0
        ? [0, Math.round(maxScrollTop / 2), maxScrollTop]
        : [0];
      var measured = [];
      offsets.forEach(function (offset) {
        element.scrollTop = offset;
        measured.push({
          requested: offset,
          applied: round(element.scrollTop),
          escapes: escapesNow(),
          stickyOffsets: stickyOffsets(mount)
        });
      });
      element.scrollTop = 0;
      sweep.push({
        element: container.element,
        overflows: maxScrollTop > 0,
        maxScrollTop: maxScrollTop,
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
        offsets: measured
      });
    });
    report.scrollSweep = sweep;

    /*
     * Pass 3: the focused state.
     *
     * The accessible table only enters the flow on focus, so at rest every measurement
     * looks perfect while the state a keyboard user actually reaches is unmeasured. The
     * rule is the same one that governs the rest of the visual: degrade chrome, never
     * data. Opening a table must not cost the funnel.
     *
     * If you ever extend this to move nodes around while testing a fix, re-focus after
     * the move: reparenting a focused element blurs it, so the measurement silently
     * describes the unfocused state and reads as the fix having failed.
     */
    var focusRegion = shadow.querySelector(".atlyn-accessible-table");
    if (focusRegion) {
      var beforeChart = shadow.querySelector(".atlyn-chart-scroll");
      var beforeChartHeight = beforeChart ? boxOf(beforeChart).height : null;
      var beforeStageList = shadow.querySelector(".atlyn-stage-list");
      var beforeStageHeight = beforeStageList ? boxOf(beforeStageList).height : null;
      var rootScrollBefore = funnel ? funnel.scrollTop : 0;

      focusRegion.focus();

      var wrapper = shadow.querySelector(".atlyn-accessible-table-scroll");
      var afterChart = shadow.querySelector(".atlyn-chart-scroll");
      var afterStageList = shadow.querySelector(".atlyn-stage-list");
      report.focusState = {
        focusable: focusRegion.hasAttribute("tabindex"),
        focused: shadow.activeElement === focusRegion,
        expandsAttribute: funnel ? funnel.getAttribute("data-table-expands") : null,
        tableBox: boxOf(focusRegion),
        tableRows: shadow.querySelectorAll(".atlyn-accessible-table tbody tr").length,
        // A <table> cannot be a scroll container: overflow and max-height are ignored on
        // a display: table box. So the element that is supposed to scroll is measured
        // directly rather than assumed to be scrolling.
        scroller: wrapper
          ? {
            element: describe(wrapper),
            display: getComputedStyle(wrapper).display,
            overflowY: getComputedStyle(wrapper).overflowY,
            clientHeight: wrapper.clientHeight,
            scrollHeight: wrapper.scrollHeight,
            isRealScrollContainer: wrapper.scrollHeight > wrapper.clientHeight + 1,
            /*
             * Whether it can actually be scrolled, proven by writing an offset and
             * reading it back rather than inferred from scrollHeight and clientHeight.
             * A box can report overflow and still refuse to scroll, and deriving the
             * answer from the same two numbers that define overflow would only restate
             * the question.
             */
            scrollProof: (function () {
              var before = wrapper.scrollTop;
              wrapper.scrollTop = 9999;
              var reached = wrapper.scrollTop;
              wrapper.scrollTop = before;
              return { requested: 9999, reached: round(reached), moved: reached > 0 };
            })(),
            box: boxOf(wrapper)
          }
          : null,
        chartHeightBefore: beforeChartHeight,
        chartHeightAfter: afterChart ? boxOf(afterChart).height : null,
        stageListHeightBefore: beforeStageHeight,
        stageListHeightAfter: afterStageList ? boxOf(afterStageList).height : null,
        rootScrolledBy: round((funnel ? funnel.scrollTop : 0) - rootScrollBefore),
        rootHiddenY: funnel ? Math.max(0, funnel.scrollHeight - funnel.clientHeight) : 0,
        /*
         * Positioning is re-measured here, not reused from the resting pass. Opening the
         * table flips it from out of flow to in flow, so the two states resolve against
         * different containing blocks: a fix that corrects only one of them is half a
         * fix, and this is the state where the defect was worst.
         */
        positioned: collectPositioned(),
        collapsed: collapsedNow(),
        escapes: escapesNow()
      };
      if (funnel) {
        funnel.scrollTop = 0;
        funnel.scrollLeft = 0;
      }
      focusRegion.blur();
      // Focusing can scroll the document itself, which shifts every viewport-relative
      // coordinate; restore it so nothing measured afterwards is offset.
      window.scrollTo(0, 0);
    } else {
      report.focusState = null;
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
