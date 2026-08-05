/* eslint-disable powerbi-visuals/non-literal-fs-path -- this gate must discover rules files by listing a directory, because hardcoding the list is the defect it exists to catch. */
import fs from "node:fs";
import path from "node:path";

/*
 * Coverage of the checks themselves.
 *
 * "The check passed" and "the check is capable of failing" are separate evidence, and
 * only the second is ever missing. This repo has a worked example: scrollsBetween() was
 * structurally dead - it treated any `overflow: auto` ancestor as containment, and the
 * visual root declares exactly that, so no escape could ever be reported. The probe read
 * as clean because the rule was incapable of speaking, and correcting it took the
 * measured defect count from 39 to 76.
 *
 * A rule that can never fire always comes back empty, and an empty result is exactly what
 * a working rule produces on a healthy build. The only way to tell them apart is to make
 * each rule speak once.
 *
 * This was previously established by a throwaway script, run by hand, and reported as a
 * number. That is a claim nobody else can re-derive - including whoever reads it next -
 * so it is a test instead.
 *
 * The file list is discovered rather than hardcoded: a new rules file is covered the day
 * it is added, without anyone remembering to add it here. Picking the set by hand is what
 * let two of these files go unchecked in the first place.
 */

const RULES_DIR = "scripts";

/*
 * The call form, not the word. An earlier version of this matched `finding(` followed by
 * any identifier character, which found the string "finding(s) suppressed" in the probe
 * runner and reported a prose fragment as an untested rules file. The discovery pattern
 * and the extraction pattern are now the same one, so they cannot disagree about what
 * counts as a rule.
 *
 * Both reporting verbs, not just the loud one. `finding()` fails the build; `suppression()`
 * records a check a precondition stopped from running and is only printed. The quiet one
 * needs this gate more, not less: an unasserted rule that fails loudly would at least be
 * noticed the first time it fired, while an unasserted suppression that can never fire
 * looks exactly like a suppression that had nothing to say.
 *
 * There is currently one suppression rule and it is asserted. It was not covered here
 * until this gate was pointed at the mechanism beside the one it was built for.
 */
const RULE_CALL = /(?:finding|suppression)\(\s*[A-Za-z_$][\w$.]*\s*,\s*["'`]([a-z0-9:-]+)["'`]/g;

const ruleFilesWithIds = (): string[] =>
  fs
    .readdirSync(RULES_DIR)
    .filter((name) => name.endsWith(".cjs") || name.endsWith(".js"))
    .filter((name) => idsIn(fs.readFileSync(path.join(RULES_DIR, name), "utf8")).length > 0);

const idsIn = (source: string): string[] => {
  const ids = new Set<string>();
  const pattern = new RegExp(RULE_CALL.source, "g");
  let match = pattern.exec(source);
  while (match) {
    ids.add(match[1]);
    match = pattern.exec(source);
  }
  return [...ids];
};

// Where a rules file's assertions live. A rules file with no paired test is itself a
// finding, so the mapping is asserted rather than assumed.
const TEST_FOR: Record<string, string> = {
  "layout-probe-cases.cjs": "tests/layout-probe.test.ts",
  "screenshot-scene-expectations.cjs": "tests/screenshot-expectations.test.ts"
};

describe("every rule is capable of failing", () => {
  test("every file that defines rule ids has a paired test file", () => {
    const discovered = ruleFilesWithIds().sort();
    expect(discovered).toEqual(Object.keys(TEST_FOR).sort());
    for (const testPath of Object.values(TEST_FOR)) {
      expect(fs.existsSync(testPath)).toBe(true);
    }
  });

  test.each(Object.entries(TEST_FOR))(
    "%s has no rule that never appears in %s",
    (rulesFile, testFile) => {
      const ids = idsIn(fs.readFileSync(path.join(RULES_DIR, rulesFile), "utf8"));
      // A rules file that defines nothing would pass vacuously, which is the shape this
      // whole suite refuses.
      expect(ids.length).toBeGreaterThan(30);

      const testSource = fs.readFileSync(testFile, "utf8");
      const unasserted = ids.filter((id) => !testSource.includes(`"${id}"`)).sort();
      expect(unasserted).toEqual([]);
    }
  );
});
