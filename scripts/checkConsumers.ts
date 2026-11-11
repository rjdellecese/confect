import * as Array from "effect/Array";
import * as Str from "effect/String";
import * as Record from "effect/Record";
import * as BunRuntime from "@effect/platform-bun/BunRuntime";
import * as BunServices from "@effect/platform-bun/BunServices";
import { tmpdir } from "node:os";
import { parseArgs } from "node:util";
import * as Config from "effect/Config";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as Result from "effect/Result";
import * as ChildProcess from "effect/process/ChildProcess";
import { ChildProcessSpawner } from "effect/process/ChildProcessSpawner";
import { consumerFiles } from "./consumerFixture";
import {
  ConsumerGateFailure,
  Manifest,
  consumerDependencies,
  graphProblems,
  installProblems,
  packedManifestProblems,
  provenanceProblems,
  profiles,
  type Candidate,
  type InstalledPackage,
  type Lane,
  type Manager,
  type Profile,
} from "./consumerCompatibility";

const Json = Schema.fromJsonString(Schema.Unknown, { space: 2 });

const manifestAt = Effect.fn("Consumer.manifestAt")(function* (
  directory: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  return yield* fs
    .readFileString(path.join(directory, "package.json"))
    .pipe(Effect.flatMap(Schema.decodeEffect(Schema.fromJsonString(Manifest))));
});

export const cleanEnvironment = (
  directory: string,
  executablePath: string,
  delimiter: string,
  repository: string,
): Record<string, string> => ({
  PATH: Array.join(
    Array.filter(
      Str.split(delimiter)(executablePath),
      (part) =>
        !Str.includes("node_modules")(part) &&
        !Str.startsWith(repository)(part),
    ),
    delimiter,
  ),
  HOME: `${directory}/home`,
  XDG_CONFIG_HOME: `${directory}/config`,
  XDG_DATA_HOME: `${directory}/data`,
  XDG_CACHE_HOME: `${directory}/cache`,
  npm_config_userconfig: `${directory}/empty.npmrc`,
  npm_config_globalconfig: `${directory}/empty-global.npmrc`,
  npm_config_registry: "https://registry.npmjs.org/",
  npm_config_cache: `${directory}/npm-cache`,
  CI: "true",
  NO_COLOR: "1",
});

/**
 * @internal
 */
export const packageManagerExecutable = Effect.fn(
  "Consumer.packageManagerExecutable",
)(function* (manager: Manager, executablePath: string, repository: string) {
  const fs = yield* FileSystem.FileSystem;
  const executable = Bun.which(manager, { PATH: executablePath });
  const isWorkspaceExecutable =
    executable === null
      ? false
      : yield* fs
          .realPath(executable)
          .pipe(Effect.map(Str.startsWith(`${repository}/`)));
  if (executable === null || isWorkspaceExecutable) {
    return yield* ConsumerGateFailure.make({
      phase: "package manager executable",
      details: { manager, executable },
    });
  }
  return executable;
});

const command = Effect.fn("Consumer.command")(
  function* (
    program: string,
    args: ReadonlyArray<string>,
    cwd: string,
    env: Record<string, string> | undefined,
    phase: string,
  ) {
    const spawner = yield* ChildProcessSpawner;
    const handle = yield* spawner.spawn(
      ChildProcess.make(program, args, {
        cwd,
        ...(env !== undefined
          ? { env, extendEnv: false }
          : { extendEnv: true }),
        stdin: "ignore",
      }),
    );
    const result = yield* Effect.all(
      {
        status: handle.exitCode,
        stdout: handle.stdout.pipe(Stream.decodeText(), Stream.mkString),
        stderr: handle.stderr.pipe(Stream.decodeText(), Stream.mkString),
      },
      { concurrency: "unbounded" },
    );
    const output = `${result.stdout}${result.stderr}`;
    if (result.status !== 0)
      return yield* ConsumerGateFailure.make({
        phase,
        details: { program, args, status: result.status, output },
      });
    return output;
  },
  Effect.scoped,
  Effect.timeout("4 minutes"),
);

const resolvePackage = Effect.fn("Consumer.resolvePackage")(function* (
  directory: string,
  name: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  let current = directory;
  while (true) {
    const location = path.join(current, "node_modules", name);
    if (yield* fs.exists(path.join(location, "package.json")))
      return yield* fs.realPath(location);
    const parent = path.dirname(current);
    if (parent === current) return;
    current = parent;
  }
});

