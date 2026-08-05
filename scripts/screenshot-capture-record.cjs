/*
 * The committed record of what the screenshot capture measured.
 *
 * The capture-time assertions in scripts/capture-screenshots.cjs prove a screenshot was
 * correct at the moment it was written, then the evidence goes to stdout and is gone.
 * That leaves a real hole: a screenshot that is hand-edited, reverted, or swapped
 * afterwards still satisfies every remaining gate, because the only surviving checks are
 * its dimensions and its byte size. The claim was evaluated and then discarded, so it
 * cannot be re-verified.
 *
 * assets/screenshot-capture.json closes that by committing the measured values, the
 * SHA-256 of each PNG the capture wrote, and the SHA-256 of the packaged .pbiviz those
 * pixels were rendered from. The audit re-derives all three from the working tree and
 * fails on any mismatch.
 *
 * The third one is the one that matters most. A screenshot captured from an earlier
 * build and committed next to a later one misrepresents the product to every customer
 * who reads the listing, and it is exactly what shipped in a sibling repository: its
 * accessible data table rendered at zero visible height, the submission screenshots were
 * captured from that build, and nothing noticed for weeks. Recording the version string
 * instead would not have caught it, because packaged bytes move more than once inside a
 * single version.
 *
 * ---------------------------------------------------------------------------------
 * These hashes pin the committed bytes that the capture-time assertions were applied
 * to. They must never become a re-render comparison.
 *
 * Browser renders are not bit-stable. A sibling repository measured 6-15 differing
 * pixels out of 1,049,088 between consecutive runs on one machine, with one browser and
 * one font stack, and the differing pixels moved between runs. This repository's own CI
 * makes the point far more loudly: the same three scenes render to 74,247 / 103,208 /
 * 77,322 bytes on the Linux runner against 47,119 / 65,378 / 50,762 bytes on Windows,
 * because the font stack differs. Every content assertion passes identically in both.
 *
 * So a hash recorded here answers "are these the bytes that were vouched for", never
 * "would a fresh render produce these bytes". Turning it into the latter would produce
 * a golden-image check that fails constantly for reasons that have nothing to do with
 * whether the screenshot is correct.
 * ---------------------------------------------------------------------------------
 */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const RECORD_PATH = "assets/screenshot-capture.json";
const SCHEMA_VERSION = 1;

const HASH_NOTE =
  "Each sha256 pins the committed bytes the capture-time assertions were applied to. " +
  "It is not a golden image: browser renders are not bit-stable and differ across " +
  "platforms and font stacks, so this must never become a re-render comparison.";

const sha256Of = (buffer) => crypto.createHash("sha256").update(buffer).digest("hex");

/*
 * A record that exists but asserts nothing looks exactly like coverage, so an absent
 * measured value is treated as a defect rather than as missing data. Arrays and objects
 * are walked because a measurement is often a shape (per-segment counts, a region's
 * width and height) rather than a single number.
 */
const findNullish = (value, trail = "") => {
  if (value === null || value === undefined) {
    return [trail || "value"];
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => findNullish(entry, `${trail}[${index}]`));
  }
  if (typeof value === "object") {
    return Object.keys(value).flatMap((key) =>
      findNullish(value[key], trail ? `${trail}.${key}` : key)
    );
  }
  return [];
};

const SCREENSHOT_DIRECTORY = "assets/screenshots";

/*
 * The path a scene must vouch for. The capture writes `<sceneId>.png`, so pinning the
 * derivation here means a record cannot be edited to point a scene at a different file:
 * swapping two scenes' recorded hashes would otherwise re-bless the exact PNG swap this
 * record exists to catch, because each hash would still match the file now holding those
 * bytes.
 */
const screenshotPathFor = (sceneId) => `${SCREENSHOT_DIRECTORY}/${sceneId}.png`;

/*
 * Whether a recorded assertion is internally consistent: does the measured value
 * actually satisfy the expectation recorded beside it?
 *
 * Without this, the guards above only prove a measured value is present, so a record
 * could be hand-edited to say "expected 6 bars, measured 4" and still pass for having
 * a non-null number. The record has to prove the assertions held, not merely that they
 * were evaluated, so every shape describeScene emits is checked here.
 */
