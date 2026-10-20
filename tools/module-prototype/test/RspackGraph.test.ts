import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import { expect, layer } from "@effect/vitest";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as Hex from "effect/encoding/Hex";
import * as Schema from "effect/Schema";
import type * as RspackExternals from "../src/RspackExternals.ts";
import * as RspackGraph from "../src/RspackGraph.ts";
import type * as RspackInputs from "../src/RspackInputs.ts";

const serialize = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));

const previousFingerprints = Effect.fn("test.previousFingerprints")(function* (
  graph: RspackGraph.Graph,
  observations: ReadonlyArray<RspackInputs.Observation>,
  external: ReadonlyArray<RspackExternals.Observation>,
  owned: (file: string) => boolean,
  virtual: (file: string) => boolean,
) {
  const crypto = yield* Crypto.Crypto;
  const bytes = new Map(
    observations
      .filter((item) => item.method === "readFile")
      .map((item) => [item.path, item.fingerprint]),
  );
  const modules = new Map(graph.modules.map((module) => [module.id, module]));
  const serialized = new Map<string, string>();
  for (const observation of external) {
    if (!graph.modules.some((module) => module.file === observation.importer))
      return yield* new RspackGraph.Failed({
        reason: "UnassignedExternal",
        module: observation.importer,
      });
  }
  for (const module of graph.modules) {
    const input = module.file && bytes.get(module.file);
    if (
      module.file &&
      !virtual(module.file) &&
      module.source !== undefined &&
      !input
    ) {
      return yield* new RspackGraph.Failed({
        reason: "UnobservedSource",
        module: module.id,
      });
    }
    serialized.set(
      module.id,
      serialize({
        id: module.id,
        type: module.type,
        file: module.file,
        input: module.file && owned(module.file) ? undefined : input,
        source: module.file && owned(module.file) ? undefined : module.source,
        external: [
          ...new Set(
            external
              .filter((observation) => observation.importer === module.file)
              .map((observation) => serialize(observation)),
          ),
        ].sort(),
        imports: module.imports.map((edge) => serialize(edge)).sort(),
      }),
    );
  }
  const values: Record<string, string> = {};
  for (const [root, entry] of Object.entries(graph.roots)) {
    const pending = [entry];
    const visited = new Set<string>();
    for (let index = 0; index < pending.length; index++) {
      const id = pending[index];
      if (visited.has(id)) continue;
      visited.add(id);
      const module = modules.get(id);
      if (!module)
        return yield* new RspackGraph.Failed({
          reason: "MissingModule",
          module: id,
        });
      pending.push(...module.imports.map((edge) => edge.id));
    }
    const value = [...visited]
      .sort()
      .map((id) => serialized.get(id))
      .join("\n");
    values[root] = Hex.encode(
      yield* crypto.digest("SHA-256", new TextEncoder().encode(value)),
    );
  }
  return values;
});

const owned = (file: string) => file === "/project/owned.ts";
const virtual = (file: string) => file === "/project/virtual.ts";

