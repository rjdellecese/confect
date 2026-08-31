/* oxlint-disable effecttsgo/node-builtin-import -- This dependency-free policy test must run unchanged on the Effect 3 and Effect 4 branches. */
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
/* oxlint-enable effecttsgo/node-builtin-import */

import {
  auditPrereleaseSync,
  decideChangesetAction,
  findDuplicateChangesets,
  isAncestor,
} from "./auditPrereleaseSync.mjs";

void test("carries a changeset that is still pending on main", () => {
  assert.equal(
    decideChangesetAction({
      pendingOnMain: true,
      effectiveContentChanged: true,
    }),
    "carry-pending",
  );
});

void test("does not duplicate a changeset already shipped on the prerelease line", () => {
  assert.equal(
    decideChangesetAction({
      prereleasedOnTarget: true,
      releasedOnMain: true,
      effectiveContentChanged: true,
    }),
    "already-prereleased",
  );
});

void test("documents released main content that has not reached the prerelease line", () => {
  assert.equal(
    decideChangesetAction({
      releasedOnMain: true,
      effectiveContentChanged: true,
    }),
    "document-released-change",
  );
});

void test("removes an unpublished retracted changeset", () => {
  assert.equal(
    decideChangesetAction({ retractedOnMain: true }),
    "remove-retracted-pending",
  );
});

void test("requires review when main retracts a changeset already prereleased", () => {
  assert.equal(
    decideChangesetAction({
      prereleasedOnTarget: true,
      retractedOnMain: true,
    }),
    "review-prereleased-retraction",
  );
});

void test("flags an unversioned public change instead of inventing a sync changeset", () => {
  assert.equal(
    decideChangesetAction({
      effectiveContentChanged: true,
      publicSurfaceChanged: true,
    }),
    "review-unversioned-public-change",
  );
});

void test("allows internal and ancestry-only syncs without a changeset", () => {
  assert.equal(
    decideChangesetAction({ effectiveContentChanged: true }),
    "no-changeset",
  );
  assert.equal(decideChangesetAction(), "no-changeset");
});

void test("rejects a changeset duplicated between pending and prereleased storage", () => {
  const repository = mkdtempSync(join(tmpdir(), "confect-changeset-audit-"));

  try {
    mkdirSync(join(repository, ".changeset", "pre"), { recursive: true });
    writeFileSync(join(repository, ".changeset", "same-id.md"), "pending");
    writeFileSync(
      join(repository, ".changeset", "pre", "same-id.md"),
      "shipped",
    );

    assert.deepEqual(findDuplicateChangesets(repository), ["same-id"]);
  } finally {
    rmSync(repository, { recursive: true, force: true });
  }
});

void test("requires ancestry even when main and the prerelease line have identical trees", () => {
  const repository = mkdtempSync(join(tmpdir(), "confect-ancestry-audit-"));
  const git = (...arguments_) =>
    execFileSync("git", arguments_, {
      cwd: repository,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });

  try {
    git("init", "--initial-branch=main");
    git("config", "user.name", "Prerelease Sync Test");
    git("config", "user.email", "sync-test@example.invalid");
    writeFileSync(join(repository, "state.txt"), "base\n");
    git("add", "state.txt");
    git("commit", "-m", "Create base");
    git("branch", "v10");

    writeFileSync(join(repository, "state.txt"), "same final tree\n");
    git("commit", "-am", "Update main");
    git("switch", "v10");
    writeFileSync(join(repository, "state.txt"), "same final tree\n");
    git("commit", "-am", "Update prerelease independently");

    assert.equal(git("diff", "main", "v10"), "");
    assert.equal(isAncestor("main", "v10", repository), false);
    assert.throws(
      () =>
        auditPrereleaseSync({
          headRef: "v10",
          mainRef: "main",
          repository,
        }),
      /real merge even if its tree diff is empty/,
    );

    git("merge", "--no-ff", "main", "-m", "Record main ancestry");
    assert.equal(isAncestor("main", "HEAD", repository), true);
    assert.doesNotThrow(() =>
      auditPrereleaseSync({
        headRef: "HEAD",
        mainRef: "main",
        repository,
      }),
    );
  } finally {
    rmSync(repository, { recursive: true, force: true });
  }
});
