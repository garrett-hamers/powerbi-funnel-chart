import powerbi from "powerbi-visuals-api";
import IVisual = powerbi.extensibility.visual.IVisual;
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import ISelectionId = powerbi.visuals.ISelectionId;
import DataViewCategoryColumn = powerbi.DataViewCategoryColumn;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import ISelectionManager = powerbi.extensibility.ISelectionManager;
import ITooltipService = powerbi.extensibility.ITooltipService;
import { buildFunnelModel, DataViewLike, FunnelModel, FunnelStage, FunnelWarning } from "./model";
import { createLocalizer, Localizer, warningTextKey } from "./localization";
import { createFormattingModel, DEFAULT_FUNNEL_SETTINGS, FunnelSettings, readFunnelSettings } from "./settings";
import "./style.css";

const MAX_BAR_WIDTH = 420;
const MIN_CHART_HEIGHT = 220;
const ROW_HEIGHT = 42;

interface StageSelection {
  id?: ISelectionId;
  stage: FunnelStage;
}

export class Visual implements IVisual {
  private readonly host: IVisualHost;
  private readonly root: HTMLDivElement;
  private readonly selectionManager: ISelectionManager;
  private readonly tooltipService?: ITooltipService;
  private readonly localizationManager?: powerbi.extensibility.ILocalizationManager;
  private readonly localizer: Localizer;
  private readonly eventService: powerbi.extensibility.IVisualEventService;
  private readonly selections = new Map<string, StageSelection>();
  private readonly stageButtons: HTMLButtonElement[] = [];
  private readonly cleanupHandlers: Array<() => void> = [];
  private readonly longPressTimers = new Set<ReturnType<typeof setTimeout>>();
  private model: FunnelModel = {
    stages: [],
    warnings: [],
    hasExplicitOrder: false,
    hasGroup: false,
    groups: [],
    truncated: false,
    reducedCount: 0,
    completeness: "complete"
  };
  private stageCategory?: DataViewCategoryColumn;
  private groupCategory?: DataViewCategoryColumn;
  private valueColumns?: powerbi.DataViewValueColumns;
  private settings: FunnelSettings = DEFAULT_FUNNEL_SETTINGS;
  private reducedMotion = false;
  private interactionsEnabled = true;
  private destroyed = false;
  private renderVersion = 0;
  private tooltipStageKey?: string;
  private tooltipIsTouch = false;

