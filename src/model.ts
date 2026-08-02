export type CellValue = string | number | boolean | null | undefined;

export interface SourceLike {
  displayName?: string;
  queryName?: string;
  roles?: Record<string, boolean>;
  objects?: Record<string, Record<string, ObjectValueLike>>;
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
  dataReduction?: unknown;
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

export type ValueState = "blank" | "zero" | "value" | "negative" | "invalid";

export interface FunnelWarning {
  code:
    | "missing-stage"
    | "missing-value"
    | "invalid-value"
    | "invalid-order"
    | "invalid-target"
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
  maxVisibleStages?: number;
  partialData?: boolean;
}

interface WorkingStage {
  label: string;
  group?: string;
  value: number | null;
  valueInvalid: boolean;
  target: number | null;
  targetInvalid: boolean;
  stageOrder: number | null;
  stageOrderInvalid: boolean;
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

const isBlank = (value: CellValue): boolean =>
  value === null ||
  value === undefined ||
  value === "" ||
  (typeof value === "string" && value.trim() === "");

const DEFAULT_MAX_VISIBLE_STAGES = 500;

interface ParsedNumber {
  value: number | null;
  blank: boolean;
  invalid: boolean;
}

const parseNumber = (value: CellValue): ParsedNumber => {
  if (isBlank(value)) {
    return { value: null, blank: true, invalid: false };
  }
  if (typeof value === "number") {
    return Number.isFinite(value)
      ? { value, blank: false, invalid: false }
      : { value: null, blank: false, invalid: true };
  }
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed)
      ? { value: parsed, blank: false, invalid: false }
      : { value: null, blank: false, invalid: true };
  }
  return { value: null, blank: false, invalid: true };
};

const text = (value: CellValue, blankLabel: string): string =>
  isBlank(value) ? blankLabel : String(value);

const stateFor = (parsed: ParsedNumber): ValueState => {
  if (parsed.invalid) {
    return "invalid";
  }
  if (parsed.blank || parsed.value === null) {
    return "blank";
  }
  if (parsed.value === 0) {
    return "zero";
  }
  return parsed.value < 0 ? "negative" : "value";
};

const groupName = (value: CellValue, blankLabel: string): string =>
  isBlank(value) ? blankLabel : String(value);

const formatFor = (source: SourceLike | undefined): string | undefined => {
  const format = source?.objects?.general?.formatString;
  return typeof format === "string" ? format : undefined;
};

