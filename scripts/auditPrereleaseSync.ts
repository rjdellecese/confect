import * as BunRuntime from "@effect/platform-bun/BunRuntime";
import * as BunServices from "@effect/platform-bun/BunServices";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as ChildProcess from "effect/unstable/process/ChildProcess";
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner";

export class InvalidChangesetState extends Schema.TaggedError<InvalidChangesetState>()(
  "InvalidChangesetState",
  { reason: Schema.String },
) {
  override get message() {
    return this.reason;
  }
}

export class DuplicateChangesets extends Schema.TaggedError<DuplicateChangesets>()(
  "DuplicateChangesets",
  { repository: Schema.String, ids: Schema.Array(Schema.String) },
) {
  override get message() {
    return `Changesets exist both pending and prereleased: ${this.ids.join(", ")}`;
  }
}

export class MissingMainAncestry extends Schema.TaggedError<MissingMainAncestry>()(
  "MissingMainAncestry",
  { repository: Schema.String, mainRef: Schema.String, headRef: Schema.String },
) {
  override get message() {
    return `${this.mainRef} is not an ancestor of ${this.headRef}; refresh the sync with a real merge even if its tree diff is empty.`;
  }
}

export class GitInspectionError extends Schema.TaggedError<GitInspectionError>()(
  "GitInspectionError",
  {
    repository: Schema.String,
    args: Schema.Array(Schema.String),
    exitCode: Schema.Finite,
    stderr: Schema.String,
  },
) {
  override get message() {
    return this.stderr.trim() || "Unable to inspect Git ancestry.";
  }
}

export class MissingArgumentValue extends Schema.TaggedError<MissingArgumentValue>()(
  "MissingArgumentValue",
  { argument: Schema.String },
) {
  override get message() {
    return `${this.argument} requires a value.`;
  }
}

export interface ChangesetState {
  readonly effectiveContentChanged?: boolean;
  readonly pendingOnMain?: boolean;
  readonly prereleasedOnTarget?: boolean;
  readonly publicSurfaceChanged?: boolean;
  readonly releasedOnMain?: boolean;
  readonly retractedOnMain?: boolean;
}

export const decideChangesetAction = Effect.fn(
  "PrereleaseSync.decideChangesetAction",
)(function* ({
  effectiveContentChanged = false,
  pendingOnMain = false,
  prereleasedOnTarget = false,
  publicSurfaceChanged = false,
  releasedOnMain = false,
  retractedOnMain = false,
}: ChangesetState = {}) {
  if (
    [pendingOnMain, releasedOnMain, retractedOnMain].filter(Boolean).length > 1
  ) {
    return yield* new InvalidChangesetState({
      reason:
        "A changeset cannot be pending, released, and retracted on main at the same time.",
    });
  }

  if (publicSurfaceChanged && !effectiveContentChanged) {
    return yield* new InvalidChangesetState({
      reason:
        "A public-surface change must also be an effective content change.",
    });
  }

  if (retractedOnMain && prereleasedOnTarget)
    return "review-prereleased-retraction" as const;

  if (prereleasedOnTarget) return "already-prereleased" as const;

  if (pendingOnMain) return "carry-pending" as const;

  if (retractedOnMain) return "remove-retracted-pending" as const;

  if (releasedOnMain && effectiveContentChanged)
    return "document-released-change" as const;

  if (!pendingOnMain && !releasedOnMain && publicSurfaceChanged)
    return "review-unversioned-public-change" as const;

  return "no-changeset" as const;
});

const changesetIds = Effect.fn("PrereleaseSync.changesetIds")(function* (
  directory: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  if (!(yield* fs.exists(directory))) return new Set<string>();
  const ids = new Set<string>();

  for (const name of yield* fs.readDirectory(directory)) {
    if (!name.endsWith(".md")) continue;
    const info = yield* fs.stat(path.join(directory, name));

    if (info.type === "File") ids.add(name.slice(0, -3));
  }

  return ids;
});

