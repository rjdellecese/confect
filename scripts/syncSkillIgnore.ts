import * as Record from "effect/Record";
import * as Str from "effect/String";
import * as Option from "effect/Option";
import * as Arr from "effect/Array";
import * as BunRuntime from "@effect/platform-bun/BunRuntime";
import * as BunServices from "@effect/platform-bun/BunServices";
import * as Console from "effect/Console";
import * as Result from "effect/Result";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Predicate from "effect/Predicate";
import * as Runtime from "effect/Runtime";
import * as Schema from "effect/Schema";

const LOCK_FILE = "skills-lock.json";
const IGNORE_FILE = ".ignore";
const LOCK_VERSION = 1;
const START_MARKER = "# skills-lock:start";
const END_MARKER = "# skills-lock:end";
const GENERATED_COMMENT =
  "# Generated from skills-lock.json by `pnpm skills:sync-ignore`.";
const JsonString = Schema.fromJsonString(Schema.String);

export class SkillIgnoreError extends Schema.TaggedError<
  SkillIgnoreError,
  {}
>()("SkillIgnoreError", { reason: Schema.String }) {
  readonly [Runtime.errorReported] = false;

  override get message(): string {
    return this.reason;
  }
}

export interface SyncOptions {
  readonly check?: boolean;
  readonly cwd?: string;
}

// Lock keys are logical skill names, while the skills CLI installs them using
// this normalized directory name. This mirrors skills@1.5.23's sanitizeName.
export const installedDirectoryName = (name: string): string =>
  Str.slice(
    0,
    255,
  )(
    Str.replace(
      /^[.-]+|[.-]+$/g,
      "",
    )(Str.replace(/[^a-z0-9._]+/g, "-")(Str.toLowerCase(name))),
  ) || "unnamed-skill";

export const vendoredSkillDirectories = Effect.fnUntraced(function* (
  lockText: string,
) {
  const lock = yield* Schema.decodeEffect(
    Schema.fromJsonString(Schema.Unknown),
  )(lockText).pipe(
    Effect.mapError(() =>
      SkillIgnoreError.make({
        reason: `Could not parse ${LOCK_FILE}`,
      }),
    ),
  );

  if (!Predicate.isObject(lock) || lock.version !== LOCK_VERSION) {
    return yield* SkillIgnoreError.make({
      reason: `Unsupported ${LOCK_FILE} version; expected ${LOCK_VERSION}`,
    });
  }
  if (!Predicate.isObject(lock.skills)) {
    return yield* SkillIgnoreError.make({
      reason: `${LOCK_FILE} must contain a skills object`,
    });
  }

  const directories = new Map<string, string>();
  for (const skillName of Record.keys(lock.skills)) {
    const directory = installedDirectoryName(skillName);
    const existing = directories.get(directory);
    if (existing !== undefined) {
      const existingName = Result.getOrThrow(
        Schema.encodeResult(JsonString)(existing),
      );
      const conflictingName = Result.getOrThrow(
        Schema.encodeResult(JsonString)(skillName),
      );
      return yield* SkillIgnoreError.make({
        reason: `${LOCK_FILE} entries ${existingName} and ${conflictingName} map to the same installed directory`,
      });
    }
    directories.set(directory, skillName);
  }

  return [...directories.keys()].sort();
});

export const renderManagedBlock = (
  directories: ReadonlyArray<string>,
): string =>
  Arr.join(
    [
      START_MARKER,
      GENERATED_COMMENT,
      ...Arr.map(directories, (directory) => `.agents/skills/${directory}/`),
      END_MARKER,
    ],
    "\n",
  );

export const updateManagedBlock = Effect.fnUntraced(function* (
  ignoreText: string,
  managedBlock: string,
) {
  const lines = Str.split("\n")(Str.replaceAll("\r\n", "\n")(ignoreText));
  if (lines.at(-1) === "") lines.pop();

  const startIndexes = Arr.flatMap(lines, (line, index) =>
    line === START_MARKER ? [index] : [],
  );
  const endIndexes = Arr.flatMap(lines, (line, index) =>
    line === END_MARKER ? [index] : [],
  );

  if (startIndexes.length !== endIndexes.length) {
    return yield* SkillIgnoreError.make({
      reason: `${IGNORE_FILE} has an incomplete skills-lock block`,
    });
  }
  if (startIndexes.length > 1) {
    return yield* SkillIgnoreError.make({
      reason: `${IGNORE_FILE} has multiple skills-lock blocks`,
    });
  }

  const managedLines = Str.split("\n")(managedBlock);
  if (startIndexes.length === 0) {
    if (lines.length > 0 && lines.at(-1) !== "") lines.push("");
    lines.push(...managedLines);
  } else {
    const start = startIndexes[0];
    const end = endIndexes[0];
    if (start > end) {
      return yield* SkillIgnoreError.make({
        reason: `${IGNORE_FILE} has an invalid skills-lock block`,
      });
    }
    lines.splice(start, end - start + 1, ...managedLines);
  }

  return `${Arr.join(lines, "\n")}\n`;
});

const readIgnoreFile = Effect.fnUntraced(function* (path: string) {
  const fs = yield* FileSystem.FileSystem;
  return (yield* fs.exists(path)) ? yield* fs.readFileString(path) : "";
});

/**
 * @internal
 */
export const syncSkillIgnore = Effect.fn("SkillIgnore.sync")(function* (
  options: SyncOptions = {},
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const cwd = options.cwd ?? process.cwd();
  const lockPath = path.resolve(cwd, LOCK_FILE);
  const ignorePath = path.resolve(cwd, IGNORE_FILE);
  const [lockText, ignoreText] = yield* Effect.all(
    [fs.readFileString(lockPath), readIgnoreFile(ignorePath)],
    { concurrency: "unbounded" },
  );
  const directories = yield* vendoredSkillDirectories(lockText);
  const expected = yield* updateManagedBlock(
    ignoreText,
    renderManagedBlock(directories),
  );

  if (expected === ignoreText) {
    yield* Console.log(`ok  ${IGNORE_FILE} matches ${LOCK_FILE}`);
    return;
  }

  if (options.check === true) {
    return yield* SkillIgnoreError.make({
      reason: `${IGNORE_FILE} does not match ${LOCK_FILE}; run \`pnpm skills:sync-ignore\``,
    });
  }

  yield* fs.writeFileString(ignorePath, expected);
  yield* Console.log(`updated ${IGNORE_FILE} from ${LOCK_FILE}`);
});

/**
 * @internal
 */
export const syncSkillIgnoreMain = Effect.fn("SkillIgnore.main")(function* (
  args: ReadonlyArray<string>,
) {
  const unknownArgument = Option.getOrUndefined(
    Arr.findFirst(args, (argument) => argument !== "--check"),
  );
  if (unknownArgument !== undefined) {
    return yield* SkillIgnoreError.make({
      reason: `Unknown argument: ${unknownArgument}`,
    });
  }
  yield* syncSkillIgnore({ check: args.includes("--check") });
});

if (import.meta.main) {
  syncSkillIgnoreMain(Bun.argv.slice(2)).pipe(
    Effect.tapErrorTag("SkillIgnoreError", (error) =>
      Console.error(error.message),
    ),
    Effect.provide(BunServices.layer),
    BunRuntime.runMain,
  );
}
