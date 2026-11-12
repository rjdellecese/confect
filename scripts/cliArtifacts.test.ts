import * as BunServices from "@effect/platform-bun/BunServices";
import { expect, test } from "bun:test";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import * as Str from "effect/String";
import { selectArtifacts, stageArtifacts, type Context } from "./cliArtifacts";

const context: Context = {
  runId: 43137770636,
  attempt: 1,
  headSha: "caa89d62fff596e3302f92e23f709d58f33ae127",
};
const start = "2026-11-12T01:55:13Z";
const upload = "2026-11-12T01:57:17Z";
const end = "2026-11-12T01:57:21Z";
const rerunStart = "2026-11-12T02:00:35Z";
const rerunUpload = "2026-11-12T02:03:02Z";
const rerunEnd = "2026-11-12T02:03:07Z";

const fixture = (attempt = 1) => {
  const shards = Array.flatMap(["ubuntu-latest", "windows-latest"], (os) =>
    Array.map([1, 2, 3, 4], (shard) => ({ os, shard })),
  );
  const jobs = Array.map(shards, ({ os, shard }, index) => ({
    id: 130917123015 + index,
    name: `Test (cli, ${os}, ${shard}/4)`,
    run_id: context.runId,
    run_attempt: attempt,
    head_sha: context.headSha,
    status: "completed",
    conclusion: "success",
    started_at: start,
    completed_at: end,
  }));
  const artifacts = Array.map(shards, ({ os, shard }, index) => ({
    id: 13908371397 + index,
    name: `cli-results-${os}-${shard}-attempt-1`,
    expired: false,
    created_at: upload,
    workflow_run: { id: context.runId, head_sha: context.headSha },
  }));
  return { jobs, artifacts };
};

type Fixture = ReturnType<typeof fixture>;
const select = ({ jobs, artifacts }: Fixture, attempt = 1) =>
  selectArtifacts(
    { ...context, attempt },
    [{ total_count: jobs.length, jobs }],
    [{ total_count: artifacts.length, artifacts }],
  );

const rerun = (input: Fixture, index: number, attempt = 2) => {
  input.jobs[index] = {
    ...input.jobs[index],
    id: 130919065809 + index,
    started_at: rerunStart,
    completed_at: rerunEnd,
  };
  input.artifacts.push({
    ...input.artifacts[index],
    id: 13908023690 + index,
    name: Str.replace(
      "attempt-1",
      `attempt-${attempt}`,
    )(input.artifacts[index].name),
    created_at: rerunUpload,
  });
};

test("selects all eight first-attempt shards without changing input or relying on API order", () => {
  const input = fixture();
  const before = structuredClone(input);
  const selected = select(input).pipe(Result.getOrThrow);
  expect(selected).toHaveLength(8);
  expect(Array.map(selected, (item) => item.artifactId)).toEqual(
    Array.map(input.artifacts, (item) => item.id),
  );
  expect(input).toEqual(before);
  expect(
    select({
      jobs: Array.reverse(input.jobs),
      artifacts: Array.reverse(input.artifacts),
    }).pipe(Result.getOrThrow),
  ).toEqual(selected);
});

test("failed-to-pass rerun selects the newer execution even when its artifact ID is smaller", () => {
  const input = fixture(2);
  input.jobs[4].conclusion = "failure";
  expect(select(input, 2).pipe(Result.getFailure)).toMatchObject({
    value: { reason: "LatestJobNotSuccessful" },
  });
  rerun(input, 4);
  input.jobs[4].conclusion = "success";
  const selected = select(input, 2).pipe(Result.getOrThrow);
  expect(selected[4].artifactId).toBe(13908023694);
  expect(selected[4].artifactAttempt).toBe(2);
  expect(Array.map(selected, (item) => item.artifactAttempt)).toEqual([
    1, 1, 1, 1, 2, 1, 1, 1,
  ]);
});

test.each(["failure", "cancelled", "timed_out", "skipped", "neutral"])(
  "never substitutes stale success for latest %s",
  (conclusion) => {
    const input = fixture(2);
    rerun(input, 4);
    input.jobs[4].conclusion = conclusion;
    expect(select(input, 2).pipe(Result.getFailure)).toMatchObject({
      _tag: "Some",
      value: { _tag: "InvalidCliShard", reason: "LatestJobNotSuccessful" },
    });
  },
);

