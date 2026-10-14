import * as Command from "effect/cli/Command";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { pipe } from "effect/Function";
import * as Array from "effect/Array";
import * as Clock from "effect/Clock";
import * as Console from "effect/Console";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Equal from "effect/Equal";
import * as HashSet from "effect/HashSet";
import * as Match from "effect/Match";
import * as Option from "effect/Option";
import * as Order from "effect/Order";
import * as Queue from "effect/Queue";
import * as Ref from "effect/Ref";
import * as Result from "effect/Result";
import * as String from "effect/String";
import type * as esbuild from "esbuild";
import * as Ansi from "../Ansi";
import * as SyncState from "../SyncState";
import type { Pending } from "../SyncState";
import type { OptionalFile } from "../EntryPoint";
import * as Watcher from "../Watcher";
import * as Evaluation from "../Evaluation";
import { ConvexDirectory } from "../ConvexDirectory";
import * as FunctionPaths from "../FunctionPaths";
import * as GenerationSnapshot from "../GenerationSnapshot";
import type { ImplModulePath } from "../ImplModulePath";
import type * as GroupPath from "../GroupPath";
import type * as GroupPaths from "../GroupPaths";
import {
  logCoalescedBuildErrors,
  logCoalescedBuildWarnings,
  logFunctionAdded,
  logFunctionRemoved,
  logPending,
  logSuccess,
} from "../log";
import { ProjectRoot } from "../ProjectRoot";
import {
  generateAuthConfig,
  generateCrons,
  generateHttp,
  touchConvexSchema,
} from "../utils";

const COALESCE_QUIESCENCE = Duration.millis(300);

// Upper bound on `drainUntilQuiescent` so a pathological infinite
// signal stream can't pin the sync loop forever.
const COALESCE_MAX_WAIT = Duration.seconds(5);

const changeChar = (change: "Added" | "Removed" | "Modified") =>
  Match.value(change).pipe(
    Match.when("Added", () => ({ char: "+", color: Ansi.green })),
    Match.when("Removed", () => ({ char: "-", color: Ansi.red })),
    Match.when("Modified", () => ({ char: "~", color: Ansi.magenta })),
    Match.exhaustive,
  );

const logFileChangeIndented = Effect.fnUntraced(function* (
  change: "Added" | "Removed" | "Modified",
  fullPath: string,
) {
  const projectRoot = yield* ProjectRoot.get;
  const path = yield* Path.Path;

  const prefix = projectRoot + path.sep;
  const suffix = pipe(fullPath, String.startsWith(prefix))
    ? pipe(fullPath, String.slice(prefix.length))
    : fullPath;

  const { char, color } = changeChar(change);

  yield* Console.log(
    `${color(char)} ${Ansi.blackBright(prefix)}${color(suffix)}`,
  );
});

const logFunctionPathDiff = Effect.fnUntraced(function* (
  previous: FunctionPaths.FunctionPaths,
  current: FunctionPaths.FunctionPaths,
) {
  const {
    functionsAdded,
    functionsRemoved,
    groupsRemoved,
    groupsAdded,
    groupsChanged,
  } = FunctionPaths.diff(previous, current);

  const logForGroups = (
    groupPaths: GroupPaths.GroupPaths,
    fnPaths: FunctionPaths.FunctionPaths,
    logFn: typeof logFunctionAdded,
  ) =>
    Effect.forEach(groupPaths, (gp) =>
      Effect.forEach(
        Array.fromIterable(
          HashSet.filter(fnPaths, (fp) => Equal.equals(fp.groupPath, gp)),
        ),
        logFn,
      ),
    );

  yield* logForGroups(groupsRemoved, functionsRemoved, logFunctionRemoved);
  yield* logForGroups(groupsAdded, functionsAdded, logFunctionAdded);
  yield* Effect.forEach(
    groupsChanged,
    Effect.fnUntraced(function* (gp: GroupPath.GroupPath) {
      yield* Effect.forEach(
        Array.fromIterable(
          HashSet.filter(functionsAdded, (fp) =>
            Equal.equals(fp.groupPath, gp),
          ),
        ),
        logFunctionAdded,
      );
      yield* Effect.forEach(
        Array.fromIterable(
          HashSet.filter(functionsRemoved, (fp) =>
            Equal.equals(fp.groupPath, gp),
          ),
        ),
        logFunctionRemoved,
      );
    }),
  );
});

