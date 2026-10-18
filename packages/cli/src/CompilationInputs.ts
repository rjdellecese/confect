import * as Array from "effect/Array";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as HashMap from "effect/HashMap";
import * as HashSet from "effect/HashSet";
import * as Hex from "effect/encoding/Hex";
import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Queue from "effect/Queue";
import * as Schema from "effect/Schema";
import * as Scope from "effect/Scope";
import * as Semaphore from "effect/Semaphore";
import * as Ref from "effect/Ref";
import * as Stream from "effect/Stream";
import { BundlerError } from "./BuildError";

export interface RestartNotification {
  readonly reason: "ResolutionInputsChanged";
  readonly paths: ReadonlyArray<string>;
}

export class RestartRequired extends Schema.TaggedError<RestartRequired>()(
  "CompilationRestartRequired",
  {
    paths: Schema.Array(Schema.String),
  },
) {}

class ObservationFailed extends Schema.TaggedError<ObservationFailed>()(
  "ResolutionInputObservationFailed",
  { directory: Schema.String, cause: Schema.Unknown },
) {}

class ObservationRejected extends Schema.TaggedError<ObservationRejected>()(
  "ResolutionInputObservationRejected",
  {
    path: Schema.String,
    resolvedPath: Schema.String,
    reason: Schema.Literals(["ForbiddenFile", "NotRegularFile"]),
  },
) {}

const names = [
  "package.json",
  "package-lock.json",
  "npm-shrinkwrap.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "yarn.lock",
  "bun.lock",
  "bun.lockb",
  ".pnp.cjs",
  ".pnp.loader.mjs",
  ".pnp.data.json",
  ".npmrc",
  ".yarnrc.yml",
  "node_modules/.modules.yaml",
  "node_modules/.package-lock.json",
  ".yarn/install-state.gz",
];

export const ancestors = (
  path: Path.Path,
  directory: string,
): ReadonlyArray<string> =>
  Array.unfold(Option.some(path.resolve(directory)), (current) =>
    Option.map(
      current,
      (value) =>
        [
          value,
          path.dirname(value) === value
            ? Option.none()
            : Option.some(path.dirname(value)),
        ] as const,
    ),
  );

