/* eslint-disable powerbi-visuals/non-literal-fs-path -- isolated temporary copies of the tracked sample report are required to drive each structural issue without touching the committed project. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/*
 * Coverage of the sample-report validator's failure paths.
 *
 * tests/sample-report.test.ts calls inspectSampleReport once, on the tracked project, and
 * asserts `issues` is empty. That proves the happy path and nothing else: 30 issue paths
 * exist and one had ever been observed to fire, so a path that could never fire was
 * indistinguishable from one that simply had nothing to report.
 *
 * This file drives a subset of them by copying the tracked project into a temp tree and
 * breaking one thing at a time. The count covered is stated rather than implied - see
 * COVERED below - because a partial sweep reported as a complete one is the failure this
 * whole suite exists to catch.
 *
 * Unlike scripts/certification-audit.cjs and scripts/release-manifest.cjs, this validator
 * already has a seam: inspectSampleReport(projectDirectory, options) takes a directory and
 * returns a list. Driving it needs no restructure, which is why it is tested here and they
 * are recorded in an issue instead.
 */

interface Inspection {
  issues: string[];
  projectName?: string;
}

const { inspectSampleReport } = require("../scripts/sample-report-utils.cjs") as {
  inspectSampleReport: (
    projectDirectory: string,
    options: { guid?: string; version?: string; dataRoles?: string[] }
  ) => Inspection;
};

const readJson = <T>(relativePath: string): T =>
  JSON.parse(fs.readFileSync(relativePath, "utf8")) as T;

const publication = readJson<{ assets: { sampleReportProject: string } }>("publication.json");
const pbiviz = readJson<{ visual: { guid: string; version: string } }>("pbiviz.json");
const capabilities = readJson<{ dataRoles: Array<{ name: string }> }>("capabilities.json");

const OPTIONS = {
  guid: pbiviz.visual.guid,
  version: pbiviz.visual.version,
  dataRoles: capabilities.dataRoles.map((role) => role.name)
};

const copyTree = (from: string, to: string): void => {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) {
      copyTree(source, target);
    } else {
      fs.copyFileSync(source, target);
    }
  }
};

/*
 * Copies the tracked project, applies one break, and returns the issues. The project is
 * never modified in place: a validator test that mutates the artifact it validates would
 * leave the repository in the broken state it was asserting about.
 */
const withBrokenProject = (breakIt: (root: string) => void): string[] => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "atlyn-sample-report-"));
  try {
    const project = path.join(root, path.basename(publication.assets.sampleReportProject));
    copyTree(publication.assets.sampleReportProject, project);
    breakIt(project);
    return inspectSampleReport(project, OPTIONS).issues;
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
};

const fileIn = (root: string, ...parts: string[]): string => path.join(root, ...parts);

const reportJsonPath = (root: string): string =>
  walkFiles(root).find((file) => file.endsWith(`definition${path.sep}report.json`)) as string;

const definitionPbir = (root: string): string => {
  const name = fs.readdirSync(root).find((entry) => entry.endsWith(".Report"));
  return fileIn(root, name as string, "definition.pbir");
};

// Stated, not implied. Raising this number means driving more paths, not rewording it.
const COVERED = 9;