export const findDuplicateChangesets = Effect.fn(
  "PrereleaseSync.findDuplicateChangesets",
)(function* (repository = ".") {
  const path = yield* Path.Path;
  const directory = path.resolve(repository, ".changeset");
  const pending = yield* changesetIds(directory);
  const prereleased = yield* changesetIds(path.join(directory, "pre"));

  return [...pending]
    .filter((id) => prereleased.has(id))
    .sort((left, right) => left.localeCompare(right));
});

const inspectGit = Effect.fn("PrereleaseSync.inspectGit")(function* (
  repository: string,
  args: ReadonlyArray<string>,
) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;

  const handle = yield* spawner.spawn(
    ChildProcess.make("git", args, { cwd: repository, stdin: "ignore" }),
  );

  return yield* Effect.all(
    {
      exitCode: handle.exitCode,
      stdout: handle.stdout.pipe(Stream.decodeText(), Stream.mkString),
      stderr: handle.stderr.pipe(Stream.decodeText(), Stream.mkString),
    },
    { concurrency: "unbounded" },
  );
}, Effect.scoped);

export const isAncestor = Effect.fn("PrereleaseSync.isAncestor")(function* (
  ancestor: string,
  descendant: string,
  repository = ".",
) {
  const args = ["merge-base", "--is-ancestor", ancestor, descendant];
  const result = yield* inspectGit(repository, args);

  if (result.exitCode === 0) return true;

  if (result.exitCode === 1) return false;

  return yield* new GitInspectionError({
    repository,
    args,
    exitCode: result.exitCode,
    stderr: result.stderr,
  });
});

export interface AuditOptions {
  readonly headRef?: string;
  readonly mainRef?: string;
  readonly repository?: string;
}

export const auditPrereleaseSync = Effect.fn("PrereleaseSync.audit")(
  function* ({
    headRef = "HEAD",
    mainRef = "origin/main",
    repository = ".",
  }: AuditOptions = {}) {
    const duplicates = yield* findDuplicateChangesets(repository);

    if (duplicates.length > 0)
      return yield* new DuplicateChangesets({ repository, ids: duplicates });

    if (!(yield* isAncestor(mainRef, headRef, repository)))
      return yield* new MissingMainAncestry({ repository, mainRef, headRef });
  },
);

const readArgument = Effect.fn("PrereleaseSync.readArgument")(function* (
  args: ReadonlyArray<string>,
  name: string,
) {
  const index = args.indexOf(name);

  if (index === -1) return undefined;
  const value = args[index + 1];

  if (!value || value.startsWith("--"))
    return yield* new MissingArgumentValue({ argument: name });

  return value;
});

export const auditPrereleaseSyncMain = Effect.fn("PrereleaseSync.main")(
  function* (args: ReadonlyArray<string>) {
    const mainRef = (yield* readArgument(args, "--main-ref")) ?? "origin/main";
    const headRef = (yield* readArgument(args, "--head-ref")) ?? "HEAD";
    yield* auditPrereleaseSync({ mainRef, headRef });
    const gitArgs = ["rev-parse", "--short", mainRef];
    const result = yield* inspectGit(".", gitArgs);

    if (result.exitCode !== 0)
      return yield* new GitInspectionError({
        repository: ".",
        args: gitArgs,
        exitCode: result.exitCode,
        stderr: result.stderr,
      });
    yield* Console.log(
      `Prerelease sync audit passed: ${mainRef} (${result.stdout.trim()}) is in ${headRef}.`,
    );
  },
);

if (import.meta.main) {
  auditPrereleaseSyncMain(Bun.argv.slice(2)).pipe(
    Effect.tapError((error) => Console.error(error.message)),
    Effect.provide(BunServices.layer),
    BunRuntime.runMain({ disableErrorReporting: true }),
  );
}