export const make = Effect.fn("CompilationInputs.make")(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const crypto = yield* Crypto.Crypto;
  const scope = yield* Scope.Scope;
  const baseline = yield* Ref.make(HashMap.empty<string, string>());
  const watched = yield* Ref.make(HashSet.empty<string>());
  const sources = yield* Ref.make(HashSet.empty<string>());
  const pending = yield* Ref.make(Option.none<RestartNotification>());
  const events = yield* Queue.unbounded<RestartNotification, BundlerError>();
  const observationFailure = yield* Ref.make(Option.none<BundlerError>());
  const lock = yield* Semaphore.make(1);
  const sourceLock = yield* Semaphore.make(1);
  const fingerprint = Effect.fn("CompilationInputs.fingerprint")(
    function* (file: string) {
      yield* fs.stat(file);
      const real = yield* fs.realPath(file);
      if (
        path.basename(file) === ".env.local" ||
        path.basename(real) === ".env.local"
      )
        return yield* new ObservationRejected({
          path: file,
          resolvedPath: real,
          reason: "ForbiddenFile",
        });
      const stat = yield* fs.stat(real);
      if (stat.type !== "File")
        return yield* new ObservationRejected({
          path: file,
          resolvedPath: real,
          reason: "NotRegularFile",
        });
      const contents = yield* fs.readFile(real);
      const digest = yield* crypto.digest("SHA-256", contents);
      return `${real}\0${Hex.encode(digest)}`;
    },
    Effect.catch((error) => {
      if (error._tag === "PlatformError" && error.reason._tag === "NotFound")
        return Effect.succeed("missing");
      return Effect.gen(function* () {
        const failure = new BundlerError({ cause: error });
        yield* Ref.set(observationFailure, Option.some(failure));
        yield* Queue.fail(events, failure);
        return yield* failure;
      });
    }),
  );

  const notify = Effect.fn("CompilationInputs.notify")(function* (
    paths: ReadonlyArray<string>,
  ) {
    const notification = {
      reason: "ResolutionInputsChanged",
      paths,
    } satisfies RestartNotification;
    const previous = yield* Ref.getAndUpdate(pending, (current) =>
      Option.isSome(current) ? current : Option.some(notification),
    );
    if (Option.isSome(previous)) return previous.value;
    yield* Queue.offer(events, notification);
    return notification;
  });

  const ensure = Effect.gen(function* () {
    const failed = yield* Ref.get(observationFailure);
    if (Option.isSome(failed)) return yield* failed.value;
    const required = yield* Ref.get(pending);
    if (Option.isSome(required))
      return yield* new RestartRequired({ paths: required.value.paths });
  });
  const verify = (files?: ReadonlyArray<string>) =>
    Effect.gen(function* () {
      yield* ensure;
      const current = yield* Ref.get(baseline);
      const entries = files
        ? Array.getSomes(
            Array.map(files, (file) =>
              Option.map(
                HashMap.get(current, file),
                (expected) => [file, expected] as const,
              ),
            ),
          )
        : HashMap.toEntries(current);
      const changed = yield* Effect.filter(
        entries,
        ([file, expected]) =>
          fingerprint(file).pipe(Effect.map((actual) => actual !== expected)),
        { concurrency: 16 },
      );
      if (Array.isReadonlyArrayNonEmpty(changed)) {
        const notification = yield* notify(
          Array.map(changed, ([file]) => file),
        );
        return yield* new RestartRequired({ paths: notification.paths });
      }
    }).pipe((effect) => lock.withPermit(effect));
  const check = verify();

  const track = Effect.fn("CompilationInputs.track")(
    function* (files: ReadonlyArray<string>) {
      yield* ensure;
      const added = yield* lock.withPermit(
        Effect.gen(function* () {
          yield* ensure;
          const current = yield* Ref.get(baseline);
          const unseen = Array.filter(
            Array.dedupe(
              Array.map(files, (candidate) => path.resolve(candidate)),
            ),
            (file) => !HashMap.has(current, file),
          );
          for (const file of unseen) {
            yield* Ref.update(
              baseline,
              HashMap.set(file, yield* fingerprint(file)),
            );
            for (const directory of ancestors(path, path.dirname(file))) {
              if (
                HashSet.has(yield* Ref.get(watched), directory) ||
                !(yield* fs.exists(directory))
              )
                continue;
              yield* Ref.update(watched, HashSet.add(directory));
              yield* fs.watch(directory).pipe(
                Stream.runForEach((event) =>
                  Effect.gen(function* () {
                    const changed = path.resolve(directory, event.path);
                    const relevant = HashMap.some(
                      yield* Ref.get(baseline),
                      (_, candidate) =>
                        candidate === changed ||
                        candidate.startsWith(`${changed}${path.sep}`),
                    );
                    if (relevant)
                      yield* check.pipe(
                        Effect.catchTag(
                          "CompilationRestartRequired",
                          () => Effect.void,
                        ),
                      );
                  }),
                ),
                Effect.catch((cause) =>
                  Effect.gen(function* () {
                    if (Option.isSome(yield* Ref.get(pending))) return;
                    const failure = new BundlerError({
                      cause: new ObservationFailed({ directory, cause }),
                    });
                    yield* Ref.set(observationFailure, Option.some(failure));
                    yield* Queue.fail(events, failure);
                  }),
                ),
                Effect.forkIn(scope),
              );
            }
          }
          return unseen;
        }),
      );
      if (Array.isReadonlyArrayNonEmpty(added)) yield* verify(added);
    },
    Effect.mapError((cause) =>
      Schema.is(RestartRequired)(cause) || Schema.is(BundlerError)(cause)
        ? cause
        : new BundlerError({ cause }),
    ),
  );

  return {
    events: Stream.fromQueue(events),
    pending: Ref.get(pending),
    check,
    ensure,
    checkFiles: verify,
    track,
    trackSource: Effect.fn("CompilationInputs.trackSource")(function* (
      file: string,
    ) {
      const directory = path.dirname(file);
      if (HashSet.has(yield* Ref.get(sources), directory)) return yield* ensure;
      yield* sourceLock.withPermit(
        Effect.gen(function* () {
          if (HashSet.has(yield* Ref.get(sources), directory))
            return yield* ensure;
          yield* track(
            Array.flatMap(ancestors(path, path.dirname(file)), (ancestor) =>
              Array.map(names, (name) => path.join(ancestor, name)),
            ),
          );
          yield* Ref.update(sources, HashSet.add(directory));
        }),
      );
    }),
  };
}, Effect.provide(NodeCrypto.layer));

export type Inputs = Effect.Success<ReturnType<typeof make>>;
