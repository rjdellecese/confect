import { dual } from "effect/Function";
import * as String from "effect/String";
import * as Array from "effect/Array";
import * as Brand from "effect/Brand";
import * as Digest from "effect/crypto/Digest";
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
import type * as esbuild from "esbuild";
import * as WatchGraph from "./WatchGraph";

/**
 * @internal
 */
export type Failure = Data.TaggedEnum<{
  BuildFailed: {
    readonly errors: Array.NonEmptyReadonlyArray<esbuild.Message>;
  };
  InputCaptureFailed: { readonly file: string; readonly cause: PlatformError };
  InvalidBuildResult: { readonly missing: "metafile" | "outputFiles" };
}>;
/**
 * @internal
 */
export const Failure = Data.taggedEnum<Failure>();
export type Fingerprints = HashMap.HashMap<string, string>;

/**
 * @internal
 */
export interface Capture {
  readonly fingerprints: Fingerprints;
  readonly failures: HashMap.HashMap<string, Failure>;
}
/**
 * @internal
 */
export const emptyCapture: Capture = {
  fingerprints: HashMap.empty(),
  failures: HashMap.empty(),
};

export interface Snapshot {
  readonly fingerprints: Fingerprints;
  readonly graph: WatchGraph.WatchGraph;
  readonly outputHash: string;
}

/**
 * @internal
 */
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
/**
 * @internal
 */
export const Outcome = Data.taggedEnum<Outcome>();

/**
 * @internal
 */
export const combine = (
  outcomes: Array.NonEmptyReadonlyArray<Outcome>,
): Outcome => {
  if (outcomes.length === 1) return Array.headNonEmpty(outcomes);
  const combined = Array.reduce(
    outcomes,
    {
      fingerprints: HashMap.empty<string, string>(),
      graph: HashMap.empty<string, HashSet.HashSet<string>>(),
      hashes: [] as ReadonlyArray<string>,
      failures: [] as ReadonlyArray<Failure>,
      warnings: [] as ReadonlyArray<esbuild.Message>,
    },
    (state, outcome) =>
      Outcome.$match(outcome, {
        Failed: ({ fingerprints, failures, warnings }) => ({
          ...state,
          fingerprints: HashMap.union(state.fingerprints, fingerprints),
          failures: [...state.failures, ...failures],
          warnings: [...state.warnings, ...warnings],
        }),
        Succeeded: ({ snapshot, warnings }) => ({
          ...state,
          fingerprints: HashMap.union(
            state.fingerprints,
            snapshot.fingerprints,
          ),
          graph: Array.reduce(
            snapshot.graph,
            state.graph,
            (graph, [file, importers]) =>
              HashMap.set(
                graph,
                file,
                HashSet.union(
                  Option.getOrElse(HashMap.get(graph, file), () =>
                    HashSet.empty<string>(),
                  ),
                  importers,
                ),
              ),
          ),
          hashes: [...state.hashes, snapshot.outputHash],
          warnings: [...state.warnings, ...warnings],
        }),
      }),
  );
  return Array.isReadonlyArrayNonEmpty(combined.failures)
    ? Outcome.Failed({
        fingerprints: combined.fingerprints,
        failures: combined.failures,
        warnings: combined.warnings,
      })
    : Outcome.Succeeded({
        snapshot: {
          fingerprints: combined.fingerprints,
          graph: combined.graph,
          outputHash: Array.join(combined.hashes, ":"),
        },
        warnings: combined.warnings,
      });
};

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

export const request: {
  (id: RequestId): (progress: Progress) => Progress;
  (progress: Progress, id: RequestId): Progress;
} = dual(2, (progress: Progress, id: RequestId): Progress => ({
  ...progress,
  request:
    Option.isSome(progress.lastRequest) && progress.lastRequest.value === id
      ? Request.Joined()
      : Request.Pending(),
  lastRequest: Option.some(id),
}));

export const complete: {
  (completion: Completion): (progress: Progress) => Progress;
  (progress: Progress, completion: Completion): Progress;
} = dual(2, (progress: Progress, completion: Completion): Progress => ({
  ...progress,
  request: Request.$match(progress.request, {
    Idle: (idle) => idle,
    Pending: () => Request.Completed({ completion }),
    Joined: () => Request.Completed({ completion }),
    Completed: (completed) => completed,
  }),
}));

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