const resolutions = Effect.fn("Consumer.resolutions")(function* (
  directory: string,
  manifest: Manifest,
) {
  const result: Record<string, string> = {};
  for (const name of Record.keys({
    ...manifest.dependencies,
    ...manifest.optionalDependencies,
    ...manifest.peerDependencies,
  })) {
    const location = yield* resolvePackage(directory, name);
    if (location !== undefined && location !== "") result[name] = location;
  }
  return result;
});

/**
 * @internal
 */
export const inspectGraph = Effect.fn("Consumer.inspectGraph")(function* (
  directory: string,
) {
  const rootManifest = yield* manifestAt(directory);
  const rootResolutions = yield* resolutions(directory, rootManifest);
  const queue = Record.values(rootResolutions);
  const packages = new Map<string, InstalledPackage>();
  for (let i = 0; i < queue.length; i++) {
    const location = queue[i]!;
    if (packages.has(location)) continue;
    const manifest = yield* manifestAt(location);
    const dependencies = yield* resolutions(location, manifest);
    packages.set(location, {
      path: location,
      manifest,
      resolutions: dependencies,
    });
    queue.push(...Record.values(dependencies));
  }
  return { packages: [...packages.values()], rootResolutions };
});

const candidatesFor = Effect.fn("Consumer.candidatesFor")(function* (
  profile: Profile,
  directory: string,
  repository: string,
  artifacts: string | undefined,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const sources = yield* Effect.forEach(profiles[profile].packages, (name) =>
    manifestAt(path.join(repository, "packages", name)),
  );
  const versions = Record.fromEntries(
    Array.map(sources, (manifest) => [manifest.name, manifest.version]),
  );
  const output =
    artifacts !== undefined && artifacts !== ""
      ? path.resolve(artifacts)
      : path.join(directory, "artifacts");
  yield* fs.makeDirectory(output, { recursive: true });
  const candidates: Array<Candidate> = [];
  for (const source of sources) {
    const tarball = path.join(
      output,
      `${Str.replace("/", "-")(Str.replace("@", "")(source.name))}-${source.version}.tgz`,
    );
    if (artifacts === undefined || artifacts === "")
      yield* command(
        "pnpm",
        ["pack", "--pack-destination", output],
        path.join(
          repository,
          "packages",
          Str.replace("@confect/", "")(source.name),
        ),
        undefined,
        "pack",
      );
    const packed = yield* command(
      "tar",
      ["-xOf", tarball, "package/package.json"],
      directory,
      undefined,
      "read packed manifest",
    ).pipe(
      Effect.flatMap(Schema.decodeEffect(Schema.fromJsonString(Manifest))),
    );
    const problems = packedManifestProblems(source, packed, versions);
    if (problems.length > 0)
      return yield* ConsumerGateFailure.make({
        phase: "packed manifest",
        details: problems,
      });
    const tarballBytes = yield* fs.readFile(tarball);
    const integrity = `sha512-${new Bun.CryptoHasher("sha512").update(tarballBytes).digest("base64")}`;
    candidates.push({ manifest: packed, tarball, integrity });
  }
  return candidates;
});

const Lock = Schema.Struct({
  packages: Schema.Record(
    Schema.String,
    Schema.Struct({
      resolved: Schema.optional(Schema.String),
      integrity: Schema.optional(Schema.String),
    }),
  ),
});
const Listing = Schema.Array(
  Schema.Struct({
    dependencies: Schema.optional(
      Schema.Record(
        Schema.String,
        Schema.Struct({
          resolved: Schema.optional(Schema.String),
          version: Schema.String,
        }),
      ),
    ),
  }),
);

