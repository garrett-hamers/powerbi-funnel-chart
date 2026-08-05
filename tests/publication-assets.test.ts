/* eslint-disable powerbi-visuals/non-literal-fs-path -- these gates must read the tracked submission assets by path. */
import crypto from "node:crypto";
import fs from "node:fs";

interface PngProfile {
  width: number;
  height: number;
  bytes: number;
  sha256: string;
  distinctColors: number;
  opaqueRatio: number;
}

const { readPngContentProfile } = require("../scripts/png-utils.cjs") as {
  readPngContentProfile: (filePath: string) => PngProfile;
};

interface PublicationConfig {
  listing: {
    displayName: string;
    publisher: string;
    supportUrl: string;
    privacyPolicyUrl: string;
    termsOfUseUrl: string;
    supportEmail: string;
  };
  assets: {
    eula: string;
    dossier: string;
    icon: string;
    logo: string;
    sampleReportProject: string;
    screenshots: string[];
    captureRecord: string;
    sampleData: string[];
  };
  sampleReport: { required: boolean; provided: boolean; reason: string };
  constraints: {
    icon: { width: number; height: number };
    logo: { width: number; height: number };
    screenshot: {
      width: number;
      height: number;
      maxBytes: number;
      minCount: number;
      maxCount: number;
    };
    description: { minLength: number; maxLength: number };
  };
}

interface TrackedFile {
  path: string;
  bytes: number;
  sha256: string;
}

interface TrackedImage extends TrackedFile {
  format: string;
  width: number;
  height: number;
}

interface ReleaseManifest {
  publicationAssets: {
    visualIcon20x20: TrackedImage;
    partnerCenterLogo300x300: TrackedImage;
    partnerCenterScreenshots1366x768: TrackedImage[];
    eula: TrackedFile;
    submissionDossier: TrackedFile;
  };
  publication: {
    displayName: string;
    publisher: string;
    author: { name: string; email: string };
    description: string;
    supportUrl: string;
    privacyPolicyUrl: string;
    termsOfUseUrl: string;
    supportEmail: string;
    sampleReport: { required: boolean; provided: boolean; reason: string };
  };
}

interface PbivizConfig {
  visual: {
    name: string;
    displayName: string;
    guid: string;
    version: string;
    description: string;
    supportUrl: string;
  };
  author: { name: string; email: string };
}

const readJson = <T>(relativePath: string): T =>
  JSON.parse(fs.readFileSync(relativePath, "utf8")) as T;

const publication = readJson<PublicationConfig>("publication.json");
const pbiviz = readJson<PbivizConfig>("pbiviz.json");
const manifest = readJson<ReleaseManifest>("release-manifest.json");
const packageJson = readJson<{ scripts: Record<string, string> }>("package.json");
const sha256Of = (relativePath: string): string =>
  crypto.createHash("sha256").update(fs.readFileSync(relativePath)).digest("hex");

describe("AppSource submission metadata", () => {
  test("pbiviz.json carries every field Microsoft requires in the package", () => {
    expect(pbiviz.visual.name).toBe("atlynFunnel");
    expect(pbiviz.visual.displayName).toBe("Atlyn Funnel");
    expect(pbiviz.visual.guid).toBe("atlynFunnelA1B2C3D4");
    expect(pbiviz.visual.version).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
    expect(pbiviz.visual.description.length).toBeGreaterThanOrEqual(
      publication.constraints.description.minLength
    );
    expect(pbiviz.visual.description.length).toBeLessThanOrEqual(
      publication.constraints.description.maxLength
    );
    expect(pbiviz.visual.supportUrl).toBe(publication.listing.supportUrl);
    expect(pbiviz.author.name).toBe(publication.listing.publisher);
    expect(pbiviz.author.email).toBe(publication.listing.supportEmail);
  });

  test("every published listing URL is https", () => {
    [
      publication.listing.supportUrl,
      publication.listing.privacyPolicyUrl,
      publication.listing.termsOfUseUrl
    ].forEach((url) => {
      expect(url.startsWith("https://")).toBe(true);
    });
  });

  test("the release manifest mirrors the listing without drift", () => {
    expect(manifest.publication.supportUrl).toBe(publication.listing.supportUrl);
    expect(manifest.publication.privacyPolicyUrl).toBe(publication.listing.privacyPolicyUrl);
    expect(manifest.publication.termsOfUseUrl).toBe(publication.listing.termsOfUseUrl);
    expect(manifest.publication.description).toBe(pbiviz.visual.description);
    expect(manifest.publication.author).toEqual(pbiviz.author);
  });
});

