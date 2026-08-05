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
// Comments would otherwise be glued onto the following selector by the naive parser.
const declarations = stylesheet.replace(/\/\*[\s\S]*?\*\//g, "");

const ruleBody = (selector: string): string => {
  const pattern = new RegExp(
    `(^|\\})\\s*${selector.replace(/[.[\]"=^$*+?()|{}\\/-]/g, "\\$&")}\\s*\\{([^}]*)\\}`,
    "m"
  );
  const match = pattern.exec(declarations);
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
  [...declarations.matchAll(/([^{}]+)\{([^}]*)\}/g)].map((match) => ({
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
      ".atlyn-accessible-shell",
      ".atlyn-chart",
      ".atlyn-summary h2",
      ".atlyn-summary-intake",
      ".atlyn-summary-metric"
    ]);
  });

  test("the summary never shrinks, and scrolls rather than hiding per-group figures", () => {
    expect(declaration(".atlyn-summary", "flex")).toBe("0 0 auto");
    // One conversion figure is rendered per group, so with many groups the summary can
    // exceed its ceiling. Those figures are data, so they scroll instead of vanishing
    // behind overflow: hidden where nothing could reach them.
    expect(declaration(".atlyn-summary", "overflow")).toBe("auto");
    expect(declaration(".atlyn-summary", "max-height")).toMatch(/%$/);
  });

  test("the root establishes the containing block its positioned child needs", () => {
    // Without this the absolutely positioned accessible table resolves against the
    // initial containing block, so the root's overflow cannot clip it and it does not
    // scroll with the root. It only looks contained because it is a clipped 1px box.
    expect(declaration(".atlyn-funnel", "position")).toBe("relative");
    const absolutes = cssRules().filter((rule) => /position\s*:\s*(absolute|fixed)/.test(rule.body));
    expect(absolutes.map((rule) => rule.selector)).toEqual([".atlyn-accessible-shell"]);
  });

  test("the one-pixel visually hidden box is the wrapper, never the table itself", () => {
    // A <table> refuses any width below its min-content width, so a table styled as
    // "1px" keeps a full-size box in the layout that only paint-time clipping hides -
    // and that box lands in the root's scrollable overflow.
    expect(declaration(".atlyn-accessible-shell", "width")).toBe("1px");
    expect(declaration(".atlyn-accessible-shell", "height")).toBe("1px");
    expect(declaration(".atlyn-accessible-shell", "overflow")).toBe("hidden");
    expect(declaration(".atlyn-accessible-table", "width")).not.toBe("1px");
    expect(declaration(".atlyn-accessible-table", "height")).toBeUndefined();
    expect(declaration(".atlyn-accessible-table", "position")).toBeUndefined();
    // On focus it returns to flow, and it must stay reachable rather than be clipped.
    expect(declaration(".atlyn-accessible-shell:focus-within", "position")).toBe("static");
    expect(declaration(".atlyn-accessible-shell:focus-within", "overflow")).toBe("auto");
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

  test("wraps the accessible table so the clipped box is not the table itself", () => {
    const { element, visual } = mount();
    render(visual, 1280, 620);
    const shell = element.querySelector(".atlyn-accessible-shell");
    const table = element.querySelector(".atlyn-accessible-table");
    expect(shell).not.toBeNull();
    expect(table?.parentElement).toBe(shell);
    expect(table?.getAttribute("role")).toBe("table");
    expect(table?.getAttribute("tabindex")).toBe("0");
    // Every stage is still in the table, whatever the tile drops on screen.
    render(visual, 160, 80);
    expect(element.querySelectorAll(".atlyn-accessible-table tbody tr")).toHaveLength(stages.length);
    visual.destroy();
  });

  test("renders one conversion figure per group so many groups need a scroll route", () => {
    const groups = ["North America", "EMEA", "APAC", "LATAM"];
    const stage: string[] = [];
    const group: string[] = [];
    const value: number[] = [];
    groups.forEach((segment, segmentIndex) => {
      stages.forEach((label, stageIndex) => {
        stage.push(label);
        group.push(segment);
        value.push(Math.round((100000 - segmentIndex * 9000) * Math.pow(0.8, stageIndex)));
      });
    });
    const { element, visual } = mount();
    visual.update({
      dataViews: [{
        categorical: {
          categories: [
            {
              source: { roles: { Stage: true }, displayName: "Stage" },
              values: stage,
              identity: stage.map((label, index) => ({ key: `${label}:${index}` }))
            },
            {
              source: { roles: { Group: true }, displayName: "Segment" },
              values: group,
              identity: group.map((label, index) => ({ key: `${label}:${index}` }))
            }
          ],
          values: [{
            source: { roles: { Value: true }, displayName: "Value" },
            values: value
          }]
        }
      }],
      viewport: { width: 398, height: 298 }
    } as never);
    expect(element.querySelectorAll(".atlyn-summary-metric")).toHaveLength(groups.length);
    visual.destroy();
  });
});

describe("chart geometry adapts to the tile", () => {  test("the canvas tracks the real tile width so the drawing is not scaled down", () => {
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
