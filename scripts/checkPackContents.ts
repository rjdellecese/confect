import * as Str from "effect/String";
import * as Option from "effect/Option";
import * as Array from "effect/Array";
import * as BunRuntime from "@effect/platform-bun/BunRuntime";
import * as BunServices from "@effect/platform-bun/BunServices";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as ChildProcess from "effect/process/ChildProcess";
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";

const DENIED: ReadonlyArray<readonly [RegExp, string]> = [
  [/\.tsbuildinfo$/, "TypeScript incremental build cache"],
  [/(^|\/)node_modules\//, "nested node_modules"],
  [/(^|\/)coverage\//, "coverage report"],
  [/\.(test|spec)\.[cm]?[jt]sx?$/, "test file"],
  [/(^|\/)__tests__\//, "test directory"],
  [/(^|\/)\.env(\.|$)/, "environment file"],
  [/(^|\/)\.DS_Store$/, "macOS metadata"],
  [/\.log$/, "log file"],
  [/(^|\/)tsconfig(\..+)?\.json$/, "TypeScript config"],
];

const PackProblem = Schema.Struct({
  path: Schema.String,
  reason: Schema.String,
});

export class InvalidPackContents extends Schema.TaggedError<
  InvalidPackContents,
  {}
>()("InvalidPackContents", {
  packages: Schema.Array(
    Schema.Struct({
      directory: Schema.String,
      problems: Schema.Array(PackProblem),
    }),
  ),
}) {
  override get message() {
    return (
      Array.join(
        Array.map(
          this.packages,
          ({ directory, problems }) =>
            `FAIL ${directory}\n${Array.join(
              Array.map(
                problems,
                ({ path, reason }) => `       ${path}—${reason}`,
              ),
              "\n",
            )}`,
        ),
        "\n",
      ) +
      "\n\nThese files would be published to npm. Keep build artifacts out of the packed directories,\nor narrow the `files` field in the offending package.json."
    );
  }
}

export class NpmPackError extends Schema.TaggedError<NpmPackError, {}>()(
  "NpmPackError",
  { directory: Schema.String, exitCode: Schema.Finite, stderr: Schema.String },
) {
  override get message() {
    return `npm pack failed for ${this.directory} (exit ${this.exitCode}): ${Str.trim(this.stderr)}`;
  }
}

export class InvalidPackOutput extends Schema.TaggedError<
  InvalidPackOutput,
  {}
>()("InvalidPackOutput", { directory: Schema.String, cause: Schema.Unknown }) {
  override get message() {
    return `Invalid npm pack JSON for ${this.directory}`;
  }
}

export const packProblems = (
  files: ReadonlyArray<string>,
): ReadonlyArray<typeof PackProblem.Type> => {
  const problems: globalThis.Array<typeof PackProblem.Type> = [];
  if (!Array.some(files, (path) => Str.startsWith("dist/")(path)))
    problems.push({
      path: "dist/",
      reason: "no build output packed—did this run before `pnpm build`?",
    });
  for (const path of files) {
    const denial = Option.getOrUndefined(
      Array.findFirst(DENIED, ([pattern]) => pattern.test(path)),
    );
    if (denial !== undefined) problems.push({ path, reason: denial[1] });
  }
  return problems;
};

/**
 * @internal
 */
export const publishedPackages = Effect.fn("PackContents.publishedPackages")(
  function* (packagesDirectory = "packages") {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const directories: globalThis.Array<string> = [];
    for (const name of yield* fs.readDirectory(packagesDirectory)) {
      const directory = path.join(packagesDirectory, name);
      if ((yield* fs.stat(directory)).type !== "Directory") continue;
      const manifest = yield* fs
        .readFileString(path.join(directory, "package.json"))
        .pipe(
          Effect.flatMap(
            Schema.decodeEffect(
              Schema.fromJsonString(
                Schema.Struct({ private: Schema.optional(Schema.Unknown) }),
              ),
            ),
          ),
          Effect.option,
        );
      if (manifest._tag === "Some" && manifest.value.private !== true)
        directories.push(directory);
    }
    return directories;
  },
);

export const decodePackedFiles = Effect.fn("PackContents.decodePackedFiles")(
  function* (directory: string, stdout: string) {
    const output = yield* Schema.decodeEffect(
      Schema.fromJsonString(
        Schema.Tuple([
          Schema.Struct({
            files: Schema.Array(Schema.Struct({ path: Schema.String })),
          }),
        ]),
      ),
    )(stdout).pipe(
      Effect.mapError((cause) => InvalidPackOutput.make({ directory, cause })),
    );
    return Array.map(output[0].files, (file) => file.path);
  },
);

/**
 * @internal
 */
export const packedFiles = Effect.fn("PackContents.packedFiles")(function* (
  directory: string,
) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const handle = yield* spawner.spawn(
    ChildProcess.make("npm", ["pack", "--dry-run", "--json"], {
      cwd: directory,
      stdin: "ignore",
    }),
  );
  const result = yield* Effect.all(
    {
      exitCode: handle.exitCode,
      stdout: handle.stdout.pipe(Stream.decodeText(), Stream.mkString),
      stderr: handle.stderr.pipe(Stream.decodeText(), Stream.mkString),
    },
    { concurrency: "unbounded" },
  );
  if (result.exitCode !== 0)
    return yield* NpmPackError.make({
      directory,
      exitCode: result.exitCode,
      stderr: result.stderr,
    });
  return yield* decodePackedFiles(directory, result.stdout);
}, Effect.scoped);

/**
 * @internal
 */
export const checkPackContents = Effect.fn("PackContents.check")(function* (
  packagesDirectory = "packages",
) {
  const failures: globalThis.Array<
    (typeof InvalidPackContents.prototype.packages)[number]
  > = [];
  for (const directory of yield* publishedPackages(packagesDirectory)) {
    const files = yield* packedFiles(directory);
    const problems = packProblems(files);
    if (problems.length === 0) {
      yield* Console.log(`ok  ${directory} (${files.length} files)`);
    } else {
      failures.push({ directory, problems });
    }
  }
  if (failures.length > 0)
    return yield* InvalidPackContents.make({ packages: failures });
});

if (import.meta.main) {
  checkPackContents().pipe(
    Effect.tapError((error) => Console.error(error.message)),
    Effect.provide(BunServices.layer),
    BunRuntime.runMain({ disableErrorReporting: true }),
  );
}
