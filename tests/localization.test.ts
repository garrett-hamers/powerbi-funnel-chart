import { createLocalizer, warningTextKey } from "../src/localization";

describe("localization", () => {
  test("formats metrics and detects RTL locales", () => {
    const localizer = createLocalizer("ar-SA");
    expect(localizer.direction).toBe("rtl");
    expect(localizer.text("overallConversion")).toBe("التحويل الإجمالي");
    expect(localizer.percent(0.5)).toMatch(/%|٪/);
    expect(localizer.number(null)).toBe("غير متاح");
  });

  test("uses Power BI measure format strings for numeric values", () => {
    expect(createLocalizer("en-US").number(1234.5, undefined, "$#,0.00")).toBe("$1,234.50");
  });

  test("falls back to English for unsupported languages", () => {
    const localizer = createLocalizer("xx-XX");
    expect(localizer.direction).toBe("ltr");
    expect(localizer.text("dropRate")).toBe("Drop rate");
  });

  test("renders a detailed localized message for every warning code", () => {
    const warningCodes = [
      "missing-stage",
      "missing-value",
      "invalid-value",
      "invalid-order",
      "invalid-target",
      "inferred-order",
      "duplicate-order",
      "duplicate-stage",
      "missing-order",
      "nonmonotonic",
      "blank-value",
      "negative-value",
      "zero-baseline",
      "stage-limit",
      "partial-data"
    ];
    const spanish = createLocalizer("es-ES");
    warningCodes.forEach((code) => {
      const key = warningTextKey(code);
      expect(key).not.toBe("warning");
      expect(createLocalizer("en-US").text(key)).not.toBe("Warning");
      expect(spanish.text(key, "Detailed diagnostic")).not.toBe("Advertencia");
    });
  });
});