const fixture = () => {
  const graph: RspackGraph.Graph = {
    roots: { first: "first", second: "second", variant: "variant" },
    modules: [
      {
        id: "first",
        type: "javascript/auto",
        file: "/project/first.ts",
        source: "first",
        imports: [
          {
            id: "virtual",
            request: "./virtual",
            type: "esm import",
            category: "esm",
            attributes: [],
          },
          {
            id: "shared",
            request: "./shared",
            type: "esm import",
            category: "esm",
            attributes: [["type", "json"]],
          },
          {
            id: "fileless",
            request: "external",
            type: "commonjs",
            category: "commonjs",
            attributes: [],
          },
        ],
      },
      {
        id: "variant",
        type: "javascript/esm",
        file: "/project/first.ts",
        source: "first variant",
        imports: [],
      },
      {
        id: "second",
        type: "javascript/auto",
        file: "/project/owned.ts",
        source: "owned",
        imports: [],
      },
      {
        id: "shared",
        type: "javascript/auto",
        file: "/project/shared.ts",
        source: "shared",
        imports: [
          {
            id: "first",
            request: "./first",
            type: "esm import",
            category: "esm",
            attributes: [],
          },
        ],
      },
      {
        id: "detached",
        type: "javascript/auto",
        file: "/project/detached.ts",
        source: "detached",
        imports: [],
      },
      {
        id: "fileless",
        type: "javascript/dynamic",
        file: undefined,
        source: "external",
        imports: [],
      },
      {
        id: "virtual",
        type: "javascript/auto",
        file: "/project/virtual.ts",
        source: "virtual",
        imports: [],
      },
    ],
  };
  const observations: ReadonlyArray<RspackInputs.Observation> = [
    {
      method: "readFile",
      path: "/project/first.ts",
      fingerprint: "first bytes",
    },
    {
      method: "readFile",
      path: "/project/owned.ts",
      fingerprint: "owned bytes",
    },
    {
      method: "readFile",
      path: "/project/shared.ts",
      fingerprint: "shared bytes",
    },
    {
      method: "readFile",
      path: "/project/detached.ts",
      fingerprint: "detached bytes",
    },
    {
      method: "stat",
      path: "/project/first.ts",
      fingerprint: "not source bytes",
    },
  ];
  const first: RspackExternals.Observation = {
    importer: "/project/first.ts",
    request: "z-package",
    dependencyType: "esm",
    physical: "/project/node_modules/z-package/index.js",
    emitted: "file:///project/node_modules/z-package/index.js",
    sha256: "external bytes",
  };
  const external: ReadonlyArray<RspackExternals.Observation> = [
    first,
    { ...first, importer: "/project/shared.ts" },
    { ...first, request: "a-package" },
    { ...first, importer: "/project/owned.ts" },
    { ...first, importer: "/project/detached.ts" },
    { ...first },
    {
      sha256: first.sha256,
      emitted: first.emitted,
      physical: first.physical,
      dependencyType: first.dependencyType,
      request: first.request,
      importer: first.importer,
    },
  ];
  return { graph, observations, external };
};

