import * as BunRuntime from "@effect/platform-bun/BunRuntime";
import * as BunServices from "@effect/platform-bun/BunServices";
import * as Array from "effect/Array";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as Str from "effect/String";

const PositiveInteger = Schema.Int.check(Schema.isGreaterThan(0));
const Sha = Schema.String.check(Schema.isPattern(/^[a-f0-9]{40}$/));
const Os = Schema.Literals(["ubuntu-latest", "windows-latest"]);
const Shard = Schema.Literals([1, 2, 3, 4]);
const Context = Schema.Struct({
  runId: PositiveInteger,
  attempt: PositiveInteger,
  headSha: Sha,
});
export type Context = typeof Context.Type;

const Job = Schema.Struct({
  id: PositiveInteger,
  name: Schema.String,
  run_id: PositiveInteger,
  run_attempt: PositiveInteger,
  head_sha: Sha,
  status: Schema.String,
  conclusion: Schema.NullOr(Schema.String),
  started_at: Schema.DateTimeUtcFromString,
  completed_at: Schema.NullOr(Schema.DateTimeUtcFromString),
});
const Artifact = Schema.Struct({
  id: PositiveInteger,
  name: Schema.String,
  expired: Schema.Boolean,
  created_at: Schema.DateTimeUtcFromString,
  workflow_run: Schema.Struct({ id: PositiveInteger, head_sha: Sha }),
});
const Jobs = Schema.NonEmptyArray(
  Schema.Struct({ total_count: Schema.Int, jobs: Schema.Array(Job) }),
);
const Artifacts = Schema.NonEmptyArray(
  Schema.Struct({ total_count: Schema.Int, artifacts: Schema.Array(Artifact) }),
);
const SelectedArtifact = Schema.Struct({
  os: Os,
  shard: Shard,
  artifactId: PositiveInteger,
  artifactName: Schema.String.check(
    Schema.isPattern(
      /^cli-results-(ubuntu|windows)-latest-[1-4]-attempt-[1-9]\d*$/,
    ),
  ),
  artifactAttempt: PositiveInteger,
  jobId: PositiveInteger,
  runId: PositiveInteger,
  headSha: Sha,
  reportAttempt: PositiveInteger,
});
const Selection = Schema.Array(SelectedArtifact);
export type SelectedArtifact = typeof SelectedArtifact.Type;

export class InvalidCliEvidence extends Schema.TaggedError<
  InvalidCliEvidence,
  {}
>()("InvalidCliEvidence", { source: Schema.String, detail: Schema.String }) {}

export class InvalidCliShard extends Schema.TaggedError<InvalidCliShard, {}>()(
  "InvalidCliShard",
  {
    shard: Schema.String,
    reason: Schema.Literals([
      "MissingJob",
      "AmbiguousJob",
      "LatestJobNotSuccessful",
      "InvalidExecutionWindow",
      "MissingArtifact",
      "AmbiguousArtifact",
      "ExpiredArtifact",
    ]),
    ids: Schema.Array(PositiveInteger),
  },
) {}

