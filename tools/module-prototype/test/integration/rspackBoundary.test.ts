import { assert, describe, expect, it } from "@effect/vitest";
import { rspack, type Compiler, type Stats } from "@rspack/core";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { createFsFromVolume, Volume } from "memfs";

class NativeFailure extends Schema.TaggedError<NativeFailure>()(
  "RspackBoundaryFailure",
  { operation: Schema.String, cause: Schema.Unknown },
) {}

class PolicyDenied extends Schema.TaggedError<PolicyDenied>()(
  "RspackBoundaryPolicyDenied",
  { path: Schema.String, code: Schema.Literal("EACCES") },
) {}

interface Observation {
  readonly operation: string;
  readonly path: string;
  readonly error: unknown;
  readonly value: unknown;
}

const root = "/rspack-boundary";
const entry = `${root}/entry.js`;
const dependency = `${root}/dependency.js`;

const fixture = Effect.fn("RspackBoundary.fixture")(function* (
  files: Readonly<Record<string, string>>,
  options: {
    readonly cache?: boolean;
    readonly incremental?: boolean;
    readonly blocked?: string;
    readonly afterRead?: (path: string, bytes: string, volume: Volume) => void;
  } = {},
) {
  const volume = Volume.fromJSON(files, root);
  const fs = createFsFromVolume(volume);
  const output = createFsFromVolume(new Volume());
  const observations: Observation[] = [];
  const underlyingReads: string[] = [];
  const denied: PolicyDenied[] = [];
  const input = new Proxy(fs, {
    get(target, property) {
      const method = Reflect.get(target, property);
      if (
        typeof method !== "function" ||
        typeof property !== "string" ||
        ![
          "readFile",
          "stat",
          "lstat",
          "readdir",
          "readlink",
          "realpath",
        ].includes(property)
      )
        return method;
      return new Proxy(method, {
        apply(invoke, _receiver, args) {
          const path = String(args[0]);
          const callback = args.at(-1);
          assert(typeof callback === "function");
          if (property === "readFile") {
            if (options.blocked === path) {
              const error = new PolicyDenied({ path, code: "EACCES" });
              denied.push(error);
              callback(error);
              return;
            }
            underlyingReads.push(path);
          }
          const observed = new Proxy(callback, {
            apply(deliver, receiver, results) {
              const [error, value] = results;
              const captured = Buffer.isBuffer(value)
                ? value.toString("utf8")
                : value;
              observations.push({
                operation: property,
                path,
                error,
                value: captured,
              });
              if (
                property === "readFile" &&
                !error &&
                typeof captured === "string"
              ) {
                options.afterRead?.(path, captured, volume);
              }
              return Reflect.apply(deliver, receiver, results);
            },
          });
          return Reflect.apply(invoke, target, [
            ...args.slice(0, -1),
            observed,
          ]);
        },
      });
    },
  });
  const compiler = yield* Effect.acquireRelease(
    Effect.try({
      try: () =>
        rspack({
          mode: "development",
          context: root,
          entry,
          target: "node",
          devtool: false,
          cache: options.cache ?? false,
          ...(options.incremental === undefined
            ? {}
            : { incremental: options.incremental }),
          experiments: { useInputFileSystem: [/.*/] },
          resolve: { extensions: [".ts", ".js"], symlinks: true },
          output: {
            path: "/rspack-output",
            filename: "bundle.cjs",
            library: { type: "commonjs2" },
          },
          optimization: { minimize: false, concatenateModules: false },
        }),
      catch: (cause) => new NativeFailure({ operation: "create", cause }),
    }),
    (engine) =>
      Effect.callback<void, NativeFailure>((resume) => {
        engine.close((error) =>
          resume(
            error
              ? Effect.fail(
                  new NativeFailure({ operation: "close", cause: error }),
                )
              : Effect.void,
          ),
        );
      }).pipe(Effect.orDie),
  );
  compiler.inputFileSystem = {
    readFile: (...args: unknown[]) =>
      Reflect.apply(input.readFile, input, args),
    readlink: (...args: unknown[]) =>
      Reflect.apply(input.readlink, input, args),
    readdir: (...args: unknown[]) => Reflect.apply(input.readdir, input, args),
    stat: (...args: unknown[]) =>
      Reflect.apply(input.stat.bind(input), input, args),
    lstat: (...args: unknown[]) =>
      Reflect.apply(input.lstat.bind(input), input, args),
    realpath: (...args: unknown[]) =>
      Reflect.apply(input.realpath, input, args),
  };
  compiler.outputFileSystem = {
    writeFile: (...args) => Reflect.apply(output.writeFile, output, args),
    mkdir: (...args) => Reflect.apply(output.mkdir, output, args),
    readdir: (...args) => Reflect.apply(output.readdir, output, args),
    rmdir: (...args) => Reflect.apply(output.rmdir, output, args),
    unlink: (...args) => Reflect.apply(output.unlink, output, args),
    stat: (...args) => Reflect.apply(output.stat.bind(output), output, args),
    readFile: (...args) => Reflect.apply(output.readFile, output, args),
    chmod: (...args) => Reflect.apply(output.chmod, output, args),
  };
  const run = (changes?: Parameters<Compiler["run"]>[1]) =>
    Effect.callback<Stats, NativeFailure>((resume) => {
      compiler.run((error, stats) => {
        if (error)
          resume(
            Effect.fail(new NativeFailure({ operation: "run", cause: error })),
          );
        else if (!stats)
          resume(
            Effect.fail(
              new NativeFailure({
                operation: "stats",
                cause: "No stats returned",
              }),
            ),
          );
        else if (stats.hasErrors())
          resume(
            Effect.fail(
              new NativeFailure({
                operation: "compile",
                cause: stats.toJson({ all: false, errors: true }).errors,
              }),
            ),
          );
        else resume(Effect.succeed(stats));
      }, changes);
    });
  return {
    volume,
    observations,
    underlyingReads,
    denied,
    run,
    code: () => output.readFileSync("/rspack-output/bundle.cjs", "utf8"),
  };
});