const assertionHolds = (assertion) => {
  const { expected, measured } = assertion ?? {};
  if (typeof expected === "number" || typeof expected === "string") {
    return measured === expected;
  }
  if (expected === null || typeof expected !== "object") {
    return false;
  }
  if ("atLeast" in expected) {
    if (typeof expected.atLeast === "number") {
      return typeof measured === "number" && measured >= expected.atLeast;
    }
    // A region floor, recorded as "<width>x<height>".
    const [minWidth, minHeight] = String(expected.atLeast).split("x").map(Number);
    if (!measured || measured.visible !== true) {
      return false;
    }
    if (measured.width < minWidth || measured.height < minHeight) {
      return false;
    }
    if (measured.insideFrame !== true) {
      return false;
    }
    // The chart canvas legitimately overflows the tile because it scrolls inside
    // .atlyn-chart-scroll, so containment is only required where the capture requires
    // it. Demanding it everywhere would reject records the capture itself just wrote.
    return expected.insideTile !== true || measured.insideTile === true;
  }
  if ("rendered" in expected) {
    return Boolean(measured) && measured.rendered === expected.rendered;
  }
  if (expected.strictlyDecreasingAcrossStages) {
    return Array.isArray(measured) &&
      measured.length === expected.strictlyDecreasingAcrossStages.length &&
      measured.every((value, index) => index === 0 || value < measured[index - 1]);
  }
  if (expected.greaterThanPreviousStage) {
    return Boolean(measured) && measured.to > measured.from;
  }
  // Remaining expectations are per-key count maps such as bar states. An empty map on
  // both sides is vacuously satisfiable, which is precisely the shape that lets an
  // entry look like coverage while asserting nothing, so it is refused.
  const keys = Object.keys(expected);
  if (keys.length === 0) {
    return false;
  }
  return Boolean(measured) &&
    typeof measured === "object" &&
    keys.every((key) => measured[key] === expected[key]) &&
    Object.keys(measured).length === keys.length;
};

const buildRecord = ({ bundle, viewport, scenes }) => ({
  $schema: SCHEMA_VERSION,
  description:
    "What the screenshot capture measured, the SHA-256 of every screenshot it wrote, " +
    "and the SHA-256 of the packaged visual those screenshots were rendered from. " +
    "Regenerate with `npm run screenshots`; `npm run certification-audit` re-derives " +
    "every hash here and fails on a mismatch.",
  hashNote: HASH_NOTE,
  generatedBy: "npm run screenshots (scripts/capture-screenshots.cjs)",
  viewport,
  package: {
    filename: bundle.packageName,
    sha256: bundle.packageSha256,
    bytes: bundle.packageBytes,
    guid: bundle.guid,
    version: bundle.version
  },
  scenes
});

