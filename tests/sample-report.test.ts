/* eslint-disable powerbi-visuals/non-literal-fs-path -- these gates must read the tracked sample report by path. */
import fs from "node:fs";
import path from "node:path";

interface SampleReportInspection {
  issues: string[];
  files: string[];
  pages: string[];
  visuals: Array<{ path: string; visualType?: string; roles: string[] }>;
  projectName?: string;
  model?: {
    pbismVersion?: string;
    referencedTables?: string[];
    tables: Array<{ name: string; file: string; contents: string }>;
  };
  embeddedPackage?: { visual?: { guid?: string; version?: string } };
}

const { inspectSampleReport } = require("../scripts/sample-report-utils.cjs") as {
  inspectSampleReport: (
    projectDirectory: string,
    options: { guid?: string; version?: string; dataRoles?: string[] }
  ) => SampleReportInspection;
};

const readJson = <T>(relativePath: string): T =>
  JSON.parse(fs.readFileSync(relativePath, "utf8")) as T;

const publication = readJson<{
  assets: { sampleReportProject: string };
  listing: { pricing: string; transactable: boolean };
  sampleReport: { required: boolean; provided: boolean; projectFormat: string; projectPath: string };
}>("publication.json");
const pbiviz = readJson<{ visual: { guid: string; version: string } }>("pbiviz.json");
const capabilities = readJson<{ dataRoles: Array<{ name: string }> }>("capabilities.json");
const manifest = readJson<{
  publicationAssets: {
    sampleReportProject: { path: string; format: string; files: number; bytes: number; sha256: string };
  };
  publication: { pricing: string; transactable: boolean };
}>("release-manifest.json");

const projectPath = publication.assets.sampleReportProject;
const dataRoles = capabilities.dataRoles.map((role) => role.name);
const inspection = inspectSampleReport(projectPath, {
  guid: pbiviz.visual.guid,
  version: pbiviz.visual.version,
  dataRoles
});

describe("offline sample report project", () => {
  test("satisfies every structural invariant", () => {
    expect(inspection.issues).toEqual([]);
  });

  test("is a PBIP project with the documented parts", () => {
    const projectName = inspection.projectName as string;
    expect(projectName).toBeTruthy();
    [
      `${projectName}.pbip`,
      `${projectName}.Report/definition.pbir`,
      `${projectName}.Report/definition/version.json`,
      `${projectName}.Report/definition/report.json`,
      `${projectName}.Report/definition/pages/pages.json`,
      `${projectName}.SemanticModel/definition.pbism`,
      `${projectName}.SemanticModel/definition/database.tmdl`,
      `${projectName}.SemanticModel/definition/model.tmdl`
    ].forEach((file) => {
      expect(inspection.files).toContain(file);
    });
    expect(inspection.pages.length).toBeGreaterThanOrEqual(1);
  });

  test("binds every visual to the Atlyn Funnel GUID and only to real data roles", () => {
    expect(inspection.visuals.length).toBeGreaterThanOrEqual(1);
    inspection.visuals.forEach((visual) => {
      expect(visual.visualType).toBe("atlynFunnelA1B2C3D4");
      visual.roles.forEach((role) => {
        expect(dataRoles).toContain(role);
      });
      expect(visual.roles).toContain("Stage");
      expect(visual.roles).toContain("Value");
    });
  });

  test("embeds the visual as a private resource instead of resolving it from AppSource", () => {
    const projectName = inspection.projectName as string;
    const guid = pbiviz.visual.guid;
    expect(inspection.files).toContain(`${projectName}.Report/CustomVisuals/${guid}/package.json`);
    expect(inspection.files).toContain(
      `${projectName}.Report/CustomVisuals/${guid}/resources/${guid}.pbiviz.json`
    );
    expect(inspection.embeddedPackage?.visual?.guid).toBe(guid);
    expect(inspection.embeddedPackage?.visual?.version).toBe(pbiviz.visual.version);

    const report = fs.readFileSync(
      path.join(projectPath, `${projectName}.Report`, "definition", "report.json"),
      "utf8"
    );
    expect(report).not.toContain("publicCustomVisuals");
    expect(report).toContain("\"type\": \"CustomVisual\"");
  });

  test("loads all data from DAX calculated tables, so the model has no data source", () => {
    const tables = inspection.model?.tables ?? [];
    expect(tables.length).toBeGreaterThanOrEqual(1);
    expect(inspection.model?.pbismVersion).toMatch(/^4\./);
    tables.forEach((table) => {
      expect(table.contents).toMatch(/partition .+ = calculated/);
      expect(table.contents).toContain("DATATABLE(");
      expect(table.contents).not.toContain("#table(");
      expect(table.contents).not.toMatch(/https?:\/\//);
      expect(table.contents).not.toMatch(/\b(Sql|Web|File|Folder|Csv|Excel|Odbc|OData|SharePoint)\./);
      expect(table.contents).not.toMatch(/\bdataSource\b/);
    });
    expect(inspection.model?.referencedTables?.sort()).toEqual(
      tables.map((table) => table.name).sort()
    );
  });

  test("is recorded in the release manifest and stays a free, non-transactable listing", () => {
    expect(manifest.publicationAssets.sampleReportProject.path).toBe(projectPath);
    expect(manifest.publicationAssets.sampleReportProject.format).toBe("pbip");
    expect(manifest.publicationAssets.sampleReportProject.files).toBe(inspection.files.length);
    expect(manifest.publicationAssets.sampleReportProject.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(publication.listing.pricing).toBe("Free");
    expect(publication.listing.transactable).toBe(false);
    expect(manifest.publication.pricing).toBe("Free");
    expect(manifest.publication.transactable).toBe(false);
  });

  test("still reports the .pbix itself as an outstanding manual step", () => {
    expect(publication.sampleReport.required).toBe(true);
    expect(publication.sampleReport.provided).toBe(false);
    expect(publication.sampleReport.projectFormat).toBe("pbip");
    expect(publication.sampleReport.projectPath).toBe(projectPath);
  });
});
