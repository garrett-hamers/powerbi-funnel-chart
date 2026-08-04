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
    logo: string;
    screenshots: string[];
    sampleData: string[];
  };
  sampleReport: { required: boolean; provided: boolean; reason: string };
  constraints: {
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

  test("the screenshot pipeline stays wired to real renders of the built bundle", () => {
    expect(packageJson.scripts.screenshots).toBe("node scripts/capture-screenshots.cjs");
    expect(fs.existsSync("scripts/capture-screenshots.cjs")).toBe(true);
    expect(fs.existsSync("scripts/screenshot-harness.cjs")).toBe(true);
    const harness = fs.readFileSync("scripts/screenshot-harness.cjs", "utf8");
    expect(harness).toContain("dist");
    expect(harness).toContain("attachShadow");
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