test("full rerun followed by partial rerun and report-only rerun preserves actual artifact attempts", () => {
  const input = fixture(4);
  for (let index = 0; index < 8; index++) rerun(input, index);
  input.jobs[5] = {
    ...input.jobs[5],
    started_at: "2026-11-12T03:00:00Z",
    completed_at: "2026-11-12T03:05:00Z",
  };
  input.artifacts.push({
    ...input.artifacts[5],
    id: 50,
    name: "cli-results-windows-latest-2-attempt-3",
    created_at: "2026-11-12T03:04:00Z",
  });
  expect(
    Array.map(
      select(input, 4).pipe(Result.getOrThrow),
      (item) => item.artifactAttempt,
    ),
  ).toEqual([2, 2, 2, 2, 2, 3, 2, 2]);
});

test("ignores stale same-name duplicates outside the latest execution, rejects matching duplicates", () => {
  const input = fixture(2);
  rerun(input, 4);
  input.artifacts.push({ ...input.artifacts[4], id: 17 });
  expect(select(input, 2).pipe(Result.isSuccess)).toBe(true);
  input.artifacts.push({ ...input.artifacts[8], id: 18 });
  expect(select(input, 2).pipe(Result.getFailure)).toMatchObject({
    value: { reason: "AmbiguousArtifact" },
  });
});

test.each([
  [
    "missing job",
    (input: Fixture) => {
      input.jobs.splice(4, 1);
    },
    "MissingJob",
  ],
  [
    "duplicate shard job",
    (input: Fixture) => {
      input.jobs.push({ ...input.jobs[4], id: 33 });
    },
    "AmbiguousJob",
  ],
  [
    "missing artifact",
    (input: Fixture) => {
      input.artifacts.splice(4, 1);
    },
    "MissingArtifact",
  ],
  [
    "expired artifact",
    (input: Fixture) => {
      input.artifacts[4].expired = true;
    },
    "ExpiredArtifact",
  ],
  [
    "reversed execution window",
    (input: Fixture) => {
      input.jobs[4].completed_at = "2026-11-12T01:00:00Z";
    },
    "InvalidExecutionWindow",
  ],
  [
    "unfinished job",
    (input: Fixture) => {
      input.jobs[4].status = "in_progress";
    },
    "LatestJobNotSuccessful",
  ],
] as const)("rejects %s", (_name, edit, reason) => {
  const input = fixture();
  edit(input);
  expect(select(input).pipe(Result.getFailure)).toMatchObject({
    value: { _tag: "InvalidCliShard", reason },
  });
});

test("a latest successful job with no new artifact cannot fall back to an older success", () => {
  const input = fixture(2);
  rerun(input, 4);
  input.artifacts.pop();
  expect(select(input, 2).pipe(Result.getFailure)).toMatchObject({
    value: { reason: "MissingArtifact" },
  });
});

test.each([
  [
    "wrong job run",
    (input: Fixture) => {
      input.jobs[0].run_id++;
    },
  ],
  [
    "wrong job head",
    (input: Fixture) => {
      input.jobs[0].head_sha = Str.repeat(40)("b");
    },
  ],
  [
    "wrong snapshot attempt",
    (input: Fixture) => {
      input.jobs[0].run_attempt++;
    },
  ],
  [
    "wrong artifact run",
    (input: Fixture) => {
      input.artifacts[0].workflow_run.id++;
    },
  ],
  [
    "wrong artifact head",
    (input: Fixture) => {
      input.artifacts[0].workflow_run.head_sha = Str.repeat(40)("b");
    },
  ],
  [
    "legacy name",
    (input: Fixture) => {
      input.artifacts[0].name = "cli-results-ubuntu-latest-1";
    },
  ],
  [
    "future artifact attempt",
    (input: Fixture) => {
      input.artifacts[0].name = "cli-results-ubuntu-latest-1-attempt-2";
    },
  ],
  [
    "unexpected shard",
    (input: Fixture) => {
      input.jobs[0].name = "Test (cli, ubuntu-latest, 1/5)";
    },
  ],
  [
    "invalid timestamp",
    (input: Fixture) => {
      input.artifacts[0].created_at = "invalid";
    },
  ],
] as const)("rejects %s evidence", (_name, edit) => {
  const input = fixture();
  edit(input);
  expect(select(input).pipe(Result.getFailure)).toMatchObject({
    value: { _tag: "InvalidCliEvidence" },
  });
});

