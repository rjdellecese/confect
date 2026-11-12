import { pipe } from "effect/Function";
import * as Str from "effect/String";
import * as Rec from "effect/Record";
import * as Array from "effect/Array";
import { FunctionSpec, GroupSpec, Spec, Table } from "@confect/core";
import * as Bundler from "@confect/cli/Bundler";
import { ConfectDirectory } from "@confect/cli/ConfectDirectory";
import { ParentChildNameCollisionError } from "@confect/cli/CodegenError";
import * as FunctionPaths from "@confect/cli/FunctionPaths";
import * as FunctionPath from "@confect/cli/FunctionPath";
import * as GroupPath from "@confect/cli/GroupPath";
import { SpecModulePath } from "@confect/cli/SpecModulePath";
import * as GenerationSnapshot from "@confect/cli/GenerationSnapshot";
import * as LeafModule from "@confect/cli/LeafModule";
import * as NodePath from "@effect/platform-node/NodePath";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import {
  assert,
  describe,
  expect,
  expectTypeOf,
  it as test,
  layer,
} from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as HashMap from "effect/HashMap";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { vi } from "vitest";

const loadLeaf = Effect.fnUntraced(function* (
  relativePath: string,
  spec: GroupSpec.AnyWithProps = GroupSpec.make(),
) {
  yield* Effect.acquireRelease(
    Effect.sync(() =>
      vi.spyOn(Bundler, "bundle").mockReturnValue(
        Effect.succeed({
          module: { default: spec },
          metafile: { inputs: {}, outputs: {} },
        }),
      ),
    ),
    (spy) => Effect.sync(() => spy.mockRestore()),
  );
  const leaf2 = yield* LeafModule.toLeafModule(relativePath);
  return yield* LeafModule.loadSpec(leaf2);
}, Effect.scoped);

const query = (name: string) =>
  FunctionSpec.publicQuery({
    name,
    returns: () => Schema.Null,
  });

const nodeAction = (name: string) =>
  FunctionSpec.publicNodeAction({
    name,
    returns: () => Schema.Null,
  });

const getLeaf = (
  snapshot: GenerationSnapshot.GenerationSnapshot,
  path: string,
) =>
  Option.getOrThrow(
    HashMap.get(
      snapshot.leaves,
      SpecModulePath.make(pipe(path, Str.replaceAll("\\", "/"))),
    ),
  );

const fromLoadedLeaves = (leaves: ReadonlyArray<LeafModule.LoadedLeafModule>) =>
  Result.getOrThrow(GenerationSnapshot.fromLoadedLeaves(leaves));
const update = (
  snapshot: GenerationSnapshot.GenerationSnapshot,
  leaves: ReadonlyArray<LeafModule.LoadedLeafModule>,
) => Result.getOrThrow(GenerationSnapshot.update(snapshot, leaves));

const codec = Schema.toCodecJson(GenerationSnapshot.GenerationSnapshot);
const jsonCodec = Schema.fromJsonString(GenerationSnapshot.GenerationSnapshot);
const roundtrip = (snapshot: GenerationSnapshot.GenerationSnapshot) =>
  pipe(
    snapshot,
    Schema.encodeResult(jsonCodec),
    Result.flatMap(Schema.decodeResult(jsonCodec)),
    Result.getOrThrow,
  );

const baseLayer = Layer.merge(
  NodeFileSystem.layer,
  Layer.succeed(ConfectDirectory, {
    get: Effect.succeed("/confect"),
  }),
);

const metadataGroup = (
  functionNames: ReadonlyArray<string> = [],
  groups: GenerationSnapshot.GroupTree["groups"] = {},
  root?: boolean,
): GenerationSnapshot.GroupTree => ({
  runtime: "Convex",
  ...(root === undefined ? {} : { root }),
  functionNames,
  groups,
});

