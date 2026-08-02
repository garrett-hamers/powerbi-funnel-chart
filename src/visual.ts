import powerbi from "powerbi-visuals-api";
import IVisual = powerbi.extensibility.visual.IVisual;
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import EnumerateVisualObjectInstancesOptions = powerbi.EnumerateVisualObjectInstancesOptions;
import VisualObjectInstanceEnumeration = powerbi.VisualObjectInstanceEnumeration;
import ISelectionId = powerbi.visuals.ISelectionId;
import DataViewCategoryColumn = powerbi.DataViewCategoryColumn;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import ISelectionManager = powerbi.extensibility.ISelectionManager;
import ITooltipService = powerbi.extensibility.ITooltipService;
import { buildFunnelModel, DataViewLike, FunnelModel, FunnelStage, FunnelWarning } from "./model";
import { createLocalizer, Localizer, warningTextKey } from "./localization";

const MAX_BAR_WIDTH = 420;
const SVG_HEIGHT = 440;

interface StageSelection {
  id?: ISelectionId;
  stage: FunnelStage;
}

interface ContextMenuManager {
  showContextMenu?: (selectionId: ISelectionId | null, point: { x: number; y: number }) => void;
}

interface EventService {
  renderingStarted?: () => void;
  renderingFinished?: () => void;
  renderingFailed?: (options: { errorCode: string }) => void;
}

interface InteractionHost extends IVisualHost {
  allowInteractions?: boolean;
}

export class Visual implements IVisual {
  private readonly host: IVisualHost;
  private readonly root: HTMLDivElement;
  private readonly selectionManager: ISelectionManager;
  private readonly tooltipService?: ITooltipService;
  private readonly localizationManager?: powerbi.extensibility.ILocalizationManager;
  private readonly localizer: Localizer;
  private readonly selections = new Map<string, StageSelection>();
  private readonly stageButtons: HTMLButtonElement[] = [];
  private readonly cleanupHandlers: Array<() => void> = [];
  private model: FunnelModel = {
    stages: [],
    warnings: [],
    hasExplicitOrder: false,
    hasGroup: false,
    groups: [],
    truncated: false
  };
  private stageCategory?: DataViewCategoryColumn;
  private reducedMotion = false;
  private interactionsEnabled = true;
  private destroyed = false;
  private renderVersion = 0;

