import { buildFunnelModel, CellValue, DataViewLike } from "../src/model";

const dataView = (
  stages: Array<string | null>,
  values: CellValue[],
  options: {
    order?: CellValue[];
    targets?: CellValue[];
    groups?: CellValue[];
    highlights?: CellValue[];
    segmented?: boolean;
  } = {}
): DataViewLike => ({
  metadata: options.segmented ? { segment: {} } : undefined,
  categorical: {
    categories: [
      {
        source: { roles: { Stage: true }, displayName: "Stage" },
        values: stages
      },
      ...(options.groups
        ? [{ source: { roles: { Group: true }, displayName: "Group" }, values: options.groups }]
        : [])
    ],
    values: [
      {
        source: { roles: { Value: true }, displayName: "Value" },
        values,
        highlights: options.highlights
      },
      ...(options.order
        ? [{ source: { roles: { StageOrder: true }, displayName: "StageOrder" }, values: options.order }]
        : []),
      ...(options.targets
        ? [{ source: { roles: { Target: true }, displayName: "Target" }, values: options.targets }]
        : [])
    ]
  }
});

describe("Atlyn Funnel conversion model", () => {
  test("uses StageOrder instead of labels or values and calculates all conversion metrics", () => {
    const model = buildFunnelModel(dataView(["Intake", "Won", "Proposal"], [100, 25, 50], { order: [1, 3, 2] }));
    expect(model.stages.map((stage) => stage.label)).toEqual(["Intake", "Proposal", "Won"]);
    expect(model.stages[1]).toMatchObject({
      value: 50,
      overallConversion: 0.5,
      stageConversion: 0.5,
      dropRate: 0.5,
      absoluteLoss: 50
    });
    expect(model.stages[2]).toMatchObject({
      overallConversion: 0.25,
      stageConversion: 0.5,
      dropRate: 0.5,
      absoluteLoss: 25
    });
    expect(model.hasExplicitOrder).toBe(true);
    expect(model.warnings.some((warning) => warning.code === "inferred-order")).toBe(false);
  });

  test("preserves model order when StageOrder is absent and warns instead of sorting", () => {
    const model = buildFunnelModel(dataView(["Zeta", "Alpha", "Middle"], [100, 60, 80]));
    expect(model.stages.map((stage) => stage.label)).toEqual(["Zeta", "Alpha", "Middle"]);
    expect(model.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "inferred-order" }),
      expect.objectContaining({ code: "nonmonotonic" })
    ]));
  });

  test("warns on duplicate order and uses model index to break ties", () => {
    const model = buildFunnelModel(dataView(["First", "Second", "Third"], [30, 20, 10], { order: [2, 1, 1] }));
    expect(model.stages.map((stage) => stage.label)).toEqual(["Second", "Third", "First"]);
    expect(model.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "duplicate-order" })
    ]));
  });

  test("treats zero and negative StageOrder as valid and invalid order values as model-order fallbacks", () => {
    const model = buildFunnelModel(dataView(
      ["Zero", "Negative", "Invalid"],
      [30, 20, 10],
      { order: [0, -1, "not-a-number"] }
    ));
    expect(model.stages.map((stage) => stage.label)).toEqual(["Negative", "Zero", "Invalid"]);
    expect(model.stages.map((stage) => stage.stageOrder)).toEqual([-1, 0, null]);
    expect(model.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "invalid-order", stage: "Invalid" })
    ]));
    expect(model.warnings.some((warning) => warning.code === "missing-order")).toBe(false);
  });

  test("preserves duplicate stage labels and diagnoses them", () => {
    const model = buildFunnelModel(dataView(["Lead", "Lead"], [20, 10]));
    expect(model.stages.map((stage) => stage.label)).toEqual(["Lead", "Lead"]);
    expect(model.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "duplicate-stage" })
    ]));
  });

  test("keeps zero distinct from blank and does not invent ratios across blanks", () => {
    const model = buildFunnelModel(dataView(["Zero", "Blank", "Final"], [0, null, 10]));
    expect(model.stages[0].valueState).toBe("zero");
    expect(model.stages[0].value).toBe(0);
    expect(model.stages[0].overallConversion).toBeNull();
    expect(model.stages[1].valueState).toBe("blank");
    expect(model.stages[1].absoluteLoss).toBeNull();
    expect(model.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "zero-baseline" }),
      expect.objectContaining({ code: "blank-value" })
    ]));
  });

  test("retains negative values, reports nonmonotonic increases, and never hides them", () => {
    const model = buildFunnelModel(dataView(["Start", "Increase", "Negative"], [10, 15, -2]));
    expect(model.stages.map((stage) => stage.value)).toEqual([10, 15, -2]);
    expect(model.stages[2].valueState).toBe("negative");
    expect(model.stages[2].overallConversion).toBeNull();
    expect(model.stages[2].stageConversion).toBeNull();
    expect(model.stages[2].absoluteLoss).toBeNull();
    expect(model.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "nonmonotonic", stage: "Increase" }),
      expect.objectContaining({ code: "negative-value", stage: "Negative" })
    ]));
  });

  test("distinguishes invalid numeric values from blanks and preserves negative targets", () => {
    const model = buildFunnelModel(dataView(
      ["Valid", "Invalid", "Blank"],
      [10, "not-a-number", null],
      { targets: [-5, "bad", 0] }
    ));
    expect(model.stages[0].valueState).toBe("value");
    expect(model.stages[1].valueState).toBe("invalid");
    expect(model.stages[2].valueState).toBe("blank");
    expect(model.stages[0].target).toBe(-5);
    expect(model.stages[1].target).toBeNull();
    expect(model.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "invalid-value", stage: "Invalid" }),
      expect.objectContaining({ code: "invalid-target", stage: "Invalid" }),
      expect.objectContaining({ code: "blank-value", stage: "Blank" })
    ]));
  });

  test("calculates each group independently", () => {
    const model = buildFunnelModel(dataView(
      ["Lead", "Won", "Lead", "Won"],
      [100, 25, 80, 40],
      { groups: ["North", "North", "South", "South"] }
    ));
    expect(model.stages.filter((stage) => stage.group === "North")[1].stageConversion).toBe(0.25);
    expect(model.stages.filter((stage) => stage.group === "South")[1].stageConversion).toBe(0.5);
  });

  test("does not invent a group for the host's synthetic ungrouped series", () => {
    const view = dataView(["Lead", "Won"], [100, 25]);
    const columns = view.categorical?.values;
    if (!columns) {
      throw new Error("test data must include value columns");
    }
    columns.grouped = () => [{ values: [...columns] }];
    const model = buildFunnelModel(view);
    expect(model.hasGroup).toBe(false);
    expect(model.stages.every((stage) => stage.group === undefined)).toBe(true);
    expect(model.stages.map((stage) => stage.label)).toEqual(["Lead", "Won"]);
  });

  test("uses composite model keys for duplicate stages across groups", () => {
    const model = buildFunnelModel(dataView(
      ["Lead", "Won", "Lead", "Won"],
      [100, 25, 80, 40],
      { groups: ["North", "North", "South", "South"] }
    ));
    expect(new Set(model.stages.map((stage) => stage.key)).size).toBe(model.stages.length);
    expect(model.stages.filter((stage) => stage.label === "Lead")).toHaveLength(2);
  });

  test("keeps a blank group distinct from a named group", () => {
    const model = buildFunnelModel(dataView(
      ["Lead", "Lead"],
      [100, 80],
      { groups: [null, "North"] }
    ));
    expect(model.stages.map((stage) => stage.group)).toEqual(["(Blank)", "North"]);
    expect(new Set(model.stages.map((stage) => stage.key)).size).toBe(2);
  });

  test("preserves measure format metadata for values and targets", () => {
    const view = dataView(["Lead", "Won"], [1234.5, 250], { targets: [1500, 300] });
    const columns = view.categorical?.values;
    const valueColumn = columns?.find((column) => column.source?.roles?.Value);
    const targetColumn = columns?.find((column) => column.source?.roles?.Target);
    if (!valueColumn?.source || !targetColumn?.source) {
      throw new Error("test data must include value and target columns");
    }
    valueColumn.source.objects = { general: { formatString: "$#,0.00" } };
    targetColumn.source.objects = { general: { formatString: "$#,0" } };
    const model = buildFunnelModel(view);
    expect(model.stages[0]).toMatchObject({ valueFormat: "$#,0.00", targetFormat: "$#,0" });
  });

  test("keeps categorical tooltip fields in each stage's tooltip payload", () => {
    const view = dataView(["Lead", "Won"], [100, 25]);
    view.categorical?.categories?.push({
      source: { roles: { Tooltips: true }, displayName: "Owner" },
      values: ["Ada", "Lin"]
    });
    const model = buildFunnelModel(view);
    expect(model.stages[0].tooltipValues).toEqual([
      { label: "Owner", value: "Ada", format: undefined }
    ]);
  });

  test("surfaces segmented host data as an incomplete contract", () => {
    const model = buildFunnelModel(dataView(["Start", "Finish"], [100, 25], { segmented: true }));
    expect(model.completeness).toBe("partial-segment");
    expect(model.truncated).toBe(false);
    expect(model.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "partial-data" })
    ]));
  });

  test("surfaces host data reduction even when the visible window is not locally truncated", () => {
    const view = dataView(["Start", "Finish"], [100, 25]);
    view.metadata = { dataReduction: { categorical: { categories: { window: { count: 50 } } } } };
    const model = buildFunnelModel(view);
    expect(model.completeness).toBe("ordered-window");
    expect(model.truncated).toBe(false);
    expect(model.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "partial-data" })
    ]));
  });

  test("uses a bounded ordered window and reports truncation", () => {
    const stages = Array.from({ length: 55 }, (_, index) => `Stage ${index}`);
    const values = stages.map(() => 1);
    const model = buildFunnelModel(dataView(stages, values));
    expect(model.stages).toHaveLength(50);
    expect(model.truncated).toBe(true);
    expect(model.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "stage-limit" })
    ]));
  });

  test("bounds total grouped rows without silently claiming completeness", () => {
    const model = buildFunnelModel(
      dataView(
        ["Lead", "Won", "Lead", "Won", "Lead", "Won"],
        [100, 25, 90, 30, 80, 40],
        { groups: ["North", "North", "South", "South", "West", "West"] }
      ),
      { maxVisibleStages: 3 }
    );
    expect(model.stages).toHaveLength(3);
    expect(model.completeness).toBe("ordered-window");
    expect(model.reducedCount).toBe(3);
    expect(model.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "stage-limit", message: expect.stringContaining("render limit is 3") })
    ]));
  });

  test("handles missing roles without throwing", () => {
    const model = buildFunnelModel({ categorical: { categories: [], values: [] } });
    expect(model.stages).toHaveLength(0);
    expect(model.warnings.map((warning) => warning.code)).toEqual(["missing-stage", "missing-value"]);
  });
});