export const selectArtifacts = (
  context: Context,
  jobsInput: unknown,
  artifactsInput: unknown,
) =>
  Result.gen(function* () {
    yield* Schema.decodeResult(Context)(context).pipe(
      Result.mapError((error) =>
        InvalidCliEvidence.make({ source: "context", detail: error.message }),
      ),
    );
    const jobPages = yield* Schema.decodeUnknownResult(Jobs)(jobsInput).pipe(
      Result.mapError((error) =>
        InvalidCliEvidence.make({ source: "jobs", detail: error.message }),
      ),
    );
    const artifactPages = yield* Schema.decodeUnknownResult(Artifacts)(
      artifactsInput,
    ).pipe(
      Result.mapError((error) =>
        InvalidCliEvidence.make({ source: "artifacts", detail: error.message }),
      ),
    );
    const jobs = Array.flatMap(jobPages, (page) => page.jobs);
    const artifacts = Array.flatMap(artifactPages, (page) => page.artifacts);
    for (const [source, pages, rows] of [
      [
        "jobs",
        Array.map(jobPages, (page) => page.total_count),
        Array.map(jobs, (job) => job.id),
      ],
      [
        "artifacts",
        Array.map(artifactPages, (page) => page.total_count),
        Array.map(artifacts, (artifact) => artifact.id),
      ],
    ] as const) {
      if (
        Array.some(pages, (count) => count !== rows.length) ||
        new Set(rows).size !== rows.length
      )
        return yield* Result.fail(
          InvalidCliEvidence.make({
            source,
            detail: "Incomplete pagination or duplicate IDs",
          }),
        );
    }
    const selected: Array<SelectedArtifact> = [];
    const expectedNames = new Set(
      Array.flatMap(["ubuntu-latest", "windows-latest"], (os) =>
        Array.map([1, 2, 3, 4], (shard) => `Test (cli, ${os}, ${shard}/4)`),
      ),
    );
    for (const job of jobs) {
      if (
        job.run_id !== context.runId ||
        job.head_sha !== context.headSha ||
        job.run_attempt !== context.attempt
      )
        return yield* Result.fail(
          InvalidCliEvidence.make({
            source: "jobs",
            detail: `Wrong run, head or attempt for job ${job.id}`,
          }),
        );
      if (
        Str.startsWith("Test (cli,")(job.name) &&
        !expectedNames.has(job.name)
      )
        return yield* Result.fail(
          InvalidCliEvidence.make({
            source: "jobs",
            detail: `Unexpected CLI shard ${job.name}`,
          }),
        );
    }
    const candidates: Array<{
      artifact: typeof Artifact.Type;
      os: typeof Os.Type;
      shard: typeof Shard.Type;
      attempt: number;
    }> = [];
    for (const artifact of artifacts) {
      if (!Str.startsWith("cli-results-")(artifact.name)) continue;
      const match =
        /^cli-results-(ubuntu-latest|windows-latest)-([1-4])-attempt-([1-9]\d*)$/.exec(
          artifact.name,
        );
      if (
        match === null ||
        artifact.workflow_run.id !== context.runId ||
        artifact.workflow_run.head_sha !== context.headSha
      )
        return yield* Result.fail(
          InvalidCliEvidence.make({
            source: "artifacts",
            detail: `Malformed or foreign CLI artifact ${artifact.id}`,
          }),
        );
      const os = yield* Schema.decodeUnknownResult(Os)(match[1]).pipe(
        Result.mapError((error) =>
          InvalidCliEvidence.make({
            source: "artifacts",
            detail: error.message,
          }),
        ),
      );
      const shard = yield* Schema.decodeUnknownResult(Shard)(
        Number(match[2]),
      ).pipe(
        Result.mapError((error) =>
          InvalidCliEvidence.make({
            source: "artifacts",
            detail: error.message,
          }),
        ),
      );
      const attempt = Number(match[3]);
      if (!Number.isSafeInteger(attempt) || attempt > context.attempt)
        return yield* Result.fail(
          InvalidCliEvidence.make({
            source: "artifacts",
            detail: `Invalid attempt for artifact ${artifact.id}`,
          }),
        );
      candidates.push({ artifact, os, shard, attempt });
    }
    for (const os of ["ubuntu-latest", "windows-latest"] as const) {
      for (const shard of [1, 2, 3, 4] as const) {
        const name = `Test (cli, ${os}, ${shard}/4)`;
        const matchingJobs = Array.filter(jobs, (job) => job.name === name);
        if (matchingJobs.length !== 1)
          return yield* Result.fail(
            InvalidCliShard.make({
              shard: name,
              reason: matchingJobs.length === 0 ? "MissingJob" : "AmbiguousJob",
              ids: Array.map(matchingJobs, (job) => job.id),
            }),
          );
        const job = matchingJobs[0];
        if (job.status !== "completed" || job.conclusion !== "success")
          return yield* Result.fail(
            InvalidCliShard.make({
              shard: name,
              reason: "LatestJobNotSuccessful",
              ids: [job.id],
            }),
          );
        const start = DateTime.toEpochMillis(job.started_at);
        const end =
          job.completed_at === null
            ? undefined
            : DateTime.toEpochMillis(job.completed_at);
        if (end === undefined || end < start)
          return yield* Result.fail(
            InvalidCliShard.make({
              shard: name,
              reason: "InvalidExecutionWindow",
              ids: [job.id],
            }),
          );
        const matches = Array.filter(
          candidates,
          (candidate) =>
            candidate.os === os &&
            candidate.shard === shard &&
            DateTime.toEpochMillis(candidate.artifact.created_at) >= start &&
            DateTime.toEpochMillis(candidate.artifact.created_at) <= end,
        );
        if (matches.length !== 1)
          return yield* Result.fail(
            InvalidCliShard.make({
              shard: name,
              reason:
                matches.length === 0 ? "MissingArtifact" : "AmbiguousArtifact",
              ids: Array.map(matches, ({ artifact }) => artifact.id),
            }),
          );
        const { artifact, attempt } = matches[0];
        if (artifact.expired)
          return yield* Result.fail(
            InvalidCliShard.make({
              shard: name,
              reason: "ExpiredArtifact",
              ids: [artifact.id],
            }),
          );
        selected.push({
          os,
          shard,
          artifactId: artifact.id,
          artifactName: artifact.name,
          artifactAttempt: attempt,
          jobId: job.id,
          runId: context.runId,
          headSha: context.headSha,
          reportAttempt: context.attempt,
        });
      }
    }
    return selected;
  });

