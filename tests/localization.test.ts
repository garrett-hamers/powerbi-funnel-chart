import { createLocalizer } from "../src/localization";

describe("localization", () => {
  test("formats metrics and detects RTL locales", () => {
    const localizer = createLocalizer("ar-SA");
    expect(localizer.direction).toBe("rtl");
    expect(localizer.text("overallConversion")).toBe("التحويل الإجمالي");
    expect(localizer.percent(0.5)).toMatch(/%|٪/);
    expect(localizer.number(null)).toBe("غير متاح");
  });

  test("falls back to English for unsupported languages", () => {
    const localizer = createLocalizer("xx-XX");
    expect(localizer.direction).toBe("ltr");
    expect(localizer.text("dropRate")).toBe("Drop rate");
  });
});
