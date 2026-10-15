import * as Array from "effect/Array";
import * as Brand from "effect/Brand";
import type * as Crypto from "effect/Crypto";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import * as Equal from "effect/Equal";
import * as HashMap from "effect/HashMap";
import * as HashSet from "effect/HashSet";
import * as Match from "effect/Match";
import * as Hex from "effect/encoding/Hex";
import * as Option from "effect/Option";
import type { PlatformError } from "effect/PlatformError";
import * as Result from "effect/Result";
import type * as esbuild from "esbuild";
import * as WatchGraph from "./WatchGraph";

export type Failure = Data.TaggedEnum<{
  BuildFailed: {
    readonly errors: Array.NonEmptyReadonlyArray<esbuild.Message>;
  };
  InputCaptureFailed: { readonly file: string; readonly cause: PlatformError };
  OutputCaptureFailed: { readonly file: string; readonly cause: PlatformError };
  InvalidBuildResult: { readonly missing: "metafile" | "outputFiles" };
}>;
export const Failure = Data.taggedEnum<Failure>();
export type Fingerprints = HashMap.HashMap<string, string>;

export interface Capture {
  readonly fingerprints: Fingerprints;
  readonly failures: HashMap.HashMap<string, Failure>;
}
export const emptyCapture: Capture = {
  fingerprints: HashMap.empty(),
  failures: HashMap.empty(),
};

export interface Snapshot {
  readonly fingerprints: Fingerprints;
  readonly graph: WatchGraph.WatchGraph;
  readonly outputHash: string;
}

export type Outcome = Data.TaggedEnum<{
  Succeeded: {
    readonly snapshot: Snapshot;
    readonly warnings: ReadonlyArray<esbuild.Message>;
  };
  Failed: {
    readonly fingerprints: Fingerprints;
    readonly failures: Array.NonEmptyReadonlyArray<Failure>;
    readonly warnings: ReadonlyArray<esbuild.Message>;
  };
}>;
export const Outcome = Data.taggedEnum<Outcome>();

export type Generation = number & Brand.Brand<"WatchBuild.Generation">;
const Generation = Brand.nominal<Generation>();

export type Barrier = number & Brand.Brand<"WatchBuild.Barrier">;
const Barrier = Brand.nominal<Barrier>();

export type RequestId = object & Brand.Brand<"WatchBuild.RequestId">;
const RequestId = Brand.nominal<RequestId>();

export const makeRequestId = (): RequestId => RequestId({});

export interface Completion {
  readonly generation: Generation;
  readonly outcome: Outcome;
}

type Request = Data.TaggedEnum<{
  Idle: {};
  Pending: {};
  Joined: {};
  Completed: { readonly completion: Completion };
}>;
const Request = Data.taggedEnum<Request>();

export interface Progress {
  readonly generation: Generation;
  readonly request: Request;
  readonly lastRequest: Option.Option<RequestId>;
}

export const initialProgress: Progress = {
  generation: Generation(0),
  request: Request.Idle(),
  lastRequest: Option.none(),
};

export const start = (progress: Progress): Progress => ({
  ...progress,
  generation: Generation(progress.generation + 1),
});

export const captureBarrier = (progress: Progress): Barrier =>
  Barrier(progress.generation);

export const request = (progress: Progress, id: RequestId): Progress => ({
  ...progress,
  request:
    Option.isSome(progress.lastRequest) && progress.lastRequest.value === id
      ? Request.Joined()
      : Request.Pending(),
  lastRequest: Option.some(id),
});

export const complete = (
  progress: Progress,
  completion: Completion,
): Progress => ({
  ...progress,
  request: Request.$match(progress.request, {
    Idle: (idle) => idle,
    Pending: () => Request.Completed({ completion }),
    Joined: () => Request.Completed({ completion }),
    Completed: (completed) => completed,
  }),
});

export const getCompletion = (progress: Progress): Option.Option<Completion> =>
  Request.$match(progress.request, {
    Idle: () => Option.none(),
    Pending: () => Option.none(),
    Joined: () => Option.none(),
    Completed: ({ completion }) => Option.some(completion),
  });