describe("GenerationSnapshot parsing", () => {
  test("roundtrips root metadata without changing physical module paths", () => {
    const before = Result.getOrThrow(
      GenerationSnapshot.parse([["app.spec.ts", metadataGroup(["greet"])]]),
    );
    const after = GenerationSnapshot.parse([
      ["app.spec.ts", metadataGroup(["greet"], {}, true)],
    ]).pipe(Result.getOrThrow, roundtrip);
    expect(getLeaf(after, "app.spec.ts").root).toBe(true);
    expect(GenerationSnapshot.diff(before, after)).toEqual({
      removed: [],
      changed: [],
    });
    expect(Array.fromIterable(GenerationSnapshot.functionPaths(after))).toEqual(
      [
        FunctionPath.FunctionPath.make({
          groupPath: GroupPath.make(["app"]),
          name: "greet",
        }),
      ],
    );
  });

  test.each([
    {
      label: "a root in a nested file",
      entries: [["nested/app.spec.ts", metadataGroup([], {}, true)]],
      tag: "NestedRoot",
    },
    {
      label: "a root in a nested in-memory group",
      entries: [
        [
          "app.spec.ts",
          metadataGroup([], { nested: metadataGroup([], {}, true) }),
        ],
      ],
      tag: "NestedRoot",
    },
    {
      label: "two empty roots",
      entries: [
        ["app.spec.ts", metadataGroup([], {}, true)],
        ["other.spec.ts", metadataGroup([], {}, true)],
      ],
      tag: "MultipleRoots",
    },
    {
      label: "a function colliding with a sibling group",
      entries: [
        ["app.spec.ts", metadataGroup(["notes"], {}, true)],
        ["notes.spec.ts", metadataGroup()],
      ],
      tag: "RootNameCollision",
    },
    {
      label: "a function colliding with an implicit sibling directory",
      entries: [
        ["app.spec.ts", metadataGroup(["notes"], {}, true)],
        ["notes/archive.spec.ts", metadataGroup(["list"])],
      ],
      tag: "RootNameCollision",
    },
    {
      label: "a flattened child colliding with a sibling directory",
      entries: [
        ["app.spec.ts", metadataGroup([], {}, true)],
        ["app/notes/archive.spec.ts", metadataGroup(["list"])],
        ["notes/current.spec.ts", metadataGroup(["list"])],
      ],
      tag: "RootNameCollision",
    },
  ])("rejects $label", ({ entries, tag }) => {
    const result = GenerationSnapshot.parse(entries);
    assert(result._tag === "Failure");
    expect(result.failure).toBeInstanceOf(Spec.InvalidRootGroups);
    expect(result.failure).toMatchObject({ issue: { _tag: tag } });
  });

  test("rejects malformed root metadata", () => {
    const result = GenerationSnapshot.parse([
      [
        "app.spec.ts",
        { runtime: "Convex", functionNames: [], groups: {}, root: "true" },
      ],
    ]);
    assert(result._tag === "Failure");
    expect(result.failure).toMatchObject({ reason: "InvalidShape" });
  });

  test("preserves named descendants and siblings beside a root", () => {
    const snapshot = GenerationSnapshot.parse([
      ["app.spec.ts", metadataGroup(["greet"], {}, true)],
      ["app/children.spec.ts", metadataGroup(["list"])],
      ["notes.spec.ts", metadataGroup(["list"])],
    ]).pipe(Result.getOrThrow, roundtrip);
    expect(
      pipe(
        GenerationSnapshot.plan(snapshot, []).changed,
        Array.map(({ path }) => GroupPath.toString(path)),
        Array.sort(Str.Order),
      ),
    ).toEqual(["app", "app.children", "notes"]);
  });

  test("roundtrips context reuse and detects flag-only changes without inheriting them", () => {
    const makeSnapshot = (enabled?: boolean) =>
      Result.getOrThrow(
        GenerationSnapshot.parse([
          [
            "notes.spec.ts",
            {
              runtime: "Convex",
              functionNames: ["list"],
              groups: { child: metadataGroup(["list"]) },
              ...(enabled === undefined
                ? {}
                : { experimental_reuseContext: enabled }),
            },
          ],
        ]),
      );
    const before = makeSnapshot();
    const after = roundtrip(makeSnapshot(true));
    expect(getLeaf(after, "notes.spec.ts").experimental_reuseContext).toBe(
      true,
    );
    expect(GenerationSnapshot.diff(before, after)).toEqual({
      removed: [],
      changed: [
        {
          path: GroupPath.make(["notes"]),
          runtime: "Convex",
          functionNames: ["list"],
          experimental_reuseContext: true,
        },
      ],
    });
    expect(GenerationSnapshot.diff(after, before).changed).toEqual([
      {
        path: GroupPath.make(["notes"]),
        runtime: "Convex",
        functionNames: ["list"],
      },
    ]);
    expect(GenerationSnapshot.diff(before, makeSnapshot(false))).toEqual({
      removed: [],
      changed: [],
    });
  });

  test.each([
    {
      runtime: "Node",
      functionNames: ["run"],
      groups: {},
      experimental_reuseContext: true,
    },
    {
      runtime: "Convex",
      functionNames: ["experimental_reuseContext"],
      groups: {},
      experimental_reuseContext: true,
    },
  ])("rejects invalid reuse metadata: %j", (tree) => {
    const result = GenerationSnapshot.parse([["notes.spec.ts", tree]]);
    assert(result._tag === "Failure");
    expect(result.failure).toMatchObject({ reason: "InvalidContextReuse" });
  });

  test.each([
    { reason: "InvalidShape", entries: {} },
    {
      reason: "InvalidShape",
      entries: [
        ["notes.spec.ts", { runtime: "Other", functionNames: [], groups: {} }],
      ],
    },
    {
      reason: "InvalidShape",
      entries: [
        ["notes.spec.ts", { runtime: "Convex", functionNames: [], groups: [] }],
      ],
    },
    {
      reason: "InvalidShape",
      entries: [
        [
          "notes.spec.ts",
          { runtime: "Convex", functionNames: [""], groups: {} },
        ],
      ],
    },
    {
      reason: "InvalidShape",
      entries: [
        [
          "notes.spec.ts",
          {
            relativePath: "other.spec.ts",
            root: {
              path: { pathSegments: ["notes"] },
              runtime: "Convex",
              functionNames: [],
            },
            descendants: [],
          },
        ],
      ],
    },
    ...Array.map(
      [
        "",
        "notes.ts",
        ".spec.ts",
        "../notes.spec.ts",
        "/notes.spec.ts",
        "notes//child.spec.ts",
        "notes/./child.spec.ts",
        "notes/../child.spec.ts",
        "notes\\child.spec.ts",
        "C:notes.spec.ts",
        "C:/notes.spec.ts",
        "notes\0.spec.ts",
        "schema.spec.ts",
        "http.spec.ts",
        "crons.spec.ts",
        "default.spec.ts",
        "bad-dir/notes.spec.ts",
        "notes/bad-name.spec.ts",
        "notes/..spec.ts",
        "notes/...spec.ts",
      ],
      (path) => ({
        reason: "NoncanonicalPath",
        entries: [[path, metadataGroup()]],
      }),
    ),
    {
      reason: "DuplicateLeaf",
      entries: [
        ["notes.spec.ts", metadataGroup()],
        ["notes.spec.ts", metadataGroup()],
      ],
    },
    ...Array.map(["nested/name", "default", "not-an-identifier"], (name) => ({
      reason: "NoncanonicalFunctionNames",
      entries: [["notes.spec.ts", metadataGroup([name])]],
    })),
    {
      reason: "NoncanonicalFunctionNames",
      entries: [["notes.spec.ts", metadataGroup(["list", "list"])]],
    },
    ...Array.map(
      [
        "not-an-identifier",
        "nested/child",
        "../other",
        "missing/child",
        "",
        "default",
      ],
      (name) => ({
        reason: "NoncanonicalPath",
        entries: [
          ["notes.spec.ts", metadataGroup([], { [name]: metadataGroup() })],
        ],
      }),
    ),
    {
      reason: "NoncanonicalFunctionNames",
      entries: [
        [
          "notes.spec.ts",
          metadataGroup([], { child: metadataGroup(["list", "list"]) }),
        ],
      ],
    },
  ])("rejects malformed metadata: $reason", ({ reason, entries }) => {
    const result = GenerationSnapshot.parse(entries);
    assert(result._tag === "Failure");
    expect(result.failure).toMatchObject({ _tag: "SnapshotError", reason });
    expect(Result.isFailure(Schema.decodeUnknownResult(codec)(entries))).toBe(
      true,
    );
  });

  test("derives ancestry and deterministic outputs from the tree without changing inputs", () => {
    const tree = metadataGroup(["zebra", "alpha"], {
      zebra: metadataGroup(["z", "a"]),
      alpha: metadataGroup([], { child: metadataGroup(["run"]) }),
    });
    const snapshot = Result.getOrThrow(
      GenerationSnapshot.parse([["nested/notes.spec.ts", tree]]),
    );
    const groups = Array.map(
      GenerationSnapshot.plan(snapshot, []).changed,
      (group) => ({
        path: group.path.pathSegments,
        names: group.functionNames,
      }),
    );
    expect(
      Array.sort(
        groups,
        (left: (typeof groups)[number], right: (typeof groups)[number]) => {
          const compared = pipe(
            Array.join(left.path, "/"),
            Str.localeCompare(Array.join(right.path, "/")),
          );
          return compared < 0 ? -1 : compared > 0 ? 1 : 0;
        },
      ),
    ).toEqual([
      { path: ["nested", "notes"], names: ["alpha", "zebra"] },
      { path: ["nested", "notes", "alpha", "child"], names: ["run"] },
      { path: ["nested", "notes", "zebra"], names: ["a", "z"] },
    ]);
    expect(tree.functionNames).toEqual(["zebra", "alpha"]);
    expect(Rec.keys(tree.groups)).toEqual(["zebra", "alpha"]);
    expect(GenerationSnapshot.diff(snapshot, roundtrip(snapshot))).toEqual({
      removed: [],
      changed: [],
    });
  });

  test.each(["__proto__", "constructor", "prototype", "toString"])(
    "preserves special root and child name %s through JSON",
    (name) => {
      const tree = metadataGroup([], { [name]: metadataGroup(["run"]) });
      const snapshot = Result.getOrThrow(
        GenerationSnapshot.parse([[`${name}.spec.ts`, tree]]),
      );
      const decoded = roundtrip(snapshot);
      expect(
        Array.map(
          [...GenerationSnapshot.functionPaths(decoded)],
          FunctionPath.toString,
        ),
      ).toEqual([`${name}.${name}.run`]);
      expect(Rec.keys(getLeaf(decoded, `${name}.spec.ts`).groups)).toEqual([
        name,
      ]);
      expect(Object.getPrototypeOf(tree.groups)).toBe(Object.prototype);
    },
  );

  test("does not accept structural maps as proof of validity", () => {
    expectTypeOf<
      HashMap.HashMap<string, GenerationSnapshot.GroupTree>
    >().not.toExtend<GenerationSnapshot.GenerationSnapshot>();
    const structural = { leaves: HashMap.empty() };
    expect(Schema.is(GenerationSnapshot.GenerationSnapshot)(structural)).toBe(
      false,
    );
    expect(
      Result.isFailure(Schema.encodeUnknownResult(codec)(structural)),
    ).toBe(true);
  });
});

