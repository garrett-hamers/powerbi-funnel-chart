/*
 * The digest of a folder-shaped submission asset.
 *
 * Extracted so the release manifest and the certification audit derive it from one
 * implementation instead of two. The audit previously checked only that the recorded
 * digest was a well-formed SHA-256 - `/^[a-f0-9]{64}$/` - and never re-derived it, so a
 * sample project whose contents changed while its file count held passed every gate. The
 * packaged artifact twenty lines away in that file is re-derived and compared; this one
 * was not.
 *
 * Reimplementing the derivation in the audit would have closed the gap and opened a worse
 * one: two hashes of the same tree that can disagree with nothing comparing them. That is
 * the defect class this repo kept finding, so the function moved rather than being copied.
 *
 * The ordering is load-bearing. Entries are sorted at every directory level and each file
 * contributes its path as well as its content hash, so the digest is stable across
 * filesystems that enumerate in different orders and still changes when a file is renamed
 * rather than edited.
 */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const listFiles = (absoluteDirectory, prefix = "") =>
  fs.readdirSync(absoluteDirectory, { withFileTypes: true })
    .sort((left, right) => (left.name < right.name ? -1 : 1))
    .flatMap((entry) => {
      const relative = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      return entry.isDirectory()
        ? listFiles(path.join(absoluteDirectory, entry.name), relative)
        : [relative];
    });

/*
 * Returns null when the directory is absent so each caller can report that in its own
 * vocabulary - the manifest fails the run, the audit records a failure - rather than this
 * module choosing an exit path for both.
 */
const hashProject = (root, relativePath) => {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) {
    return null;
  }
  const files = listFiles(absolutePath);
  const digest = crypto.createHash("sha256");
  let bytes = 0;
  files.forEach((file) => {
    const contents = fs.readFileSync(path.join(absolutePath, ...file.split("/")));
    bytes += contents.length;
    digest.update(`${file}\n${crypto.createHash("sha256").update(contents).digest("hex")}\n`);
  });
  return {
    path: relativePath,
    format: "pbip",
    files: files.length,
    bytes,
    sha256: digest.digest("hex")
  };
};

module.exports = { hashProject, listFiles };