export const joinedWithoutCompletion = (progress: Progress): boolean =>
  Request.$is("Joined")(progress.request);

export const endRequest = (progress: Progress): Progress => ({
  ...progress,
  request: Request.Idle(),
});

export const isFresh = (barrier: Barrier, completion: Completion): boolean =>
  completion.generation > barrier;

export const verifyInputs = Effect.fn("WatchBuild.verifyInputs")(function* (
  snapshot: Snapshot,
  fs: FileSystem.FileSystem,
  crypto: Crypto.Crypto,
) {
  const matches = yield* Effect.forEach(
    snapshot.fingerprints,
    ([file, expected]) =>
      fs.readFile(file).pipe(
        Effect.flatMap((contents) => crypto.digest("SHA-256", contents)),
        Effect.map((digest) => Hex.encode(digest) === expected),
        Effect.mapError((cause) => Failure.InputCaptureFailed({ file, cause })),
      ),
    { concurrency: 8 },
  );
  return Array.every(matches, (matchesInput) => matchesInput);
});

export type State = Data.TaggedEnum<{
  Initial: {};
  Succeeded: {
    readonly snapshot: Snapshot;
    readonly warnings: ReadonlyArray<esbuild.Message>;
  };
  Failed: {
    readonly observation: Extract<Outcome, { readonly _tag: "Failed" }>;
    readonly lastSuccessful: Option.Option<Snapshot>;
  };
}>;
export const State = Data.taggedEnum<State>();

export const lastSuccessful = (state: State): Option.Option<Snapshot> =>
  State.$match(state, {
    Initial: () => Option.none(),
    Succeeded: ({ snapshot }) => Option.some(snapshot),
    Failed: ({ lastSuccessful: snapshot }) => snapshot,
  });

export const observe = (previous: State, outcome: Outcome): State =>
  Outcome.$match(outcome, {
    Succeeded: ({ snapshot, warnings }) =>
      State.Succeeded({ snapshot, warnings }),
    Failed: (observation) =>
      State.Failed({
        observation,
        lastSuccessful: lastSuccessful(previous),
      }),
  });

export const fingerprints = (state: State): Fingerprints =>
  State.$match(state, {
    Initial: () => HashMap.empty(),
    Succeeded: ({ snapshot }) => snapshot.fingerprints,
    Failed: ({ observation }) => observation.fingerprints,
  });

export const outputHash = (state: State): Option.Option<string> =>
  State.$match(state, {
    Initial: () => Option.none(),
    Succeeded: ({ snapshot }) => Option.some(snapshot.outputHash),
    Failed: () => Option.none(),
  });

export type Change = Data.TaggedEnum<{
  Full: {};
  Affected: { readonly paths: HashSet.HashSet<string> };
}>;
export const Change = Data.taggedEnum<Change>();

export const diff = (
  previous: State,
  current: State,
  generatedDirectoryPrefix: string,
): Change => {
  const previousFingerprints = fingerprints(previous);
  const currentFingerprints = fingerprints(current);
  const files = HashSet.union(
    HashSet.fromIterable(HashMap.keys(previousFingerprints)),
    HashSet.fromIterable(HashMap.keys(currentFingerprints)),
  );
  const changed = Array.fromIterable(files).filter(
    (file) =>
      !Equal.equals(
        HashMap.get(previousFingerprints, file),
        HashMap.get(currentFingerprints, file),
      ),
  );
  const sources = changed.filter(
    (file) => !file.startsWith(generatedDirectoryPrefix),
  );
  if (
    State.$is("Initial")(previous) ||
    (sources.length > 0 && State.$is("Failed")(current)) ||
    (changed.length === 0 &&
      !Equal.equals(outputHash(previous), outputHash(current)))
  )
    return Change.Full();

  const graph = Option.match(lastSuccessful(current), {
    onNone: () => HashMap.empty<string, HashSet.HashSet<string>>(),
    onSome: (snapshot) => snapshot.graph,
  });
  const previousGraph = Option.match(lastSuccessful(previous), {
    onNone: () => HashMap.empty<string, HashSet.HashSet<string>>(),
    onSome: (snapshot) => snapshot.graph,
  });
  return Change.Affected({
    paths: HashSet.union(
      WatchGraph.affected(graph, sources),
      WatchGraph.affected(previousGraph, sources),
    ),
  });
};

