import * as Array from "effect/Array";
import type * as Crypto from "effect/Crypto";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Equal from "effect/Equal";
import * as HashMap from "effect/HashMap";
import * as HashSet from "effect/HashSet";
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
  outcome._tag === "Succeeded"
    ? State.Succeeded({
        snapshot: outcome.snapshot,
        warnings: outcome.warnings,
      })
    : State.Failed({
        observation: outcome,
        lastSuccessful: lastSuccessful(previous),
      });

export const fingerprints = (state: State): Fingerprints =>
  State.$match(state, {
    Initial: () => HashMap.empty(),
    Succeeded: ({ snapshot }) => snapshot.fingerprints,
    Failed: ({ observation }) => observation.fingerprints,
  });

export const outputHash = (state: State): Option.Option<string> =>
  state._tag === "Succeeded"
    ? Option.some(state.snapshot.outputHash)
    : Option.none();

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
    previous._tag === "Initial" ||
    (sources.length > 0 && current._tag === "Failed") ||
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
  outcome._tag === "Succeeded"
    ? []
    : outcome.failures.flatMap((failure) =>
        failure._tag === "BuildFailed"
          ? failure.errors
          : [
              {
                id: "confect-watch",
                pluginName: "confect",
                text: failureMessage(failure),
                location: null,
                notes: [],
                detail: failure,
              },
            ],
      );

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