layer(Layer.merge(baseLayer, NodePath.layerPosix))(
  "GenerationSnapshot",
  (it) => {
    it.effect(
      "validates root changes against unchanged leaves without mutating the snapshot",
      () =>
        Effect.gen(function* () {
          const app = yield* loadLeaf(
            "app.spec.ts",
            GroupSpec.make().addFunction(query("notes")),
          );
          const notes = yield* loadLeaf(
            "notes.spec.ts",
            GroupSpec.make().addFunction(query("list")),
          );
          const before = fromLoadedLeaves([app, notes]);
          const root = yield* loadLeaf(
            "app.spec.ts",
            GroupSpec.make({ root: true }).addFunction(query("notes")),
          );
          const collision = GenerationSnapshot.update(before, [root]);
          assert(collision._tag === "Failure");
          expect(collision.failure).toMatchObject({
            _tag: "InvalidRootGroups",
            issue: { _tag: "RootNameCollision", name: "notes" },
          });
          expect(getLeaf(before, "app.spec.ts").root).toBeUndefined();
          const valid = yield* loadLeaf(
            "app.spec.ts",
            GroupSpec.make({ root: true }).addFunction(query("greet")),
          );
          const after = roundtrip(update(before, [valid]));
          expect(getLeaf(after, "app.spec.ts").root).toBe(true);
          expect(getLeaf(after, "notes.spec.ts").root).toBeUndefined();
          const second = yield* loadLeaf(
            "notes.spec.ts",
            GroupSpec.make({ root: true }).addFunction(query("list")),
          );
          const duplicate = GenerationSnapshot.update(after, [second]);
          assert(duplicate._tag === "Failure");
          expect(duplicate.failure).toMatchObject({
            _tag: "InvalidRootGroups",
            issue: { _tag: "MultipleRoots" },
          });
          expect(getLeaf(after, "notes.spec.ts").root).toBeUndefined();
        }),
    );

    it.effect(
      "summarizes an opted-in group without propagating the flag to children",
      () =>
        Effect.gen(function* () {
          const spec = GroupSpec.addGroupsAt(
            GroupSpec.make({ experimental_reuseContext: true }).addFunction(
              query("list"),
            ),
            { child: GroupSpec.make().addFunction(query("list")) },
          );
          const leaf = yield* loadLeaf("notes.spec.ts", spec);
          const snapshot = roundtrip(fromLoadedLeaves([leaf]));
          expect(
            getLeaf(snapshot, leaf.relativePath).experimental_reuseContext,
          ).toBe(true);
          expect(
            getLeaf(snapshot, leaf.relativePath).groups.child
              ?.experimental_reuseContext,
          ).toBeUndefined();
        }),
    );
    it.effect(
      "reports malformed loaded metadata as failures rather than throwing",
      () =>
        Effect.gen(function* () {
          const leaf = yield* loadLeaf("notes.spec.ts");
          const mismatch = GenerationSnapshot.fromLoadedLeaves([
            { ...leaf, relativePath: "../notes.spec.ts" },
          ]);
          assert(mismatch._tag === "Failure");
          expect(mismatch.failure).toMatchObject({
            _tag: "SnapshotError",
            reason: "NoncanonicalPath",
            relativePath: "../notes.spec.ts",
          });
          const result = GenerationSnapshot.fromLoadedLeaves([
            { ...leaf, relativePath: "" },
          ]);
          assert(result._tag === "Failure");
          expect(result.failure).toMatchObject({
            _tag: "SnapshotError",
            reason: "NoncanonicalPath",
          });
        }),
    );

    it.effect(
      "rejects duplicate loaded leaves without changing the previous snapshot",
      () =>
        Effect.gen(function* () {
          const leaf = yield* loadLeaf("notes.spec.ts");
          const snapshot = fromLoadedLeaves([leaf]);
          const duplicated = GenerationSnapshot.fromLoadedLeaves([leaf, leaf]);
          assert(duplicated._tag === "Failure");
          expect(duplicated.failure).toMatchObject({
            _tag: "SnapshotError",
            reason: "DuplicateLeaf",
            relativePath: "notes.spec.ts",
          });
          expect(GenerationSnapshot.update(snapshot, [leaf, leaf])).toEqual(
            duplicated,
          );
          expect(HashMap.size(snapshot.leaves)).toBe(1);
        }),
    );

    it.effect(
      "roundtrips only metadata without forcing schemas or changing inputs",
      () =>
        Effect.gen(function* () {
          const fields = vi.fn(() => Schema.Struct({ title: Schema.String }));
          const table = Table.make(fields)("notes");
          const args = vi.fn(() => ({ title: Schema.String }));
          const returns = vi.fn(() => table.Doc);
          const error = vi.fn(() => Schema.String);
          const fn = FunctionSpec.publicQuery({
            name: "zebra",
            args,
            returns,
            error,
          });
          const empty = GroupSpec.withName("originalEmpty", GroupSpec.make());
          const node = GroupSpec.withName(
            "originalNode",
            GroupSpec.makeNode(),
          ).addFunction(nodeAction("run"));
          const spec = GroupSpec.addGroupsAt(
            GroupSpec.withName("notTheFilesystemName", GroupSpec.make())
              .addFunction(fn)
              .addFunction(query("alpha")),
            { ["empty"]: GroupSpec.addGroupsAt(empty, { ["node"]: node }) },
          );
          const functions = spec.functions;
          const authoredGroups = spec.groups;
          const leaf = yield* loadLeaf("nested/notes.spec.ts", spec);
          const leaves = [leaf];
          const snapshot = fromLoadedLeaves(leaves);
          const summary = getLeaf(snapshot, leaf.relativePath);
          expect(summary.functionNames).toEqual(["zebra", "alpha"]);
          expect(summary.groups).toEqual({
            empty: {
              runtime: "Convex",
              functionNames: [],
              groups: {
                node: { runtime: "Node", functionNames: ["run"], groups: {} },
              },
            },
          });
          const encoded = yield* Schema.encodeEffect(codec)(snapshot);
          expect(encoded).toEqual([
            [
              "nested/notes.spec.ts",
              {
                runtime: "Convex",
                functionNames: ["zebra", "alpha"],
                groups: {
                  empty: {
                    runtime: "Convex",
                    functionNames: [],
                    groups: {
                      node: {
                        runtime: "Node",
                        functionNames: ["run"],
                        groups: {},
                      },
                    },
                  },
                },
              },
            ],
          ]);
          const decoded = roundtrip(snapshot);
          expect(
            Array.map(
              [...GenerationSnapshot.functionPaths(decoded)],
              FunctionPath.toString,
            ).sort(),
          ).toEqual([
            "nested.notes.alpha",
            "nested.notes.empty.node.run",
            "nested.notes.zebra",
          ]);
          expect(
            Schema.toEquivalence(FunctionPaths.FunctionPaths)(
              GenerationSnapshot.functionPaths(snapshot),
              GenerationSnapshot.functionPaths(decoded),
            ),
          ).toBe(true);
          expect(GenerationSnapshot.diff(snapshot, decoded)).toEqual({
            removed: [],
            changed: [],
          });
          expect(
            Schema.is(GenerationSnapshot.GenerationSnapshot)(decoded),
          ).toBe(true);
          expect(leaves).toEqual([leaf]);
          expect(leaf.spec).toBe(spec);
          expect(spec.functions).toBe(functions);
          expect(Rec.keys(functions)).toEqual(["zebra", "alpha"]);
          expect(spec.groups).toBe(authoredGroups);
          expect(spec.name).toBe("notTheFilesystemName");
          expect(empty.name).toBe("originalEmpty");
          expect(node.name).toBe("originalNode");
          for (const thunk of [fields, args, returns, error])
            expect(thunk).not.toHaveBeenCalled();
        }),
    );

    it.effect(
      "replaces supplied leaves while retaining untouched summaries and the prior snapshot",
      () =>
        Effect.gen(function* () {
          const first = yield* loadLeaf(
            "notes.spec.ts",
            GroupSpec.make().addFunction(query("list")),
          );
          const untouched = yield* loadLeaf(
            "other.spec.ts",
            GroupSpec.make().addFunction(query("get")),
          );
          const before = fromLoadedLeaves([first, untouched]);
          const replacement = yield* loadLeaf(
            "notes.spec.ts",
            GroupSpec.makeNode().addFunction(nodeAction("run")),
          );
          const added = yield* loadLeaf("renamed.spec.ts");
          const after = update(before, [replacement, added]);
          expect(HashMap.size(before.leaves)).toBe(2);
          expect(HashMap.size(after.leaves)).toBe(3);
          expect(getLeaf(after, "other.spec.ts")).toBe(
            getLeaf(before, "other.spec.ts"),
          );
          expect(getLeaf(before, "notes.spec.ts").functionNames).toEqual([
            "list",
          ]);
          expect(getLeaf(after, "notes.spec.ts")).toMatchObject({
            runtime: "Node",
            functionNames: ["run"],
          });
          expect(update(before, [])).toBe(before);
        }),
    );

    it.effect(
      "diffs generated modules for additions, removal of the last function, and leaf renames",
      () =>
        Effect.gen(function* () {
          const old = yield* loadLeaf(
            "old.spec.ts",
            GroupSpec.make().addFunction(query("list")),
          );
          const before = fromLoadedLeaves([old]);
          const renamed = yield* loadLeaf("renamed.spec.ts", old.spec);
          const after = fromLoadedLeaves([renamed]);
          expect(GenerationSnapshot.diff(before, after)).toEqual({
            removed: [GroupPath.make(["old"])],
            changed: [
              {
                path: GroupPath.make(["renamed"]),
                runtime: "Convex",
                functionNames: ["list"],
              },
            ],
          });
          const empty = fromLoadedLeaves([yield* loadLeaf("old.spec.ts")]);
          expect(GenerationSnapshot.diff(before, empty)).toEqual({
            removed: [GroupPath.make(["old"])],
            changed: [],
          });
          expect(GenerationSnapshot.diff(empty, before)).toEqual({
            removed: [],
            changed: [
              {
                path: GroupPath.make(["old"]),
                runtime: "Convex",
                functionNames: ["list"],
              },
            ],
          });
          expect(GenerationSnapshot.diff(before, fromLoadedLeaves([]))).toEqual(
            {
              removed: [GroupPath.make(["old"])],
              changed: [],
            },
          );
          expect(
            GenerationSnapshot.plan(after, [GroupPath.make(["old"])]),
          ).toEqual(GenerationSnapshot.diff(before, after));
        }),
    );

    it.effect(
      "ignores equivalent evaluations and empty groups but detects nested runtime and export changes",
      () =>
        Effect.gen(function* () {
          const original = GroupSpec.addGroupsAt(
            GroupSpec.make().addFunction(query("b")).addFunction(query("a")),
            { ["nested"]: GroupSpec.make().addFunction(query("run")) },
          );
          const before = fromLoadedLeaves([
            yield* loadLeaf("notes.spec.ts", original),
          ]);
          const equivalent = GroupSpec.addGroupsAt(
            GroupSpec.addGroupsAt(
              GroupSpec.make().addFunction(query("a")).addFunction(query("b")),
              { ["nested"]: GroupSpec.make().addFunction(query("run")) },
            ),
            { ["empty"]: GroupSpec.makeNode() },
          );
          const reevaluated = fromLoadedLeaves([
            yield* loadLeaf("notes.spec.ts", equivalent),
          ]);
          expect(
            GenerationSnapshot.diff(before, roundtrip(reevaluated)),
          ).toEqual({ removed: [], changed: [] });
          const changed = GroupSpec.addGroupsAt(
            GroupSpec.make()
              .addFunction(query("a"))
              .addFunction(query("renamed")),
            { ["nested"]: GroupSpec.makeNode().addFunction(nodeAction("run")) },
          );
          const after = update(before, [
            yield* loadLeaf("notes.spec.ts", changed),
          ]);
          const result = GenerationSnapshot.diff(before, after);
          expect(result.removed).toEqual([]);
          expect(result.changed).toHaveLength(2);
          expect(result.changed).toEqual(
            expect.arrayContaining([
              {
                path: GroupPath.make(["notes"]),
                runtime: "Convex",
                functionNames: ["a", "renamed"],
              },
              {
                path: GroupPath.make(["notes", "nested"]),
                runtime: "Node",
                functionNames: ["run"],
              },
            ]),
          );
        }),
    );
  },
);