export const dev = Command.make("dev", {}, () =>
  Effect.gen(function* () {
    yield* logPending("Performing initial sync…");
    const previousFunctionPaths = yield* Evaluation.loadPreviousFunctionPaths;

    const pendingRef = yield* Ref.make<Pending>(SyncState.empty);
    const signal = yield* Queue.sliding<void>(1);
    const watcher = yield* Watcher.make(signal, pendingRef);

    yield* Effect.all(
      [
        watcher.run,
        syncLoop(signal, pendingRef, previousFunctionPaths, watcher),
      ],
      { concurrency: "unbounded" },
    );
  }),
).pipe(Command.withDescription("Start the Confect development server"));

const esbuildMessageKey = (m: esbuild.Message): string =>
  `${m.location?.file ?? ""}:${m.location?.line ?? ""}:${m.location?.column ?? ""}:${m.text}`;

const dedupeWatcherMessages = (
  messages: ReadonlyArray<esbuild.Message>,
): ReadonlyArray<esbuild.Message> =>
  pipe(
    messages,
    Array.dedupeWith(
      (messageA, messageB) =>
        esbuildMessageKey(messageA) === esbuildMessageKey(messageB),
    ),
  );

const watcherMessagesSignature = (
  messages: ReadonlyArray<esbuild.Message>,
): string =>
  pipe(
    messages,
    Array.map(esbuildMessageKey),
    Array.dedupe,
    Array.sort(Order.String),
    Array.join("\n"),
  );

/**
 * Log any watcher messages (errors or warnings) that haven't already been
 * logged at their current signature. Suppresses the per-watcher fanout that
 * happens when one root cause (e.g. a missing import) breaks every entry
 * point's build at the same source location.
 */
const logChangedWatcherMessages = Effect.fnUntraced(function* (
  messages: ReadonlyArray<esbuild.Message>,
  lastLoggedSignatureRef: Ref.Ref<string>,
  log: (messages: ReadonlyArray<esbuild.Message>) => Effect.Effect<void>,
) {
  const signature = watcherMessagesSignature(messages);
  const previous = yield* Ref.get(lastLoggedSignatureRef);
  if (signature === previous) return;
  yield* Ref.set(lastLoggedSignatureRef, signature);
  if (messages.length === 0) return;
  yield* log(dedupeWatcherMessages(messages));
});

const drainUntilQuiescent = Effect.fnUntraced(function* (
  signal: Queue.Queue<void>,
  quiescence: Duration.Duration,
  maxWait: Duration.Duration,
) {
  const start = yield* Clock.currentTimeMillis;
  const maxMillis = Duration.toMillis(maxWait);
  const loop: Effect.Effect<void> = Effect.gen(function* () {
    yield* Effect.sleep(quiescence);
    const drained = yield* Queue.clear(signal);
    if (drained.length === 0) return;
    const now = yield* Clock.currentTimeMillis;
    if (now - start < maxMillis) {
      yield* loop;
    }
  });
  yield* loop;
});