export const isFresh: {
  (completion: Completion): (barrier: Barrier) => boolean;
  (barrier: Barrier, completion: Completion): boolean;
} = dual(
  2,
  (barrier: Barrier, completion: Completion): boolean =>
    completion.generation > barrier,
);

/**
 * @internal
 */
export const verifyInputs = Effect.fn("WatchBuild.verifyInputs")(function* (
  snapshot: Snapshot,
  fs: FileSystem.FileSystem,
  digest: Digest.Digest["Service"],
) {
  const matches = yield* Effect.forEach(
    snapshot.fingerprints,
    ([file, expected]) =>
      fs.readFile(file).pipe(
        Effect.flatMap((contents) => digest.digest(Digest.sha256, contents)),
        Effect.mapBoth({
          onSuccess: (hash) => Hex.encode(hash) === expected,
          onFailure: (cause) => Failure.InputCaptureFailed({ file, cause }),
        }),
      ),
    { concurrency: 8 },
  );
  return Array.every(matches, (matchesInput) => matchesInput);
});

/**
 * @internal
 */
export type State = Data.TaggedEnum<{
  Initial: {};
  Succeeded: {
    readonly snapshot: Snapshot;
    readonly warnings: ReadonlyArray<esbuild.Message>;
  };
  Failed: {
    readonly observation: Extract<Outcome, { readonly _tag: "Failed" }>;
    readonly lastSuccessful: Option.Option<Snapshot>;
    readonly discovered: HashSet.HashSet<string>;
  };
}>;
/**
 * @internal
 */
export const State = Data.taggedEnum<State>();

/**
 * @internal
 */
export const lastSuccessful = (state: State): Option.Option<Snapshot> =>
  State.$match(state, {
    Initial: () => Option.none(),
    Succeeded: ({ snapshot }) => Option.some(snapshot),
    Failed: ({ lastSuccessful: snapshot }) => snapshot,
  });

export const observe: {
  (outcome: Outcome): (previous: State) => State;
  (previous: State, outcome: Outcome): State;
} = dual(2, (previous: State, outcome: Outcome): State =>
  Outcome.$match(outcome, {
    Succeeded: ({ snapshot, warnings }) =>
      State.Succeeded({ snapshot, warnings }),
    Failed: (observation) =>
      State.Failed({
        observation,
        lastSuccessful: lastSuccessful(previous),
        discovered: State.$is("Initial")(previous)
          ? HashSet.empty()
          : HashSet.union(
              State.$is("Failed")(previous)
                ? previous.discovered
                : HashSet.empty(),
              HashSet.difference(
                observation.fingerprints.pipe(
                  HashMap.keys,
                  HashSet.fromIterable,
                ),
                fingerprints(previous).pipe(HashMap.keys, HashSet.fromIterable),
              ),
            ),
      }),
  }),
);

/**
 * @internal
 */
export const fingerprints = (state: State): Fingerprints =>
  State.$match(state, {
    Initial: () => HashMap.empty(),
    Succeeded: ({ snapshot }) => snapshot.fingerprints,
    Failed: ({ observation }) => observation.fingerprints,
  });

/**
 * @internal
 */
export const outputHash = (state: State): Option.Option<string> =>
  State.$match(state, {
    Initial: () => Option.none(),
    Succeeded: ({ snapshot }) => Option.some(snapshot.outputHash),
    Failed: () => Option.none(),
  });

export type Change = Data.TaggedEnum<{
  Full: {};
  Affected: { readonly paths: HashSet.HashSet<string> };
  Recovered: { readonly paths: HashSet.HashSet<string> };
}>;
export const Change = Data.taggedEnum<Change>();

