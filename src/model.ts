export type CellValue = string | number | boolean | null | undefined;

export interface SourceLike {
  displayName?: string;
  queryName?: string;
  roles?: Record<string, boolean>;
  format?: string;
}

export type ObjectValueLike =
  | CellValue
  | {
      solid?: {
        color?: string;
      };
    }
  | Record<string, unknown>;

export interface MetadataLike {
  columns?: SourceLike[];
  objects?: Record<string, Record<string, ObjectValueLike>>;
  segment?: unknown;
}

export interface CategoryColumnLike {
  source?: SourceLike;
  values?: CellValue[];
  identity?: unknown[];
}

export interface ValueColumnLike {
  source?: SourceLike;
  values?: CellValue[];
  highlights?: CellValue[];
}

export interface GroupedValueLike {
  name?: CellValue;
  identity?: unknown;
  values?: ValueColumnLike[];
}

export interface ValueColumnsLike extends Array<ValueColumnLike> {
  grouped?: () => GroupedValueLike[];
}

export interface CategoricalDataViewLike {
  categories?: CategoryColumnLike[];
  values?: ValueColumnsLike;
}

export interface DataViewLike {
  metadata?: MetadataLike;
  categorical?: CategoricalDataViewLike;
}

export type ValueState = "blank" | "zero" | "value" | "negative";

export interface FunnelWarning {
  code:
    | "missing-stage"
    | "missing-value"
    | "duplicate-stage"
    | "inferred-order"
    | "duplicate-order"
    | "missing-order"
    | "nonmonotonic"
    | "blank-value"
    | "negative-value"
    | "zero-baseline"
    | "stage-limit"
    | "partial-data";
    group?: string;
    stage?: string;
    message: string;
}

export interface FunnelStage {
  key: string;
  label: string;
  group?: string;
  value: number | null;
  target: number | null;
  stageOrder: number | null;
  valueState: ValueState;
  modelIndex: number;
  categoryIndex: number;
  seriesIndex: number | null;
  identity?: unknown;
  groupIdentity?: unknown;
  highlighted: boolean;
  tooltipValues: Array<{ label: string; value: CellValue; format?: string }>;
  valueFormat?: string;
  targetFormat?: string;
  overallConversion: number | null;
  stageConversion: number | null;
  dropRate: number | null;
  absoluteLoss: number | null;
}

export interface FunnelModel {
  stages: FunnelStage[];
  warnings: FunnelWarning[];
  hasExplicitOrder: boolean;
  hasGroup: boolean;
  groups: string[];
  truncated: boolean;
  reducedCount: number;
  completeness: "complete" | "ordered-window" | "partial-segment";
}

export interface BuildModelOptions {
  blankLabel?: string;
  maxStages?: number;
}

interface WorkingStage {
  label: string;
  group?: string;
  value: number | null;
  target: number | null;
  stageOrder: number | null;
  modelIndex: number;
  categoryIndex: number;
  seriesIndex: number | null;
  identity?: unknown;
  groupIdentity?: unknown;
  highlighted: boolean;
  tooltipValues: Array<{ label: string; value: CellValue; format?: string }>;
  valueFormat?: string;
  targetFormat?: string;
}

const roleIs = (source: SourceLike | undefined, role: string): boolean =>
  Boolean(source?.roles?.[role]);

const firstCategory = (
  categories: CategoryColumnLike[],
  role: string
): CategoryColumnLike | undefined =>
  categories.find((category) => roleIs(category.source, role));

const firstValueColumn = (
  columns: ValueColumnLike[],
  role: string
): ValueColumnLike | undefined =>
  columns.find((column) => roleIs(column.source, role));

const cellAt = (column: CategoryColumnLike | ValueColumnLike | undefined, index: number): CellValue =>
  column?.values?.[index];

const asNumber = (value: CellValue): number | null => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : null;
  }
  return null;
};

const isBlank = (value: CellValue): boolean =>
  value === null || value === undefined || value === "" || (typeof value === "number" && Number.isNaN(value));

const text = (value: CellValue, blankLabel: string): string =>
  isBlank(value) ? blankLabel : String(value);

const stateFor = (value: number | null, source: CellValue): ValueState => {
  if (isBlank(source) || value === null) {
    return "blank";
  }
  if (value === 0) {
    return "zero";
  }
  return value < 0 ? "negative" : "value";
};

const groupName = (value: CellValue): string | undefined =>
  isBlank(value) ? undefined : String(value);

const getTooltips = (
  columns: ValueColumnLike[],
  index: number,
  excluded: Set<ValueColumnLike>
): Array<{ label: string; value: CellValue; format?: string }> =>
  columns
    .filter((column) => roleIs(column.source, "Tooltips") && !excluded.has(column))
    .slice(0, 5)
    .map((column) => ({
      label: column.source?.displayName ?? column.source?.queryName ?? "Tooltip",
      value: cellAt(column, index),
      format: column.source?.format
    }));

