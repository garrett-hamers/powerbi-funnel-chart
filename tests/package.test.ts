const fs = require("node:fs") as typeof import("node:fs");
const { isPackageSuccess } = require("../scripts/package-utils.cjs") as {
  isPackageSuccess: (status: number | null, artifactExists: boolean) => boolean;
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
});
