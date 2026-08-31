/* oxlint-disable effecttsgo/node-builtin-import -- This dependency-free repository policy script must run unchanged on the Effect 3 and Effect 4 branches. */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
/* oxlint-enable effecttsgo/node-builtin-import */

const ACTIONS = Object.freeze({
  alreadyPrereleased: "already-prereleased",
  carryPending: "carry-pending",
  documentReleased: "document-released-change",
  noChangeset: "no-changeset",
  removeRetracted: "remove-retracted-pending",
  reviewPrereleasedRetraction: "review-prereleased-retraction",
  reviewUnversionedPublicChange: "review-unversioned-public-change",
});

export function decideChangesetAction({
  effectiveContentChanged = false,
  pendingOnMain = false,
  prereleasedOnTarget = false,
  publicSurfaceChanged = false,
  releasedOnMain = false,
  retractedOnMain = false,
} = {}) {
  const mainStates = [pendingOnMain, releasedOnMain, retractedOnMain].filter(
    Boolean,
  );

  if (mainStates.length > 1) {
    throw new Error(
      "A changeset cannot be pending, released, and retracted on main at the same time.",
    );
  }

  if (publicSurfaceChanged && !effectiveContentChanged) {
    throw new Error(
      "A public-surface change must also be an effective content change.",
    );
  }

  if (retractedOnMain && prereleasedOnTarget) {
    return ACTIONS.reviewPrereleasedRetraction;
  }

  if (prereleasedOnTarget) {
    return ACTIONS.alreadyPrereleased;
  }

  if (pendingOnMain) {
    return ACTIONS.carryPending;
  }

  if (retractedOnMain) {
    return ACTIONS.removeRetracted;
  }

  if (releasedOnMain && effectiveContentChanged) {
    return ACTIONS.documentReleased;
  }

  if (!pendingOnMain && !releasedOnMain && publicSurfaceChanged) {
    return ACTIONS.reviewUnversionedPublicChange;
  }

  return ACTIONS.noChangeset;
}

function changesetIds(directory) {
  if (!existsSync(directory)) return new Set();

  return new Set(
    readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map((entry) => entry.name.slice(0, -3)),
  );
}

export function findDuplicateChangesets(repository = process.cwd()) {
  const changesetDirectory = resolve(repository, ".changeset");
  const pending = changesetIds(changesetDirectory);
  const prereleased = changesetIds(resolve(changesetDirectory, "pre"));

  return [...pending]
    .filter((id) => prereleased.has(id))
    .sort((left, right) => left.localeCompare(right));
}

export function isAncestor(ancestor, descendant, repository = process.cwd()) {
  const result = spawnSync(
    "git",
    ["merge-base", "--is-ancestor", ancestor, descendant],
    { cwd: repository, encoding: "utf8" },
  );

  if (result.status === 0) return true;
  if (result.status === 1) return false;

  throw new Error(result.stderr.trim() || "Unable to inspect Git ancestry.");
}

export function auditPrereleaseSync({
  headRef = "HEAD",
  mainRef = "origin/main",
  repository = process.cwd(),
} = {}) {
  const duplicates = findDuplicateChangesets(repository);
  if (duplicates.length > 0) {
    throw new Error(
      `Changesets exist both pending and prereleased: ${duplicates.join(", ")}`,
    );
  }

  if (!isAncestor(mainRef, headRef, repository)) {
    throw new Error(
      `${mainRef} is not an ancestor of ${headRef}; refresh the sync with a real merge even if its tree diff is empty.`,
    );
  }
}

function readArgument(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  if (!process.argv[index + 1]) throw new Error(`${name} requires a value.`);
  return process.argv[index + 1];
}

function runCli() {
  const mainRef = readArgument("--main-ref") ?? "origin/main";
  const headRef = readArgument("--head-ref") ?? "HEAD";

  auditPrereleaseSync({ headRef, mainRef });
  const mainCommit = execFileSync("git", ["rev-parse", "--short", mainRef], {
    encoding: "utf8",
  }).trim();
  // oxlint-disable-next-line effecttsgo/global-console -- This is a standalone CLI result, not application logging.
  console.log(
    `Prerelease sync audit passed: ${mainRef} (${mainCommit}) is in ${headRef}.`,
  );
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  try {
    runCli();
  } catch (error) {
    // oxlint-disable-next-line effecttsgo/global-console -- This is a standalone CLI diagnostic, not application logging.
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
