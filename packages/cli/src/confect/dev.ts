import { Command } from "@effect/cli";
import { FileSystem, Path } from "@effect/platform";
import { Ansi, AnsiDoc } from "@effect/printer-ansi";
import {
  Array,
  Console,
  Deferred,
  Duration,
  Effect,
  Match,
  Option,
  pipe,
  Queue,
  Ref,
  Stream,
  String,
} from "effect";
import type { ReadonlyRecord } from "effect/Record";
import { ConfectDirectory } from "../ConfectDirectory";
import { ConvexDirectory } from "../ConvexDirectory";
import { logFailure, logPending, logSuccess } from "../log";
import { isLeafImplPath, isLeafSpecPath } from "../modulePaths";
import { ProjectRoot } from "../ProjectRoot";
import { generateAuthConfig, generateCrons, generateHttp } from "../utils";
import { codegenHandler } from "./codegen";

type Pending = {
  readonly specDirty: boolean;
  readonly httpDirty: boolean;
  readonly cronsDirty: boolean;
  readonly authDirty: boolean;
};

const pendingInit: Pending = {
  specDirty: false,
  httpDirty: false,
  cronsDirty: false,
  authDirty: false,
};

const changeChar = (change: "Added" | "Removed" | "Modified") =>
  Match.value(change).pipe(
    Match.when("Added", () => ({ char: "+", color: Ansi.green })),
    Match.when("Removed", () => ({ char: "-", color: Ansi.red })),
    Match.when("Modified", () => ({ char: "~", color: Ansi.yellow })),
    Match.exhaustive,
  );

const logFileChangeIndented = (
  change: "Added" | "Removed" | "Modified",
  fullPath: string,
) =>
  Effect.gen(function* () {
    const projectRoot = yield* ProjectRoot.get;
    const path = yield* Path.Path;

    const prefix = projectRoot + path.sep;
    const suffix = pipe(fullPath, String.startsWith(prefix))
      ? pipe(fullPath, String.slice(prefix.length))
      : fullPath;

    const { char, color } = changeChar(change);

    yield* Console.log(
      pipe(
        AnsiDoc.char(char),
        AnsiDoc.annotate(color),
        AnsiDoc.catWithSpace(
          AnsiDoc.hcat([
            pipe(AnsiDoc.text(prefix), AnsiDoc.annotate(Ansi.blackBright)),
            pipe(AnsiDoc.text(suffix), AnsiDoc.annotate(color)),
          ]),
        ),
        AnsiDoc.render({ style: "pretty" }),
      ),
    );
  });

export const dev = Command.make("dev", {}, () =>
  Effect.gen(function* () {
    yield* logPending("Performing initial sync…");
    yield* codegenHandler.pipe(
      Effect.tap(() => logSuccess("Generated files are up-to-date")),
      Effect.catchTag("ImplValidationError", (error) => logFailure(error.message)),
    );

    const pendingRef = yield* Ref.make<Pending>(pendingInit);
    const signal = yield* Queue.sliding<void>(1);

    yield* Effect.all(
      [
        specFileWatcher(signal, pendingRef),
        confectDirectoryWatcher(signal, pendingRef),
        syncLoop(signal, pendingRef),
      ],
      { concurrency: "unbounded" },
    );
  }),
).pipe(Command.withDescription("Start the Confect development server"));

const syncLoop = (
  signal: Queue.Queue<void>,
  pendingRef: Ref.Ref<Pending>,
) =>
  Effect.gen(function* () {
    const initialSyncDone = yield* Deferred.make<void>();

    return yield* Effect.forever(
      Effect.gen(function* () {
        yield* Effect.logDebug("Running sync loop…");
        yield* Queue.take(signal);

        const isDone = yield* Deferred.isDone(initialSyncDone);
        yield* Effect.when(
          logPending("Dependencies may have changed, reloading…"),
          () => isDone,
        );
        yield* Deferred.succeed(initialSyncDone, undefined);

        const pending = yield* Ref.getAndSet(pendingRef, pendingInit);

        if (pending.specDirty) {
          yield* codegenHandler;
        }

        const dirtyOptionalFiles = [
          ...(pending.httpDirty
            ? [syncOptionalFile(generateHttp, "http.ts")]
            : []),
          ...(pending.cronsDirty
            ? [syncOptionalFile(generateCrons, "crons.ts")]
            : []),
          ...(pending.authDirty
            ? [syncOptionalFile(generateAuthConfig, "auth.config.ts")]
            : []),
        ];

        yield* Array.isNonEmptyReadonlyArray(dirtyOptionalFiles)
          ? Effect.all(dirtyOptionalFiles, { concurrency: "unbounded" })
          : Effect.void;

        yield* pending.specDirty
          ? logSuccess("Generated files are up-to-date")
          : Effect.void;
      }).pipe(
        Effect.catchTag("ImplValidationError", (error) => logFailure(error.message)),
      ),
    );
  });

const specFileWatcher = (
  signal: Queue.Queue<void>,
  pendingRef: Ref.Ref<Pending>,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const confectDirectory = yield* ConfectDirectory.get;

    yield* pipe(
      fs.watch(confectDirectory, { recursive: true }),
      Stream.debounce(Duration.millis(200)),
      Stream.runForEach((event) => {
        const relativePath = path.relative(confectDirectory, event.path);
        if (!isLeafSpecPath(relativePath) && !isLeafImplPath(relativePath)) {
          return Effect.void;
        }

        return Ref.update(pendingRef, (pending) => ({
          ...pending,
          specDirty: true,
        })).pipe(Effect.andThen(Queue.offer(signal, undefined)));
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

const optionalConfectFiles: ReadonlyRecord<string, keyof Pending> = {
  "http.ts": "httpDirty",
  "crons.ts": "cronsDirty",
  "auth.ts": "authDirty",
};

const confectDirectoryWatcher = (
  signal: Queue.Queue<void>,
  pendingRef: Ref.Ref<Pending>,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const confectDirectory = yield* ConfectDirectory.get;

    yield* pipe(
      fs.watch(confectDirectory),
      Stream.runForEach((event) => {
        const basename = path.basename(event.path);
        const pendingKey = optionalConfectFiles[basename];

        if (pendingKey !== undefined) {
          return pipe(
            pendingRef,
            Ref.update((pending) => ({ ...pending, [pendingKey]: true })),
            Effect.andThen(Queue.offer(signal, undefined)),
          );
        }
        return Effect.void;
      }),
    );
  });
