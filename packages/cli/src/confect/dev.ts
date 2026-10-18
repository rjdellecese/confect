import * as Command from "effect/cli/Command";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { pipe } from "effect/Function";
import * as Array from "effect/Array";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as Cause from "effect/Cause";
import * as Clock from "effect/Clock";
import * as Exit from "effect/Exit";
import * as Queue from "effect/Queue";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as Equal from "effect/Equal";
import * as HashSet from "effect/HashSet";
import * as Match from "effect/Match";
import * as Option from "effect/Option";
import * as Order from "effect/Order";
import * as Ref from "effect/Ref";
import * as String from "effect/String";
import type * as esbuild from "esbuild";
import * as Ansi from "../Ansi";
import * as SyncState from "../SyncState";
import type { OptionalFile } from "../EntryPoint";
import * as Compilation from "../Compilation";
import * as CompilationInputs from "../CompilationInputs";
import type * as CompilationState from "../CompilationState";
import * as DevelopmentState from "../DevelopmentState";
import * as DevelopmentEvents from "../DevelopmentEvents";
import * as DevSupervisor from "../DevSupervisor";
import * as EntryPoint from "../EntryPoint";
import * as SpecModulePath from "../SpecModulePath";
import { ConfectDirectory } from "../ConfectDirectory";
import { compileOptionalModules } from "./codegen";
import * as Evaluation from "../Evaluation";
import { ConvexDirectory } from "../ConvexDirectory";
import * as FunctionPaths from "../FunctionPaths";
import * as GenerationSnapshot from "../GenerationSnapshot";
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

type DevelopmentEvent =
  | {
      readonly _tag: "Compilation";
      readonly revision: CompilationState.Revision;
    }
  | { readonly _tag: "Filesystem"; readonly event: DevelopmentEvents.Event };

const runSession = Effect.gen(function* () {
  yield* logPending("Performing initial sync…");
  const previous = yield* Evaluation.loadPreviousFunctionPaths;
  const compiler = yield* Compilation.Service;
  const events = yield* Queue.unbounded<DevelopmentEvent>();
  const watched = yield* DevelopmentEvents.watch;
  const inventory = yield* EntryPoint.discover;
  const enqueue = (event: DevelopmentEvents.Event) =>
    Queue.offer(events, { _tag: "Filesystem", event }).pipe(Effect.asVoid);
  const structure = watched.confectEvents.pipe(Stream.runForEach(enqueue));
  const restart = compiler.restarts.pipe(
    Stream.runForEach(() => DevSupervisor.requestRestart),
  );
  yield* Effect.all(
    [
      structure,
      watched.convexEvents.pipe(Stream.runForEach(enqueue)),
      watched.projectEvents.pipe(Stream.runForEach(enqueue)),
      compiler.events.pipe(
        Stream.runForEach((revision) =>
          Queue.offer(events, { _tag: "Compilation", revision }),
        ),
      ),
      restart,
      syncLoop(previous, inventory, events),
    ],
    { concurrency: "unbounded" },
  );
});

export const dev = Command.make("dev", {}, () =>
  DevSupervisor.run(
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const confect = yield* ConfectDirectory.get;
      const convex = yield* ConvexDirectory.get;
      return yield* runSession.pipe(
        Effect.provide(
          Compilation.layer({
            ownedDirectories: [path.join(confect, "_generated"), convex],
            authoredFiles: [
              path.join(convex, "convex.config.ts"),
              path.join(convex, "tsconfig.json"),
              path.join(convex, "package.json"),
            ],
          }),
        ),
        Effect.catchTags({
          CompilationRestartRequired: () => DevSupervisor.requestRestart,
          BundlerError: (error) =>
            Schema.is(CompilationInputs.RestartRequired)(error.cause)
              ? DevSupervisor.requestRestart
              : Effect.fail(error),
        }),
      );
    }),
  ),
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

export class SyncJobError extends Schema.TaggedError<SyncJobError>()(
  "SyncJobError",
  {
    phase: Schema.Literals(["Evaluation", "Publication"]),
    diagnostic: Schema.String,
  },
) {}