const verifyProvenance = Effect.fn("Consumer.verifyProvenance")(function* (
  directory: string,
  manager: Manager,
  executable: string,
  candidates: ReadonlyArray<Candidate>,
  env: Record<string, string>,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  if (manager === "npm") {
    const lock = yield* fs
      .readFileString(path.join(directory, "package-lock.json"))
      .pipe(Effect.flatMap(Schema.decodeEffect(Schema.fromJsonString(Lock))));
    for (const candidate of candidates) {
      const entry = lock.packages[`node_modules/${candidate.manifest.name}`];
      if (
        provenanceProblems(
          candidate,
          entry,
          entry?.resolved !== undefined && entry.resolved !== ""
            ? path.resolve(directory, Str.slice(5)(entry.resolved))
            : undefined,
          manager,
        ).length > 0
      )
        return yield* ConsumerGateFailure.make({
          phase: "candidate provenance",
          details: {
            package: candidate.manifest.name,
            entry,
            expected: candidate.tarball,
          },
        });
    }
    yield* command(
      executable,
      ["ls", "--all", "--json"],
      directory,
      env,
      "npm dependency tree",
    );
  } else {
    const listing = yield* command(
      executable,
      ["list", "--json", "--depth", "0"],
      directory,
      env,
      "pnpm dependency tree",
    ).pipe(Effect.flatMap(Schema.decodeEffect(Schema.fromJsonString(Listing))));
    for (const candidate of candidates) {
      const entry = listing[0]?.dependencies?.[candidate.manifest.name];
      if (
        provenanceProblems(
          candidate,
          entry,
          entry?.resolved !== undefined && entry.resolved !== ""
            ? path.resolve(directory, Str.slice(5)(entry.resolved))
            : undefined,
          manager,
        ).length > 0
      )
        return yield* ConsumerGateFailure.make({
          phase: "candidate provenance",
          details: {
            package: candidate.manifest.name,
            entry,
            expected: candidate.tarball,
          },
        });
    }
  }
});

/**
 * @internal
 */
export const checkConsumer = Effect.fn("Consumer.check")(function* (
  profile: Profile,
  lane: Lane,
  manager: Manager,
  artifacts?: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const repository = path.resolve(import.meta.dirname, "..");
  const directory = yield* fs
    .makeTempDirectory({ directory: tmpdir(), prefix: "confect-consumer-" })
    .pipe(Effect.flatMap(fs.realPath));
  if (Str.startsWith(`${repository}/`)(directory))
    return yield* ConsumerGateFailure.make({
      phase: "isolation",
      details: directory,
    });
  const executablePath = yield* Config.String("PATH");
  const executable = yield* packageManagerExecutable(
    manager,
    executablePath,
    repository,
  );
  const env = cleanEnvironment(
    directory,
    executablePath,
    path.sep === "/" ? ":" : ";",
    repository,
  );
  yield* fs.makeDirectory(env.HOME!, { recursive: true });
  yield* fs.writeFileString(env.npm_config_userconfig!, "");
  yield* fs.writeFileString(env.npm_config_globalconfig!, "");
  const result: Record<string, unknown> = {
    profile,
    lane,
    manager,
    directory,
    acceptance: "failed",
  };
  yield* Effect.gen(function* () {
    const candidates = yield* candidatesFor(
      profile,
      directory,
      repository,
      artifacts,
    );
    result.candidates = candidates;
    const toolchain = yield* fs
      .readFileString(path.join(repository, "package.json"))
      .pipe(
        Effect.flatMap(
          Schema.decodeEffect(
            Schema.fromJsonString(
              Schema.Struct({ packageManager: Schema.String }),
            ),
          ),
        ),
      );
    const dependencies = {
      ...consumerDependencies(profile, lane),
      ...Record.fromEntries(
        Array.map(candidates, ({ manifest, tarball }) => [
          manifest.name,
          `file:${tarball}`,
        ]),
      ),
      "@effect/tsgo": "0.67.1",
      tsrs: "0.21.0-ts7.1.0-beta",
      tsx: "4.23.15",
      "@types/node": "26.6.4",
      "@types/react": "19.3.0",
    };
    result.requested = dependencies;
    yield* fs.writeFileString(
      path.join(directory, "package.json"),
      Schema.encodeResult(Json)({
        name: "confect-consumer",
        version: "0.0.0",
        private: true,
        type: "module",
        packageManager: toolchain.packageManager,
        dependencies,
      }).pipe(Result.getOrThrow),
    );
    yield* fs.writeFileString(
      path.join(directory, ".npmrc"),
      `registry=https://registry.npmjs.org/\n${manager === "npm" ? "strict-peer-deps=true" : "strict-peer-dependencies=true"}\n`,
    );
    yield* fs.writeFileString(
      path.join(directory, "pnpm-workspace.yaml"),
      "packages: []\nallowBuilds:\n  esbuild: true\nstrictPeerDependencies: true\nminimumReleaseAge: 0\n",
    );
    const nodeVersion = yield* command(
      "node",
      ["--version"],
      directory,
      env,
      "node version",
    );
    const managerVersion = yield* command(
      executable,
      ["--version"],
      directory,
      env,
      "manager version",
    );
    result.tools = {
      packageManagerExecutable: executable,
      node: Str.trim(nodeVersion),
      [manager]: Str.trim(managerVersion),
    };
    for (const [file, contents] of Record.toEntries(consumerFiles(profile))) {
      const target = path.join(directory, file);
      yield* fs.makeDirectory(path.dirname(target), { recursive: true });
      yield* fs.writeFileString(target, contents);
    }
    const args =
      manager === "npm"
        ? ["install", "--strict-peer-deps", "--no-audit", "--no-fund"]
        : ["install", "--strict-peer-dependencies", "--reporter=append-only"];
    const output = yield* command(executable, args, directory, env, "install");
    result.installOutput = output;
    const problems = installProblems(0, output);
    if (problems.length > 0)
      return yield* ConsumerGateFailure.make({
        phase: "install diagnostics",
        details: { problems, output },
      });
    const graph = yield* inspectGraph(directory);
    result.graph = graph;
    const invalid = graphProblems(
      graph.packages,
      candidates,
      graph.rootResolutions,
      directory,
    );
    if (invalid.length > 0)
      return yield* ConsumerGateFailure.make({
        phase: "installed graph",
        details: invalid,
      });
    yield* verifyProvenance(directory, manager, executable, candidates, env);
    result.codegen = yield* command(
      "node",
      [
        path.join(directory, "node_modules/@confect/cli/bin/confect.mjs"),
        "codegen",
      ],
      directory,
      env,
      "installed CLI codegen",
    );
    result.typecheck = yield* command(
      path.join(directory, "node_modules/.bin/effect-tsgo"),
      ["tsrs", "--noEmit"],
      directory,
      env,
      "installed declaration typecheck",
    );
    result.smoke = yield* command(
      path.join(directory, "node_modules/.bin/tsx"),
      ["smoke.ts"],
      directory,
      env,
      "installed runtime smoke",
    );
    result.acceptance = "passed";
  }).pipe(
    Effect.catch((error) =>
      Effect.sync(() => {
        result.failure = Schema.is(ConsumerGateFailure)(error)
          ? { _tag: error._tag, phase: error.phase, details: error.details }
          : { _tag: "ConsumerInfrastructureFailure", message: String(error) };
      }),
    ),
  );
  return result;
});