const stableIdentityToken = (value: unknown, seen = new WeakSet<object>()): string => {
  if (value === undefined) {
    return "undefined";
  }
  if (value === null) {
    return "null";
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (typeof value === "bigint") {
    return `${value.toString()}n`;
  }
  if (typeof value === "function") {
    return value.name || "function";
  }
  if (seen.has(value)) {
    return "[circular]";
  }
  seen.add(value);
  if (Array.isArray(value)) {
    const token = `[${value.map((entry) => stableIdentityToken(entry, seen)).join(",")}]`;
    seen.delete(value);
    return token;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const token = `{${keys.map((key) => `${JSON.stringify(key)}:${stableIdentityToken(record[key], seen)}`).join(",")}}`;
  seen.delete(value);
  return token;
};

const getTooltips = (
  categories: CategoryColumnLike[],
  columns: ValueColumnLike[],
  index: number,
  excludedCategories: Set<CategoryColumnLike>,
  excludedColumns: Set<ValueColumnLike>
): Array<{ label: string; value: CellValue; format?: string }> =>
  [
    ...categories
      .filter((category) => roleIs(category.source, "Tooltips") && !excludedCategories.has(category))
      .map((category) => ({
        label: category.source?.displayName ?? category.source?.queryName ?? "Tooltip",
        value: cellAt(category, index),
        format: formatFor(category.source)
      })),
    ...columns
      .filter((column) => roleIs(column.source, "Tooltips") && !excludedColumns.has(column))
      .map((column) => ({
        label: column.source?.displayName ?? column.source?.queryName ?? "Tooltip",
        value: cellAt(column, index),
        format: formatFor(column.source)
      }))
  ].slice(0, 5);

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
  if (explicitOrder && rows.some((row) => row.stageOrder === null && !row.stageOrderInvalid)) {
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
    if (row.valueInvalid) {
      warnings.push({
        code: "invalid-value",
        group,
        stage: row.label,
        message: "This stage has a non-numeric Value; conversion metrics are unavailable."
      });
    } else if (row.value === null) {
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
    if (row.stageOrderInvalid) {
      warnings.push({
        code: "invalid-order",
        group,
        stage: row.label,
        message: "This StageOrder is not numeric; the row remains after ordered values in model order."
      });
    }
    if (row.targetInvalid) {
      warnings.push({
        code: "invalid-target",
        group,
        stage: row.label,
        message: "This Target is not numeric and is not used for comparison."
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
      key: JSON.stringify([
        group ?? "default",
        stableIdentityToken(row.groupIdentity),
        stableIdentityToken(row.identity),
        row.categoryIndex,
        row.seriesIndex,
        row.label
      ]),
      label: row.label,
      group,
      value: row.value,
      target: row.target,
      stageOrder: row.stageOrder,
      valueState: stateFor({
        value: row.value,
        blank: row.value === null && !row.valueInvalid,
        invalid: row.valueInvalid
      }),
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
  categories: CategoryColumnLike[],
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
  const excludedColumns = new Set([valueColumn, orderColumn, targetColumn].filter((column): column is ValueColumnLike => Boolean(column)));
  const excludedCategories = new Set([stageCategory, groupCategory].filter((category): category is CategoryColumnLike => Boolean(category)));

  return stages.map((stageValue, index) => {
    const rawValue = cellAt(valueColumn, index);
    const parsedValue = parseNumber(rawValue);
    const parsedTarget = parseNumber(cellAt(targetColumn, index));
    const parsedOrder = parseNumber(cellAt(orderColumn, index));
    return {
      label: text(stageValue, blankLabel),
      group: group ?? (groupCategory ? groupName(cellAt(groupCategory, index), blankLabel) : undefined),
      value: parsedValue.value,
      valueInvalid: parsedValue.invalid,
      target: parsedTarget.value,
      targetInvalid: parsedTarget.invalid,
      stageOrder: parsedOrder.value,
      stageOrderInvalid: parsedOrder.invalid,
      modelIndex: index,
      categoryIndex: index,
      seriesIndex,
      identity: stageCategory?.identity?.[index],
      groupIdentity: groupIdentity ?? groupCategory?.identity?.[index],
      highlighted: valueColumn?.highlights?.[index] === undefined || valueColumn.highlights[index] !== null,
      tooltipValues: getTooltips(categories, columns, index, excludedCategories, excludedColumns),
      valueFormat: formatFor(valueColumn?.source),
      targetFormat: formatFor(targetColumn?.source)
    };
  });
};

export const buildFunnelModel = (dataView: DataViewLike | undefined, options: BuildModelOptions = {}): FunnelModel => {
  const blankLabel = options.blankLabel ?? "(Blank)";
  const maxStages = Math.max(1, options.maxStages ?? 50);
  const maxVisibleStages = Math.max(1, options.maxVisibleStages ?? DEFAULT_MAX_VISIBLE_STAGES);
  const categories = dataView?.categorical?.categories ?? [];
  const columns = dataView?.categorical?.values ?? [];
  const stageCategory = firstCategory(categories, "Stage");
  const groupCategory = firstCategory(categories, "Group");
  const valueColumn = firstValueColumn(columns, "Value");
  const stageOrderColumn = firstValueColumn(columns, "StageOrder");
  const warnings: FunnelWarning[] = [];
  const isSegmented = Boolean(dataView?.metadata?.segment) || options.partialData === true;
  const isReduced = Boolean(dataView?.metadata?.dataReduction);

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
      completeness: isSegmented ? "partial-segment" : isReduced ? "ordered-window" : "complete"
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
  if (isSegmented || isReduced) {
    warnings.push({
      code: "partial-data",
      message: isSegmented
        ? "The host supplied a data segment; conversion metrics describe the supplied segment only."
        : "The host applied data reduction; conversion metrics describe the supplied ordered window only."
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
      const group = isBlank(entry.name) ? `Group ${groupIndex + 1}` : groupName(entry.name, blankLabel);
      seenGroups.add(group);
      addGroupRows(
        rowsFor(stageCategory, groupCategory, categories, entry.values ?? columns, group, blankLabel, groupIndex, entry.identity),
        group
      );
    });
  } else {
    const rows = rowsFor(stageCategory, groupCategory, categories, columns, undefined, blankLabel);
    rows.forEach((row) => {
      if (row.group) {
        seenGroups.add(row.group);
      }
    });
    const byGroup = groupCategory
      ? [...new Set(rows.map((row) => row.group ?? blankLabel))].map((group) => rows.filter((row) => (row.group ?? blankLabel) === group))
      : [rows];
    byGroup.forEach((groupRows, groupIndex) => {
      const group = groupCategory ? (groupRows[0]?.group ?? `Group ${groupIndex + 1}`) : undefined;
      addGroupRows(groupRows, group);
    });
  }
  if (stageGroups.length > maxVisibleStages) {
    const omitted = stageGroups.length - maxVisibleStages;
    stageGroups.splice(maxVisibleStages);
    truncated = true;
    reducedCount += omitted;
    warnings.unshift({
      code: "stage-limit",
      message: `The visual render limit is ${maxVisibleStages} rows; ${omitted} supplied row(s) are outside the rendered window.`
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
    completeness: isSegmented ? "partial-segment" : isReduced || truncated ? "ordered-window" : "complete"
  };
};
