/* eslint-disable powerbi-visuals/non-literal-fs-path -- isolated temporary trees are required to exercise the tampering guards without touching the committed assets. */
/*
 * The committed capture record is the only thing that survives a capture run, so its
 * guards need their own tests.
 *
 * The failure being defended against is not a broken render — the capture-time
 * assertions already catch that — but a screenshot that is hand-edited, reverted, or
 * swapped afterwards, and a screenshot captured from a build that is no longer the one
 * being shipped. Both leave a file that satisfies every other gate in the repository.
 *
 * A record that exists but vouches for nothing looks exactly like coverage, so the
 * hollow-entry cases matter as much as the hash cases.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const {
  RECORD_PATH,
  SCHEMA_VERSION,
  findNullish,
  assertionHolds,
  readRecord,
  auditCaptureRecord
} = require("../scripts/screenshot-capture-record.cjs") as {
  RECORD_PATH: string;
  SCHEMA_VERSION: number;
  findNullish: (value: unknown, trail?: string) => string[];
  assertionHolds: (assertion: { expected: unknown; measured: unknown }) => boolean;
  readRecord: (root: string) => Record<string, unknown> | null;
  auditCaptureRecord: (options: {
    root: string;
    record: Record<string, unknown> | null;
    sceneIds: string[];
    screenshotPaths: string[];
    packageSha256?: string;
    packageName?: string;
  }) => string[];
};

const { describeScene, expectationFor } =
  require("../scripts/screenshot-scene-expectations.cjs") as {
    describeScene: (
      expectation: Record<string, unknown>,
      report: Record<string, unknown>
    ) => Record<string, unknown>;
    expectationFor: (sceneId: string) => Record<string, unknown>;
  };

const publication = JSON.parse(fs.readFileSync("publication.json", "utf8")) as {
  assets: { screenshots: string[]; captureRecord: string };
};
const scenarios = JSON.parse(
  fs.readFileSync("assets/sample-data/screenshot-scenarios.json", "utf8")
) as { scenarios: Array<{ id: string }> };
const sceneIds = scenarios.scenarios.map((scene) => scene.id);
const committed = readRecord(".") as {
  package: { sha256: string; filename: string; version: string };
  scenes: Array<{
    id: string;
    assertions: Array<{ name: string; expected: unknown; measured: unknown }>;
    observations: Record<string, unknown>;
    screenshot: { path: string; sha256: string; bytes: number };
    visual: { width: number; height: number };
  }>;
};

/*
 * Builds a throwaway tree holding just the files the record refers to, so a tampering
 * case can be exercised without touching the committed assets.
 */
