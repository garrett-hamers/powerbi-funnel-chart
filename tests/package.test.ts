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
});