describe("Partner Center media assets", () => {
  test("the visual icon is a real 20x20 PNG, not the 300x300 logo", () => {
    const icon = readPngContentProfile(publication.assets.icon);
    expect(publication.assets.icon).toBe("assets/icon.png");
    expect(icon.width).toBe(publication.constraints.icon.width);
    expect(icon.height).toBe(publication.constraints.icon.height);
    expect(icon.width).toBe(20);
    expect(icon.height).toBe(20);
    expect(icon.distinctColors).toBeGreaterThanOrEqual(8);
    expect(icon.opaqueRatio).toBeGreaterThan(0.01);
    expect(manifest.publicationAssets.visualIcon20x20).toEqual({
      path: "assets/icon.png",
      format: "png",
      width: icon.width,
      height: icon.height,
      bytes: icon.bytes,
      sha256: icon.sha256
    });
  });

  test("the logo is a real 300x300 PNG rather than a placeholder", () => {
    const logo = readPngContentProfile(publication.assets.logo);
    expect(logo.width).toBe(publication.constraints.logo.width);
    expect(logo.height).toBe(publication.constraints.logo.height);
    expect(logo.distinctColors).toBeGreaterThanOrEqual(8);
    expect(logo.opaqueRatio).toBeGreaterThan(0.01);
    expect(manifest.publicationAssets.partnerCenterLogo300x300).toEqual({
      path: publication.assets.logo,
      format: "png",
      width: logo.width,
      height: logo.height,
      bytes: logo.bytes,
      sha256: logo.sha256
    });
  });

  test("between one and five screenshots are declared", () => {
    expect(publication.assets.screenshots.length).toBeGreaterThanOrEqual(
      publication.constraints.screenshot.minCount
    );
    expect(publication.assets.screenshots.length).toBeLessThanOrEqual(
      publication.constraints.screenshot.maxCount
    );
    expect(manifest.publicationAssets.partnerCenterScreenshots1366x768).toHaveLength(
      publication.assets.screenshots.length
    );
  });

  test.each(publication.assets.screenshots)(
    "%s is an exactly sized real render inside the byte budget",
    (relativePath) => {
      const rules = publication.constraints.screenshot;
      const screenshot = readPngContentProfile(relativePath);
      expect(screenshot.width).toBe(rules.width);
      expect(screenshot.height).toBe(rules.height);
      expect(screenshot.bytes).toBeLessThanOrEqual(rules.maxBytes);
      expect(screenshot.distinctColors).toBeGreaterThanOrEqual(32);
      expect(manifest.publicationAssets.partnerCenterScreenshots1366x768).toContainEqual({
        path: relativePath,
        format: "png",
        width: screenshot.width,
        height: screenshot.height,
        bytes: screenshot.bytes,
        sha256: screenshot.sha256
      });
    }
  );

  test("the screenshot pipeline stays wired to real renders of the packaged bundle", () => {
    expect(packageJson.scripts.screenshots).toBe("node scripts/capture-screenshots.cjs");
    expect(packageJson.scripts["screenshots:verify"]).toBe("node scripts/capture-screenshots.cjs --verify");
    expect(packageJson.scripts.icons).toBe("node scripts/build-icons.cjs");
    expect(packageJson.scripts["layout-probe"]).toBe("node scripts/layout-probe.cjs");
    expect(fs.existsSync("scripts/capture-screenshots.cjs")).toBe(true);
    expect(fs.existsSync("scripts/screenshot-harness.cjs")).toBe(true);
    expect(fs.existsSync("scripts/packaged-bundle.cjs")).toBe(true);
    expect(fs.existsSync("scripts/build-icons.cjs")).toBe(true);
    expect(fs.existsSync("assets/icon.svg")).toBe(true);
    const harness = fs.readFileSync("scripts/screenshot-harness.cjs", "utf8");
    expect(harness).toContain("dist");
    expect(harness).toContain("attachShadow");
    // A listing screenshot has to depict the artifact the customer receives, and
    // `pbiviz package` runs its own build, so dist/visual.js is not that artifact.
    expect(harness).toContain("readPackagedBundle");
    expect(fs.readFileSync("scripts/packaged-bundle.cjs", "utf8")).toContain(".pbiviz");
  });

  test("the capture asserts what each scene drew, not just how big the PNG is", () => {
    // Size and byte checks pass on an empty chart, on a chart that failed to bind its
    // data, and on a chart that rendered outside the visible area. Only an assertion
    // made while the scene is still rendered can tell those from a correct render, so
    // the capture has to inspect the DOM before it writes anything.
    expect(fs.existsSync("scripts/screenshot-scene-expectations.cjs")).toBe(true);
    expect(fs.existsSync("scripts/screenshot-content-agent.js")).toBe(true);

    const capture = fs.readFileSync("scripts/capture-screenshots.cjs", "utf8");
    expect(capture).toContain("screenshot-scene-expectations.cjs");
    expect(capture).toContain("screenshot-content-agent.js");
    // The PNG and the DOM have to come out of one browser run, otherwise the
    // assertions describe a render the screenshot never contained.
    expect(capture).toContain("--dump-dom");
    expect(capture).toContain("--screenshot=");

    const agent = fs.readFileSync("scripts/screenshot-content-agent.js", "utf8");
    expect(agent).toContain("querySelectorAll");
    // Presence alone is not enough: the failure mode this guards against was an
    // element that sat in the DOM the entire time it rendered at zero height.
    expect(agent).toContain("getBoundingClientRect");
  });

  test("the capture writes a committed record so its assertions can be re-verified", () => {
    // Assertions that run at capture and then print to stdout prove a screenshot was
    // correct when written, and nothing more: the evidence is gone by the time anyone
    // reviews the repository. The record is what makes the claim durable.
    expect(fs.existsSync("scripts/screenshot-capture-record.cjs")).toBe(true);
    expect(fs.existsSync("assets/screenshot-capture.json")).toBe(true);
    expect(publication.assets.captureRecord).toBe("assets/screenshot-capture.json");

    const capture = fs.readFileSync("scripts/capture-screenshots.cjs", "utf8");
    expect(capture).toContain("screenshot-capture-record.cjs");
    expect(capture).toContain("buildRecord");
    // The record has to be written from the bytes the capture just wrote.
    expect(capture).toContain("sha256Of");

    // The audit is what re-derives the hashes; without this wiring the record would be
    // recorded and never checked, which is the failure this whole change exists to fix.
    const audit = fs.readFileSync("scripts/certification-audit.cjs", "utf8");
    expect(audit).toContain("auditCaptureRecord");
    expect(audit).toContain("packageSha256");
  });

  test("every screenshot scene declares its own content expectation", () => {
    const scenarios = JSON.parse(
      fs.readFileSync("assets/sample-data/screenshot-scenarios.json", "utf8")
    ) as { scenarios: Array<{ id: string }> };
    const { SCENE_EXPECTATIONS, expectationFor } =
      require("../scripts/screenshot-scene-expectations.cjs") as {
        SCENE_EXPECTATIONS: Record<string, { requiredRegions: string[]; forbiddenRegions: string[] }>;
        expectationFor: (id: string) => unknown;
      };

    scenarios.scenarios.forEach((scenario) => {
      expect(expectationFor(scenario.id)).toBeTruthy();
      expect(publication.assets.screenshots).toContain(`assets/screenshots/${scenario.id}.png`);
    });
    expect(Object.keys(SCENE_EXPECTATIONS).sort()).toEqual(
      scenarios.scenarios.map((scenario) => scenario.id).sort()
    );

    // One generic check shared by all three scenes would catch neither a missing
    // second segment nor missing diagnostics, so the expectations must differ.
    const shapes = Object.values(SCENE_EXPECTATIONS).map((expectation) =>
      JSON.stringify(expectation)
    );
    expect(new Set(shapes).size).toBe(shapes.length);
    expect(SCENE_EXPECTATIONS["03-diagnostics"].requiredRegions).toContain("warnings");
    expect(SCENE_EXPECTATIONS["01-conversion-funnel"].forbiddenRegions).toContain("warnings");
  });
});