const observationKey = (observation: Pick<Observation, "operation" | "path">) =>
  `${observation.operation} ${observation.path}`;

const serializeObservation = Schema.encodeSync(
  Schema.fromJsonString(Schema.Unknown),
);

const observationFingerprint = ({ operation, error, value }: Observation) => {
  if (error) {
    assert(typeof error === "object" && "code" in error);
    return serializeObservation({ error: error.code });
  }
  if (operation === "stat" || operation === "lstat") {
    const stat = value as ReturnType<Volume["statSync"]>;
    assert(stat !== undefined);
    return serializeObservation({
      kind: [stat.isFile(), stat.isDirectory(), stat.isSymbolicLink()],
      dev: stat.dev,
      ino: stat.ino,
      mode: stat.mode,
      nlink: stat.nlink,
      uid: stat.uid,
      gid: stat.gid,
      rdev: stat.rdev,
      size: stat.size,
      mtimeMs: stat.mtimeMs,
      ctimeMs: stat.ctimeMs,
      birthtimeMs: stat.birthtimeMs,
    });
  }
  return serializeObservation(
    Buffer.isBuffer(value)
      ? value.toString("utf8")
      : Array.isArray(value)
        ? [...value].sort((a, b) => String(a).localeCompare(String(b)))
        : value,
  );
};

const observationReceipt = (observations: ReadonlyArray<Observation>) =>
  new Map(
    observations.map((observation) => [
      observationKey(observation),
      { observation, fingerprint: observationFingerprint(observation) },
    ]),
  );