test("validates pagination completeness, duplicate IDs and malformed JSON shapes", () => {
  const { jobs, artifacts } = fixture();
  const artifactPages = [{ total_count: 8, artifacts }];
  expect(
    selectArtifacts(
      context,
      [
        { total_count: 8, jobs: jobs.slice(0, 3) },
        { total_count: 8, jobs: jobs.slice(3) },
      ],
      artifactPages,
    ).pipe(Result.isSuccess),
  ).toBe(true);
  expect(
    selectArtifacts(context, [{ total_count: 9, jobs }], artifactPages).pipe(
      Result.isFailure,
    ),
  ).toBe(true);
  expect(
    selectArtifacts(
      context,
      [{ total_count: 8, jobs }],
      [{ total_count: 9, artifacts }],
    ).pipe(Result.isFailure),
  ).toBe(true);
  expect(
    selectArtifacts(
      context,
      [{ total_count: 16, jobs: [...jobs, ...jobs] }],
      artifactPages,
    ).pipe(Result.isFailure),
  ).toBe(true);
  expect(
    selectArtifacts(context, [], artifactPages).pipe(Result.isFailure),
  ).toBe(true);
  expect(
    selectArtifacts(context, { jobs }, artifactPages).pipe(Result.isFailure),
  ).toBe(true);
  expect(
    selectArtifacts(
      { ...context, attempt: 0 },
      [{ total_count: 8, jobs }],
      artifactPages,
    ).pipe(Result.isFailure),
  ).toBe(true);
});

const timing =
  '{"success":true,"numTotalTests":1,"numPassedTests":1,"numFailedTests":0,"numFailedTestSuites":0,"testResults":[{}]}';

test("stages only validated isolated shard files and never overwrites an existing destination", () =>
  Effect.runPromise(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const selected = select(fixture()).pipe(Result.getOrThrow);
      for (const item of selected) {
        const os = item.os === "ubuntu-latest" ? "linux" : "windows";
        for (const kind of ["blobs", "timings"]) {
          const directory = path.join(
            root,
            "download",
            os,
            item.artifactName,
            kind,
          );
          yield* fs.makeDirectory(directory, { recursive: true });
          yield* fs.writeFileString(
            path.join(directory, `shard-${item.shard}.json`),
            kind === "blobs" ? '["vitest-blob"]' : timing,
          );
        }
      }
      const destination = path.join(root, "selected");
      yield* stageArtifacts(selected, path.join(root, "download"), destination);
      const linuxFiles = yield* fs.readDirectory(
        path.join(destination, "linux", "blobs"),
      );
      expect(linuxFiles).toHaveLength(4);
      const windowsFiles = yield* fs.readDirectory(
        path.join(destination, "windows", "timings"),
      );
      expect(windowsFiles).toHaveLength(4);
      const overwrite = yield* stageArtifacts(
        selected,
        path.join(root, "download"),
        destination,
      ).pipe(Effect.isFailure);
      expect(overwrite).toBe(true);
      const folder = path.join(
        root,
        "download",
        "linux",
        selected[0].artifactName,
        "blobs",
      );
      yield* fs.writeFileString(path.join(folder, "shard-1.json"), "{}");
      const malformed = yield* stageArtifacts(
        selected,
        path.join(root, "download"),
        path.join(root, "invalid"),
      ).pipe(Effect.flip);
      expect(malformed).toMatchObject({ _tag: "InvalidCliEvidence" });
      const invalidExists = yield* fs.exists(path.join(root, "invalid"));
      expect(invalidExists).toBe(false);
      yield* fs.remove(path.join(folder, "shard-1.json"));
      const missing = yield* stageArtifacts(
        selected,
        path.join(root, "download"),
        path.join(root, "missing"),
      ).pipe(Effect.flip);
      expect(missing).toMatchObject({ _tag: "InvalidCliEvidence" });
      yield* fs.writeFileString(
        path.join(folder, "shard-1.json"),
        '["vitest-blob"]',
      );
      const timingFile = path.join(
        root,
        "download",
        "linux",
        selected[0].artifactName,
        "timings",
        "shard-1.json",
      );
      yield* fs.writeFileString(
        timingFile,
        Str.replace('"numFailedTests":0', '"numFailedTests":1')(timing),
      );
      const failedTiming = yield* stageArtifacts(
        selected,
        path.join(root, "download"),
        path.join(root, "failed-timing"),
      ).pipe(Effect.flip);
      expect(failedTiming).toMatchObject({ _tag: "InvalidCliEvidence" });
      const incomplete = yield* stageArtifacts(
        selected.slice(1),
        path.join(root, "download"),
        path.join(root, "incomplete"),
      ).pipe(Effect.flip);
      expect(incomplete).toMatchObject({ _tag: "InvalidCliEvidence" });
      const duplicate = yield* stageArtifacts(
        [...selected.slice(1), selected[1]],
        path.join(root, "download"),
        path.join(root, "duplicate"),
      ).pipe(Effect.flip);
      expect(duplicate).toMatchObject({ _tag: "InvalidCliEvidence" });
    }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
  ));
