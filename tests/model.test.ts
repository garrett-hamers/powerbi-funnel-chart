import { buildFunnelModel, DataViewLike } from "../src/model";

const dataView = (
  stages: Array<string | null>,
  values: Array<number | null>,
  options: {
    order?: Array<number | null>;
    targets?: Array<number | null>;
    groups?: Array<string>;
    highlights?: Array<number | null>;
  } = {}
): DataViewLike => ({
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
    expect(model.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "nonmonotonic", stage: "Increase" }),
      expect.objectContaining({ code: "negative-value", stage: "Negative" })
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

  test("handles missing roles without throwing", () => {
    const model = buildFunnelModel({ categorical: { categories: [], values: [] } });
    expect(model.stages).toHaveLength(0);
    expect(model.warnings.map((warning) => warning.code)).toEqual(["missing-stage", "missing-value"]);
  });
});