if (import.meta.main) {
  const { values } = parseArgs({
    options: {
      profile: { type: "string" },
      lane: { type: "string" },
      manager: { type: "string" },
      artifacts: { type: "string" },
      report: { type: "string" },
    },
  });
  Effect.gen(function* () {
    const { profile, lane, manager } = values;
    if (
      (profile !== "react" && profile !== "foldkit") ||
      (lane !== "baseline" && lane !== "fresh") ||
      (manager !== "npm" && manager !== "pnpm")
    )
      return yield* ConsumerGateFailure.make({
        phase: "arguments",
        details:
          "Usage: --profile react|foldkit --lane baseline|fresh --manager npm|pnpm [--artifacts DIR] [--report FILE]",
      });
    const result = yield* checkConsumer(
      profile,
      lane,
      manager,
      values.artifacts,
    );
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const report = path.resolve(
      values.report ?? path.join(String(result.directory), "result.json"),
    );
    yield* fs.makeDirectory(path.dirname(report), { recursive: true });
    yield* fs.writeFileString(
      report,
      `${Schema.encodeResult(Json)(result).pipe(Result.getOrThrow)}\n`,
    );
    yield* Console.log(
      Schema.encodeResult(Json)({
        ...result,
        graph: undefined,
        installOutput: undefined,
        candidates: undefined,
      }).pipe(Result.getOrThrow),
    );
    yield* Console.log(
      `Full graph, artifact identities, and diagnostics: ${report}`,
    );
    if (result.acceptance !== "passed")
      return yield* ConsumerGateFailure.make({
        phase: "acceptance",
        details: result.failure,
      });
  }).pipe(Effect.provide(BunServices.layer), BunRuntime.runMain);
}
