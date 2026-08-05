/*
 * Small-tile layout regressions.
 *
 * Power BI hands a custom visual a fixed box inside a shadow root and clips whatever
 * does not fit. These tests pin the two things that made the funnel disappear on a
 * small tile: stacked regions that could not shrink, and chrome that grew as the tile
 * narrowed. Asserting that a stylesheet exists would pass on the broken layout, so
 * every rule here is checked against the declaration that actually ships.
 */
import { resolveLayout, Visual } from "../src/visual";
import { DataViewLike } from "../src/model";

const fs = require("node:fs") as typeof import("node:fs");

const stylesheet = fs.readFileSync("src/style.css", "utf8");
/*
 * Comments are stripped before any rule is parsed. The parser below treats everything
 * between `}` and `{` as the selector, so a comment sitting above a rule would be folded
 * into that rule's selector and every assertion about it would silently describe the
 * wrong thing.
 */
const stylesheetRules = stylesheet.replace(/\/\*[\s\S]*?\*\//g, "");

const ruleBody = (selector: string): string => {
  const pattern = new RegExp(
    `(^|\\})\\s*${selector.replace(/[.[\]"=^$*+?()|{}\\/-]/g, "\\$&")}\\s*\\{([^}]*)\\}`,
    "m"
  );
  const match = pattern.exec(stylesheetRules);
  if (!match) {
    throw new Error(`src/style.css declares no rule for ${selector}`);
  }
  return match[2];
};

const declaration = (selector: string, property: string): string | undefined => {
  const pattern = new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`, "m");
  const match = pattern.exec(ruleBody(selector));
  return match ? match[1].trim() : undefined;
};

const cssRules = (): Array<{ selector: string; body: string }> =>
  [...stylesheetRules.matchAll(/([^{}]+)\{([^}]*)\}/g)].map((match) => ({
    selector: match[1].trim(),
    body: match[2]
  }));

const stages = ["Visits", "Tour", "Trial", "Demo", "Proposal", "Won"];
const values = [128400, 74900, 31250, 12880, 6240, 2860];

const dataView: DataViewLike = {
  categorical: {
    categories: [{
      source: { roles: { Stage: true }, displayName: "Stage" },
      values: stages,
      identity: stages.map((stage) => ({ key: stage }))
    }],
    values: [{
      source: { roles: { Value: true }, displayName: "Value" },
      values
    }]
  }
};

const makeHost = (): Record<string, unknown> => ({
  locale: "en-US",
  colorPalette: { isHighContrast: false, foreground: { value: "#111111" }, background: { value: "#ffffff" } },
  createSelectionManager: () => ({ select: jest.fn(), clear: jest.fn(), showContextMenu: jest.fn() }),
  createSelectionIdBuilder: () => {
    const builder = {
      withCategory: jest.fn().mockReturnThis(),
      withSeries: jest.fn().mockReturnThis(),
      createSelectionId: () => ({ key: "selection" })
    };
    return builder;
  },
  tooltipService: { enabled: (): boolean => true, show: jest.fn(), move: jest.fn(), hide: jest.fn() },
  eventService: { renderingStarted: jest.fn(), renderingFinished: jest.fn(), renderingFailed: jest.fn() }
});

const mount = (): { element: HTMLDivElement; shadow: ShadowRoot; visual: Visual } => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  // Power BI renders custom visuals inside a shadow root, which is why the visual
  // cannot rely on document.activeElement.
  const shadow = container.attachShadow({ mode: "open" });
  const element = document.createElement("div");
  shadow.appendChild(element);
  const visual = new Visual({ element, host: makeHost() } as never);
  return { element, shadow, visual };
};

const render = (visual: Visual, width: number, height: number): void => {
  visual.update({ dataViews: [dataView], viewport: { width, height } } as never);
};

describe("stylesheet layout contract", () => {
  test("the visual root is a flex column that is allowed to shrink", () => {
    expect(declaration(".atlyn-funnel", "display")).toBe("flex");
    expect(declaration(".atlyn-funnel", "flex-direction")).toBe("column");
  });

  test("the visual root declares no minimum size floor", () => {
    // A floor here makes the root bigger than the tile Power BI gives it, and the
    // tile clips, so the overflow is lost with no scrollbar and no keyboard route.
    expect(declaration(".atlyn-funnel", "min-height")).toBe("0");
    expect(declaration(".atlyn-funnel", "min-width")).toBe("0");
  });

  test("every stacked region can shrink so none can push the funnel out of view", () => {
    [
      ".atlyn-summary",
      ".atlyn-warnings",
      ".atlyn-chart",
      ".atlyn-chart-scroll",
      ".atlyn-stage-list",
      ".atlyn-empty"
    ].forEach((selector) => {
      expect([selector, declaration(selector, "min-height")]).toEqual([selector, "0"]);
    });
  });

  test("the chart carries no fixed height floor at any tile size", () => {
    const floors = cssRules()
      .filter((rule) => rule.selector.includes(".atlyn-chart"))
      .flatMap((rule) =>
        [...rule.body.matchAll(/min-height\s*:\s*([^;]+)/g)].map((match) => ({
          selector: rule.selector,
          value: match[1].trim()
        }))
      );
    expect(floors.length).toBeGreaterThan(0);
    expect(floors.filter((entry) => entry.value !== "0")).toEqual([]);
  });

  test("text-overflow: ellipsis is always paired with white-space: nowrap", () => {
    // Ellipsis only truncates a single line. Without nowrap the rule silently does
    // nothing and the text wraps to three lines instead.
    const unpaired = cssRules()
      .filter((rule) => /text-overflow\s*:\s*ellipsis/.test(rule.body))
      .filter((rule) => !/white-space\s*:\s*(nowrap|pre)/.test(rule.body));
    expect(unpaired.map((rule) => rule.selector)).toEqual([]);
  });

  test("regions that clip their overflow are the deliberately hidden ones", () => {
    const clipping = cssRules()
      .filter((rule) => /overflow\s*:\s*hidden/.test(rule.body))
      .map((rule) => rule.selector);
    expect(clipping.sort()).toEqual([
      ".atlyn-accessible-table-scroll",
      ".atlyn-chart",
      ".atlyn-summary",
      ".atlyn-summary h2",
      ".atlyn-summary-intake",
      ".atlyn-summary-metric"
    ]);
  });

  test("the summary never shrinks, because a shrunk summary clips its own text", () => {
    expect(declaration(".atlyn-summary", "flex")).toBe("0 0 auto");
  });
});

describe("viewport-derived layout", () => {
  test("classifies tiles from the host viewport rather than the report page", () => {
    expect(resolveLayout(1280, 620)).toEqual(expect.objectContaining({
      narrow: false,
      short: false,
      tiny: false,
      showTitle: true,
      showStageList: true,
      verboseStageText: true
    }));
    expect(resolveLayout(398, 298)).toEqual(expect.objectContaining({
      compact: true,
      narrow: false,
      short: false,
      tiny: false,
      showStageList: true,
      verboseStageText: false
    }));
    expect(resolveLayout(258, 198)).toEqual(expect.objectContaining({
      narrow: true,
      short: true,
      tiny: false,
      showTitle: false,
      showIntake: false,
      showStageList: false
    }));
    expect(resolveLayout(178, 138)).toEqual(expect.objectContaining({ tiny: true, showStageList: false }));
    expect(resolveLayout(160, 80)).toEqual(expect.objectContaining({ tiny: true, showStageList: false }));
  });
});

describe("chrome degrades before data", () => {
  test("keeps every region on a full-size tile", () => {
    const { element, visual } = mount();
    render(visual, 1280, 620);
    expect(element.querySelector(".atlyn-summary h2")).not.toBeNull();
    expect(element.querySelector(".atlyn-summary-intake")).not.toBeNull();
    expect(element.querySelector(".atlyn-stage-list")).not.toBeNull();
    expect(element.querySelectorAll(".atlyn-bar")).toHaveLength(stages.length);
    visual.destroy();
  });

  test("drops the heading, the intake figure and the stage list on a small tile, never the funnel", () => {
    const { element, visual } = mount();
    render(visual, 258, 198);
    expect(element.querySelector(".atlyn-summary h2")).toBeNull();
    expect(element.querySelector(".atlyn-summary-intake")).toBeNull();
    expect(element.querySelector(".atlyn-stage-list")).toBeNull();
    // The data survives: every stage still has a bar and the accessible table.
    expect(element.querySelectorAll(".atlyn-bar")).toHaveLength(stages.length);
    expect(element.querySelectorAll(".atlyn-accessible-table tbody tr")).toHaveLength(stages.length);
    expect(element.querySelector(".atlyn-summary-metric")?.textContent).toContain("Overall conversion");
    visual.destroy();
  });

  test("keeps the diagnostics panel on a small tile", () => {
    const { element, visual } = mount();
    visual.update({
      dataViews: [{
        categorical: {
          categories: dataView.categorical?.categories,
          values: [{
            source: { roles: { Value: true }, displayName: "Value" },
            values: [128400, 74900, null, 12880, 6240, 2860]
          }]
        }
      }],
      viewport: { width: 258, height: 198 }
    } as never);
    expect(element.querySelector(".atlyn-warnings")).not.toBeNull();
    expect(element.querySelectorAll(".atlyn-bar")).toHaveLength(stages.length);
    visual.destroy();
  });

  test("shortens the stage sentence instead of letting it wrap to six lines", () => {
    const { element, visual } = mount();
    render(visual, 398, 298);
    const button = element.querySelector(".atlyn-stage-button");
    expect(button?.textContent).not.toContain("Absolute loss");
    // Nothing is lost: the accessible name still carries every figure.
    expect(button?.getAttribute("aria-label")).toContain("Absolute loss");
    visual.destroy();
  });

  test("sets the size attributes the stylesheet keys its chrome rules off", () => {
    const { element, visual } = mount();
    render(visual, 258, 198);
    const root = element.querySelector(".atlyn-funnel");
    expect(root?.getAttribute("data-narrow")).toBe("true");
    expect(root?.getAttribute("data-short")).toBe("true");
    expect(root?.getAttribute("data-tiny")).toBeNull();
    render(visual, 160, 80);
    expect(element.querySelector(".atlyn-funnel")?.getAttribute("data-tiny")).toBe("true");
    visual.destroy();
  });
});

describe("chart geometry adapts to the tile", () => {
  test("the canvas tracks the real tile width so the drawing is not scaled down", () => {
    const { element, visual } = mount();
    render(visual, 258, 198);
    const svg = element.querySelector("svg");
    // A viewBox wider than the CSS box makes the browser scale every label below
    // legibility instead of simply drawing a smaller funnel.
    expect(svg?.getAttribute("viewBox")?.split(" ")[2]).toBe("246");
    visual.destroy();
  });

  test("the row height shrinks on a short tile so all six stages stay on the canvas", () => {
    const { element, visual } = mount();
    render(visual, 1280, 620);
    const tall = Number(element.querySelector("svg")?.getAttribute("height"));
    render(visual, 258, 198);
    const short = Number(element.querySelector("svg")?.getAttribute("height"));
    expect(tall).toBe(stages.length * 42 + 12);
    expect(short).toBe(stages.length * 20 + 12);
    expect(short).toBeLessThan(tall);
    visual.destroy();
  });

  test("drops the chart labels only once the tile is too small to hold them", () => {
    const { element, visual } = mount();
    render(visual, 398, 298);
    expect(element.querySelectorAll(".atlyn-chart-label").length).toBe(stages.length);
    render(visual, 160, 80);
    expect(element.querySelectorAll(".atlyn-chart-label").length).toBe(0);
    visual.destroy();
  });

  test("bars stay inside the canvas at the smallest supported tile", () => {
    const { element, visual } = mount();
    render(visual, 160, 80);
    const canvasWidth = Number(element.querySelector("svg")?.getAttribute("viewBox")?.split(" ")[2]);
    element.querySelectorAll("rect.atlyn-bar").forEach((bar) => {
      const x = Number(bar.getAttribute("x"));
      const width = Number(bar.getAttribute("width"));
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x + width).toBeLessThanOrEqual(canvasWidth);
    });
    visual.destroy();
  });
});

describe("keyboard focus inside a shadow root", () => {
  test("restores focus to the same stage after a re-render", () => {
    const { element, shadow, visual } = mount();
    render(visual, 1280, 620);
    const button = element.querySelectorAll<HTMLButtonElement>(".atlyn-stage-button")[2];
    const stageKey = button.dataset.stageKey;
    button.focus();
    // Power BI's shadow root retargets document.activeElement to the host, so a
    // visual that reads document.activeElement never sees its own focused control.
    expect(document.activeElement).not.toBe(button);
    expect(shadow.activeElement).toBe(button);

    render(visual, 1280, 620);
    expect(shadow.activeElement?.getAttribute("data-stage-key")).toBe(stageKey);
    visual.destroy();
  });

  test("restores focus onto a chart bar when the stage list has been dropped", () => {
    const { element, shadow, visual } = mount();
    render(visual, 258, 198);
    const bar = element.querySelectorAll<SVGRectElement>("rect.atlyn-bar")[1];
    const stageKey = bar.getAttribute("data-stage-key");
    bar.focus();
    render(visual, 258, 198);
    expect(shadow.activeElement?.getAttribute("data-stage-key")).toBe(stageKey);
    visual.destroy();
  });

  test("arrow keys still move between stages when the stage list has been dropped", () => {
    const { element, shadow, visual } = mount();
    render(visual, 258, 198);
    const bars = element.querySelectorAll<SVGRectElement>("rect.atlyn-bar");
    bars[0].focus();
    bars[0].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    expect(shadow.activeElement).toBe(bars[1]);
    bars[1].dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
    expect(shadow.activeElement).toBe(bars[bars.length - 1]);
    visual.destroy();
  });
});