const sortStages = (rows: WorkingStage[], explicitOrder: boolean): WorkingStage[] => {
  if (!explicitOrder) {
    return rows;
  }
  return [...rows].sort((left, right) => {
    if (left.stageOrder === null && right.stageOrder === null) {
      return left.modelIndex - right.modelIndex;
    }
    if (left.stageOrder === null) {
      return 1;
    }
    if (right.stageOrder === null) {
      return -1;
    }
    return left.stageOrder - right.stageOrder || left.modelIndex - right.modelIndex;
  });
};

const calculateMetrics = (
  rows: WorkingStage[],
  warnings: FunnelWarning[],
  group: string | undefined,
  explicitOrder: boolean
): FunnelStage[] => {
  const baseline = rows[0]?.value ?? null;
  if (rows.length > 0 && baseline === 0) {
    warnings.push({
      code: "zero-baseline",
      group,
      stage: rows[0].label,
      message: "The first stage is zero, so conversion ratios are unavailable."
    });
  }

  const orderValues = rows
    .map((row) => row.stageOrder)
    .filter((order): order is number => order !== null);
  if (explicitOrder && rows.some((row) => row.stageOrder === null)) {
    warnings.push({
      code: "missing-order",
      group,
      message: "Some or all stages have no StageOrder; they are displayed after ordered stages in model order."
    });
  }
  if (new Set(orderValues).size !== orderValues.length) {
    warnings.push({
      code: "duplicate-order",
      group,
      message: "Two or more stages share the same StageOrder; model order breaks the tie."
    });
  }
  const labels = new Set<string>();
  const duplicateLabels = new Set<string>();
  rows.forEach((row) => {
    if (labels.has(row.label)) {
      duplicateLabels.add(row.label);
    }
    labels.add(row.label);
  });
  duplicateLabels.forEach((label) => {
    warnings.push({
      code: "duplicate-stage",
      group,
      stage: label,
      message: "Duplicate stage labels are preserved as separate model rows."
    });
  });

  rows.forEach((row, index) => {
    if (row.value === null) {
      warnings.push({
        code: "blank-value",
        group,
        stage: row.label,
        message: "This stage has a blank value; ratios are not inferred."
      });
    } else if (row.value < 0) {
      warnings.push({
        code: "negative-value",
        group,
        stage: row.label,
        message: "Negative values are displayed but are not a conventional conversion funnel."
      });
    }
    const previousValue = index > 0 ? rows[index - 1].value : null;
    if (row.value !== null && previousValue !== null && row.value > previousValue) {
      warnings.push({
        code: "nonmonotonic",
        group,
        stage: row.label,
        message: "This stage increases from the prior stage; the sequence is nonmonotonic."
      });
    }
  });

  return rows.map((row, index) => {
    const previous = index > 0 ? rows[index - 1].value : null;
    const overallConversion =
      baseline !== null && baseline > 0 && row.value !== null && row.value >= 0 ? row.value / baseline : null;
    const stageConversion =
      previous !== null && previous > 0 && row.value !== null && row.value >= 0 ? row.value / previous : null;
    return {
      key: JSON.stringify([group ?? "default", row.categoryIndex, row.seriesIndex, row.label]),
      label: row.label,
      group,
      value: row.value,
      target: row.target,
      stageOrder: row.stageOrder,
      valueState: stateFor(row.value, row.value),
      modelIndex: row.modelIndex,
      categoryIndex: row.categoryIndex,
      seriesIndex: row.seriesIndex,
      identity: row.identity,
      groupIdentity: row.groupIdentity,
      highlighted: row.highlighted,
      tooltipValues: row.tooltipValues,
      valueFormat: row.valueFormat,
      targetFormat: row.targetFormat,
      overallConversion,
      stageConversion,
      dropRate: stageConversion === null ? null : 1 - stageConversion,
      absoluteLoss:
        previous !== null &&
        previous >= 0 &&
        row.value !== null &&
        row.value >= 0
          ? previous - row.value
          : null
    };
  });
};

const rowsFor = (
  stageCategory: CategoryColumnLike | undefined,
  groupCategory: CategoryColumnLike | undefined,
  columns: ValueColumnLike[],
  group: string | undefined,
  blankLabel: string,
  seriesIndex: number | null = null,
  groupIdentity?: unknown
): WorkingStage[] => {
  const stages = stageCategory?.values ?? [];
  const valueColumn = firstValueColumn(columns, "Value");
  const orderColumn = firstValueColumn(columns, "StageOrder");
  const targetColumn = firstValueColumn(columns, "Target");
  const excluded = new Set([valueColumn, orderColumn, targetColumn].filter((column): column is ValueColumnLike => Boolean(column)));

  return stages.map((stageValue, index) => {
    const rawValue = cellAt(valueColumn, index);
    return {
      label: text(stageValue, blankLabel),
      group: group ?? groupName(cellAt(groupCategory, index)),
      value: asNumber(rawValue),
      target: asNumber(cellAt(targetColumn, index)),
      stageOrder: asNumber(cellAt(orderColumn, index)),
      modelIndex: index,
      categoryIndex: index,
      seriesIndex,
      identity: stageCategory?.identity?.[index],
      groupIdentity: groupIdentity ?? groupCategory?.identity?.[index],
      highlighted: valueColumn?.highlights?.[index] === undefined || valueColumn.highlights[index] !== null,
      tooltipValues: getTooltips(columns, index, excluded),
      valueFormat: valueColumn?.source?.format,
      targetFormat: targetColumn?.source?.format
    };
  });
};

