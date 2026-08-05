import powerbi from "powerbi-visuals-api";
import { Visual } from "../src/visual";
import { DataViewLike, ValueColumnsLike } from "../src/model";

const input: DataViewLike = {
  categorical: {
    categories: [{
      source: { roles: { Stage: true }, displayName: "Stage" },
      values: ["Lead", "Won"],
      identity: [{ key: "lead" }, { key: "won" }]
    }],
    values: [{
      source: { roles: { Value: true }, displayName: "Value" },
      values: [100, 25],
      highlights: [100, null]
    }]
  }
};

const makeHost = (): {
  host: Record<string, unknown>;
  selected: jest.Mock;
  started: jest.Mock;
  finished: jest.Mock;
  failed: jest.Mock;
  contextMenu: jest.Mock;
  tooltipShown: jest.Mock;
  tooltipMoved: jest.Mock;
  tooltipHidden: jest.Mock;
  cleared: jest.Mock;
  selectionBuilders: Array<{ withCategory: jest.Mock; withSeries: jest.Mock }>;
} => {
  const selected = jest.fn();
  const started = jest.fn();
  const finished = jest.fn();
  const failed = jest.fn();
  const contextMenu = jest.fn();
  const tooltipShown = jest.fn();
  const tooltipMoved = jest.fn();
  const tooltipHidden = jest.fn();
  const cleared = jest.fn();
  const selectionBuilders: Array<{ withCategory: jest.Mock; withSeries: jest.Mock }> = [];
  const host = {
    locale: "en-US",
    colorPalette: {
      isHighContrast: false,
      foreground: { value: "#111111" },
      background: { value: "#ffffff" }
    },
    createSelectionManager: () => ({
      select: selected,
      clear: cleared,
      showContextMenu: contextMenu
    }),
    createSelectionIdBuilder: () => {
      const builder = {
        withCategory: jest.fn().mockReturnThis(),
        withSeries: jest.fn().mockReturnThis(),
        createSelectionId: () => ({
          key: `${builder.withCategory.mock.calls.length}:${builder.withSeries.mock.calls.length}`
        })
      };
      selectionBuilders.push(builder);
      return builder;
    },
    tooltipService: {
      enabled: jest.fn(() => true),
      show: tooltipShown,
      move: tooltipMoved,
      hide: tooltipHidden
    },
    eventService: {
      renderingStarted: started,
      renderingFinished: finished,
      renderingFailed: failed
    }
  };
  return {
    host,
    selected,
    started,
    finished,
    failed,
    contextMenu,
    tooltipShown,
    tooltipMoved,
    tooltipHidden,
    cleared,
    selectionBuilders
  };
};