const validateReceipt = (
  volume: Volume,
  receipt: ReturnType<typeof observationReceipt>,
) => {
  const fs = createFsFromVolume(volume);
  return new Map(
    [...receipt].map(([key, { observation }]) => {
      let value: unknown;
      let error: unknown;
      try {
        const method = Reflect.get(fs, `${observation.operation}Sync`);
        assert(typeof method === "function");
        value = Reflect.apply(method, fs, [observation.path]);
      } catch (cause) {
        error = cause;
      }
      return [key, observationFingerprint({ ...observation, value, error })];
    }),
  );
};

const compilationSnapshot = (stats: Stats) => {
  const compilation = stats.compilation;
  return {
    assets: compilation
      .getAssets()
      .map(({ name, source }) => {
        assert(source !== undefined);
        return { name, bytes: source.buffer().toString("base64") };
      })
      .sort((a, b) => a.name.localeCompare(b.name)),
    entries: [...compilation.entries]
      .map(([name, item]) => ({
        name,
        modules: item.dependencies.map((itemDependency) =>
          compilation.moduleGraph.getModule(itemDependency)?.identifier(),
        ),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    modules: [...compilation.modules]
      .map((module) => ({
        id: module.identifier(),
        type: module.type,
        file: module.nameForCondition(),
        source: module.originalSource()?.source().toString(),
        edges: compilation.moduleGraph
          .getOutgoingConnections(module)
          .map((edge) => ({
            target: edge.module?.identifier(),
            request: edge.dependency.request,
            type: edge.dependency.type,
            category: edge.dependency.category,
            attributes: Object.entries(edge.dependency.attributes ?? {}).sort(
              ([a], [b]) => a.localeCompare(b),
            ),
          }))
          .sort((a, b) =>
            serializeObservation(a).localeCompare(serializeObservation(b)),
          ),
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    dependencies: {
      files: [...compilation.fileDependencies].sort(),
      contexts: [...compilation.contextDependencies].sort(),
      missing: [...compilation.missingDependencies].sort(),
    },
  };
};

const warmFiles = {
  "entry.js":
    'import left from "./left.js"; import right from "./right.js"; import choice from "./choice"; import linked from "./alias.js"; import packaged from "fixture-package"; const parts = require.context("./parts", false, /\\.js$/); export const result = [left, right, choice, linked, packaged, parts.keys()];',
  "left.js": 'export { default } from "./shared.js";',
  "right.js": 'export { default } from "./shared.js";',
  "shared.js": 'export default "shared-one";',
  "choice.js": 'export default "choice-javascript";',
  "link-one.js": 'export default "link-one";',
  "link-two.js": 'export default "link-two";',
  "parts/one.js": 'export default "part-one";',
  "node_modules/fixture-package/package.json": '{"main":"./one.js"}',
  "node_modules/fixture-package/one.js": 'export default "package-one";',
  "node_modules/fixture-package/two.js": 'export default "package-two";',
};

const prepareWarmVolume = (volume: Volume) => {
  volume.symlinkSync(`${root}/link-one.js`, `${root}/alias.js`);
  for (const file of Object.keys(warmFiles))
    volume.utimesSync(`${root}/${file}`, 1_000_000_000, 1_000_000_000);
  for (const directory of [root, `${root}/parts`])
    volume.utimesSync(directory, 1_000_000_000, 1_000_000_000);
};

const keysAt = (path: string, ...operations: ReadonlyArray<string>) =>
  operations.map((operation) => `${operation} ${root}${path}`);

const warmCases: ReadonlyArray<{
  readonly name: string;
  readonly missing?: boolean;
  readonly reacquired: ReadonlyArray<string>;
  readonly unproven: ReadonlyArray<string>;
  readonly mutate: (volume: Volume) => {
    readonly modifiedFiles?: ReadonlySet<string>;
    readonly removedFiles?: ReadonlySet<string>;
  };
}> = [
  {
    name: "ordinary source edit",
    reacquired: keysAt("/choice.js", "lstat", "readFile", "stat"),
    unproven: [],
    mutate(volume) {
      volume.writeFileSync(
        `${root}/choice.js`,
        'export default "choice-edited";',
      );
      return { modifiedFiles: new Set([`${root}/choice.js`]) };
    },
  },
  {
    name: "shared dependency edit",
    reacquired: keysAt("/shared.js", "lstat", "readFile", "stat"),
    unproven: [],
    mutate(volume) {
      volume.writeFileSync(`${root}/shared.js`, 'export default "shared-two";');
      return { modifiedFiles: new Set([`${root}/shared.js`]) };
    },
  },
  {
    name: "same-metadata source edit",
    reacquired: keysAt("/shared.js", "lstat", "readFile", "stat"),
    unproven: [],
    mutate(volume) {
      const path = `${root}/shared.js`;
      const before = volume.statSync(path);
      volume.writeFileSync(path, 'export default "shared-two";');
      volume.utimesSync(path, 1_000_000_000, 1_000_000_000);
      const after = volume.statSync(path);
      expect([after.ino, after.size, after.mtimeMs]).toEqual([
        before.ino,
        before.size,
        before.mtimeMs,
      ]);
      return { modifiedFiles: new Set([path]) };
    },
  },
  {
    name: "missing dependency recovery",
    missing: true,
    reacquired: [
      ...keysAt("", "lstat", "stat"),
      ...keysAt("/shared.js", "stat"),
    ],
    unproven: keysAt("", "readdir"),
    mutate(volume) {
      volume.writeFileSync(
        `${root}/shared.js`,
        'export default "shared-recovered";',
      );
      return { modifiedFiles: new Set([`${root}/shared.js`, root]) };
    },
  },
  {
    name: "new extension shadow",
    reacquired: [
      ...keysAt("", "lstat", "stat"),
      ...keysAt("/choice.ts", "stat"),
    ],
    unproven: [],
    mutate(volume) {
      volume.writeFileSync(
        `${root}/choice.ts`,
        'export default "choice-typescript";',
      );
      return { modifiedFiles: new Set([`${root}/choice.ts`, root]) };
    },
  },
  {
    name: "new glob member",
    reacquired: keysAt("/parts", "lstat", "readdir", "stat"),
    unproven: [],
    mutate(volume) {
      volume.writeFileSync(
        `${root}/parts/two.js`,
        'export default "part-two";',
      );
      return {
        modifiedFiles: new Set([`${root}/parts/two.js`, `${root}/parts`]),
      };
    },
  },
  {
    name: "same-metadata manifest edit",
    reacquired: keysAt(
      "/node_modules/fixture-package/package.json",
      "readFile",
    ),
    unproven: [],
    mutate(volume) {
      const path = `${root}/node_modules/fixture-package/package.json`;
      const before = volume.statSync(path);
      volume.writeFileSync(path, '{"main":"./two.js"}');
      volume.utimesSync(path, 1_000_000_000, 1_000_000_000);
      const after = volume.statSync(path);
      expect([after.ino, after.size, after.mtimeMs]).toEqual([
        before.ino,
        before.size,
        before.mtimeMs,
      ]);
      return { modifiedFiles: new Set([path]) };
    },
  },
  {
    name: "symlink retarget",
    reacquired: [
      ...keysAt("", "stat"),
      ...keysAt("/alias.js", "lstat", "realpath", "stat"),
    ],
    unproven: keysAt("", "lstat"),
    mutate(volume) {
      const alias = `${root}/alias.js`;
      volume.unlinkSync(alias);
      volume.symlinkSync(`${root}/link-two.js`, alias);
      return { modifiedFiles: new Set([alias, root]) };
    },
  },
  {
    name: "removed import with unchanged former source",
    reacquired: [
      ...keysAt("/left.js", "lstat", "readFile", "stat"),
      ...keysAt("/right.js", "lstat", "readFile", "stat"),
    ],
    unproven: [],
    mutate(volume) {
      volume.writeFileSync(
        `${root}/left.js`,
        'export default "left-detached";',
      );
      volume.writeFileSync(
        `${root}/right.js`,
        'export default "right-detached";',
      );
      return {
        modifiedFiles: new Set([`${root}/left.js`, `${root}/right.js`]),
      };
    },
  },
  {
    name: "removed import and source",
    reacquired: [
      ...keysAt("", "lstat", "stat"),
      ...keysAt("/left.js", "lstat", "readFile", "stat"),
      ...keysAt("/right.js", "lstat", "readFile", "stat"),
    ],
    unproven: keysAt("/shared.js", "lstat", "readFile", "stat"),
    mutate(volume) {
      volume.writeFileSync(
        `${root}/left.js`,
        'export default "left-detached";',
      );
      volume.writeFileSync(
        `${root}/right.js`,
        'export default "right-detached";',
      );
      volume.unlinkSync(`${root}/shared.js`);
      return {
        modifiedFiles: new Set([`${root}/left.js`, `${root}/right.js`, root]),
        removedFiles: new Set([`${root}/shared.js`]),
      };
    },
  },
];

describe("Rspack supported warm-build acquisition evidence", () => {
  it.effect(
    "retains complete public artifacts, graph and dependency sets without fresh callbacks",
    () =>
      Effect.gen(function* () {
        const probe = yield* fixture(warmFiles, {
          cache: true,
          incremental: true,
        });
        prepareWarmVolume(probe.volume);
        const first = compilationSnapshot(yield* probe.run());
        const receipt = observationReceipt(probe.observations);
        const before = probe.observations.length;
        const warm = compilationSnapshot(yield* probe.run());
        expect(probe.observations.slice(before)).toEqual([]);
        expect(warm).toEqual(first);
        expect(validateReceipt(probe.volume, receipt)).toEqual(
          new Map([...receipt].map(([key, value]) => [key, value.fingerprint])),
        );
        const fresh = yield* fixture(warmFiles, {
          cache: false,
          incremental: false,
        });
        prepareWarmVolume(fresh.volume);
        expect(warm).toEqual(compilationSnapshot(yield* fresh.run()));
        expect(warm.assets).toHaveLength(1);
        expect(warm.dependencies.files).toContain(`${root}/shared.js`);
        expect(warm.dependencies.contexts).toContain(`${root}/parts`);
        expect(warm.dependencies.missing).toContain(`${root}/choice.ts`);
      }).pipe(Effect.scoped),
  );

  it.effect.each(warmCases)(
    "records previous changed keys actually reacquired for $name",
    (scenario) =>
      Effect.gen(function* () {
        const probe = yield* fixture(warmFiles, {
          cache: true,
          incremental: true,
        });
        prepareWarmVolume(probe.volume);
        if (scenario.missing) probe.volume.unlinkSync(`${root}/shared.js`);
        const initial = yield* probe.run().pipe(Effect.result);
        expect(Result.isFailure(initial)).toBe(scenario.missing === true);
        const receipt = observationReceipt(probe.observations);
        const changes = scenario.mutate(probe.volume);
        const before = probe.observations.length;
        const validated = validateReceipt(probe.volume, receipt);
        expect(probe.observations).toHaveLength(before);
        const changed = [...receipt]
          .filter(([key, value]) => validated.get(key) !== value.fingerprint)
          .map(([key]) => key)
          .sort();
        expect(changed.length).toBeGreaterThan(0);
        const warm = compilationSnapshot(yield* probe.run(changes));
        const acquired = observationReceipt(probe.observations.slice(before));
        const reacquired = changed.filter(
          (key) => acquired.get(key)?.fingerprint === validated.get(key),
        );
        const unproven = changed.filter((key) => !reacquired.includes(key));
        expect(reacquired).toEqual([...scenario.reacquired].sort());
        expect(unproven).toEqual([...scenario.unproven].sort());
        expect([...receipt.keys()].some((key) => !acquired.has(key))).toBe(
          true,
        );
        const union = new Map([...receipt, ...acquired]);
        const stillChanged = [...validateReceipt(probe.volume, union)]
          .filter(([key, value]) => union.get(key)?.fingerprint !== value)
          .map(([key]) => key)
          .sort();
        expect(stillChanged).toEqual(unproven);
        const fresh = yield* fixture(warmFiles, {
          cache: false,
          incremental: false,
        });
        prepareWarmVolume(fresh.volume);
        if (scenario.missing) fresh.volume.unlinkSync(`${root}/shared.js`);
        scenario.mutate(fresh.volume);
        const cold = compilationSnapshot(yield* fresh.run());
        expect(warm).toEqual(cold);
        expect(probe.code()).toEqual(fresh.code());
      }).pipe(Effect.scoped),
  );
});

const sources = (stats: Stats) =>
  new Map(
    [...stats.compilation.modules].map((module) => [
      module.identifier(),
      module.originalSource()?.source().toString(),
    ]),
  );

describe("Rspack 2.2.9 public filesystem and incremental boundary", () => {
  it.effect(
    "routes source, package, missing candidate, context and realpath observations through the supplied filesystem",
    () =>
      Effect.gen(function* () {
        const probe = yield* fixture({
          "entry.js":
            'import value from "fixture-package"; import choice from "./choice"; import linked from "./alias.js"; const parts = require.context("./parts", false, /\\.js$/); export const result = [value, choice, linked, parts.keys()];',
          "choice.js": 'export default "javascript-choice";',
          "target.js": 'export default "symlink-target";',
          "parts/one.js": 'export default "context-one";',
          "node_modules/fixture-package/package.json": '{"main":"./one.js"}',
          "node_modules/fixture-package/one.js":
            'export default "package-one";',
        });
        probe.volume.symlinkSync(`${root}/target.js`, `${root}/alias.js`);
        const built = yield* probe.run();
        expect(probe.underlyingReads).toEqual(
          expect.arrayContaining([
            entry,
            `${root}/node_modules/fixture-package/package.json`,
            `${root}/node_modules/fixture-package/one.js`,
            `${root}/target.js`,
          ]),
        );
        expect(probe.observations).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              operation: "stat",
              path: `${root}/choice.ts`,
              error: expect.objectContaining({ code: "ENOENT" }),
            }),
            expect.objectContaining({
              operation: "readdir",
              path: `${root}/parts`,
              value: expect.arrayContaining(["one.js"]),
            }),
            expect.objectContaining({
              operation: "realpath",
              path: `${root}/alias.js`,
              value: `${root}/target.js`,
            }),
          ]),
        );
        expect([...built.compilation.fileDependencies]).toContain(entry);
        expect([...built.compilation.contextDependencies]).toContain(
          `${root}/parts`,
        );
        expect([...built.compilation.missingDependencies]).toContain(
          `${root}/choice.ts`,
        );
        expect(probe.code()).toContain("package-one");
        expect(probe.code()).toContain("symlink-target");
        expect(probe.code()).toContain("./one.js");
      }).pipe(Effect.scoped),
  );

  it.effect.each([false, true])(
    "retains modules without fresh source reads and does not discover edits without modifiedFiles (cache: %s)",
    (cache) =>
      Effect.gen(function* () {
        const original = 'export default "original-byte-value";';
        const changed = 'export default "changed-source-value";';
        const probe = yield* fixture(
          {
            "entry.js": 'export { default } from "./dependency.js";',
            "dependency.js": original,
          },
          cache ? { cache, incremental: true } : { cache },
        );
        const first = yield* probe.run();
        expect(sources(first).get(dependency)).toBe(original);
        expect(probe.underlyingReads).toContain(dependency);
        const before = probe.underlyingReads.length;
        const warm = yield* probe.run();
        expect(sources(warm).get(dependency)).toBe(original);
        expect([...warm.compilation.fileDependencies]).toContain(dependency);
        expect(probe.underlyingReads.slice(before)).not.toContain(dependency);
        probe.volume.writeFileSync(dependency, changed);
        const stale = yield* probe.run();
        expect(sources(stale).get(dependency)).toBe(original);
        expect(probe.code()).toContain("original-byte-value");
        expect(probe.code()).not.toContain("changed-source-value");
        const refreshed = yield* probe.run({
          modifiedFiles: new Set([dependency]),
        });
        expect(sources(refreshed).get(dependency)).toBe(changed);
        expect(probe.code()).toContain("changed-source-value");
        probe.volume.writeFileSync(dependency, "export default ;");
        const failed = yield* probe
          .run({ modifiedFiles: new Set([dependency]) })
          .pipe(Effect.result);
        assert(Result.isFailure(failed));
        expect(failed.failure._tag).toBe("RspackBoundaryFailure");
        probe.volume.writeFileSync(dependency, original);
        expect(
          sources(
            yield* probe.run({ modifiedFiles: new Set([dependency]) }),
          ).get(dependency),
        ).toBe(original);
      }).pipe(Effect.scoped),
  );
  it.effect(
    "rereads source bytes without changed paths when both cache and incremental reuse are disabled",
    () =>
      Effect.gen(function* () {
        const probe = yield* fixture(
          {
            "entry.js": 'export { default } from "./dependency.js";',
            "dependency.js": 'export default "original-source";',
          },
          { cache: false, incremental: false },
        );
        yield* probe.run();
        const before = probe.underlyingReads.length;
        const changed = 'export default "refreshed-source";';
        probe.volume.writeFileSync(dependency, changed);
        const refreshed = yield* probe.run();
        expect(probe.underlyingReads.slice(before)).toContain(dependency);
        expect(sources(refreshed).get(dependency)).toBe(changed);
        expect(probe.code()).toContain("refreshed-source");
        expect(probe.code()).not.toContain("original-source");
      }).pipe(Effect.scoped),
  );

  it.effect(
    "honors explicit invalidation of same-metadata package changes, new shadow candidates, context members and symlink retargets",
    () =>
      Effect.gen(function* () {
        const manifest = `${root}/node_modules/fixture-package/package.json`;
        const shadow = `${root}/choice.ts`;
        const member = `${root}/parts/two.js`;
        const alias = `${root}/alias.js`;
        const probe = yield* fixture({
          "entry.js":
            'import value from "fixture-package"; import choice from "./choice"; import linked from "./alias.js"; const parts = require.context("./parts", false, /\\.js$/); export const result = [value, choice, linked, parts.keys()];',
          "choice.js": 'export default "javascript-choice";',
          "link-one.js": 'export default "link-one";',
          "link-two.js": 'export default "link-two";',
          "parts/one.js": 'export default "context-one";',
          "node_modules/fixture-package/package.json": '{"main":"./one.js"}',
          "node_modules/fixture-package/one.js":
            'export default "package-one";',
          "node_modules/fixture-package/two.js":
            'export default "package-two";',
        });
        probe.volume.symlinkSync(`${root}/link-one.js`, alias);
        probe.volume.utimesSync(manifest, 1_000_000_000, 1_000_000_000);
        yield* probe.run();
        const before = probe.volume.statSync(manifest);
        probe.volume.writeFileSync(manifest, '{"main":"./two.js"}');
        probe.volume.utimesSync(manifest, 1_000_000_000, 1_000_000_000);
        const after = probe.volume.statSync(manifest);
        expect([after.ino, after.size, after.mtimeMs]).toEqual([
          before.ino,
          before.size,
          before.mtimeMs,
        ]);
        yield* probe.run({ modifiedFiles: new Set([manifest]) });
        expect(probe.code()).toContain("package-two");
        expect(probe.code()).not.toContain("package-one");
        probe.volume.writeFileSync(
          shadow,
          'export default "typescript-shadow";',
        );
        yield* probe.run({ modifiedFiles: new Set([shadow]) });
        expect(probe.code()).toContain("typescript-shadow");
        expect(probe.code()).not.toContain("javascript-choice");
        probe.volume.writeFileSync(member, 'export default "context-two";');
        yield* probe.run({ modifiedFiles: new Set([member]) });
        expect(probe.code()).not.toContain("context-two");
        yield* probe.run({ modifiedFiles: new Set([`${root}/parts`]) });
        expect(probe.code()).toContain("./two.js");
        expect(probe.code()).toContain("context-two");
        probe.volume.unlinkSync(alias);
        probe.volume.symlinkSync(`${root}/link-two.js`, alias);
        yield* probe.run({ modifiedFiles: new Set([alias]) });
        expect(probe.code()).toContain("link-two");
        expect(probe.code()).not.toContain("link-one");
        probe.volume.unlinkSync(shadow);
        probe.volume.unlinkSync(member);
        yield* probe.run({
          modifiedFiles: new Set([`${root}/parts`]),
          removedFiles: new Set([shadow, member]),
        });
        expect(probe.code()).toContain("javascript-choice");
        expect(probe.code()).not.toContain("typescript-shadow");
        expect(probe.code()).not.toContain("context-two");
      }).pipe(Effect.scoped),
  );

  it.effect(
    "rejects an innocuous protected symlink target before its underlying read",
    () =>
      Effect.gen(function* () {
        const blocked = `${root}/blocked.fixture`;
        const probe = yield* fixture(
          {
            "entry.js": 'export { default } from "./alias.js";',
            "blocked.fixture": 'export default "innocuous-policy-fixture";',
          },
          { blocked },
        );
        probe.volume.symlinkSync(blocked, `${root}/alias.js`);
        const outcome = yield* probe.run().pipe(Effect.result);
        assert(Result.isFailure(outcome));
        expect(probe.denied).toEqual([
          new PolicyDenied({ path: blocked, code: "EACCES" }),
        ]);
        expect(probe.underlyingReads).not.toContain(blocked);
        expect(probe.underlyingReads).not.toContain(`${root}/alias.js`);
        expect(probe.observations).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              operation: "realpath",
              path: `${root}/alias.js`,
              value: blocked,
            }),
          ]),
        );
      }).pipe(Effect.scoped),
  );

  it.effect(
    "records acquired bytes rather than later filesystem contents when a source changes before its read callback returns",
    () =>
      Effect.gen(function* () {
        const original = 'export default "acquired-original";';
        const changed = 'export default "mutated-after-read";';
        let mutated = false;
        const probe = yield* fixture(
          {
            "entry.js": 'export { default } from "./dependency.js";',
            "dependency.js": original,
          },
          {
            afterRead(path, bytes, volume) {
              if (path === dependency && !mutated) {
                expect(bytes).toBe(original);
                mutated = true;
                volume.writeFileSync(dependency, changed);
              }
            },
          },
        );
        const first = yield* probe.run();
        expect(mutated).toBe(true);
        expect(probe.volume.readFileSync(dependency, "utf8")).toBe(changed);
        expect(probe.observations).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              operation: "readFile",
              path: dependency,
              value: original,
            }),
          ]),
        );
        expect(sources(first).get(dependency)).toBe(original);
        expect(probe.code()).toContain("acquired-original");
        expect(probe.code()).not.toContain("mutated-after-read");
        const refreshed = yield* probe.run({
          modifiedFiles: new Set([dependency]),
        });
        expect(sources(refreshed).get(dependency)).toBe(changed);
        expect(probe.code()).toContain("mutated-after-read");
      }).pipe(Effect.scoped),
  );
});