const syncLoop = Effect.fnUntraced(function* (
  initialFunctionPaths: FunctionPaths.FunctionPaths,
  initialInventory: ReadonlyArray<EntryPoint.EntryPoint>,
  events: Queue.Queue<DevelopmentEvent>,
) {
  const compiler = yield* Compilation.Service;
  const path = yield* Path.Path;
  const confect = yield* ConfectDirectory.get;
  const convex = yield* ConvexDirectory.get;
  const functionPathsRef = yield* Ref.make(initialFunctionPaths);
  const phaseRef = yield* Ref.make<SyncState.Phase>(
    SyncState.Phase.Bootstrapping(),
  );
  const pendingRef = yield* Ref.make(SyncState.full(SyncState.empty));
  const inventoryRef = yield* Ref.make(initialInventory);
  const receiptsRef = yield* Ref.make(DevelopmentState.empty);
  const optionalPendingRef = yield* Ref.make(HashSet.empty<OptionalFile>());
  const lastLoggedErrors = yield* Ref.make("");
  const lastLoggedWarnings = yield* Ref.make("");

  const rescan = Effect.gen(function* () {
    const previous = yield* Ref.get(inventoryRef);
    const current = yield* EntryPoint.discover;
    if (DevelopmentState.sameInventory(previous, current)) return;
    const removed = previous.filter(
      (entry) =>
        EntryPoint.isOptional(entry) &&
        !current.some((next) => next.absolutePath === entry.absolutePath),
    );
    yield* Ref.set(inventoryRef, current);
    yield* Ref.update(pendingRef, (pending) =>
      SyncState.add(pending, removed, true),
    );
    yield* compiler.reset;
    yield* Ref.set(receiptsRef, DevelopmentState.empty);
  });

  const processEvent = (event: DevelopmentEvent) =>
    Effect.gen(function* () {
      if (event._tag === "Compilation") {
        const topology = yield* compiler.topology;
        yield* Ref.update(receiptsRef, (receipts) =>
          DevelopmentState.retain(receipts, topology),
        );
        if (!topology.some((context) => context.id === event.revision.context))
          return;
        const roots = DevelopmentState.pendingRoots(
          yield* Ref.get(receiptsRef),
          event.revision,
        );
        if (roots.length === 0) {
          if (event.revision.affectedRoots.length === 0)
            yield* logChangedWatcherMessages(
              event.revision.warnings,
              lastLoggedWarnings,
              logCoalescedBuildWarnings,
            );
          return;
        }
        const inventory = yield* Ref.get(inventoryRef);
        const affected = inventory.filter(
          (entry) =>
            roots.includes(entry.inputPath) ||
            roots.includes(entry.absolutePath),
        );
        yield* Ref.update(pendingRef, (pending) =>
          SyncState.add(pending, affected, affected.length === 0),
        );
        yield* logChangedWatcherMessages(
          event.revision.errors,
          lastLoggedErrors,
          logCoalescedBuildErrors,
        );
        yield* logChangedWatcherMessages(
          event.revision.warnings,
          lastLoggedWarnings,
          logCoalescedBuildWarnings,
        );
        return;
      }
      const change = event.event;
      if (change._tag === "Restart") return yield* DevSupervisor.requestRestart;
      if (change.kind !== "Update") yield* rescan;
      const phase = yield* Ref.get(phaseRef);
      if (change.file === path.join(confect, "schema.ts")) {
        yield* Ref.update(pendingRef, SyncState.full);
      } else if (!SyncState.Phase.$is("Incremental")(phase)) {
        yield* Ref.update(pendingRef, SyncState.full);
      } else if (!HashSet.isEmpty(phase.failedImpls)) {
        yield* Ref.update(pendingRef, (pending) =>
          SyncState.add(
            pending,
            Array.fromIterable(phase.failedImpls).map((relativePath) =>
              EntryPoint.Kind.Impl({ relativePath }),
            ),
          ),
        );
      } else if (change.file === path.join(convex, "convex.config.ts")) {
        yield* Ref.update(pendingRef, SyncState.full);
      }
    });

  const drain = Effect.gen(function* () {
    const queued = yield* Queue.clear(events);
    yield* Effect.forEach(queued, processEvent, { discard: true });
  });

  while (true) {
    yield* drain;
    if (!SyncState.isDirty(yield* Ref.get(pendingRef))) {
      yield* processEvent(yield* Queue.take(events));
      const started = yield* Clock.currentTimeMillis;
      yield* Effect.gen(function* () {
        const next = yield* Queue.take(events).pipe(
          Effect.timeoutOption("300 millis"),
        );
        if (Option.isNone(next)) return false;
        yield* processEvent(next.value);
        return (yield* Clock.currentTimeMillis) - started < 5000;
      }).pipe(Effect.repeat({ while: (again) => again }));
      continue;
    }

    const pending = yield* Ref.getAndSet(pendingRef, SyncState.empty);
    const phase = yield* Ref.get(phaseRef);
    const operation = SyncState.plan(phase, pending);
    const inventory = yield* Ref.get(inventoryRef);
    const optional = yield* Ref.updateAndGet(
      optionalPendingRef,
      HashSet.union(pending.optional),
    );
    const planned = SyncState.Operation.$match(operation, {
      Generate: () =>
        HashSet.fromIterable(inventory.map((entry) => entry.inputPath)),
      Validate: ({ paths }) =>
        HashSet.fromIterable(
          paths.flatMap((relativePath) => [
            path.resolve(confect, relativePath),
            path.resolve(confect, SpecModulePath.fromImpl(relativePath)),
          ]),
        ),
      Update: ({ declarations, paths }) =>
        HashSet.fromIterable([
          ...declarations.map((entry) =>
            path.resolve(confect, entry.relativePath),
          ),
          ...paths.flatMap((relativePath) => [
            path.resolve(confect, relativePath),
            path.resolve(confect, SpecModulePath.fromImpl(relativePath)),
          ]),
        ]),
    });
    const plannedRoots = HashSet.union(
      planned,
      HashSet.fromIterable(
        inventory.filter(EntryPoint.isOptional).map((entry) => entry.inputPath),
      ),
    );
    yield* Effect.logDebug("Planned development sync").pipe(
      Effect.annotateLogs({
        phase: phase._tag,
        work: pending.work._tag,
        operation: operation._tag,
      }),
    );
    if (
      !SyncState.Phase.$is("Bootstrapping")(phase) &&
      !(
        SyncState.Operation.$is("Validate")(operation) &&
        operation.paths.length === 0
      )
    )
      yield* logPending("Dependencies may have changed, reloading…");

    const program = Effect.gen(function* () {
      const nextSnapshot = yield* SyncState.Operation.$match(operation, {
        Generate: () => Evaluation.generateSnapshot,
        Update: ({ snapshot, declarations, paths }) =>
          Compilation.withPreparedRevisions(
            Evaluation.updateDeclarations(snapshot, declarations, paths),
          ),
        Validate: ({ snapshot, paths }) =>
          (paths.length === 0
            ? Effect.void
            : Compilation.withPreparedRevisions(Evaluation.validate(paths))
          ).pipe(Effect.as(snapshot)),
      }).pipe(
        Effect.mapError(
          (error) =>
            new SyncJobError({
              phase: "Evaluation",
              diagnostic: error.diagnostic,
            }),
        ),
      );
      yield* Effect.gen(function* () {
        yield* Effect.all(
          [
            ...(HashSet.has(optional, "Http")
              ? [syncOptionalFile(generateHttp, "http.ts")]
              : []),
            ...(HashSet.has(optional, "Crons")
              ? [syncOptionalFile(generateCrons, "crons.ts")]
              : []),
            ...(HashSet.has(optional, "Auth")
              ? [syncOptionalFile(generateAuthConfig, "auth.config.ts")]
              : []),
          ],
          { concurrency: "unbounded" },
        );
        if (
          SyncState.Operation.$is("Update")(operation) ||
          !HashSet.isEmpty(optional)
        )
          yield* compileOptionalModules;
      }).pipe(
        Evaluation.catchDiagnostic,
        Effect.mapError(
          (error) =>
            new SyncJobError({
              phase: "Publication",
              diagnostic: error.diagnostic,
            }),
        ),
      );
      return nextSnapshot;
    });

    const job = yield* Compilation.runJob(program);
    if (Option.isSome(yield* compiler.restartRequired))
      return yield* DevSupervisor.requestRestart;
    const topology = yield* compiler.topology;
    const covered = Exit.isSuccess(job.exit)
      ? HashSet.fromIterable(job.receipts.flatMap((receipt) => receipt.roots))
      : plannedRoots;
    yield* Ref.update(receiptsRef, (receipts) =>
      DevelopmentState.acknowledgeFailures(
        DevelopmentState.acknowledge(receipts, job.receipts),
        job.failedReceipts,
        covered,
        topology,
      ),
    );
    const outcome = yield* Exit.match(job.exit, {
      onSuccess: (snapshot) =>
        Effect.succeed(SyncState.Outcome.Succeeded({ snapshot })),
      onFailure: (cause) =>
        Effect.gen(function* () {
          if (Cause.hasInterruptsOnly(cause))
            return yield* Effect.failCause(cause);
          const failure = Cause.findErrorOption(cause);
          if (Option.isNone(failure) || !Schema.is(SyncJobError)(failure.value))
            return yield* Effect.failCause(cause);
          yield* Console.error(failure.value.diagnostic);
          return failure.value.phase === "Evaluation" &&
            SyncState.Operation.$is("Validate")(operation) &&
            Array.isReadonlyArrayNonEmpty(operation.paths)
            ? SyncState.Outcome.ValidationFailed({
                snapshot: operation.snapshot,
                paths: operation.paths,
              })
            : SyncState.Outcome.GenerationFailed();
        }),
    });
    yield* Ref.set(phaseRef, SyncState.transition(outcome));
    if (SyncState.shouldRetry(phase, outcome))
      yield* Ref.update(pendingRef, SyncState.full);
    if (SyncState.Outcome.$is("Succeeded")(outcome)) {
      const nextPaths = GenerationSnapshot.functionPaths(outcome.snapshot);
      yield* logFunctionPathDiff(yield* Ref.get(functionPathsRef), nextPaths);
      yield* Ref.set(functionPathsRef, nextPaths);
      yield* Ref.set(optionalPendingRef, HashSet.empty());
      yield* compiler.verify;
      yield* rescan;
      yield* drain;
      if (SyncState.needsDeploymentNotification(phase))
        yield* touchConvexSchema;
      if (!SyncState.isDirty(yield* Ref.get(pendingRef)))
        yield* logSuccess("Generated files are up-to-date");
    }
  }
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