export const diff: {
  (
    current: State,
    generatedDirectoryPrefix: string,
  ): (previous: State) => Change;
  (previous: State, current: State, generatedDirectoryPrefix: string): Change;
} = dual(
  3,
  (
    previous: State,
    current: State,
    generatedDirectoryPrefix: string,
  ): Change => {
    const previousFingerprints = fingerprints(previous);
    const currentFingerprints = fingerprints(current);
    const files = HashSet.union(
      previousFingerprints.pipe(HashMap.keys, HashSet.fromIterable),
      currentFingerprints.pipe(HashMap.keys, HashSet.fromIterable),
    );
    const changed = Array.filter(
      Array.fromIterable(files),
      (file) =>
        !Equal.equals(
          HashMap.get(previousFingerprints, file),
          HashMap.get(currentFingerprints, file),
        ),
    );
    const sources = Array.filter(
      changed,
      (file) => !String.startsWith(generatedDirectoryPrefix)(file),
    );
    const recovered =
      State.$is("Failed")(previous) && State.$is("Succeeded")(current);
    const untrackedOutput = recovered
      ? Option.match(lastSuccessful(previous), {
          onNone: () => false,
          onSome: (baseline) =>
            Equal.equals(baseline.fingerprints, currentFingerprints) &&
            !Equal.equals(
              Option.some(baseline.outputHash),
              outputHash(current),
            ),
        })
      : changed.length === 0 &&
        !Equal.equals(outputHash(previous), outputHash(current));
    if (
      State.$is("Initial")(previous) ||
      (Array.some(sources, (file) => HashMap.has(previousFingerprints, file)) &&
        State.$is("Failed")(current)) ||
      untrackedOutput
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
    const affectedSources =
      recovered && State.$is("Failed")(previous)
        ? Array.fromIterable(
            HashSet.union(
              HashSet.fromIterable(sources),
              HashSet.filter(
                previous.discovered,
                (file) => !String.startsWith(generatedDirectoryPrefix)(file),
              ),
            ),
          )
        : sources;
    const paths = HashSet.union(
      WatchGraph.affected(graph, affectedSources),
      WatchGraph.affected(previousGraph, affectedSources),
    );
    return recovered ? Change.Recovered({ paths }) : Change.Affected({ paths });
  },
);

/**
 * @internal
 */
export const parse = Effect.fn("WatchBuild.parse")(function* (
  result: esbuild.BuildResult,
  capture: Capture,
  resolve: (file: string) => string,
  digest: Digest.Digest["Service"],
) {
  const failures = capture.failures.pipe(HashMap.values, Array.fromIterable);
  if (Array.isReadonlyArrayNonEmpty(result.errors))
    failures.push(Failure.BuildFailed({ errors: result.errors }));
  if (Array.isReadonlyArrayNonEmpty(failures))
    return Outcome.Failed({
      fingerprints: capture.fingerprints,
      failures,
      warnings: result.warnings,
    });
  if (result.metafile === undefined)
    return Outcome.Failed({
      fingerprints: capture.fingerprints,
      failures: [Failure.InvalidBuildResult({ missing: "metafile" })],
      warnings: result.warnings,
    });
  if (
    result.outputFiles === undefined ||
    !Array.isReadonlyArrayNonEmpty(result.outputFiles)
  )
    return Outcome.Failed({
      fingerprints: capture.fingerprints,
      failures: [Failure.InvalidBuildResult({ missing: "outputFiles" })],
      warnings: result.warnings,
    });
  const hashes = yield* Effect.forEach(result.outputFiles, (file) =>
    digest.digest(Digest.sha256, file.contents).pipe(Effect.map(Hex.encode)),
  );
  return Outcome.Succeeded({
    snapshot: {
      fingerprints: capture.fingerprints,
      graph: WatchGraph.make(result.metafile, resolve),
      outputHash: Array.join(hashes, ":"),
    },
    warnings: result.warnings,
  });
});

/**
 * @internal
 */
export const failureMessage = (failure: Failure): string =>
  Failure.$match(failure, {
    BuildFailed: ({ errors }) =>
      Array.join(
        Array.map(errors, (error) => error.text),
        "\n",
      ),
    InputCaptureFailed: ({ file, cause }) =>
      `Could not fingerprint input ${file}: ${cause.message}`,
    InvalidBuildResult: ({ missing }) => `esbuild completed without ${missing}`,
  });

/**
 * @internal
 */
export const messages = (outcome: Outcome): ReadonlyArray<esbuild.Message> =>
  Outcome.$match(outcome, {
    Succeeded: () => [],
    Failed: ({ failures }) =>
      Array.flatMap(failures, (failure) =>
        Match.value(failure).pipe(
          Match.tag("BuildFailed", ({ errors }) => errors),
          Match.tag(
            "InputCaptureFailed",
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

/**
 * @internal
 */
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