const readRecord = (root) => {
  const absolutePath = path.join(root, RECORD_PATH);
  if (!fs.existsSync(absolutePath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(absolutePath, "utf8"));
};

/*
 * Re-derives everything the record claims, from the working tree.
 *
 * `packageSha256` is optional only because the unit tests run before anything is
 * packaged; the certification audit always supplies it, so the build that the
 * screenshots depict is always checked before a release is assembled.
 */
const auditCaptureRecord = ({ root, record, sceneIds, screenshotPaths, packageSha256, packageName }) => {
  const failures = [];
  const fail = (message) => failures.push(message);

  if (!record) {
    fail(`${RECORD_PATH} is missing; run \`npm run screenshots\` to record what the screenshots show`);
    return failures;
  }
  if (record.$schema !== SCHEMA_VERSION) {
    fail(`${RECORD_PATH} declares schema ${record.$schema} but this audit understands ${SCHEMA_VERSION}`);
  }
  if (typeof record.hashNote !== "string" || !/never become a re-render comparison/i.test(record.hashNote)) {
    fail(
      `${RECORD_PATH} must keep the note explaining that its hashes pin committed bytes ` +
      "rather than acting as a golden-image comparison"
    );
  }

  const scenes = Array.isArray(record.scenes) ? record.scenes : [];
  const recordedIds = scenes.map((scene) => scene.id);
  if (recordedIds.join("|") !== sceneIds.join("|")) {
    fail(
      `${RECORD_PATH} records [${recordedIds.join(", ") || "nothing"}] but the declared scenes are ` +
      `[${sceneIds.join(", ")}]; re-run \`npm run screenshots\``
    );
  }

  /*
   * Every declared screenshot has to be vouched for by some scene. Checking only that
   * each recorded path is declared leaves the other direction open: a hand-made PNG
   * added to publication.json that no capture ever asserted would ship with nothing but
   * a dimension and byte-size check behind it, which is the hole this record closes.
   */
  const vouchedFor = new Set(
    scenes.map((scene) => scene?.screenshot?.path).filter((entry) => typeof entry === "string")
  );
  screenshotPaths.forEach((declaredPath) => {
    if (!vouchedFor.has(declaredPath)) {
      fail(
        `${declaredPath} is declared for submission but no scene in ${RECORD_PATH} vouches for it, ` +
        "so nothing has ever checked what it shows"
      );
    }
  });
  if (vouchedFor.size !== scenes.length) {
    fail(`${RECORD_PATH} vouches for the same screenshot from more than one scene`);
  }

  // The recorded package has to be the package in the tree, otherwise the screenshots
  // depict a build nobody is shipping.
  if (packageSha256) {
    if (record.package?.sha256 !== packageSha256) {
      fail(
        `${RECORD_PATH} says the screenshots were rendered from ${record.package?.sha256 ?? "no package"} ` +
        `but the current ${packageName ?? "package"} is ${packageSha256}; the committed screenshots ` +
        "depict a different build, so re-run `npm run screenshots`"
      );
    }
    if (packageName && record.package?.filename !== packageName) {
      fail(
        `${RECORD_PATH} records ${record.package?.filename ?? "no filename"} but the current artifact ` +
        `is ${packageName}`
      );
    }
  }

  scenes.forEach((scene) => {
    const label = `${RECORD_PATH} scene ${scene.id ?? "(unnamed)"}`;
    const assertions = Array.isArray(scene.assertions) ? scene.assertions : [];
    if (assertions.length === 0) {
      fail(`${label} records no assertions, so the entry vouches for nothing`);
    }
    assertions.forEach((assertion) => {
      if (typeof assertion?.name !== "string" || assertion.name.length === 0) {
        fail(`${label} records an assertion with no name`);
        return;
      }
      if (!("measured" in (assertion ?? {}))) {
        fail(`${label} assertion "${assertion.name}" records no measured value`);
        return;
      }
      const missing = findNullish(assertion.measured);
      if (missing.length > 0) {
        fail(
          `${label} assertion "${assertion.name}" has no measured value at ${missing.join(", ")}, ` +
          "so it asserts nothing"
        );
        return;
      }
      if (!assertionHolds(assertion)) {
        fail(
          `${label} assertion "${assertion.name}" records a measured value that does not satisfy it ` +
          `(expected ${JSON.stringify(assertion.expected)}, measured ${JSON.stringify(assertion.measured)})`
        );
      }
    });
    if (typeof scene.demonstrates !== "string" || scene.demonstrates.length < 20) {
      fail(`${label} must say what the scene demonstrates`);
    }

    const screenshot = scene.screenshot;
    if (!screenshot || typeof screenshot.path !== "string") {
      fail(`${label} records no screenshot path`);
      return;
    }
    /*
     * The path is derived from the scene id rather than trusted from the record.
     * Swapping two scenes' screenshot blocks leaves every recorded hash matching the
     * file that now holds those bytes, so a membership test alone would re-bless
     * exactly the swap this record exists to catch.
     */
    const owned = screenshotPathFor(scene.id);
    if (screenshot.path !== owned) {
      fail(`${label} vouches for ${screenshot.path} but a scene may only vouch for its own ${owned}`);
      return;
    }
    if (!screenshotPaths.includes(screenshot.path)) {
      fail(`${label} records ${screenshot.path}, which publication.json does not declare`);
    }
    const absolutePath = path.join(root, screenshot.path);
    if (!fs.existsSync(absolutePath)) {
      fail(`${label} records ${screenshot.path}, which is not in the working tree`);
      return;
    }
    const bytes = fs.readFileSync(absolutePath);
    const actual = sha256Of(bytes);
    if (screenshot.sha256 !== actual) {
      fail(
        `${screenshot.path} is ${actual} but the capture that vouches for it recorded ` +
        `${screenshot.sha256}; the file changed without the capture being re-run, so nothing ` +
        "has checked what it now shows"
      );
    }
    if (screenshot.bytes !== bytes.length) {
      fail(`${screenshot.path} is ${bytes.length} bytes but ${RECORD_PATH} records ${screenshot.bytes}`);
    }
  });

  return failures;
};

module.exports = {
  RECORD_PATH,
  SCHEMA_VERSION,
  HASH_NOTE,
  sha256Of,
  findNullish,
  assertionHolds,
  buildRecord,
  readRecord,
  auditCaptureRecord
};