  public constructor(options?: VisualConstructorOptions) {
    if (!options) {
      throw new Error("ATLYN_CONSTRUCTOR_OPTIONS_REQUIRED");
    }
    this.host = options.host;
    this.interactionsEnabled = this.host.hostCapabilities?.allowInteractions !== false;
    this.localizationManager = this.host.createLocalizationManager?.();
    this.eventService = this.host.eventService;
    this.selectionManager = this.host.createSelectionManager();
    this.tooltipService = this.host.tooltipService;
    this.localizer = createLocalizer(this.host.locale);
    this.root = document.createElement("div");
    this.root.className = "atlyn-funnel";
    this.root.setAttribute("role", "region");
    this.root.setAttribute("aria-label", this.localizer.text("title", "Atlyn Funnel"));
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
        this.setStateAttribute("data-reduced-motion", this.reducedMotion);
      };
      mediaQuery.addEventListener?.("change", onMotionChanged);
      this.cleanupHandlers.push(() => mediaQuery.removeEventListener?.("change", onMotionChanged));
    }
  }

  public update(options: VisualUpdateOptions): void {
    if (this.destroyed) {
      return;
    }
    this.eventService.renderingStarted(options);
    try {
      this.renderVersion += 1;
      const dataView = options.dataViews?.[0];
      this.stageCategory = this.findStageCategory(dataView);
      this.groupCategory = this.findGroupCategory(dataView);
      this.valueColumns = dataView?.categorical?.values;
      this.settings = readFunnelSettings(dataView as unknown as DataViewLike);
      this.model = buildFunnelModel(dataView as unknown as DataViewLike, {
        blankLabel: this.localizer.text("blank", "(Blank)")
      });
      this.render(options.viewport.width, options.viewport.height);
      this.eventService.renderingFinished(options);
    } catch (error) {
      this.renderEmpty(this.localizer.text("noData"));
      const reason = error instanceof Error ? error.message : "ATLYN_RENDER_FAILED";
      this.eventService.renderingFailed(options, reason);
    }
  }

  public getFormattingModel(): powerbi.visuals.FormattingModel {
    return createFormattingModel(this.settings, this.localizer, {
      displayName: (key, fallback) => this.getDisplayName(key, fallback)
    });
  }

  public destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.clearLongPressTimers();
    this.hideTooltip(true);
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

  private findGroupCategory(dataView: powerbi.DataView | undefined): DataViewCategoryColumn | undefined {
    return dataView?.categorical?.categories?.find((category) => Boolean(category.source.roles?.Group));
  }

  private getDisplayName(key: string, fallback: string): string {
    const displayName = this.localizationManager?.getDisplayName(key);
    return displayName && displayName !== key ? displayName : fallback;
  }

  private render(width: number, height: number): void {
    this.applyVisualStyles();
    this.setStateAttribute("data-high-contrast", Boolean(this.host.colorPalette?.isHighContrast));
    this.setStateAttribute("data-reduced-motion", this.reducedMotion);
    this.setStateAttribute("data-compact", width < 480 || height < 320);
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
    this.root.appendChild(this.createChart(width, height));
    this.root.appendChild(this.createStageList());
    this.root.appendChild(this.createAccessibleTable());
  }

  private createSummary(): HTMLDivElement {
    const summary = document.createElement("div");
    summary.className = "atlyn-summary";
    summary.setAttribute("aria-label", this.localizer.text("overallConversion"));
    const first = this.model.stages[0];
    const heading = document.createElement("h2");
    heading.textContent = this.localizer.text("title", "Atlyn Funnel");
    summary.appendChild(heading);
    const overallByGroup = [...new Set(this.model.stages.map((stage) => stage.group ?? ""))];
    overallByGroup.forEach((group) => {
      const groupStages = this.model.stages.filter((stage) => (stage.group ?? "") === group);
      const last = groupStages[groupStages.length - 1];
      const overall = document.createElement("span");
      overall.className = "atlyn-summary-metric";
      const groupLabel = group ? ` (${this.localizer.text("group")} ${group})` : "";
      overall.textContent = `${this.localizer.text("overallConversion")}${groupLabel}: ${this.localizer.percent(last.overallConversion)}`;
      summary.appendChild(overall);
    });
    const intake = document.createElement("span");
    intake.className = "atlyn-summary-intake";
    intake.textContent = `${first.label}: ${this.localizer.number(first.value, undefined, first.valueFormat)}`;
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

  private createChart(width: number, height: number): HTMLDivElement {
    const chartScroll = document.createElement("div");
    chartScroll.className = "atlyn-chart-scroll";
    chartScroll.setAttribute("role", "region");
    chartScroll.setAttribute("aria-label", this.localizer.text("stageListLabel"));
    chartScroll.style.maxHeight = `${Math.max(150, Math.floor(height * 0.55))}px`;

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.classList.add("atlyn-chart");
    const canvasWidth = Math.max(width, 320);
    const chartHeight = Math.max(MIN_CHART_HEIGHT, this.model.stages.length * ROW_HEIGHT + 16);
    svg.setAttribute("viewBox", `0 0 ${canvasWidth} ${chartHeight}`);
    svg.setAttribute("height", String(chartHeight));
    svg.style.height = `${chartHeight}px`;
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
    const rowHeight = ROW_HEIGHT;
    this.model.stages.forEach((stage, index) => {
      const y = index * rowHeight + 8;
      const barWidth =
        stage.value !== null && stage.value > 0
          ? Math.max(4, Math.min(chartWidth, (stage.value / maxValue) * chartWidth))
          : 0;
      const x = (canvasWidth - barWidth) / 2;
      const bar = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      bar.setAttribute("x", String(x));
      bar.setAttribute("y", String(y));
      bar.setAttribute("width", String(barWidth));
      bar.setAttribute("height", String(Math.max(18, rowHeight - 8)));
      bar.setAttribute("rx", "4");
      bar.setAttribute("class", `atlyn-bar atlyn-${stage.valueState}${stage.highlighted ? "" : " atlyn-dimmed"}`);
      bar.setAttribute("data-stage-key", stage.key);
      bar.setAttribute("data-value-state", stage.valueState);
      bar.setAttribute("role", "button");
      bar.setAttribute("tabindex", "0");
      bar.setAttribute("aria-label", this.stageAriaLabel(stage));
      bar.addEventListener("click", (event) => {
        this.selectStage(stage, event as MouseEvent);
      });
      bar.addEventListener("keydown", (event) => this.navigateStage(index, event));
      this.bindStagePointerInteractions(bar, stage);
      svg.appendChild(bar);

      if (stage.valueState !== "value") {
        const marker = document.createElementNS("http://www.w3.org/2000/svg", "line");
        const markerWidth = stage.valueState === "zero" ? 8 : 14;
        marker.setAttribute("x1", String((canvasWidth - markerWidth) / 2));
        marker.setAttribute("x2", String((canvasWidth + markerWidth) / 2));
        marker.setAttribute("y1", String(y + rowHeight / 2));
        marker.setAttribute("y2", String(y + rowHeight / 2));
        marker.setAttribute("class", `atlyn-state-marker atlyn-${stage.valueState}`);
        marker.setAttribute("data-value-state", stage.valueState);
        marker.setAttribute("aria-hidden", "true");
        svg.appendChild(marker);
      }

      if (this.settings.labelsShow) {
        const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
        label.setAttribute("x", String(this.localizer.direction === "rtl" ? 10 : canvasWidth - 10));
        label.setAttribute("y", String(y + rowHeight / 2));
        label.setAttribute("text-anchor", this.localizer.direction === "rtl" ? "start" : "end");
        label.setAttribute("class", "atlyn-chart-label");
        label.textContent = `${stage.label} · ${this.localizer.number(stage.value, undefined, stage.valueFormat)}`;
        svg.appendChild(label);
      }
    });
    chartScroll.appendChild(svg);
    return chartScroll;
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
      button.setAttribute("aria-posinset", String(index + 1));
      button.setAttribute("aria-setsize", String(this.model.stages.length));
      button.setAttribute("aria-label", this.stageAriaLabel(stage));
      const groupLabel = stage.group ? `; ${this.localizer.text("group")}: ${stage.group}` : "";
      const targetLabel = stage.target === null ? "" : `; ${this.localizer.text("target")}: ${this.localizer.number(stage.target, undefined, stage.targetFormat)}`;
      button.textContent = `${this.localizer.text("stage")}: ${stage.label}; ${this.localizer.text("value")}: ${this.localizer.number(stage.value, undefined, stage.valueFormat)}${groupLabel}; ${this.localizer.text("stageConversion")}: ${this.localizer.percent(stage.stageConversion)}; ${this.localizer.text("dropRate")}: ${this.localizer.percent(stage.dropRate)}; ${this.localizer.text("absoluteLoss")}: ${this.localizer.number(stage.absoluteLoss, undefined, stage.valueFormat)}${targetLabel}`;
      button.addEventListener("click", (event) => this.selectStage(stage, event));
      button.addEventListener("keydown", (event) => this.navigateStage(index, event));
      this.bindStagePointerInteractions(button, stage);
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
    table.setAttribute("tabindex", "0");
    const headers = [
      this.localizer.text("stage"),
      this.getDisplayName("Role_Value_DisplayNameKey", this.localizer.text("value")),
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
        this.localizer.number(stage.value, undefined, stage.valueFormat),
        this.localizer.percent(stage.overallConversion),
        this.localizer.percent(stage.stageConversion),
        this.localizer.percent(stage.dropRate),
        this.localizer.number(stage.absoluteLoss, undefined, stage.valueFormat),
        this.localizer.number(stage.target, undefined, stage.targetFormat)
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
    const groupedValues = this.valueColumns?.grouped?.() ?? [];
    this.model.stages.forEach((stage) => {
      const builder = this.host.createSelectionIdBuilder();
      if (this.stageCategory && stage.categoryIndex >= 0) {
        builder.withCategory(this.stageCategory, stage.categoryIndex);
      }
      if (this.groupCategory && stage.categoryIndex >= 0) {
        builder.withCategory(this.groupCategory, stage.categoryIndex);
      } else if (this.valueColumns && stage.seriesIndex !== null && groupedValues[stage.seriesIndex]) {
        builder.withSeries(this.valueColumns, groupedValues[stage.seriesIndex]);
      }
      this.selections.set(stage.key, {
        stage,
        id: builder.createSelectionId()
      });
    });
  }

  private showContextMenu(stage: FunnelStage | undefined, x: number, y: number): void {
    const selectionId = stage ? this.selections.get(stage.key)?.id : undefined;
    this.selectionManager.showContextMenu(selectionId ?? ({} as ISelectionId), { x, y });
  }

  private showTooltip(stage: FunnelStage, x: number, y: number, isTouchEvent: boolean): void {
    if (!this.tooltipService || !this.tooltipsEnabled()) {
      return;
    }
    const dataItems: powerbi.extensibility.VisualTooltipDataItem[] = [
      { displayName: this.localizer.text("stage"), value: stage.label },
      { displayName: this.localizer.text("value"), value: this.localizer.number(stage.value, undefined, stage.valueFormat) },
      { displayName: this.localizer.text("overallConversion"), value: this.localizer.percent(stage.overallConversion) },
      { displayName: this.localizer.text("stageConversion"), value: this.localizer.percent(stage.stageConversion) },
      { displayName: this.localizer.text("dropRate"), value: this.localizer.percent(stage.dropRate) },
      { displayName: this.localizer.text("absoluteLoss"), value: this.localizer.number(stage.absoluteLoss, undefined, stage.valueFormat) }
    ];
    if (stage.target !== null) {
      dataItems.push({ displayName: this.localizer.text("target"), value: this.localizer.number(stage.target, undefined, stage.targetFormat) });
    }
    if (stage.group) {
      dataItems.push({ displayName: this.localizer.text("group"), value: stage.group });
    }
    stage.tooltipValues.forEach((tooltip) =>
      dataItems.push({
        displayName: tooltip.label,
        value:
          typeof tooltip.value === "number"
            ? this.localizer.number(tooltip.value, undefined, tooltip.format)
            : String(tooltip.value ?? "")
      })
    );
    const selectionId = this.selections.get(stage.key)?.id;
    this.tooltipService.show({
      dataItems,
      identities: selectionId ? [selectionId] : [],
      coordinates: [x, y],
      isTouchEvent
    });
    this.tooltipStageKey = stage.key;
    this.tooltipIsTouch = isTouchEvent;
  }

  private moveTooltip(stage: FunnelStage, x: number, y: number, isTouchEvent: boolean): void {
    if (!this.tooltipService || !this.tooltipsEnabled()) {
      return;
    }
    if (this.tooltipStageKey !== stage.key) {
      this.showTooltip(stage, x, y, isTouchEvent);
      return;
    }
    const selectionId = this.selections.get(stage.key)?.id;
    this.tooltipService.move({
      coordinates: [x, y],
      identities: selectionId ? [selectionId] : [],
      isTouchEvent
    });
  }

  private hideTooltip(isTouchEvent = this.tooltipIsTouch): void {
    if (!this.tooltipService || !this.tooltipStageKey) {
      return;
    }
    this.tooltipService.hide({
      immediately: false,
      isTouchEvent
    });
    this.tooltipStageKey = undefined;
    this.tooltipIsTouch = false;
  }

  private tooltipsEnabled(): boolean {
    return typeof this.tooltipService?.enabled !== "function" || this.tooltipService.enabled();
  }

  private bindStagePointerInteractions(element: Element, stage: FunnelStage): void {
    let longPressTimer: ReturnType<typeof setTimeout> | undefined;
    let touchStartX: number | undefined;
    let touchStartY: number | undefined;
    const clearLongPress = (): void => {
      this.cancelLongPress(longPressTimer);
      longPressTimer = undefined;
    };
    const clearTouchStart = (): void => {
      touchStartX = undefined;
      touchStartY = undefined;
    };

    element.addEventListener("contextmenu", (event) => {
      const pointerEvent = event as MouseEvent;
      pointerEvent.preventDefault();
      pointerEvent.stopPropagation();
      this.showContextMenu(stage, pointerEvent.clientX, pointerEvent.clientY);
    });
    element.addEventListener("pointerenter", (event) => {
      const pointerEvent = event as PointerEvent;
      if (pointerEvent.pointerType !== "touch") {
        this.showTooltip(stage, pointerEvent.clientX, pointerEvent.clientY, false);
      }
    });
    element.addEventListener("pointermove", (event) => {
      const pointerEvent = event as PointerEvent;
      if (
        pointerEvent.pointerType === "touch" &&
        touchStartX !== undefined &&
        touchStartY !== undefined &&
        Math.hypot(pointerEvent.clientX - touchStartX, pointerEvent.clientY - touchStartY) > 8
      ) {
        clearLongPress();
      }
      this.moveTooltip(stage, pointerEvent.clientX, pointerEvent.clientY, pointerEvent.pointerType === "touch");
    });
    element.addEventListener("pointerleave", () => {
      if (!this.tooltipIsTouch) {
        this.hideTooltip();
      }
      clearLongPress();
      clearTouchStart();
    });
    element.addEventListener("pointerdown", (event) => {
      const pointerEvent = event as PointerEvent;
      if (pointerEvent.pointerType === "touch") {
        clearLongPress();
        touchStartX = pointerEvent.clientX;
        touchStartY = pointerEvent.clientY;
        this.showTooltip(stage, pointerEvent.clientX, pointerEvent.clientY, true);
        longPressTimer = this.scheduleLongPress(stage, pointerEvent.clientX, pointerEvent.clientY);
      }
    });
    element.addEventListener("pointerup", (event) => {
      const pointerEvent = event as PointerEvent;
      clearLongPress();
      if (pointerEvent.pointerType === "touch") {
        this.hideTooltip(true);
      }
      clearTouchStart();
    });
    element.addEventListener("pointercancel", () => {
      clearLongPress();
      this.hideTooltip(true);
      clearTouchStart();
    });
  }

  private clearSelection(): void {
    this.selectionManager.clear();
  }

  private applyVisualStyles(): void {
    const highContrast = Boolean(this.host.colorPalette?.isHighContrast);
    if (highContrast) {
      const foreground = this.host.colorPalette.foreground?.value ?? "CanvasText";
      const background = this.host.colorPalette.background?.value ?? "Canvas";
      this.root.style.setProperty("--atlyn-primary", foreground);
      this.root.style.setProperty("--atlyn-text", foreground);
      this.root.style.setProperty("--atlyn-muted", foreground);
      this.root.style.setProperty("--atlyn-warning", foreground);
      this.root.style.setProperty("--atlyn-surface", background);
      this.root.style.setProperty("--atlyn-border", foreground);
    } else {
      this.root.style.setProperty("--atlyn-primary", this.settings.dataPointFill);
      ["--atlyn-text", "--atlyn-muted", "--atlyn-warning", "--atlyn-surface", "--atlyn-border"].forEach((property) => {
        this.root.style.removeProperty(property);
      });
    }
  }

  private stageAriaLabel(stage: FunnelStage): string {
    const group = stage.group ? `, ${this.localizer.text("group")} ${stage.group}` : "";
    const target = stage.target === null ? "" : `, ${this.localizer.text("target")} ${this.localizer.number(stage.target, undefined, stage.targetFormat)}`;
    const state =
      stage.valueState === "negative"
        ? `, ${this.localizer.text("negativeValue")}`
        : stage.valueState === "blank"
          ? `, ${this.localizer.text("blankValue")}`
          : "";
    return `${this.localizer.text("stage")} ${stage.label}, ${this.localizer.text("value")} ${this.localizer.number(stage.value, undefined, stage.valueFormat)}${group}${state}, ${this.localizer.text("overallConversion")} ${this.localizer.percent(stage.overallConversion)}, ${this.localizer.text("stageConversion")} ${this.localizer.percent(stage.stageConversion)}, ${this.localizer.text("dropRate")} ${this.localizer.percent(stage.dropRate)}, ${this.localizer.text("absoluteLoss")} ${this.localizer.number(stage.absoluteLoss, undefined, stage.valueFormat)}${target}`;
  }

  private clearChildren(): void {
    this.hideTooltip();
    this.clearLongPressTimers();
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

  private setStateAttribute(name: string, enabled: boolean): void {
    if (enabled) {
      this.root.setAttribute(name, "true");
    } else {
      this.root.removeAttribute(name);
    }
  }

  private scheduleLongPress(stage: FunnelStage, x: number, y: number): ReturnType<typeof setTimeout> {
    const renderVersion = this.renderVersion;
    const timer = setTimeout(() => {
      this.longPressTimers.delete(timer);
      if (!this.destroyed && renderVersion === this.renderVersion) {
        this.showContextMenu(stage, x, y);
      }
    }, 650);
    this.longPressTimers.add(timer);
    return timer;
  }

  private cancelLongPress(timer: ReturnType<typeof setTimeout> | undefined): void {
    if (timer) {
      clearTimeout(timer);
      this.longPressTimers.delete(timer);
    }
  }

  private clearLongPressTimers(): void {
    this.longPressTimers.forEach((timer) => clearTimeout(timer));
    this.longPressTimers.clear();
  }
}