const Json = Schema.fromJsonString(Schema.Unknown);
const SelectionJson = Schema.fromJsonString(Selection);
const osDirectory = (os: typeof Os.Type) =>
  os === "ubuntu-latest" ? "linux" : "windows";

export const stageArtifacts = Effect.fn("CliArtifacts.stage")(function* (
  selection: ReadonlyArray<SelectedArtifact>,
  source: string,
  destination: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  if (
    selection.length !== 8 ||
    new Set(Array.map(selection, (item) => `${item.os}/${item.shard}`)).size !==
      8
  )
    return yield* InvalidCliEvidence.make({
      source: "selection",
      detail: "Expected exactly one artifact for each of the eight CLI shards",
    });
  const files: Array<{ source: string; destination: string }> = [];
  for (const item of selection) {
    const directory = path.join(
      source,
      osDirectory(item.os),
      item.artifactName,
    );
    const entries = yield* fs.readDirectory(directory);
    if (
      entries.length !== 2 ||
      !entries.includes("blobs") ||
      !entries.includes("timings")
    )
      return yield* InvalidCliEvidence.make({
        source: directory,
        detail: "Expected only blobs and timings directories",
      });
    for (const kind of ["blobs", "timings"] as const) {
      const folder = path.join(directory, kind);
      const name = `shard-${item.shard}.json`;
      const names = yield* fs.readDirectory(folder);
      if (names.length !== 1 || names[0] !== name)
        return yield* InvalidCliEvidence.make({
          source: folder,
          detail: `Expected exactly ${name}`,
        });
      const file = path.join(folder, name);
      const content = yield* fs.readFileString(file);
      const schema =
        kind === "blobs"
          ? Schema.NonEmptyArray(Schema.Unknown)
          : Schema.Struct({
              success: Schema.Literal(true),
              numTotalTests: PositiveInteger,
              numPassedTests: PositiveInteger,
              numFailedTests: Schema.Literal(0),
              numFailedTestSuites: Schema.Literal(0),
              testResults: Schema.NonEmptyArray(Schema.Unknown),
            });
      yield* Schema.decodeEffect(Schema.fromJsonString(schema))(content).pipe(
        Effect.mapError((error) =>
          InvalidCliEvidence.make({ source: file, detail: error.message }),
        ),
      );
      files.push({
        source: file,
        destination: path.join(destination, osDirectory(item.os), kind, name),
      });
    }
  }
  yield* fs.makeDirectory(destination);
  for (const file of files) {
    yield* fs.makeDirectory(path.dirname(file.destination), {
      recursive: true,
    });
    yield* fs.copyFile(file.source, file.destination);
  }
});

const main = Effect.fn("CliArtifacts.main")(function* (
  args: ReadonlyArray<string>,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  if (args[0] === "select" && args.length === 6) {
    const [, directory, output, runId, attempt, headSha] = args;
    const jobs = yield* fs
      .readFileString(path.join(directory, "jobs.json"))
      .pipe(Effect.flatMap(Schema.decodeEffect(Json)));
    const artifacts = yield* fs
      .readFileString(path.join(directory, "artifacts.json"))
      .pipe(Effect.flatMap(Schema.decodeEffect(Json)));
    const selected = yield* Effect.fromResult(
      selectArtifacts(
        { runId: Number(runId), attempt: Number(attempt), headSha },
        jobs,
        artifacts,
      ),
    );
    const encoded = yield* Schema.encodeEffect(SelectionJson)(selected);
    yield* fs.writeFileString(path.join(directory, "selection.json"), encoded);
    const lines = Array.map(
      ["ubuntu-latest", "windows-latest"] as const,
      (os) =>
        `${osDirectory(os)}=${Array.join(
          Array.map(
            Array.filter(selected, (item) => item.os === os),
            (item) => String(item.artifactId),
          ),
          ",",
        )}`,
    );
    yield* fs.writeFileString(output, `${Array.join(lines, "\n")}\n`, {
      flag: "a",
    });
  } else if (args[0] === "stage" && args.length === 4) {
    const [, selection, source, destination] = args;
    const selected = yield* fs
      .readFileString(selection)
      .pipe(Effect.flatMap(Schema.decodeEffect(SelectionJson)));
    yield* stageArtifacts(selected, source, destination);
  } else {
    return yield* InvalidCliEvidence.make({
      source: "arguments",
      detail:
        "Expected select <evidence directory> <output> <run id> <attempt> <head sha> or stage <selection> <source> <destination>",
    });
  }
});

if (import.meta.main) {
  main(Bun.argv.slice(2)).pipe(
    Effect.provide(BunServices.layer),
    BunRuntime.runMain,
  );
}