const syncLoop = Effect.fnUntraced(function* (
  signal: Queue.Queue<void>,
  pendingRef: Ref.Ref<Pending>,
  initialFunctionPaths: FunctionPaths.FunctionPaths,
  watcher: Watcher.Watcher,
) {
  const functionPathsRef = yield* Ref.make(initialFunctionPaths);
  const lastLoggedErrorsRef = yield* Ref.make<string>("");
  const lastLoggedWarningsRef = yield* Ref.make<string>("");
  const phaseRef = yield* Ref.make<SyncState.Phase>(
    SyncState.Phase.Bootstrapping(),
  );
  const optionalPendingRef = yield* Ref.make(HashSet.empty<OptionalFile>());
  const logMessages = Effect.gen(function* () {
    const { errors, warnings } = yield* watcher.diagnostics;
    yield* logChangedWatcherMessages(
      errors,
      lastLoggedErrorsRef,
      logCoalescedBuildErrors,
    );
    yield* logChangedWatcherMessages(
      warnings,
      lastLoggedWarningsRef,
      logCoalescedBuildWarnings,
    );
  });

  return yield* Effect.forever(
    Effect.gen(function* () {
      yield* Effect.logDebug("Running sync loop…");
      yield* Queue.take(signal);
      yield* drainUntilQuiescent(
        signal,
        COALESCE_QUIESCENCE,
        COALESCE_MAX_WAIT,
      );

      const phase = yield* Ref.get(phaseRef);
      const firstSync = SyncState.Phase.$is("Bootstrapping")(phase);
      if (!firstSync) yield* logMessages;

      const pending = yield* watcher.takePending;
      if (!SyncState.isDirty(pending)) return;

      const optional = yield* Ref.updateAndGet(
        optionalPendingRef,
        HashSet.union(pending.optional),
      );
      if (!firstSync)
        yield* logPending("Dependencies may have changed, reloading…");

      const regenerate = (generation: typeof Evaluation.generateSnapshot) =>
        Effect.gen(function* () {
          const current = yield* generation.pipe(
            Effect.tap((snapshot) =>
              Effect.gen(function* () {
                const nextFunctionPaths =
                  GenerationSnapshot.functionPaths(snapshot);
                const previous = yield* Ref.get(functionPathsRef);
                yield* logFunctionPathDiff(previous, nextFunctionPaths);
                yield* Ref.set(functionPathsRef, nextFunctionPaths);
              }),
            ),
            Evaluation.catchAndLog,
          );
          if (Option.isNone(current)) {
            return SyncState.Outcome.GenerationFailed();
          }
          const refreshed = yield* watcher.refresh.pipe(Effect.result);
          if (Result.isFailure(refreshed)) {
            yield* Console.error(
              `Dependency watcher could not ${refreshed.failure.operation}: ${globalThis.String(refreshed.failure.cause)}`,
            );
            return SyncState.Outcome.ReconciliationFailed();
          }
          if (!Watcher.isRefreshSuccessful(refreshed.success)) {
            yield* logMessages;
            return SyncState.Outcome.ReconciliationFailed();
          }
          return SyncState.Outcome.Succeeded({ snapshot: current.value });
        });
      const validate = (
        paths: ReadonlyArray<ImplModulePath>,
        snapshot: GenerationSnapshot.GenerationSnapshot,
      ) =>
        Effect.gen(function* () {
          if (Array.isReadonlyArrayNonEmpty(paths)) {
            const validated = yield* Evaluation.validate(paths).pipe(
              Evaluation.catchAndLog,
            );
            if (Option.isNone(validated)) {
              return SyncState.Outcome.ValidationFailed({ paths, snapshot });
            }
          }
          return SyncState.Outcome.Succeeded({ snapshot });
        });
      const outcome = yield* SyncState.Operation.$match(
        SyncState.plan(phase, pending),
        {
          Generate: () => regenerate(Evaluation.generateSnapshot),
          Validate: ({ paths, snapshot }) => validate(paths, snapshot),
          Update: ({ snapshot, declarations, paths }) =>
            regenerate(
              Evaluation.updateDeclarations(snapshot, declarations, paths),
            ),
        },
      );
      yield* Ref.set(phaseRef, SyncState.transition(outcome));
      if (SyncState.shouldRetry(phase, outcome)) {
        yield* Ref.update(pendingRef, SyncState.full);
        yield* Queue.offer(signal, undefined);
      }
      if (!SyncState.Outcome.$is("Succeeded")(outcome)) return;

      const dirtyOptionalFiles = [
        ...(HashSet.has(optional, "Http")
          ? [syncOptionalFile(generateHttp, "http.ts")]
          : []),
        ...(HashSet.has(optional, "Crons")
          ? [syncOptionalFile(generateCrons, "crons.ts")]
          : []),
        ...(HashSet.has(optional, "Auth")
          ? [syncOptionalFile(generateAuthConfig, "auth.config.ts")]
          : []),
      ];

      yield* Array.isReadonlyArrayNonEmpty(dirtyOptionalFiles)
        ? Effect.all(dirtyOptionalFiles, { concurrency: "unbounded" })
        : Effect.void;
      yield* Ref.set(optionalPendingRef, HashSet.empty());

      if (SyncState.needsDeploymentNotification(phase))
        yield* touchConvexSchema;

      if (!SyncState.isDirty(yield* Ref.get(pendingRef))) {
        yield* logSuccess("Generated files are up-to-date");
      }
    }),
  );
});

const syncOptionalFile = (generate: typeof generateHttp, convexFile: string) =>
  pipe(
    generate,
    Effect.andThen(
      Option.match({
        onSome: ({ change, convexFilePath }) =>
          Match.value(change).pipe(
            Match.when("Unchanged", () => Effect.void),
            Match.whenOr("Added", "Modified", (addedOrModified) =>
              logFileChangeIndented(addedOrModified, convexFilePath),
            ),
            Match.exhaustive,
          ),
        onNone: () =>
          Effect.gen(function* () {
            const fs = yield* FileSystem.FileSystem;
            const path = yield* Path.Path;
            const convexDirectory = yield* ConvexDirectory.get;
            const convexFilePath = path.join(convexDirectory, convexFile);

            if (yield* fs.exists(convexFilePath)) {
              yield* fs.remove(convexFilePath);
              yield* logFileChangeIndented("Removed", convexFilePath);
            }
          }),
      }),
    ),
  );