export const parse = Effect.fn("WatchBuild.parse")(function* (
  result: esbuild.BuildResult,
  capture: Capture,
  resolve: (file: string) => string,
  crypto: Crypto.Crypto,
) {
  const failures = Array.fromIterable(HashMap.values(capture.failures));
  if (Array.isReadonlyArrayNonEmpty(result.errors))
    failures.push(Failure.BuildFailed({ errors: result.errors }));
  if (Array.isReadonlyArrayNonEmpty(failures))
    return Outcome.Failed({
      fingerprints: capture.fingerprints,
      failures,
      warnings: result.warnings,
    });
  if (!result.metafile)
    return Outcome.Failed({
      fingerprints: capture.fingerprints,
      failures: [Failure.InvalidBuildResult({ missing: "metafile" })],
      warnings: result.warnings,
    });
  if (!result.outputFiles || !Array.isReadonlyArrayNonEmpty(result.outputFiles))
    return Outcome.Failed({
      fingerprints: capture.fingerprints,
      failures: [Failure.InvalidBuildResult({ missing: "outputFiles" })],
      warnings: result.warnings,
    });
  const hashes = yield* Effect.forEach(result.outputFiles, (file) =>
    crypto.digest("SHA-256", file.contents).pipe(
      Effect.map(Hex.encode),
      Effect.mapError((cause) =>
        Failure.OutputCaptureFailed({ file: file.path, cause }),
      ),
    ),
  ).pipe(Effect.result);
  if (Result.isFailure(hashes))
    return Outcome.Failed({
      fingerprints: capture.fingerprints,
      failures: [hashes.failure],
      warnings: result.warnings,
    });
  return Outcome.Succeeded({
    snapshot: {
      fingerprints: capture.fingerprints,
      graph: WatchGraph.make(result.metafile, resolve),
      outputHash: hashes.success.join(":"),
    },
    warnings: result.warnings,
  });
});

export const failureMessage = (failure: Failure): string =>
  Failure.$match(failure, {
    BuildFailed: ({ errors }) => errors.map((error) => error.text).join("\n"),
    InputCaptureFailed: ({ file, cause }) =>
      `Could not fingerprint input ${file}: ${cause.message}`,
    OutputCaptureFailed: ({ file, cause }) =>
      `Could not fingerprint output ${file}: ${cause.message}`,
    InvalidBuildResult: ({ missing }) => `esbuild completed without ${missing}`,
  });

export const messages = (outcome: Outcome): ReadonlyArray<esbuild.Message> =>
  Outcome.$match(outcome, {
    Succeeded: () => [],
    Failed: ({ failures }) =>
      failures.flatMap((failure) =>
        Match.value(failure).pipe(
          Match.tag("BuildFailed", ({ errors }) => errors),
          Match.tag(
            "InputCaptureFailed",
            "OutputCaptureFailed",
            "InvalidBuildResult",
            (captureFailure) => [
              {
                id: "confect-watch",
                pluginName: "confect",
                text: failureMessage(captureFailure),
                location: null,
                notes: [],
                detail: captureFailure,
              },
            ],
          ),
          Match.exhaustive,
        ),
      ),
  });

export const diagnostics = (
  state: State,
): {
  readonly errors: ReadonlyArray<esbuild.Message>;
  readonly warnings: ReadonlyArray<esbuild.Message>;
} =>
  State.$match(state, {
    Initial: () => ({ errors: [], warnings: [] }),
    Succeeded: ({ warnings }) => ({ errors: [], warnings }),
    Failed: ({ observation }) => ({
      errors: messages(observation),
      warnings: observation.warnings,
    }),
  });
