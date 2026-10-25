import * as Array from "effect/Array";
import * as Crypto from "effect/Crypto";
import * as Deferred from "effect/Deferred";
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
import * as CompilationPolicy from "./CompilationPolicy";
import * as CompilationConfig from "./CompilationConfig";
import * as ResolutionScope from "./ResolutionScope";

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

const pnpNames = [".pnp.cjs", ".pnp.js", ".pnp.loader.mjs", ".pnp.data.json"];

const names = [
  "package.json",
  "package-lock.json",
  "npm-shrinkwrap.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "yarn.lock",
  "bun.lock",
  "bun.lockb",
  ...pnpNames,
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

export const make = Effect.fn("CompilationInputs.make")(
  function* (
    policy: CompilationPolicy.CompilationPolicy = "Watch",
    conditions?: ReadonlyArray<string>,
  ) {
    const mode = CompilationPolicy.toMode(policy);
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const crypto = yield* Crypto.Crypto;
    const scope = yield* Scope.Scope;
    const baseline = yield* Ref.make(HashMap.empty<string, string>());
    const runtimes = yield* Ref.make(
      HashMap.empty<string, CompilationConfig.RuntimeObservation>(),
    );
    const configDirectories = yield* Ref.make(HashSet.empty<string>());
    const generation = yield* Ref.make(0);
    const watched = yield* Ref.make(HashSet.empty<string>());
    const sources = yield* Ref.make(HashSet.empty<string>());
    const configurations = yield* Ref.make(
      HashMap.empty<string, CompilationConfig.Discovery>(),
    );
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
        if (
          stat.type === "Directory" &&
          HashSet.has(yield* Ref.get(configDirectories), file)
        )
          return `${real}\0directory`;
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
        if (
          error._tag === "PlatformError" &&
          (error.reason._tag === "NotFound" ||
            (error.reason._tag === "BadResource" &&
              typeof error.reason.cause === "object" &&
              error.reason.cause !== null &&
              "code" in error.reason.cause &&
              error.reason.cause.code === "ENOTDIR"))
        )
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
    const verifyFiles = (files?: ReadonlyArray<string>) =>
      Effect.gen(function* () {
        yield* ensure;
        const current = yield* Ref.get(baseline);
        const observedRuntimes = HashMap.toEntries(yield* Ref.get(runtimes));
        const entries =
          files && observedRuntimes.length === 0
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
        if (observedRuntimes.length === 0) return;
        const changedRuntimes = yield* Effect.filter(
          observedRuntimes,
          ([, observation]) =>
            observation.current.pipe(
              Effect.map((actual) => actual !== observation.value),
              Effect.catch((cause) =>
                Effect.gen(function* () {
                  const failure = new BundlerError({ cause });
                  yield* Ref.set(observationFailure, Option.some(failure));
                  yield* Queue.fail(events, failure);
                  return yield* failure;
                }),
              ),
            ),
        );
        const changedDuringAcquisition = yield* Effect.filter(
          entries,
          ([file, expected]) =>
            fingerprint(file).pipe(Effect.map((actual) => actual !== expected)),
          { concurrency: 16 },
        );
        const paths = Array.dedupe(
          Array.map(
            [...changedRuntimes, ...changedDuringAcquisition],
            ([file]) => file,
          ),
        );
        if (Array.isReadonlyArrayNonEmpty(paths)) {
          const notification = yield* notify(paths);
          return yield* new RestartRequired({ paths: notification.paths });
        }
      });
    const verify = (files?: ReadonlyArray<string>) =>
      lock.withPermit(verifyFiles(files));
    const check = verify();
    const checks = yield* Queue.unbounded<{
      readonly files: ReadonlyArray<string> | undefined;
      readonly result: Deferred.Deferred<void, BundlerError | RestartRequired>;
    }>();
    yield* Effect.gen(function* () {
      const first = yield* Queue.take(checks);
      yield* Effect.yieldNow;
      yield* lock.withPermit(
        Effect.gen(function* () {
          const requests = [first, ...(yield* Queue.clear(checks))];
          const files = requests.some((request) => request.files === undefined)
            ? undefined
            : Array.dedupe(requests.flatMap((request) => request.files ?? []));
          const result = yield* Effect.exit(verifyFiles(files));
          yield* Effect.forEach(
            requests,
            (request) => Deferred.done(request.result, result),
            {
              discard: true,
            },
          );
        }),
      );
    }).pipe(Effect.forever, Effect.forkScoped);
    const checkFiles = (files?: ReadonlyArray<string>) =>
      Effect.gen(function* () {
        yield* ensure;
        const result = yield* Deferred.make<
          void,
          BundlerError | RestartRequired
        >();
        yield* Queue.offer(checks, { files, result });
        return yield* Deferred.await(result);
      });

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
              if (mode === "Once") continue;
              for (const directory of ancestors(path, path.dirname(file))) {
                if (
                  HashSet.has(yield* Ref.get(watched), directory) ||
                  !(yield* fs.exists(directory)) ||
                  (yield* fs.stat(directory)).type !== "Directory"
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
      generation: Ref.get(generation),
      events: Stream.fromQueue(events),
      pending: Ref.get(pending),
      check,
      ensure,
      checkFiles,
      track,
      canSharePackageLookups: Ref.get(baseline).pipe(
        Effect.map(
          (current) =>
            mode === "Once" &&
            !HashMap.some(
              current,
              (value, file) =>
                value !== "missing" && pnpNames.includes(path.basename(file)),
            ),
        ),
      ),
      resolutionBoundary: Effect.fn("CompilationInputs.resolutionBoundary")(
        function* (
          directory: string,
        ): Effect.fn.Return<
          ResolutionScope.Boundary,
          BundlerError | RestartRequired
        > {
          yield* ensure;
          const parent = path.dirname(directory);
          if (
            parent === directory ||
            path.basename(directory).toLowerCase() === "node_modules"
          )
            return ResolutionScope.Boundary.Stop({ directory });
          const current = yield* Ref.get(baseline);
          for (const ancestor of ancestors(path, directory)) {
            for (const name of pnpNames) {
              if (
                !Option.contains(
                  HashMap.get(current, path.join(ancestor, name)),
                  "missing",
                )
              )
                return ResolutionScope.Boundary.Stop({ directory });
            }
          }
          const modules = path.join(directory, "node_modules");
          const files = [path.join(directory, "package.json"), modules];
          yield* Ref.update(configDirectories, HashSet.add(modules));
          yield* track(files);
          yield* checkFiles(files);
          const observed = yield* Ref.get(baseline);
          return Array.every(files, (file) =>
            Option.contains(HashMap.get(observed, file), "missing"),
          )
            ? ResolutionScope.Boundary.Continue({ parent })
            : ResolutionScope.Boundary.Stop({ directory });
        },
      ),
      trackSource: Effect.fn("CompilationInputs.trackSource")(function* (
        file: string,
      ) {
        const directory = path.dirname(file);
        if (HashSet.has(yield* Ref.get(sources), directory))
          return yield* ensure;
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
            yield* Ref.update(generation, (current) => current + 1);
          }),
        );
      }),
      configuration: Effect.fn("CompilationInputs.configuration")(function* (
        file: string,
      ) {
        const directory = path.dirname(path.resolve(file));
        return yield* sourceLock.withPermit(
          Effect.gen(function* () {
            yield* ensure;
            const cached = HashMap.get(
              yield* Ref.get(configurations),
              directory,
            );
            if (Option.isSome(cached)) return cached.value;
            const configs = yield* CompilationConfig.discover(
              path.resolve(file),
              (candidate, kind, realPath) =>
                Effect.gen(function* () {
                  if (kind === "Directory")
                    yield* Ref.update(
                      configDirectories,
                      HashSet.add(candidate),
                    );
                  const unseen = !HashMap.has(
                    yield* Ref.get(baseline),
                    candidate,
                  );
                  yield* track([candidate]);
                  const captured = Option.getOrUndefined(
                    HashMap.get(yield* Ref.get(baseline), candidate),
                  );
                  const consistent =
                    kind === "Missing"
                      ? captured === "missing"
                      : kind === "Directory"
                        ? captured === `${realPath}\0directory`
                        : captured?.startsWith(`${realPath}\0`) === true &&
                          captured !== `${realPath}\0directory`;
                  if (!consistent) {
                    const notification = yield* notify([candidate]);
                    return yield* new RestartRequired({
                      paths: notification.paths,
                    });
                  }
                  if (unseen)
                    yield* Ref.update(generation, (current) => current + 1);
                }),
              conditions,
              (observation) =>
                lock.withPermit(
                  Effect.gen(function* () {
                    yield* ensure;
                    const previous = HashMap.get(
                      yield* Ref.get(runtimes),
                      observation.path,
                    );
                    if (Option.isSome(previous)) {
                      if (previous.value.value !== observation.value) {
                        const notification = yield* notify([observation.path]);
                        return yield* new RestartRequired({
                          paths: notification.paths,
                        });
                      }
                      return;
                    }
                    yield* Ref.update(
                      runtimes,
                      HashMap.set(observation.path, observation),
                    );
                    yield* Ref.update(generation, (current) => current + 1);
                  }),
                ),
              (observation) =>
                lock.withPermit(
                  Effect.gen(function* () {
                    yield* ensure;
                    const expected = yield* Ref.get(baseline);
                    const digest = yield* crypto.digest(
                      "SHA-256",
                      observation.contents,
                    );
                    const captured = `${observation.realPath}\0${Hex.encode(digest)}`;
                    const changed = Array.filter(
                      Array.dedupe([observation.path, observation.realPath]),
                      (candidate) =>
                        Option.getOrUndefined(
                          HashMap.get(expected, candidate),
                        ) !== captured,
                    );
                    if (Array.isReadonlyArrayNonEmpty(changed)) {
                      const notification = yield* notify(changed);
                      return yield* new RestartRequired({
                        paths: notification.paths,
                      });
                    }
                  }),
                ),
            ).pipe(
              Effect.provideService(FileSystem.FileSystem, fs),
              Effect.provideService(Path.Path, path),
              Effect.catch((cause) =>
                Effect.gen(function* () {
                  if (Schema.is(RestartRequired)(cause)) return yield* cause;
                  if (
                    Schema.is(CompilationConfig.DiscoveryRejected)(cause) &&
                    cause.reason === "ChangedDuringDiscovery"
                  ) {
                    const notification = yield* notify([cause.path]);
                    return yield* new RestartRequired({
                      paths: notification.paths,
                    });
                  }
                  const failure = Schema.is(BundlerError)(cause)
                    ? cause
                    : new BundlerError({ cause });
                  yield* Ref.set(observationFailure, Option.some(failure));
                  yield* Queue.fail(events, failure);
                  return yield* failure;
                }),
              ),
            );
            yield* verify(configs.files);
            yield* Ref.update(configurations, HashMap.set(directory, configs));
            return configs;
          }),
        );
      }),
    };
  },
  (
    effect,
    _policy?: CompilationPolicy.CompilationPolicy,
    _conditions?: ReadonlyArray<string>,
  ) => Effect.provide(effect, NodeCrypto.layer),
);

export type Inputs = Effect.Success<ReturnType<typeof make>>;
