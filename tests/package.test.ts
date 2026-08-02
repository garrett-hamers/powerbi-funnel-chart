/* eslint-disable powerbi-visuals/non-literal-fs-path -- isolated temporary paths are required for this ZIP test. */
const fs = require("node:fs") as typeof import("node:fs");
const os = require("node:os") as typeof import("node:os");
const path = require("node:path") as typeof import("node:path");
const JSZip = require("jszip") as typeof import("jszip");
const { isPackageSuccess } = require("../scripts/package-utils.cjs") as {
  isPackageSuccess: (status: number | null, artifactExists: boolean) => boolean;
};
const { normalizePackage } = require("../scripts/normalize-package.cjs") as {
  normalizePackage: (packagePath: string) => Promise<void>;
};

describe("package certification wrapper", () => {
  test("only reports success when pbiviz exits successfully and emits an artifact", () => {
    expect(isPackageSuccess(0, true)).toBe(true);
    expect(isPackageSuccess(0, false)).toBe(false);
    expect(isPackageSuccess(1, true)).toBe(false);
    expect(isPackageSuccess(null, true)).toBe(false);
  });

  test("requires a fresh artifact check so stale packages cannot mask failures", () => {
    const script = fs.readFileSync("scripts/package.cjs", "utf8");
    expect(script).toContain("beforeArtifacts");
    expect(script).toContain("previous.mtimeMs");
  });

  test("normalizes two package runs to identical bytes", async () => {
    const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "atlyn-funnel-package-"));
    const firstPath = path.join(temporaryDirectory, "first.pbiviz");
    const secondPath = path.join(temporaryDirectory, "second.pbiviz");

    try {
      const firstZip = new JSZip();
      firstZip.file("z.txt", "z", { date: new Date("2024-01-01T00:00:00Z") });
      firstZip.file("a.txt", "a", { date: new Date("2024-01-02T00:00:00Z") });
      const secondZip = new JSZip();
      secondZip.file("a.txt", "a", { date: new Date("2025-01-02T00:00:00Z") });
      secondZip.file("z.txt", "z", { date: new Date("2025-01-01T00:00:00Z") });
      fs.writeFileSync(firstPath, await firstZip.generateAsync({ type: "nodebuffer" }));
      fs.writeFileSync(secondPath, await secondZip.generateAsync({ type: "nodebuffer" }));

      await normalizePackage(firstPath);
      await normalizePackage(secondPath);

      expect(fs.readFileSync(firstPath)).toEqual(fs.readFileSync(secondPath));
    } finally {
      fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  });
});
