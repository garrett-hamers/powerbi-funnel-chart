import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");

describe("certification-first package metadata", () => {
  test("declares the stable Atlyn Funnel GUID and exactly no privileges", () => {
    const capabilities = JSON.parse(fs.readFileSync(path.join(root, "capabilities.json"), "utf8")) as {
      privileges: unknown[];
    };
    const pbiviz = JSON.parse(fs.readFileSync(path.join(root, "pbiviz.json"), "utf8")) as {
      visual: {
        guid: string;
        name: string;
        supportUrl: string;
      };
      author: { name: string; email: string };
    };
    expect(pbiviz.visual.guid).toBe("atlynFunnelA1B2C3D4");
    expect(pbiviz.visual.name).toBe("atlynFunnel");
    expect(pbiviz.visual.supportUrl).toBe("https://github.com/garrett-hamers/powerbi-funnel-chart");
    expect(pbiviz.author).toEqual({
      name: "Garrett Hamers",
      email: "garrett.hamers@gmail.com"
    });
    expect(capabilities.privileges).toEqual([]);
  });

  test("uses an ordered window and never a top/value reduction", () => {
    const capabilities = JSON.parse(fs.readFileSync(path.join(root, "capabilities.json"), "utf8")) as {
      dataViewMappings: Array<{
        categorical: {
          categories: {
            dataReductionAlgorithm: { window: { count: number } };
            select: Array<Record<string, unknown>>;
          };
        };
      }>;
    };
    const categories = capabilities.dataViewMappings[0].categorical.categories;
    expect(categories.dataReductionAlgorithm.window.count).toBe(50);
    expect(categories.select.some((item) => "dataReductionAlgorithm" in item)).toBe(false);
    expect(JSON.stringify(capabilities)).not.toMatch(/"top"|sortBy|orderBy/i);
  });

  test("requires both Stage and Value roles", () => {
    const capabilities = JSON.parse(fs.readFileSync(path.join(root, "capabilities.json"), "utf8")) as {
      dataViewMappings: Array<{ conditions: Array<{ Stage: { min: number }; Value: { min: number } }> }>;
    };
    const condition = capabilities.dataViewMappings[0].conditions[0];
    expect(condition.Stage.min).toBe(1);
    expect(condition.Value.min).toBe(1);
  });

  test("declares every formatting-model setting and localized display key", () => {
    const capabilities = JSON.parse(fs.readFileSync(path.join(root, "capabilities.json"), "utf8")) as {
      dataRoles: Array<{ displayNameKey?: string }>;
      objects: Record<string, {
        displayNameKey?: string;
        properties?: Record<string, { displayNameKey?: string }>;
      }>;
    };
    expect(capabilities.dataRoles.every((role) => Boolean(role.displayNameKey))).toBe(true);
    expect(capabilities.objects.dataPoint.displayNameKey).toBe("Object_DataPoint_DisplayNameKey");
    expect(capabilities.objects.dataPoint.properties?.fill.displayNameKey).toBe("Property_DataPointFill_DisplayNameKey");
    expect(capabilities.objects.labels.displayNameKey).toBe("Object_Labels_DisplayNameKey");
    expect(capabilities.objects.labels.properties?.show.displayNameKey).toBe("Property_LabelsShow_DisplayNameKey");
    expect(fs.existsSync(path.join(root, "stringResources", "en-US", "resources.resjson"))).toBe(true);
  });

  test("does not include network access, unsafe DOM APIs, or external assets", () => {
    const source = fs.readFileSync(path.join(root, "src", "visual.ts"), "utf8");
    expect(source).not.toMatch(/\b(fetch|XMLHttpRequest|WebSocket|eval)\b/);
    expect(source).not.toMatch(/\b(innerHTML|outerHTML|insertAdjacentHTML)\b/);
    expect(fs.readFileSync(path.join(root, "pbiviz.json"), "utf8")).toContain('"externalJS": []');
  });
});
