import fs from "node:fs";

describe("release manifest gate", () => {
  test("requires a deterministic manifest command and tracked manifest", () => {
    const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8")) as {
      scripts: { "release-manifest": string };
    };
    const manifest = JSON.parse(fs.readFileSync("release-manifest.json", "utf8")) as {
      schemaVersion: number;
      visual: { guid: string; version: string };
      package: { filename: string; sha256: string; bytes: number };
      reproducible: boolean;
      zipNormalization: { entryTimestamp: string; compression: string; compressionLevel: number };
      sourceCommit: string;
      publicationAssets: {
        partnerCenterLogo300x300: {
          path: string;
          format: string;
          width: number;
          height: number;
          bytes: number;
          sha256: string;
        };
        partnerCenterScreenshots1366x768: Array<{
          path: string;
          format: string;
          width: number;
          height: number;
          bytes: number;
          sha256: string;
        }>;
        eula: { path: string; bytes: number; sha256: string };
        submissionDossier: { path: string; bytes: number; sha256: string };
      };
      publication: {
        supportUrl: string;
        privacyPolicyUrl: string;
        termsOfUseUrl: string;
        sampleReport: { required: boolean; provided: boolean };
      };
    };

    expect(packageJson.scripts["release-manifest"]).toBe("node scripts/release-manifest.cjs");
    expect(manifest.schemaVersion).toBe(2);
    expect(manifest.visual.guid).toBe("atlynFunnelA1B2C3D4");
    expect(manifest.visual.version).toBe("1.0.0.0");
    expect(manifest.package.filename).toBe("atlynFunnelA1B2C3D4.1.0.0.0.pbiviz");
    expect(manifest.package.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(manifest.package.bytes).toBeGreaterThan(0);
    expect(manifest.reproducible).toBe(true);
    expect(manifest.zipNormalization).toEqual({
      entryTimestamp: "1980-01-01T00:00:00.000Z",
      compression: "DEFLATE",
      compressionLevel: 9
    });
    expect(manifest.sourceCommit).toMatch(/^[0-9a-f]{40}$/);
    expect(manifest.publicationAssets.partnerCenterLogo300x300).toEqual(
      expect.objectContaining({
        path: "assets/logo-300x300.png",
        format: "png",
        width: 300,
        height: 300
      })
    );
    expect(manifest.publicationAssets.partnerCenterLogo300x300.bytes).toBeGreaterThan(0);
    expect(manifest.publicationAssets.partnerCenterLogo300x300.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(manifest.publicationAssets.partnerCenterScreenshots1366x768.length).toBeGreaterThan(0);
    manifest.publicationAssets.partnerCenterScreenshots1366x768.forEach((screenshot) => {
      expect(screenshot).toEqual(
        expect.objectContaining({ format: "png", width: 1366, height: 768 })
      );
      expect(screenshot.bytes).toBeGreaterThan(0);
      expect(screenshot.bytes).toBeLessThanOrEqual(1024 * 1024);
      expect(screenshot.sha256).toMatch(/^[a-f0-9]{64}$/);
    });
    expect(manifest.publicationAssets.eula.path).toBe("EULA.md");
    expect(manifest.publicationAssets.submissionDossier.path).toBe(
      "docs/partner-center-submission.md"
    );
    expect(manifest.publication.supportUrl).toBe("https://atlyn.io/contact");
    expect(manifest.publication.privacyPolicyUrl).toBe("https://atlyn.io/legal/privacy");
    expect(manifest.publication.termsOfUseUrl).toBe("https://atlyn.io/legal/terms");
    expect(manifest.publication.sampleReport).toEqual(
      expect.objectContaining({ required: true, provided: false })
    );
  });
});