export const buildFunnelModel = (dataView: DataViewLike | undefined, options: BuildModelOptions = {}): FunnelModel => {
  const blankLabel = options.blankLabel ?? "(Blank)";
  const maxStages = Math.max(1, options.maxStages ?? 50);
  const categories = dataView?.categorical?.categories ?? [];
  const columns = dataView?.categorical?.values ?? [];
  const stageCategory = firstCategory(categories, "Stage");
  const groupCategory = firstCategory(categories, "Group");
  const valueColumn = firstValueColumn(columns, "Value");
  const stageOrderColumn = firstValueColumn(columns, "StageOrder");
  const warnings: FunnelWarning[] = [];
  const isSegmented = Boolean(dataView?.metadata && "segment" in dataView.metadata);

  if (!stageCategory) {
    warnings.push({
      code: "missing-stage",
      message: "Add a Stage field to define the ordered process."
    });
  }
  if (!valueColumn) {
    warnings.push({
      code: "missing-value",
      message: "Add a Value measure to calculate conversion."
    });
  }
  if (!stageCategory || !valueColumn) {
    return {
      stages: [],
      warnings,
      hasExplicitOrder: Boolean(stageOrderColumn),
      hasGroup: Boolean(groupCategory),
      groups: [],
      truncated: false,
      reducedCount: 0,
      completeness: isSegmented ? "partial-segment" : "complete"
    };
  }

  const grouped = columns.grouped?.() ?? [];
  const explicitOrder = Boolean(stageOrderColumn);
  if (!explicitOrder) {
    warnings.push({
      code: "inferred-order",
      message: "StageOrder is not assigned; model order is displayed and is not alphabetically sorted."
    });
  }
  if (isSegmented) {
    warnings.push({
      code: "partial-data",
      message: "The host supplied a data segment; conversion metrics describe the supplied segment only."
    });
  }

  const stageGroups: FunnelStage[] = [];
  const seenGroups = new Set<string>();
  let truncated = false;
  let reducedCount = 0;
  const addGroupRows = (
    rows: WorkingStage[],
    group: string | undefined,
    displayRows: WorkingStage[] = rows
  ): void => {
    const orderedRows = sortStages(displayRows, explicitOrder);
    const visibleRows = orderedRows.slice(0, maxStages);
    stageGroups.push(...calculateMetrics(visibleRows, warnings, group, explicitOrder));
    if (orderedRows.length > maxStages) {
      truncated = true;
      reducedCount += orderedRows.length - maxStages;
      warnings.push({
        code: "stage-limit",
        group,
        message: `Only the first ${maxStages} ordered stages are shown; ${orderedRows.length - maxStages} stage(s) are outside the visual window.`
      });
    }
  };

  const hasSeriesGroups =
    grouped.length > 0 &&
    grouped.some((entry) => entry.name !== undefined || entry.identity !== undefined);
  if (hasSeriesGroups) {
    grouped.forEach((entry, groupIndex) => {
      const group = groupName(entry.name) ?? `Group ${groupIndex + 1}`;
      seenGroups.add(group);
      addGroupRows(
        rowsFor(stageCategory, groupCategory, entry.values ?? columns, group, blankLabel, groupIndex, entry.identity),
        group
      );
    });
  } else {
    const rows = rowsFor(stageCategory, groupCategory, columns, undefined, blankLabel);
    rows.forEach((row) => {
      if (row.group) {
        seenGroups.add(row.group);
      }
    });
    const byGroup = groupCategory
      ? [...new Set(rows.map((row) => row.group ?? "Default"))].map((group) => rows.filter((row) => (row.group ?? "Default") === group))
      : [rows];
    byGroup.forEach((groupRows, groupIndex) => {
      const group = groupCategory ? (groupRows[0]?.group ?? `Group ${groupIndex + 1}`) : undefined;
      addGroupRows(groupRows, group);
    });
  }

  return {
    stages: stageGroups,
    warnings,
    hasExplicitOrder: explicitOrder,
    hasGroup: Boolean(groupCategory || hasSeriesGroups),
    groups: [...seenGroups],
    truncated,
    reducedCount,
    completeness: isSegmented ? "partial-segment" : truncated ? "ordered-window" : "complete"
  };
};