describe("Partner Center legal and report assets", () => {
  test("the EULA is tracked, hashed, and references the published policies", () => {
    const eulaPath = publication.assets.eula;
    const contents = fs.readFileSync(eulaPath, "utf8");
    expect(contents.length).toBeGreaterThan(1000);
    expect(contents).toContain(publication.listing.privacyPolicyUrl);
    expect(contents).toContain(publication.listing.termsOfUseUrl);
    expect(contents).toContain(publication.listing.supportUrl);
    expect(contents).toContain(publication.listing.supportEmail);
    expect(manifest.publicationAssets.eula.path).toBe(eulaPath);
    expect(manifest.publicationAssets.eula.sha256).toBe(sha256Of(eulaPath));
  });

  test("the submission dossier is tracked, hashed, and lists every asset", () => {
    const dossierPath = publication.assets.dossier;
    const contents = fs.readFileSync(dossierPath, "utf8");
    expect(contents).toContain(pbiviz.visual.guid);
    expect(contents).toContain(publication.listing.privacyPolicyUrl);
    publication.assets.screenshots.forEach((relativePath) => {
      expect(contents).toContain(relativePath);
    });
    expect(manifest.publicationAssets.submissionDossier.path).toBe(dossierPath);
    expect(manifest.publicationAssets.submissionDossier.sha256).toBe(sha256Of(dossierPath));
  });

  test("the sample .pbix stays an explicit outstanding manual step", () => {
    expect(publication.sampleReport.required).toBe(true);
    expect(publication.sampleReport.provided).toBe(false);
    expect(publication.sampleReport.reason.length).toBeGreaterThan(40);
    expect(manifest.publication.sampleReport.provided).toBe(false);
    publication.assets.sampleData.forEach((relativePath) => {
      expect(fs.existsSync(relativePath)).toBe(true);
    });
  });
});