const withTamperedTree = (
  mutate: (record: Record<string, unknown>, root: string) => void,
  run: (failures: string[]) => void
) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "atlyn-funnel-record-"));
  try {
    const record = JSON.parse(JSON.stringify(committed));
    fs.mkdirSync(path.join(root, "assets", "screenshots"), { recursive: true });
    publication.assets.screenshots.forEach((relativePath) => {
      fs.copyFileSync(relativePath, path.join(root, relativePath));
    });
    mutate(record, root);
    run(
      auditCaptureRecord({
        root,
        record,
        sceneIds,
        screenshotPaths: publication.assets.screenshots,
        packageSha256: committed.package.sha256,
        packageName: committed.package.filename
      })
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
};

const firstScene = (record: Record<string, unknown>) =>
  (record.scenes as Array<Record<string, unknown>>)[0];

describe("the committed capture record", () => {
  test("exists, is declared as a submission asset, and covers every scene", () => {
    expect(publication.assets.captureRecord).toBe(RECORD_PATH);
    expect(fs.existsSync(RECORD_PATH)).toBe(true);
    expect(committed.scenes.map((scene) => scene.id)).toEqual(sceneIds);
    expect(committed.package.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  test("re-derives clean against the working tree", () => {
    // No package hash here: npm test runs before anything is packaged in CI, so the
    // build check is the certification audit's job. Everything else is checked now.
    expect(
      auditCaptureRecord({
        root: ".",
        record: committed,
        sceneIds,
        screenshotPaths: publication.assets.screenshots
      })
    ).toEqual([]);
  });

  test("records the measured values a reviewer would need, not a pass or fail", () => {
    committed.scenes.forEach((scene) => {
      expect(scene.assertions.length).toBeGreaterThanOrEqual(20);
      expect(scene.visual.width).toBeGreaterThan(0);
      expect(scene.visual.height).toBeGreaterThan(0);
      // Measured values, so the record can be read months later.
      expect(scene.observations.barDrawnWidths).toEqual(expect.any(Array));
      expect((scene.observations.barDrawnWidths as number[]).length).toBeGreaterThan(0);
      expect((scene.observations.summaryMetricText as string[]).join(" ")).toContain("conversion");
      scene.assertions.forEach((assertion) => {
        expect(findNullish(assertion.measured)).toEqual([]);
        expect(assertionHolds(assertion)).toBe(true);
      });
    });
  });

  test("records the load-bearing values of each scene", () => {
    const named = (sceneId: string) =>
      committed.scenes.find((scene) => scene.id === sceneId)!.assertions.map((entry) => entry.name);

    // Losing one segment leaves a healthy four-bar funnel behind, so the per-segment
    // counts are what prove the comparison is still on screen.
    expect(named("02-segment-comparison")).toEqual(
      expect.arrayContaining([
        "chartLabelsInSegment:North America",
        "chartLabelsInSegment:EMEA",
        "stageRowsInSegment:North America",
        "stageRowsInSegment:EMEA"
      ])
    );
    expect(named("03-diagnostics")).toEqual(
      expect.arrayContaining([
        "region:warnings",
        "diagnosticMentions:inferred order",
        "diagnosticMentions:blank",
        "diagnosticMentions:nonmonotonic",
        "blankStageDrawsNoBar:4",
        "stageIncreases:5->6"
      ])
    );
    expect(named("01-conversion-funnel")).toEqual(
      expect.arrayContaining(["regionAbsent:warnings", "funnelNarrows:1", "stageRowMentions:Target"])
    );

    // The diagnostic text itself is committed, so a reviewer sees what was on screen.
    const diagnostics = committed.scenes.find((scene) => scene.id === "03-diagnostics")!;
    expect((diagnostics.observations.diagnosticText as string[]).join(" ")).toContain("Nonmonotonic");
  });
});

describe("capture record guards", () => {
  test("rejects a screenshot that changed after the capture that vouched for it", () => {
    withTamperedTree(
      (_record, root) => {
        // The realistic case: a valid, correctly sized, under-cap PNG swapped in for
        // another. Every other gate in the repository passes on this.
        fs.copyFileSync(
          path.join(root, "assets/screenshots/01-conversion-funnel.png"),
          path.join(root, "assets/screenshots/03-diagnostics.png")
        );
      },
      (failures) => {
        expect(failures.join("\n")).toContain("03-diagnostics.png");
        expect(failures.join("\n")).toContain("without the capture being re-run");
      }
    );
  });

  test("rejects a screenshot that is missing entirely", () => {
    withTamperedTree(
      (_record, root) => fs.rmSync(path.join(root, "assets/screenshots/02-segment-comparison.png")),
      (failures) => expect(failures.join("\n")).toContain("not in the working tree")
    );
  });

  test("rejects screenshots rendered from a different build than the one being shipped", () => {
    // The failure that actually shipped in a sibling repository. The version string is
    // deliberately left untouched here, because it is too coarse to catch this: the
    // packaged bytes move more than once inside one version.
    const failures = auditCaptureRecord({
      root: ".",
      record: committed,
      sceneIds,
      screenshotPaths: publication.assets.screenshots,
      packageSha256: "f".repeat(64),
      packageName: committed.package.filename
    });
    expect(failures.join("\n")).toContain("depict a different build");
    expect(failures.join("\n")).toContain("re-run `npm run screenshots`");
  });

  test("rejects a declared screenshot that no scene ever vouched for", () => {
    // publication.json allows up to five screenshots while three scenes are declared,
    // so a hand-made PNG could otherwise be added to the submission with nothing but a
    // dimension and byte-size check behind it.
    const failures = auditCaptureRecord({
      root: ".",
      record: committed,
      sceneIds,
      screenshotPaths: [...publication.assets.screenshots, "assets/screenshots/04-handmade.png"]
    });
    expect(failures.join("\n")).toContain("no scene in");
    expect(failures.join("\n")).toContain("nothing has ever checked what it shows");
  });

  test("rejects a scene vouching for a screenshot that is not its own", () => {
    // Swapping two scenes' recorded blocks leaves every hash matching the file that now
    // holds those bytes, which would re-bless exactly the PNG swap above.
    withTamperedTree(
      (record) => {
        const scenes = record.scenes as Array<Record<string, unknown>>;
        const first = scenes[0].screenshot;
        scenes[0].screenshot = scenes[2].screenshot;
        scenes[2].screenshot = first;
      },
      (failures) => expect(failures.join("\n")).toContain("may only vouch for its own")
    );
  });

  test("rejects an entry that records no assertions", () => {
    withTamperedTree(
      (record) => {
        firstScene(record).assertions = [];
      },
      (failures) => expect(failures.join("\n")).toContain("vouches for nothing")
    );
  });

  test("rejects an assertion with no measured value", () => {
    withTamperedTree(
      (record) => {
        (firstScene(record).assertions as Array<Record<string, unknown>>)[1].measured = null;
      },
      (failures) => expect(failures.join("\n")).toContain("asserts nothing")
    );

    withTamperedTree(
      (record) => {
        delete (firstScene(record).assertions as Array<Record<string, unknown>>)[1].measured;
      },
      (failures) => expect(failures.join("\n")).toContain("records no measured value")
    );
  });

  test("rejects a nullish value nested inside a measured shape", () => {
    withTamperedTree(
      (record) => {
        const assertions = firstScene(record).assertions as Array<Record<string, unknown>>;
        const region = assertions.find((entry) => String(entry.name).startsWith("region:"))!;
        (region.measured as Record<string, unknown>).height = null;
      },
      (failures) => expect(failures.join("\n")).toContain("height")
    );
  });

  test("rejects a record whose measured value does not satisfy its own expectation", () => {
    // Otherwise a hand-edited record could claim "expected 6, measured 4" and pass for
    // having a non-null number in the field.
    withTamperedTree(
      (record) => {
        const assertions = firstScene(record).assertions as Array<Record<string, unknown>>;
        const bars = assertions.find((entry) => entry.name === "bars")!;
        bars.measured = 4;
      },
      (failures) => expect(failures.join("\n")).toContain("does not satisfy it")
    );
  });

  test("rejects a record that no longer covers the declared scenes", () => {
    withTamperedTree(
      (record) => {
        (record.scenes as unknown[]).pop();
      },
      (failures) => expect(failures.join("\n")).toContain("re-run `npm run screenshots`")
    );
  });

  test("rejects a missing record and an unreadable schema", () => {
    expect(
      auditCaptureRecord({
        root: ".",
        record: null,
        sceneIds,
        screenshotPaths: publication.assets.screenshots
      }).join("\n")
    ).toContain("is missing");

    withTamperedTree(
      (record) => {
        record.$schema = SCHEMA_VERSION + 1;
      },
      (failures) => expect(failures.join("\n")).toContain("schema")
    );
  });

  test("keeps the note that stops these hashes becoming a golden-image check", () => {
    // Browser renders are not bit-stable and differ across platforms: this repository's
    // own CI renders the same scenes 55-58% larger on Linux than on Windows while every
    // content assertion passes on both. A re-render comparison would fail constantly.
    withTamperedTree(
      (record) => {
        record.hashNote = "compare against a fresh render";
      },
      (failures) => expect(failures.join("\n")).toContain("golden-image")
    );
  });
});

describe("record construction", () => {
  test("findNullish walks arrays and nested shapes", () => {
    expect(findNullish(0)).toEqual([]);
    expect(findNullish(false)).toEqual([]);
    expect(findNullish("")).toEqual([]);
    expect(findNullish(null)).toEqual(["value"]);
    expect(findNullish({ a: { b: [1, undefined] } })).toEqual(["a.b[1]"]);
    expect(findNullish({ width: 10, height: null })).toEqual(["height"]);
  });

  test("assertionHolds understands every shape describeScene emits", () => {
    expect(assertionHolds({ expected: 6, measured: 6 })).toBe(true);
    expect(assertionHolds({ expected: 6, measured: 5 })).toBe(false);
    expect(assertionHolds({ expected: "ready", measured: "ready" })).toBe(true);
    expect(assertionHolds({ expected: { atLeast: 3 }, measured: 5 })).toBe(true);
    expect(assertionHolds({ expected: { atLeast: 3 }, measured: 2 })).toBe(false);
    expect(assertionHolds({ expected: { value: 6 }, measured: { value: 6 } })).toBe(true);
    expect(assertionHolds({ expected: { value: 6 }, measured: { value: 6, blank: 1 } })).toBe(false);
    // An empty map on both sides is vacuously satisfiable, which is exactly the shape
    // that lets an entry look like coverage while asserting nothing.
    expect(assertionHolds({ expected: {}, measured: {} })).toBe(false);
    expect(assertionHolds({ expected: { rendered: false }, measured: { rendered: false } })).toBe(true);
    expect(assertionHolds({ expected: { rendered: false }, measured: { rendered: true } })).toBe(false);
    expect(
      assertionHolds({ expected: { strictlyDecreasingAcrossStages: [1, 2, 3] }, measured: [9, 5, 2] })
    ).toBe(true);
    expect(
      assertionHolds({ expected: { strictlyDecreasingAcrossStages: [1, 2, 3] }, measured: [9, 5, 6] })
    ).toBe(false);
    expect(
      assertionHolds({ expected: { greaterThanPreviousStage: true }, measured: { from: 4, to: 9 } })
    ).toBe(true);
    expect(
      assertionHolds({ expected: { greaterThanPreviousStage: true }, measured: { from: 9, to: 4 } })
    ).toBe(false);
    expect(
      assertionHolds({
        expected: { visible: true, atLeast: "240x24", insideTile: true },
        measured: { width: 1282, height: 230, visible: true, insideTile: true, insideFrame: true }
      })
    ).toBe(true);
    // In the DOM at full width, but zero height: the sibling failure mode.
    expect(
      assertionHolds({
        expected: { visible: true, atLeast: "240x24", insideTile: true },
        measured: { width: 1282, height: 0, visible: true, insideTile: true, insideFrame: true }
      })
    ).toBe(false);
    // Drawn, but scrolled out of the captured frame.
    expect(
      assertionHolds({
        expected: { visible: true, atLeast: "240x24", insideTile: true },
        measured: { width: 1282, height: 230, visible: true, insideTile: true, insideFrame: false }
      })
    ).toBe(false);
    // Present and sized, but hidden by computed style.
    expect(
      assertionHolds({
        expected: { visible: true, atLeast: "240x24", insideTile: true },
        measured: { width: 1282, height: 230, visible: false, insideTile: true, insideFrame: true }
      })
    ).toBe(false);
    // A region that must stay inside the tile but does not.
    expect(
      assertionHolds({
        expected: { visible: true, atLeast: "240x24", insideTile: true },
        measured: { width: 1282, height: 230, visible: true, insideTile: false, insideFrame: true }
      })
    ).toBe(false);
    // The chart canvas legitimately overflows the tile because it scrolls, so its
    // recorded expectation exempts it and the record must not reject its own capture.
    expect(
      assertionHolds({
        expected: { visible: true, atLeast: "240x80", insideTile: false },
        measured: { width: 1282, height: 900, visible: true, insideTile: false, insideFrame: true }
      })
    ).toBe(true);
  });

  test("describeScene refuses to invent values when the render produced nothing", () => {
    const empty = describeScene(expectationFor("01-conversion-funnel"), {
      id: "01-conversion-funnel",
      ok: true,
      renderState: "ready",
      regions: {},
      bars: [],
      markers: [],
      stageButtons: [],
      chartLabels: [],
      summaryMetrics: [],
      summaryIntake: [],
      warnings: [],
      tableRows: 0
    });
    const assertions = empty.assertions as Array<{ name: string; expected: unknown; measured: unknown }>;
    expect(assertions.length).toBeGreaterThan(0);
    // An empty render must produce assertions that visibly do not hold, so such a
    // record could never be committed as if it were coverage.
    expect(assertions.filter((entry) => !assertionHolds(entry)).length).toBeGreaterThan(0);
    expect(assertions.some((entry) => findNullish(entry.measured).length > 0)).toBe(true);
  });
});