describe("the sample report validator is capable of failing", () => {
  test("an untouched copy still reports nothing, so every case below is caused by its break", () => {
    expect(withBrokenProject(() => {})).toEqual([]);
  });

  test(`covers ${COVERED} distinct issue paths`, () => {
    // A missing project directory entirely.
    expect(withBrokenProject((root) => {
      fs.rmSync(root, { recursive: true, force: true });
    }).join("\n")).toContain("sample report project is missing");

    // The .pbip entry point removed.
    expect(withBrokenProject((root) => {
      const pbip = fs.readdirSync(root).find((entry) => entry.endsWith(".pbip"));
      fs.rmSync(fileIn(root, pbip as string));
    }).join("\n")).toContain("must contain a .pbip entry point");

    // A byConnection dataset reference instead of a relative path.
    expect(withBrokenProject((root) => {
      const pbir = definitionPbir(root);
      const parsed = JSON.parse(fs.readFileSync(pbir, "utf8")) as Record<string, unknown>;
      parsed.datasetReference = { byConnection: { connectionString: "x" } };
      fs.writeFileSync(pbir, JSON.stringify(parsed, null, 2));
    }).join("\n")).toContain("must not use a byConnection dataset reference");

    // publicCustomVisuals, which resolves from the store rather than the embedded package.
    expect(withBrokenProject((root) => {
      const reportJson = reportJsonPath(root);
      const parsed = JSON.parse(fs.readFileSync(reportJson, "utf8")) as Record<string, unknown>;
      parsed.publicCustomVisuals = [pbiviz.visual.guid];
      fs.writeFileSync(reportJson, JSON.stringify(parsed, null, 2));
    }).join("\n")).toContain("publicCustomVisuals");

    // The CustomVisual resource package removed.
    expect(withBrokenProject((root) => {
      const reportJson = reportJsonPath(root);
      const parsed = JSON.parse(fs.readFileSync(reportJson, "utf8")) as {
        resourcePackages?: unknown[];
      };
      parsed.resourcePackages = [];
      fs.writeFileSync(reportJson, JSON.stringify(parsed, null, 2));
    }).join("\n")).toContain("must declare a CustomVisual resource package");

    // A visual bound to a role capabilities.json does not declare.
    expect(withBrokenProject((root) => {
      const visual = findVisualFile(root);
      const parsed = JSON.parse(fs.readFileSync(visual, "utf8")) as {
        visual?: { query?: { queryState?: Record<string, unknown> } };
      };
      const queryState = parsed.visual?.query?.queryState ?? {};
      const firstRole = Object.keys(queryState)[0];
      queryState.NotARole = queryState[firstRole];
      delete queryState[firstRole];
      fs.writeFileSync(visual, JSON.stringify(parsed, null, 2));
    }).join("\n")).toMatch(/is not a capabilities\.json data role|must bind the required/);

    // A semantic model that declares a data source.
    expect(withBrokenProject((root) => {
      const table = findTableTmdl(root);
      fs.appendFileSync(table, "\n\tpartition Source = m\n\t\tmode: import\n\t\tsource = Sql.Database(\"h\", \"d\")\n");
    }).join("\n")).toMatch(/external data source|declares a data source|Power Query partition/);

    // A table file that model.tmdl does not reference.
    expect(withBrokenProject((root) => {
      const table = findTableTmdl(root);
      fs.copyFileSync(table, path.join(path.dirname(table), "orphaned.tmdl"));
    }).join("\n")).toContain("is not referenced by model.tmdl");

    // The embedded package declaring a different GUID.
    expect(withBrokenProject((root) => {
      const embedded = findEmbeddedPackage(root);
      const parsed = JSON.parse(fs.readFileSync(embedded, "utf8")) as {
        visual?: Record<string, unknown>;
      };
      if (parsed.visual) {
        parsed.visual.guid = "someOtherVisualGuid";
      }
      fs.writeFileSync(embedded, JSON.stringify(parsed, null, 2));
    }).join("\n")).toContain("different GUID");
  });
});

function walkFiles(root: string): string[] {
  const found: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(full);
      } else {
        found.push(full);
      }
    }
  };
  visit(root);
  return found;
}

function findVisualFile(root: string): string {
  return walkFiles(root).find((file) => file.endsWith("visual.json")) as string;
}

function findTableTmdl(root: string): string {
  return walkFiles(root).find((file) => file.includes("tables") && file.endsWith(".tmdl")) as string;
}

function findEmbeddedPackage(root: string): string {
  /*
   * CustomVisuals/<guid>/package.json, which is what the validator reads. An earlier
   * version of this targeted the `.pbiviz.json` beside it under resources/, which the
   * validator never opens for this check, so the mutation produced no issue and read as a
   * rule that could not fire. Fifth time in this session that a single negative probe was
   * the instrument rather than the code.
   */
  return walkFiles(root).find(
    (file) => file.includes(`CustomVisuals${path.sep}`) && file.endsWith(`${path.sep}package.json`)
  ) as string;
}