layer(NodeCrypto.layer)("RspackGraph", (it) => {
  it.effect("preserves the previous serialized digests and all inputs", () =>
    Effect.gen(function* () {
      const { graph, observations, external } = fixture();
      const original = serialize({ graph, observations, external });
      const actual = yield* RspackGraph.fingerprints(
        graph,
        observations,
        external,
        owned,
        virtual,
      );
      expect(actual).toEqual(
        yield* previousFingerprints(
          graph,
          observations,
          external,
          owned,
          virtual,
        ),
      );
      expect(
        yield* RspackGraph.fingerprints(
          graph,
          observations,
          [],
          owned,
          virtual,
        ),
      ).toEqual(
        yield* previousFingerprints(graph, observations, [], owned, virtual),
      );
      expect(
        yield* RspackGraph.fingerprints(
          graph,
          observations,
          external.toReversed(),
          owned,
          virtual,
        ),
      ).toEqual(actual);
      expect(
        yield* RspackGraph.fingerprints(
          graph,
          observations,
          [...external, ...external],
          owned,
          virtual,
        ),
      ).toEqual(actual);
      expect(
        yield* RspackGraph.fingerprints(
          graph,
          observations,
          external.slice(0, -1),
          owned,
          virtual,
        ),
      ).not.toEqual(actual);
      expect(serialize({ graph, observations, external })).toBe(original);
    }),
  );

  it.effect.each([
    ["/project/first.ts", ["first", "variant"]],
    ["/project/shared.ts", ["first"]],
    ["/project/owned.ts", ["second"]],
    ["/project/detached.ts", []],
  ] as const)(
    "attributes external changes for %s only to reachable roots",
    ([importer, roots]) =>
      Effect.gen(function* () {
        const { graph, observations, external } = fixture();
        const before = yield* RspackGraph.fingerprints(
          graph,
          observations,
          external,
          owned,
          virtual,
        );
        const changed = external.map((observation) =>
          observation.importer === importer
            ? {
                importer: observation.importer,
                request: observation.request,
                dependencyType: observation.dependencyType,
                physical: observation.physical,
                emitted: observation.emitted,
                sha256: "changed external bytes",
              }
            : observation,
        );
        const after = yield* RspackGraph.fingerprints(
          graph,
          observations,
          changed,
          owned,
          virtual,
        );
        expect(after).toEqual(
          yield* previousFingerprints(
            graph,
            observations,
            changed,
            owned,
            virtual,
          ),
        );
        expect(
          Object.keys(before).filter((root) => before[root] !== after[root]),
        ).toEqual(roots);
      }),
  );

  it.effect(
    "preserves the first unassigned importer error before source guards",
    () =>
      Effect.gen(function* () {
        const { graph, external } = fixture();
        const removed = {
          ...graph,
          modules: graph.modules.filter(
            (module) => module.file !== "/project/shared.ts",
          ),
        };
        const actual = yield* RspackGraph.fingerprints(
          removed,
          [],
          external,
          owned,
          virtual,
        ).pipe(Effect.result);
        expect(actual).toEqual(
          yield* previousFingerprints(
            removed,
            [],
            external,
            owned,
            virtual,
          ).pipe(Effect.result),
        );
        expect(actual).toMatchObject({
          _tag: "Failure",
          failure: {
            _tag: "RspackGraphFailed",
            reason: "UnassignedExternal",
            module: "/project/shared.ts",
          },
        });
      }),
  );

  it.effect(
    "requires observed owned sources but permits explicitly virtual sources",
    () =>
      Effect.gen(function* () {
        const { graph, observations, external } = fixture();
        const missingOwned = observations.filter(
          (observation) => !owned(observation.path),
        );
        const actual = yield* RspackGraph.fingerprints(
          graph,
          missingOwned,
          external,
          owned,
          virtual,
        ).pipe(Effect.result);
        expect(actual).toEqual(
          yield* previousFingerprints(
            graph,
            missingOwned,
            external,
            owned,
            virtual,
          ).pipe(Effect.result),
        );
        expect(actual).toMatchObject({
          _tag: "Failure",
          failure: {
            _tag: "RspackGraphFailed",
            reason: "UnobservedSource",
            module: "second",
          },
        });
        expect(
          yield* RspackGraph.fingerprints(
            graph,
            observations,
            external,
            owned,
          ).pipe(Effect.result),
        ).toMatchObject({
          _tag: "Failure",
          failure: {
            _tag: "RspackGraphFailed",
            reason: "UnobservedSource",
            module: "virtual",
          },
        });
        const changedGraph = {
          ...graph,
          modules: graph.modules.map((module) =>
            module.file && owned(module.file)
              ? { ...module, source: "changed owned source" }
              : module,
          ),
        };
        const changedObservations = observations.map((observation) =>
          owned(observation.path)
            ? {
                method: observation.method,
                path: observation.path,
                fingerprint: "changed owned bytes",
              }
            : observation,
        );
        expect(
          yield* RspackGraph.fingerprints(
            changedGraph,
            changedObservations,
            external,
            owned,
            virtual,
          ),
        ).toEqual(
          yield* RspackGraph.fingerprints(
            graph,
            observations,
            external,
            owned,
            virtual,
          ),
        );
      }),
  );

  it.effect("preserves missing reachable module failures", () =>
    Effect.gen(function* () {
      const { graph, observations, external } = fixture();
      const removed = {
        ...graph,
        modules: graph.modules.filter((module) => module.id !== "fileless"),
      };
      const actual = yield* RspackGraph.fingerprints(
        removed,
        observations,
        external,
        owned,
        virtual,
      ).pipe(Effect.result);
      expect(actual).toEqual(
        yield* previousFingerprints(
          removed,
          observations,
          external,
          owned,
          virtual,
        ).pipe(Effect.result),
      );
      expect(actual).toMatchObject({
        _tag: "Failure",
        failure: {
          _tag: "RspackGraphFailed",
          reason: "MissingModule",
          module: "fileless",
        },
      });
    }),
  );
});