for (const { name, pathLayer, sep } of [
  { name: "POSIX", pathLayer: NodePath.layerPosix, sep: "/" },
  { name: "Windows", pathLayer: NodePath.layerWin32, sep: "\\" },
]) {
  layer(Layer.merge(baseLayer, pathLayer))(
    `GenerationSnapshot collisions from ${name} paths`,
    (it) => {
      it.effect.each([
        { kind: "function", intermediate: false },
        { kind: "function", intermediate: true },
        { kind: "group", intermediate: false },
        { kind: "group", intermediate: true },
      ] as const)(
        "matches loaded-leaf $kind collisions with missing intermediate=$intermediate",
        ({ kind, intermediate }) =>
          Effect.gen(function* () {
            const parentSpec =
              kind === "function"
                ? GroupSpec.make().addFunction(query("archived"))
                : GroupSpec.addGroupsAt(GroupSpec.make(), {
                    ["archived"]: GroupSpec.makeNode(),
                  });
            const parent = yield* loadLeaf(
              Array.join(["nested", "notes.spec.ts"], sep),
              parentSpec,
            );
            const childSegments = intermediate
              ? ["nested", "notes", "archived", "deep.spec.ts"]
              : ["nested", "notes", "archived.spec.ts"];
            const child = yield* loadLeaf(
              Array.join(childSegments, sep),
              GroupSpec.makeNode().addFunction(nodeAction("run")),
            );
            const leaves = [child, parent];
            const expected = ParentChildNameCollisionError.make({
              parentSpecPath: "nested/notes.spec.ts",
              childSpecPath: Array.join(childSegments, "/"),
              collisionKind: kind,
              collisionName: "archived",
            });
            const actual = GenerationSnapshot.fromLoadedLeaves(leaves);
            assert(actual._tag === "Failure");
            expect(actual.failure).toEqual(expected);
            expect(actual.failure).toMatchObject({
              _tag: "ParentChildNameCollisionError",
              parentSpecPath: "nested/notes.spec.ts",
              childSpecPath: Array.join(childSegments, "/"),
              collisionKind: kind,
              collisionName: "archived",
            });
            const entries = Array.flatMap([child, parent], (leaf) => {
              const encoded = pipe(
                fromLoadedLeaves([leaf]),
                Schema.encodeResult(codec),
                Result.getOrThrow,
              );
              return pipe(
                encoded,
                Schema.decodeUnknownResult(Schema.Array(Schema.Json)),
                Result.getOrThrow,
              );
            });
            expect(GenerationSnapshot.parse(entries)).toEqual(actual);
            const decoded = Schema.decodeResult(codec)(entries);
            assert(decoded._tag === "Failure");
            expect(decoded.failure.message).toContain("nested/notes.spec.ts");
            expect(decoded.failure.message).toContain(
              Array.join(childSegments, "/"),
            );
          }),
      );

      it.effect(
        "checks updated leaves against untouched ancestors and descendants",
        () =>
          Effect.gen(function* () {
            const parent = yield* loadLeaf("notes.spec.ts");
            const child = yield* loadLeaf(
              Array.join(["notes", "archived", "deep.spec.ts"], sep),
            );
            const before = fromLoadedLeaves([parent, child]);
            const replacement = yield* loadLeaf(
              "notes.spec.ts",
              GroupSpec.makeNode().addFunction(nodeAction("archived")),
            );
            const result = GenerationSnapshot.update(before, [replacement]);
            assert(result._tag === "Failure");
            assert(result.failure._tag === "ParentChildNameCollisionError");
            expect(result.failure.collisionKind).toBe("function");
            expect(getLeaf(before, "notes.spec.ts").functionNames).toEqual([]);
            expect(
              Schema.is(GenerationSnapshot.GenerationSnapshot)(before),
            ).toBe(true);
            const parentOnly = fromLoadedLeaves([replacement]);
            expect(GenerationSnapshot.update(parentOnly, [child])).toEqual(
              result,
            );
          }),
      );

      it.effect(
        "accepts noncolliding roots, absent parents, and unrelated nested names",
        () =>
          Effect.gen(function* () {
            const parent = yield* loadLeaf(
              "notes.spec.ts",
              GroupSpec.addGroupsAt(
                GroupSpec.make().addFunction(query("list")),
                {
                  ["other"]: GroupSpec.addGroupsAt(GroupSpec.make(), {
                    ["archived"]: GroupSpec.make(),
                  }),
                },
              ),
            );
            const child = yield* loadLeaf(
              Array.join(["notes", "archived.spec.ts"], sep),
              GroupSpec.makeNode(),
            );
            const orphan = yield* loadLeaf(
              Array.join(["missing", "archived.spec.ts"], sep),
            );
            const leaves = [parent, child, orphan];
            const result = GenerationSnapshot.fromLoadedLeaves(leaves);
            assert(result._tag === "Success");
            expect(HashMap.size(roundtrip(result.success).leaves)).toBe(3);
          }),
      );
    },
  );
}
