import * as BunRuntime from "@effect/platform-bun/BunRuntime";
import * as BunServices from "@effect/platform-bun/BunServices";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as ChildProcess from "effect/unstable/process/ChildProcess";
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner";

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

export class InvalidPackContents extends Schema.TaggedError<InvalidPackContents>()(
  "InvalidPackContents",
  {
    packages: Schema.Array(
      Schema.Struct({
        directory: Schema.String,
        problems: Schema.Array(PackProblem),
      }),
    ),
  },
) {
  override get message() {
    return (
      this.packages
        .map(
          ({ directory, problems }) =>
            `FAIL ${directory}\n${problems.map(({ path, reason }) => `       ${path}—${reason}`).join("\n")}`,
        )
        .join("\n") +
      "\n\nThese files would be published to npm. Keep build artifacts out of the packed directories,\nor narrow the `files` field in the offending package.json."
    );
  }
}

export class NpmPackError extends Schema.TaggedError<NpmPackError>()(
  "NpmPackError",
  { directory: Schema.String, exitCode: Schema.Finite, stderr: Schema.String },
) {
  override get message() {
    return `npm pack failed for ${this.directory} (exit ${this.exitCode}): ${this.stderr.trim()}`;
  }
}

export class InvalidPackOutput extends Schema.TaggedError<InvalidPackOutput>()(
  "InvalidPackOutput",
  { directory: Schema.String, cause: Schema.Unknown },
) {
  override get message() {
    return `Invalid npm pack JSON for ${this.directory}`;
  }
}

export const packProblems = (
  files: ReadonlyArray<string>,
): ReadonlyArray<typeof PackProblem.Type> => {
  const problems: Array<typeof PackProblem.Type> = [];

  if (!files.some((path) => path.startsWith("dist/")))
    problems.push({
      path: "dist/",
      reason: "no build output packed—did this run before `pnpm build`?",
    });

  for (const path of files) {
    const denial = DENIED.find(([pattern]) => pattern.test(path));

    if (denial) problems.push({ path, reason: denial[1] });
  }

  return problems;
};

export const publishedPackages = Effect.fn("PackContents.publishedPackages")(
  function* (packagesDirectory = "packages") {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const directories: Array<string> = [];

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

      if (Option.isSome(manifest) && manifest.value.private !== true)
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
      Effect.mapError((cause) => new InvalidPackOutput({ directory, cause })),
    );

    return output[0].files.map((file) => file.path);
  },
);

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
    return yield* new NpmPackError({
      directory,
      exitCode: result.exitCode,
      stderr: result.stderr,
    });

  return yield* decodePackedFiles(directory, result.stdout);
}, Effect.scoped);

export const checkPackContents = Effect.fn("PackContents.check")(function* (
  packagesDirectory = "packages",
) {
  const failures: Array<
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
    return yield* new InvalidPackContents({ packages: failures });
});

if (import.meta.main) {
  checkPackContents().pipe(
    Effect.tapError((error) => Console.error(error.message)),
    Effect.provide(BunServices.layer),
    BunRuntime.runMain({ disableErrorReporting: true }),
  );
}