describe("Atlyn Funnel visual lifecycle and interactions", () => {
  test("renders ordered accessible metrics and emits rendering events", () => {
    const element = document.createElement("div");
    document.body.appendChild(element);
    const mocks = makeHost();
    const visual = new Visual({ element, host: mocks.host } as never);
    visual.update({ dataViews: [input], viewport: { width: 640, height: 480 } } as never);
    expect(mocks.started).toHaveBeenCalledTimes(1);
    expect(mocks.finished).toHaveBeenCalledTimes(1);
    expect(element.querySelector('[role="list"]')).not.toBeNull();
    expect(element.querySelector('[role="table"]')).not.toBeNull();
    expect(element.textContent).toContain("Overall conversion");
    expect(element.textContent).toContain("Absolute loss");
    expect(element.querySelector(".atlyn-stage-button.atlyn-dimmed")).not.toBeNull();
    visual.update({ dataViews: [input], viewport: { width: 640, height: 480 } } as never);
    expect(mocks.started).toHaveBeenCalledTimes(2);
    expect(mocks.finished).toHaveBeenCalledTimes(2);
    expect(mocks.failed).not.toHaveBeenCalled();
    visual.destroy();
  });

  test("reads persisted formatting metadata, exposes a real formatting model, and renders it", () => {
    const element = document.createElement("div");
    document.body.appendChild(element);
    const mocks = makeHost();
    const visual = new Visual({ element, host: mocks.host } as never);
    visual.update({
      dataViews: [{
        ...input,
        metadata: {
          objects: {
            dataPoint: { fill: { solid: { color: "#d946ef" } } },
            labels: { show: false }
          }
        }
      }],
      viewport: { width: 640, height: 480 }
    } as never);

    const model = visual.getFormattingModel();
    expect(model.cards).toHaveLength(1);
    const card = model.cards[0];
    if (!("groups" in card)) {
      throw new Error("formatting model card must be populated");
    }
    const groups = card.groups;
    if (groups.length !== 2 || !("slices" in groups[0]) || !groups[0].slices || !("slices" in groups[1]) || !groups[1].slices) {
      throw new Error("formatting model groups must be populated");
    }
    const fillSlice = groups[0].slices[0];
    const labelSlice = groups[1].slices[0];
    if (!("control" in fillSlice) || !("control" in labelSlice)) {
      throw new Error("formatting model slices must be populated");
    }
    expect(fillSlice.control.properties.descriptor).toEqual({
      objectName: "dataPoint",
      propertyName: "fill"
    });
    expect(labelSlice.control.properties).toEqual(expect.objectContaining({
      descriptor: {
        objectName: "labels",
        propertyName: "show"
      },
      value: false
    }));
    expect((element.querySelector(".atlyn-funnel") as HTMLElement | null)?.style.getPropertyValue("--atlyn-primary")).toBe("#d946ef");
    expect(element.querySelectorAll(".atlyn-chart-label")).toHaveLength(0);
    expect("enumerateObjectInstances" in visual).toBe(false);
    visual.destroy();
  });

  test("applies measure format strings to rendered values", () => {
    const element = document.createElement("div");
    document.body.appendChild(element);
    const mocks = makeHost();
    const formattedInput: DataViewLike = {
      ...input,
      categorical: {
        ...input.categorical,
        values: input.categorical?.values?.map((column, index) =>
          index === 0
            ? { ...column, source: { ...column.source, objects: { general: { formatString: "$#,0.00" } } } }
            : column
        )
      }
    };
    const visual = new Visual({ element, host: mocks.host } as never);
    visual.update({ dataViews: [formattedInput], viewport: { width: 640, height: 480 } } as never);
    expect(element.textContent).toContain("$100.00");
    visual.destroy();
  });

  test("labels segmented updates as partial instead of claiming complete conversion", () => {
    const element = document.createElement("div");
    document.body.appendChild(element);
    const mocks = makeHost();
    const visual = new Visual({ element, host: mocks.host } as never);
    visual.update({
      dataViews: [input],
      operationKind: powerbi.VisualDataChangeOperationKind.Segment,
      viewport: { width: 640, height: 480 }
    } as never);
    expect(element.textContent).toContain("Partial data");
    expect(mocks.finished).toHaveBeenCalledTimes(1);
    visual.destroy();
  });

  test("rejects unsafe persisted colors without changing the rendered CSS contract", () => {
    const element = document.createElement("div");
    document.body.appendChild(element);
    const mocks = makeHost();
    const visual = new Visual({ element, host: mocks.host } as never);
    visual.update({
      dataViews: [{
        ...input,
        metadata: {
          objects: {
            dataPoint: { fill: { solid: { color: "red; background:url(https://example.invalid)" } } }
          }
        }
      }],
      viewport: { width: 640, height: 480 }
    } as never);
    expect((element.querySelector(".atlyn-funnel") as HTMLElement | null)?.style.getPropertyValue("--atlyn-primary")).toBe("#2563eb");
    visual.destroy();
  });

  test("honors host interaction capability flags", () => {
    const element = document.createElement("div");
    document.body.appendChild(element);
    const mocks = makeHost();
    mocks.host.hostCapabilities = { allowInteractions: false };
    const visual = new Visual({ element, host: mocks.host } as never);
    visual.update({ dataViews: [input], viewport: { width: 640, height: 480 } } as never);
    element.querySelector<HTMLButtonElement>(".atlyn-stage-button")?.click();
    expect(mocks.selected).not.toHaveBeenCalled();
    element.querySelector("svg")?.dispatchEvent(new MouseEvent("contextmenu", {
      bubbles: true,
      clientX: 10,
      clientY: 20
    }));
    element.querySelector("rect")?.dispatchEvent(new Event("pointerenter", { bubbles: true }));
    expect(mocks.contextMenu).not.toHaveBeenCalled();
    expect(mocks.tooltipShown).not.toHaveBeenCalled();
    visual.destroy();
  });

  test("clears host selection from empty chart space", () => {
    const element = document.createElement("div");
    document.body.appendChild(element);
    const mocks = makeHost();
    const visual = new Visual({ element, host: mocks.host } as never);
    visual.update({ dataViews: [input], viewport: { width: 640, height: 480 } } as never);
    element.querySelector("svg")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(mocks.cleared).toHaveBeenCalledTimes(1);
    visual.destroy();
  });

  test("uses an empty selection object for background context menus", () => {
    const element = document.createElement("div");
    document.body.appendChild(element);
    const mocks = makeHost();
    const visual = new Visual({ element, host: mocks.host } as never);
    visual.update({ dataViews: [input], viewport: { width: 640, height: 480 } } as never);
    element.querySelector("svg")?.dispatchEvent(new MouseEvent("contextmenu", {
      bubbles: true,
      clientX: 10,
      clientY: 20
    }));
    expect(mocks.contextMenu).toHaveBeenCalledWith({}, { x: 10, y: 20 });
    visual.destroy();
  });

  test("uses composite group and stage identities for data-point context menus", () => {
    const element = document.createElement("div");
    document.body.appendChild(element);
    const mocks = makeHost();
    const visual = new Visual({ element, host: mocks.host } as never);
    visual.update({
      dataViews: [{
        categorical: {
          categories: [
            {
              source: { roles: { Stage: true }, displayName: "Stage" },
              values: ["Lead", "Lead"]
            },
            {
              source: { roles: { Group: true }, displayName: "Group" },
              values: ["North", "South"]
            }
          ],
          values: [{
            source: { roles: { Value: true }, displayName: "Value" },
            values: [100, 80]
          }]
        }
      }],
      viewport: { width: 640, height: 480 }
    } as never);

    expect(mocks.selectionBuilders).toHaveLength(2);
    expect(mocks.selectionBuilders.every((builder) => Boolean(builder.withCategory))).toBe(true);
    expect(mocks.selectionBuilders[0].withCategory).toHaveBeenCalledTimes(2);
    const firstBar = element.querySelector("rect");
    firstBar?.dispatchEvent(new MouseEvent("contextmenu", {
      bubbles: true,
      clientX: 12,
      clientY: 24
    }));
    expect(mocks.contextMenu).toHaveBeenCalledWith(
      expect.objectContaining({ key: "2:0" }),
      { x: 12, y: 24 }
    );
    visual.destroy();
  });

  test("uses series identities when grouped values contain duplicate stage names", () => {
    const element = document.createElement("div");
    document.body.appendChild(element);
    const mocks = makeHost();
    const values: ValueColumnsLike = [
      {
        source: { roles: { Value: true }, displayName: "Value" },
        values: [100, 25]
      }
    ];
    values.grouped = () => [
      {
        name: "North",
        identity: { key: "north" },
        values: [{ source: { roles: { Value: true }, displayName: "Value" }, values: [100, 25] }]
      },
      {
        name: "South",
        identity: { key: "south" },
        values: [{ source: { roles: { Value: true }, displayName: "Value" }, values: [90, 45] }]
      }
    ];
    const visual = new Visual({ element, host: mocks.host } as never);
    visual.update({
      dataViews: [{
        categorical: {
          categories: [{
            source: { roles: { Stage: true }, displayName: "Stage" },
            values: ["Lead", "Lead"]
          }],
          values
        }
      }],
      viewport: { width: 640, height: 480 }
    } as never);
    expect(mocks.selectionBuilders).toHaveLength(4);
    expect(mocks.selectionBuilders.every((builder) => builder.withSeries.mock.calls.length === 1)).toBe(true);
    expect(new Set(Array.from(element.querySelectorAll<SVGRectElement>("rect")).map((bar) => bar.dataset.stageKey)).size).toBe(4);
    visual.destroy();
  });

  test("combines category and series identity when grouped data also has a group category", () => {
    const element = document.createElement("div");
    document.body.appendChild(element);
    const mocks = makeHost();
    const values: ValueColumnsLike = [{
      source: { roles: { Value: true }, displayName: "Value" },
      values: [100, 25]
    }];
    values.grouped = () => [{
      name: "North",
      identity: { key: "north" },
      values: [{ source: { roles: { Value: true }, displayName: "Value" }, values: [100, 25] }]
    }];
    const visual = new Visual({ element, host: mocks.host } as never);
    visual.update({
      dataViews: [{
        categorical: {
          categories: [
            { source: { roles: { Stage: true }, displayName: "Stage" }, values: ["Lead", "Won"] },
            { source: { roles: { Group: true }, displayName: "Group" }, values: ["North", "North"] }
          ],
          values
        }
      }],
      viewport: { width: 640, height: 480 }
    } as never);
    expect(mocks.selectionBuilders).toHaveLength(2);
    expect(mocks.selectionBuilders.every((builder) => builder.withSeries.mock.calls.length === 1)).toBe(true);
    expect(mocks.selectionBuilders.every((builder) => builder.withCategory.mock.calls.length === 2)).toBe(true);
    visual.destroy();
  });

  test("shows, moves, hides, and long-presses tooltips on stage bars", () => {
    jest.useFakeTimers();
    const element = document.createElement("div");
    document.body.appendChild(element);
    const mocks = makeHost();
    const visual = new Visual({ element, host: mocks.host } as never);
    visual.update({ dataViews: [input], viewport: { width: 640, height: 480 } } as never);
    const bar = element.querySelector("rect");
    expect(bar).not.toBeNull();
    const pointer = (type: string, pointerType: string, x: number, y: number): Event => {
      const event = new Event(type, { bubbles: true });
      Object.defineProperties(event, {
        pointerType: { value: pointerType },
        clientX: { value: x },
        clientY: { value: y }
      });
      return event;
    };
    bar?.dispatchEvent(pointer("pointerenter", "mouse", 10, 20));
    expect(mocks.tooltipShown).toHaveBeenCalled();
    bar?.dispatchEvent(pointer("pointermove", "mouse", 14, 24));
    expect(mocks.tooltipMoved).toHaveBeenCalledWith(expect.objectContaining({
      coordinates: [14, 24],
      isTouchEvent: false
    }));
    bar?.dispatchEvent(pointer("pointerleave", "mouse", 14, 24));
    expect(mocks.tooltipHidden).toHaveBeenCalled();

    bar?.dispatchEvent(pointer("pointerdown", "touch", 30, 40));
    jest.advanceTimersByTime(650);
    expect(mocks.contextMenu).toHaveBeenCalledWith(
      expect.objectContaining({ key: "1:0" }),
      { x: 30, y: 40 }
    );
    bar?.dispatchEvent(pointer("pointerup", "touch", 30, 40));
    visual.destroy();
    jest.useRealTimers();
  });

  test("keeps long ordered funnels scrollable and exposes negative values without positive bars", () => {
    const element = document.createElement("div");
    document.body.appendChild(element);
    const mocks = makeHost();
    const visual = new Visual({ element, host: mocks.host } as never);
    const stages = Array.from({ length: 49 }, (_, index) => `Stage ${index}`);
    visual.update({
      dataViews: [{
        categorical: {
          categories: [{
            source: { roles: { Stage: true }, displayName: "Stage" },
            values: [...stages, "Negative"]
          }],
          values: [{
            source: { roles: { Value: true }, displayName: "Value" },
            values: [...stages.map(() => 100), -5]
          }]
        }
      }],
      viewport: { width: 640, height: 480 }
    } as never);
    const svg = element.querySelector("svg");
    expect(element.querySelector(".atlyn-chart-scroll")).not.toBeNull();
    expect(Number(svg?.getAttribute("height"))).toBeGreaterThan(440);
    expect(element.querySelector('rect[data-value-state="negative"]')?.getAttribute("width")).toBe("0");
    expect(element.querySelector('line[data-value-state="negative"]')).not.toBeNull();
    visual.destroy();
  });

  test("uses host high-contrast colors and correct RTL label geometry", () => {
    const element = document.createElement("div");
    document.body.appendChild(element);
    const mocks = makeHost();
    mocks.host.locale = "ar-SA";
    mocks.host.colorPalette = {
      isHighContrast: true,
      foreground: { value: "#ffff00" },
      background: { value: "#000000" }
    };
    const visual = new Visual({ element, host: mocks.host } as never);
    visual.update({ dataViews: [input], viewport: { width: 640, height: 480 } } as never);
    const root = element.querySelector(".atlyn-funnel") as HTMLElement | null;
    expect(root?.style.getPropertyValue("--atlyn-primary")).toBe("#ffff00");
    expect(root?.getAttribute("dir")).toBe("rtl");
    // text-anchor is resolved against the inline base direction, so in RTL the "end"
    // edge is the left one. Anchoring "start" at the left gutter used to hang every
    // label off the canvas, where the SVG clipped it away.
    expect(element.querySelector(".atlyn-chart-label")?.getAttribute("x")).toBe("6");
    expect(element.querySelector(".atlyn-chart-label")?.getAttribute("text-anchor")).toBe("end");
    visual.destroy();
  });

  test("reports rendering failures instead of a false successful completion", () => {
    const element = document.createElement("div");
    document.body.appendChild(element);
    const mocks = makeHost();
    mocks.host.createSelectionIdBuilder = (): never => {
      throw new Error("selection builder failure");
    };
    const visual = new Visual({ element, host: mocks.host } as never);
    visual.update({ dataViews: [input], viewport: { width: 640, height: 480 } } as never);
    expect(mocks.started).toHaveBeenCalledTimes(1);
    expect(mocks.finished).not.toHaveBeenCalled();
    expect(mocks.failed).toHaveBeenCalledWith(expect.anything(), "selection builder failure");
    visual.destroy();
  });

  test("selects a stage, supports deterministic keyboard order, and destroys cleanly", () => {
    const element = document.createElement("div");
    document.body.appendChild(element);
    const mocks = makeHost();
    const visual = new Visual({ element, host: mocks.host } as never);
    visual.update({ dataViews: [input], viewport: { width: 640, height: 480 } } as never);
    const buttons = element.querySelectorAll<HTMLButtonElement>(".atlyn-stage-button");
    buttons[0].click();
    expect(mocks.selected).toHaveBeenCalled();
    buttons[0].focus();
    buttons[0].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    expect(document.activeElement).toBe(buttons[1]);
    buttons[1].dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    visual.destroy();
    expect(element.childElementCount).toBe(0);
  });

  test("restores stage focus after a host update", () => {
    const element = document.createElement("div");
    document.body.appendChild(element);
    const mocks = makeHost();
    const visual = new Visual({ element, host: mocks.host } as never);
    visual.update({ dataViews: [input], viewport: { width: 640, height: 480 } } as never);
    const initialButton = element.querySelector<HTMLButtonElement>(".atlyn-stage-button");
    const stageKey = initialButton?.dataset.stageKey;
    initialButton?.focus();
    visual.update({ dataViews: [input], viewport: { width: 640, height: 480 } } as never);
    expect((document.activeElement as HTMLElement | null)?.dataset.stageKey).toBe(stageKey);
    visual.destroy();
  });

  test("renders high contrast and compact mobile states without errors", () => {
    const element = document.createElement("div");
    document.body.appendChild(element);
    const mocks = makeHost();
    mocks.host.colorPalette = { isHighContrast: true };
    const visual = new Visual({ element, host: mocks.host } as never);
    visual.update({ dataViews: [input], viewport: { width: 360, height: 240 } } as never);
    expect(element.querySelector(".atlyn-funnel")?.getAttribute("data-high-contrast")).toBe("true");
    expect(element.querySelector(".atlyn-funnel")?.getAttribute("data-compact")).toBe("true");
    visual.update({ dataViews: [input], viewport: { width: 640, height: 480 } } as never);
    expect(element.querySelector(".atlyn-funnel")?.hasAttribute("data-high-contrast")).toBe(true);
    expect(element.querySelector(".atlyn-funnel")?.hasAttribute("data-compact")).toBe(false);
    visual.destroy();
  });

  test("cancels long press on pointercancel and destroy", () => {
    jest.useFakeTimers();
    const element = document.createElement("div");
    document.body.appendChild(element);
    const mocks = makeHost();
    const visual = new Visual({ element, host: mocks.host } as never);
    visual.update({ dataViews: [input], viewport: { width: 640, height: 480 } } as never);
    const button = element.querySelector<HTMLButtonElement>(".atlyn-stage-button");
    expect(button).not.toBeNull();
    const pointerDown = new Event("pointerdown", { bubbles: true }) as PointerEvent;
    Object.defineProperty(pointerDown, "pointerType", { value: "touch" });
    button?.dispatchEvent(pointerDown);
    button?.dispatchEvent(new Event("pointercancel", { bubbles: true }));
    jest.advanceTimersByTime(700);
    expect(mocks.contextMenu).not.toHaveBeenCalled();

    const stalePointerDown = new Event("pointerdown", { bubbles: true }) as PointerEvent;
    Object.defineProperty(stalePointerDown, "pointerType", { value: "touch" });
    button?.dispatchEvent(stalePointerDown);
    visual.update({ dataViews: [input], viewport: { width: 640, height: 480 } } as never);
    jest.advanceTimersByTime(700);
    expect(mocks.contextMenu).not.toHaveBeenCalled();

    const currentButton = element.querySelector<HTMLButtonElement>(".atlyn-stage-button");
    const secondPointerDown = new Event("pointerdown", { bubbles: true }) as PointerEvent;
    Object.defineProperty(secondPointerDown, "pointerType", { value: "touch" });
    currentButton?.dispatchEvent(secondPointerDown);
    visual.destroy();
    jest.advanceTimersByTime(700);
    expect(mocks.contextMenu).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  test("cancels a touch context menu when a stage starts scrolling", () => {
    jest.useFakeTimers();
    const element = document.createElement("div");
    document.body.appendChild(element);
    const mocks = makeHost();
    const visual = new Visual({ element, host: mocks.host } as never);
    visual.update({ dataViews: [input], viewport: { width: 640, height: 480 } } as never);
    const button = element.querySelector<HTMLButtonElement>(".atlyn-stage-button");
    const pointer = (type: string, x: number, y: number): Event => {
      const event = new Event(type, { bubbles: true });
      Object.defineProperties(event, {
        pointerType: { value: "touch" },
        clientX: { value: x },
        clientY: { value: y }
      });
      return event;
    };
    button?.dispatchEvent(pointer("pointerdown", 10, 10));
    button?.dispatchEvent(pointer("pointermove", 10, 24));
    jest.advanceTimersByTime(700);
    expect(mocks.contextMenu).not.toHaveBeenCalled();
    visual.destroy();
    jest.useRealTimers();
  });
});