  public constructor(options?: VisualConstructorOptions) {
    if (!options) {
      throw new Error("ATLYN_CONSTRUCTOR_OPTIONS_REQUIRED");
    }
    this.host = options.host;
    this.interactionsEnabled = (this.host as InteractionHost).allowInteractions !== false;
    this.localizationManager = this.host.createLocalizationManager?.();
    this.selectionManager = this.host.createSelectionManager();
    this.tooltipService = this.host.tooltipService;
    this.localizer = createLocalizer(this.host.locale);
    this.root = document.createElement("div");
    this.root.className = "atlyn-funnel";
    this.root.setAttribute("role", "application");
    this.root.setAttribute("aria-label", "Atlyn Funnel");
    this.root.setAttribute("tabindex", "0");
    this.root.dir = this.localizer.direction;
    options.element.appendChild(this.root);

    const onRootKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        this.clearSelection();
      }
    };
    this.root.addEventListener("keydown", onRootKeyDown);
    this.cleanupHandlers.push(() => this.root.removeEventListener("keydown", onRootKeyDown));

    const mediaQuery = typeof window !== "undefined" && window.matchMedia
      ? window.matchMedia("(prefers-reduced-motion: reduce)")
      : undefined;
    if (mediaQuery) {
      this.reducedMotion = mediaQuery.matches;
      const onMotionChanged = (): void => {
        this.reducedMotion = mediaQuery.matches;
        this.root.toggleAttribute("data-reduced-motion", this.reducedMotion);
      };
      mediaQuery.addEventListener?.("change", onMotionChanged);
      this.cleanupHandlers.push(() => mediaQuery.removeEventListener?.("change", onMotionChanged));
    }
  }

  public update(options: VisualUpdateOptions): void {
    if (this.destroyed) {
      return;
    }
    const events = this.host.eventService as EventService | undefined;
    events?.renderingStarted?.();
    try {
      this.renderVersion += 1;
      this.stageCategory = this.findStageCategory(options.dataViews?.[0]);
      this.model = buildFunnelModel(options.dataViews?.[0] as unknown as DataViewLike, {
        blankLabel: this.localizer.text("blank", "(Blank)")
      });
      this.render(options.viewport.width, options.viewport.height);
      events?.renderingFinished?.();
    } catch {
      this.renderEmpty(this.localizer.text("noData"));
      events?.renderingFailed?.({ errorCode: "ATLYN_RENDER_FAILED" });
    }
  }

  public enumerateObjectInstances(
    options: EnumerateVisualObjectInstancesOptions
  ): VisualObjectInstanceEnumeration {
    if (options.objectName === "dataPoint") {
      return [
        {
          objectName: "dataPoint",
          properties: {
            fill: {
              solid: {
                color: "#2563eb"
              }
            }
          },
          selector: {}
        }
      ];
    }
    if (options.objectName === "labels") {
      return [
        {
          objectName: "labels",
          properties: {
            show: true
          },
          selector: {}
        }
      ];
    }
    return [];
  }

  public getFormattingModel(): powerbi.visuals.FormattingModel {
    return { cards: [] };
  }

  public destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.cleanupHandlers.splice(0).forEach((cleanup) => cleanup());
    this.selections.clear();
    this.stageButtons.splice(0);
    while (this.root.firstChild) {
      this.root.removeChild(this.root.firstChild);
    }
    this.root.remove();
  }

  private findStageCategory(dataView: powerbi.DataView | undefined): DataViewCategoryColumn | undefined {
    return dataView?.categorical?.categories?.find((category) => Boolean(category.source.roles?.Stage));
  }

  private render(width: number, height: number): void {
    this.root.toggleAttribute("data-high-contrast", Boolean(this.host.colorPalette?.isHighContrast));
    this.root.toggleAttribute("data-reduced-motion", this.reducedMotion);
    this.root.toggleAttribute("data-compact", width < 480 || height < 320);
    this.root.style.width = `${Math.max(0, width)}px`;
    this.root.style.height = `${Math.max(0, height)}px`;
    this.clearChildren();
    if (this.model.stages.length === 0) {
      this.renderEmpty(this.localizer.text("noData"));
      return;
    }

    this.populateSelections();
    const summary = this.createSummary();
    this.root.appendChild(summary);
    const warningPanel = this.createWarnings(this.model.warnings);
    if (warningPanel) {
      this.root.appendChild(warningPanel);
    }
    this.root.appendChild(this.createChart(width));
    this.root.appendChild(this.createStageList());
    this.root.appendChild(this.createAccessibleTable());
  }

  private createSummary(): HTMLDivElement {
    const summary = document.createElement("div");
    summary.className = "atlyn-summary";
    summary.setAttribute("aria-label", this.localizer.text("overallConversion"));
    const first = this.model.stages[0];
    const heading = document.createElement("h2");
    heading.textContent = "Atlyn Funnel";
    summary.appendChild(heading);
    const overallByGroup = [...new Set(this.model.stages.map((stage) => stage.group ?? ""))];
    overallByGroup.forEach((group) => {
      const groupStages = this.model.stages.filter((stage) => (stage.group ?? "") === group);
      const last = groupStages[groupStages.length - 1];
      const overall = document.createElement("span");
      overall.className = "atlyn-summary-metric";
      const groupLabel = group ? ` (${group})` : "";
      overall.textContent = `${this.localizer.text("overallConversion")}${groupLabel}: ${this.localizer.percent(last.overallConversion)}`;
      summary.appendChild(overall);
    });
    const intake = document.createElement("span");
    intake.className = "atlyn-summary-intake";
    intake.textContent = `${first.label}: ${this.localizer.number(first.value)}`;
    summary.appendChild(intake);
    return summary;
  }

  private createWarnings(warnings: FunnelWarning[]): HTMLDivElement | undefined {
    if (warnings.length === 0) {
      return undefined;
    }
    const panel = document.createElement("div");
    panel.className = "atlyn-warnings";
    panel.setAttribute("role", "status");
    panel.setAttribute("aria-live", "polite");
    const heading = document.createElement("strong");
    heading.textContent = `${this.localizer.text("warning")}:`;
    panel.appendChild(heading);
    const list = document.createElement("ul");
    warnings.slice(0, 8).forEach((warning) => {
      const item = document.createElement("li");
      item.textContent = `${this.localizer.text(warningTextKey(warning.code), warning.message)}${warning.group ? ` (${warning.group})` : ""}`;
      list.appendChild(item);
    });
    panel.appendChild(list);
    return panel;
  }

  private createChart(width: number): SVGSVGElement {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.classList.add("atlyn-chart");
    svg.setAttribute("viewBox", `0 0 ${Math.max(width, 320)} ${SVG_HEIGHT}`);
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", this.localizer.text("stageListLabel"));
    svg.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      this.showContextMenu(undefined, event.clientX, event.clientY);
    });
    const positiveValues = this.model.stages
      .map((stage) => stage.value)
      .filter((value): value is number => value !== null && Number.isFinite(value) && value > 0);
    const maxValue = Math.max(1, ...positiveValues);
    const chartWidth = Math.min(MAX_BAR_WIDTH, Math.max(160, width - 220));
    const rowHeight = Math.max(30, Math.min(54, SVG_HEIGHT / Math.max(1, this.model.stages.length)));
    this.model.stages.forEach((stage, index) => {
      const y = index * rowHeight + 8;
      const barWidth = stage.value !== null ? Math.max(4, Math.min(chartWidth, (Math.abs(stage.value) / maxValue) * chartWidth)) : 4;
      const x = (Math.max(width, 320) - barWidth) / 2;
      const bar = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      bar.setAttribute("x", String(x));
      bar.setAttribute("y", String(y));
      bar.setAttribute("width", String(barWidth));
      bar.setAttribute("height", String(Math.max(18, rowHeight - 8)));
      bar.setAttribute("rx", "4");
      bar.setAttribute("class", `atlyn-bar atlyn-${stage.valueState}${stage.highlighted ? "" : " atlyn-dimmed"}`);
      bar.setAttribute("data-stage-key", stage.key);
      bar.setAttribute("aria-label", this.stageAriaLabel(stage));
      bar.addEventListener("click", (event) => {
        this.selectStage(stage, event as MouseEvent);
      });
      bar.addEventListener("mouseenter", (event) => this.showTooltip(stage, event.clientX, event.clientY, false));
      bar.addEventListener("mouseleave", () => this.hideTooltip());
      svg.appendChild(bar);

      const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
      label.setAttribute("x", String(Math.max(width, 320) - 10));
      label.setAttribute("y", String(y + rowHeight / 2));
      label.setAttribute("text-anchor", this.localizer.direction === "rtl" ? "start" : "end");
      label.setAttribute("class", "atlyn-chart-label");
      label.textContent = `${stage.label} · ${this.localizer.number(stage.value)}`;
      svg.appendChild(label);
    });
    return svg;
  }

  private createStageList(): HTMLDivElement {
    const list = document.createElement("div");
    list.className = "atlyn-stage-list";
    list.setAttribute("role", "list");
    list.setAttribute("aria-label", this.localizer.text("stageListLabel"));
    this.stageButtons.splice(0);
    this.model.stages.forEach((stage, index) => {
      const item = document.createElement("div");
      item.setAttribute("role", "listitem");
      item.className = "atlyn-stage-item";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "atlyn-stage-button";
      if (!stage.highlighted) {
        button.classList.add("atlyn-dimmed");
      }
      button.dataset.stageKey = stage.key;
      button.setAttribute("aria-label", this.stageAriaLabel(stage));
      const groupLabel = stage.group ? `; ${this.localizer.text("group")}: ${stage.group}` : "";
      const targetLabel = stage.target === null ? "" : `; ${this.localizer.text("target")}: ${this.localizer.number(stage.target)}`;
      button.textContent = `${stage.label}: ${this.localizer.number(stage.value)}${groupLabel}; ${this.localizer.text("stageConversion")}: ${this.localizer.percent(stage.stageConversion)}; ${this.localizer.text("dropRate")}: ${this.localizer.percent(stage.dropRate)}; ${this.localizer.text("absoluteLoss")}: ${this.localizer.number(stage.absoluteLoss)}${targetLabel}`;
      button.addEventListener("click", (event) => this.selectStage(stage, event));
      button.addEventListener("keydown", (event) => this.navigateStage(index, event));
      button.addEventListener("mouseenter", (event) => this.showTooltip(stage, event.clientX, event.clientY, false));
      button.addEventListener("mouseleave", () => this.hideTooltip());
      button.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        this.showContextMenu(stage, event.clientX, event.clientY);
      });
      let longPressTimer: ReturnType<typeof setTimeout> | undefined;
      button.addEventListener("pointerdown", (event) => {
        if (event.pointerType === "touch") {
          longPressTimer = setTimeout(() => this.showContextMenu(stage, event.clientX, event.clientY), 650);
        }
      });
      const clearLongPress = (): void => {
        if (longPressTimer) {
          clearTimeout(longPressTimer);
          longPressTimer = undefined;
        }
      };
      button.addEventListener("pointerup", clearLongPress);
      button.addEventListener("pointerleave", clearLongPress);
      item.appendChild(button);
      list.appendChild(item);
      this.stageButtons.push(button);
    });
    return list;
  }

  private createAccessibleTable(): HTMLTableElement {
    const table = document.createElement("table");
    table.className = "atlyn-accessible-table";
    table.setAttribute("role", "table");
    table.setAttribute("aria-label", this.localizer.text("tableLabel"));
    const headers = [
      "Stage",
      this.localizationManager?.getDisplayName("Value") || this.localizer.text("value"),
      this.localizer.text("overallConversion"),
      this.localizer.text("stageConversion"),
      this.localizer.text("dropRate"),
      this.localizer.text("absoluteLoss"),
      this.localizer.text("target")
    ];
    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    headers.forEach((header) => {
      const cell = document.createElement("th");
      cell.scope = "col";
      cell.textContent = header;
      headerRow.appendChild(cell);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);
    const body = document.createElement("tbody");
    this.model.stages.forEach((stage) => {
      const row = document.createElement("tr");
      [
        stage.label,
        this.localizer.number(stage.value),
        this.localizer.percent(stage.overallConversion),
        this.localizer.percent(stage.stageConversion),
        this.localizer.percent(stage.dropRate),
        this.localizer.number(stage.absoluteLoss),
        this.localizer.number(stage.target)
      ].forEach((value) => {
        const cell = document.createElement("td");
        cell.textContent = value;
        row.appendChild(cell);
      });
      body.appendChild(row);
    });
    table.appendChild(body);
    return table;
  }

  private navigateStage(index: number, event: KeyboardEvent): void {
    const direction = event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : event.key === "ArrowUp" || event.key === "ArrowLeft" ? -1 : 0;
    if (direction !== 0) {
      event.preventDefault();
      const nextIndex = Math.max(0, Math.min(this.stageButtons.length - 1, index + direction));
      this.stageButtons[nextIndex]?.focus();
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      this.stageButtons[event.key === "Home" ? 0 : this.stageButtons.length - 1]?.focus();
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const stage = this.model.stages[index];
      if (stage) {
        this.selectStage(stage, event);
      }
    } else if (event.key === "Escape") {
      this.clearSelection();
    }
  }

  private selectStage(stage: FunnelStage, event: MouseEvent | KeyboardEvent): void {
    if (!this.interactionsEnabled) {
      return;
    }
    const selection = this.selections.get(stage.key);
    const multiSelect = "ctrlKey" in event && (event.ctrlKey || event.metaKey);
    if (selection?.id) {
      this.selectionManager.select(selection.id, multiSelect);
    }
    event.stopPropagation();
  }

  private populateSelections(): void {
    this.selections.clear();
    this.model.stages.forEach((stage) => {
      const builder = this.host.createSelectionIdBuilder();
      if (this.stageCategory) {
        builder.withCategory(this.stageCategory, stage.modelIndex);
      }
      this.selections.set(stage.key, {
        stage,
        id: builder.createSelectionId()
      });
    });
  }

  private showContextMenu(stage: FunnelStage | undefined, x: number, y: number): void {
    const selectionId = stage ? this.selections.get(stage.key)?.id ?? null : null;
    (this.selectionManager as unknown as ContextMenuManager).showContextMenu?.(selectionId, { x, y });
  }

  private showTooltip(stage: FunnelStage, x: number, y: number, isTouchEvent: boolean): void {
    if (!this.tooltipService) {
      return;
    }
    const dataItems = [
      { displayName: "Stage", value: stage.label },
      { displayName: this.localizer.text("value"), value: this.localizer.number(stage.value) },
      { displayName: this.localizer.text("overallConversion"), value: this.localizer.percent(stage.overallConversion) },
      { displayName: this.localizer.text("stageConversion"), value: this.localizer.percent(stage.stageConversion) },
      { displayName: this.localizer.text("dropRate"), value: this.localizer.percent(stage.dropRate) },
      { displayName: this.localizer.text("absoluteLoss"), value: this.localizer.number(stage.absoluteLoss) }
    ];
    if (stage.target !== null) {
      dataItems.push({ displayName: this.localizer.text("target"), value: this.localizer.number(stage.target) });
    }
    if (stage.group) {
      dataItems.push({ displayName: this.localizer.text("group"), value: stage.group });
    }
    stage.tooltipValues.forEach((tooltip) => dataItems.push({ displayName: tooltip.label, value: String(tooltip.value ?? "") }));
    const selectionId = this.selections.get(stage.key)?.id;
    this.tooltipService.show({
      dataItems,
      identities: selectionId ? [selectionId] : [],
      coordinates: [x, y],
      isTouchEvent
    } as never);
  }

  private hideTooltip(): void {
    this.tooltipService?.hide({
      immediately: false,
      isTouchEvent: false
    } as never);
  }

  private clearSelection(): void {
    this.selectionManager.clear();
  }

  private stageAriaLabel(stage: FunnelStage): string {
    const group = stage.group ? `, ${this.localizer.text("group")} ${stage.group}` : "";
    const target = stage.target === null ? "" : `, ${this.localizer.text("target")} ${this.localizer.number(stage.target)}`;
    return `${stage.label}, ${this.localizer.text("value")} ${this.localizer.number(stage.value)}${group}, ${this.localizer.text("overallConversion")} ${this.localizer.percent(stage.overallConversion)}, ${this.localizer.text("stageConversion")} ${this.localizer.percent(stage.stageConversion)}, ${this.localizer.text("dropRate")} ${this.localizer.percent(stage.dropRate)}, ${this.localizer.text("absoluteLoss")} ${this.localizer.number(stage.absoluteLoss)}${target}`;
  }

  private clearChildren(): void {
    this.selections.clear();
    while (this.root.firstChild) {
      this.root.removeChild(this.root.firstChild);
    }
  }

  private renderEmpty(message: string): void {
    this.clearChildren();
    const empty = document.createElement("p");
    empty.className = "atlyn-empty";
    empty.setAttribute("role", "status");
    empty.textContent = message;
    this.root.appendChild(empty);
  }
}
