import * as BunServices from "@effect/platform-bun/BunServices";
import { expect, test } from "bun:test";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as ChildProcess from "effect/unstable/process/ChildProcess";
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner";
import {
  auditPrereleaseSync,
  auditPrereleaseSyncMain,
  decideChangesetAction,
  findDuplicateChangesets,
  isAncestor,
} from "./auditPrereleaseSync";

const runTest = <A, E>(effect: Effect.Effect<A, E, BunServices.BunServices>) =>
  Effect.runPromise(effect.pipe(Effect.provide(BunServices.layer)));

test("carries a changeset that is still pending on main", () =>
  runTest(
    Effect.gen(function* () {
      expect(
        yield* decideChangesetAction({
          pendingOnMain: true,
          effectiveContentChanged: true,
        }),
      ).toBe("carry-pending");
    }),
  ));

test("does not duplicate a changeset already shipped on the prerelease line", () =>
  runTest(
    Effect.gen(function* () {
      expect(
        yield* decideChangesetAction({
          prereleasedOnTarget: true,
          releasedOnMain: true,
          effectiveContentChanged: true,
        }),
      ).toBe("already-prereleased");
    }),
  ));

test("documents released main content that has not reached the prerelease line", () =>
  runTest(
    Effect.gen(function* () {
      expect(
        yield* decideChangesetAction({
          releasedOnMain: true,
          effectiveContentChanged: true,
        }),
      ).toBe("document-released-change");
    }),
  ));

test("removes an unpublished retracted changeset", () =>
  runTest(
    Effect.gen(function* () {
      expect(yield* decideChangesetAction({ retractedOnMain: true })).toBe(
        "remove-retracted-pending",
      );
    }),
  ));

test("requires review when main retracts a changeset already prereleased", () =>
  runTest(
    Effect.gen(function* () {
      expect(
        yield* decideChangesetAction({
          prereleasedOnTarget: true,
          retractedOnMain: true,
        }),
      ).toBe("review-prereleased-retraction");
    }),
  ));

test("flags an unversioned public change instead of inventing a sync changeset", () =>
  runTest(
    Effect.gen(function* () {
      expect(
        yield* decideChangesetAction({
          effectiveContentChanged: true,
          publicSurfaceChanged: true,
        }),
      ).toBe("review-unversioned-public-change");
    }),
  ));

test("allows internal and ancestry-only syncs without a changeset", () =>
  runTest(
    Effect.gen(function* () {
      expect(
        yield* decideChangesetAction({ effectiveContentChanged: true }),
      ).toBe("no-changeset");
      expect(yield* decideChangesetAction()).toBe("no-changeset");
    }),
  ));

test("rejects contradictory changeset states", () =>
  runTest(
    Effect.gen(function* () {
      for (const state of [
        { pendingOnMain: true, releasedOnMain: true },
        { publicSurfaceChanged: true },
      ]) {
        expect(
          (yield* decideChangesetAction(state).pipe(Effect.flip))._tag,
        ).toBe("InvalidChangesetState");
      }
    }),
  ));

test("requires values for CLI reference arguments", () =>
  runTest(
    Effect.gen(function* () {
      for (const args of [
        ["--main-ref"],
        ["--head-ref", "--main-ref", "main"],
      ]) {
        expect(
          (yield* auditPrereleaseSyncMain(args).pipe(Effect.flip))._tag,
        ).toBe("MissingArgumentValue");
      }
    }),
  ));

test("rejects a changeset duplicated between pending and prereleased storage", () =>
  runTest(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const repository = yield* fs.makeTempDirectoryScoped({
        prefix: "confect-changeset-audit-",
      });
      expect(yield* findDuplicateChangesets(repository)).toEqual([]);
      yield* fs.makeDirectory(path.join(repository, ".changeset", "pre"), {
        recursive: true,
      });
      yield* fs.writeFileString(
        path.join(repository, ".changeset", "same-id.md"),
        "pending",
      );
      yield* fs.writeFileString(
        path.join(repository, ".changeset", "pre", "same-id.md"),
        "shipped",
      );
      expect(yield* findDuplicateChangesets(repository)).toEqual(["same-id"]);
      const error = yield* auditPrereleaseSync({ repository }).pipe(
        Effect.flip,
      );
      expect(error._tag).toBe("DuplicateChangesets");
    }).pipe(Effect.scoped),
  ));

test("requires ancestry even when main and the prerelease line have identical trees", () =>
  runTest(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const repository = yield* fs.makeTempDirectoryScoped({
        prefix: "confect-ancestry-audit-",
      });
      const git = Effect.fn("PrereleaseSyncTest.git")(function* (
        ...args: Array<string>
      ) {
        const code = yield* spawner.exitCode(
          ChildProcess.make("git", args, {
            cwd: repository,
            stdout: "ignore",
            stderr: "inherit",
          }),
        );
        expect(Number(code)).toBe(0);
      });
      yield* git("init", "--initial-branch=main");
      yield* git("config", "user.name", "Prerelease Sync Test");
      yield* git("config", "user.email", "sync-test@example.invalid");
      yield* fs.writeFileString(path.join(repository, "state.txt"), "base\n");
      yield* git("add", "state.txt");
      yield* git("commit", "-m", "Create base");
      yield* git("branch", "v10");
      yield* fs.writeFileString(
        path.join(repository, "state.txt"),
        "same final tree\n",
      );
      yield* git("commit", "-am", "Update main");
      yield* git("switch", "v10");
      yield* fs.writeFileString(
        path.join(repository, "state.txt"),
        "same final tree\n",
      );
      yield* git("commit", "-am", "Update prerelease independently");
      expect(
        yield* spawner.string(
          ChildProcess.make("git", ["diff", "main", "v10"], {
            cwd: repository,
          }),
        ),
      ).toBe("");
      expect(yield* isAncestor("main", "v10", repository)).toBe(false);
      const error = yield* auditPrereleaseSync({
        headRef: "v10",
        mainRef: "main",
        repository,
      }).pipe(Effect.flip);
      expect(error._tag).toBe("MissingMainAncestry");
      expect(error.message).toMatch(
        /real merge even if its tree diff is empty/,
      );
      expect(
        (yield* isAncestor("missing-ref", "v10", repository).pipe(Effect.flip))
          ._tag,
      ).toBe("GitInspectionError");
      yield* git("merge", "--no-ff", "main", "-m", "Record main ancestry");
      expect(yield* isAncestor("main", "HEAD", repository)).toBe(true);
      yield* auditPrereleaseSync({
        headRef: "HEAD",
        mainRef: "main",
        repository,
      });
    }).pipe(Effect.scoped),
  ));
