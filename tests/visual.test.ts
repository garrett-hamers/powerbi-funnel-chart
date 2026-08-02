import { Visual } from "../src/visual";
import { DataViewLike } from "../src/model";

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
  contextMenu: jest.Mock;
} => {
  const selected = jest.fn();
  const started = jest.fn();
  const finished = jest.fn();
  const contextMenu = jest.fn();
  const host = {
    locale: "en-US",
    colorPalette: { isHighContrast: false },
    createSelectionManager: () => ({
      select: selected,
      clear: jest.fn(),
      showContextMenu: contextMenu
    }),
    createSelectionIdBuilder: () => {
      const builder = {
        withCategory: jest.fn().mockReturnThis(),
        createSelectionId: () => ({ key: "stage" })
      };
      return builder;
    },
    tooltipService: {
      show: jest.fn(),
      hide: jest.fn()
    },
    eventService: {
      renderingStarted: started,
      renderingFinished: finished,
      renderingFailed: jest.fn()
    }
  };
  return { host, selected, started, finished, contextMenu };
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
});
