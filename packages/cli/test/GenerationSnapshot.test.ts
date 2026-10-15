import { FunctionSpec, GroupSpec, Table } from "@confect/core";
import * as Bundler from "@confect/cli/Bundler";
import { ConfectDirectory } from "@confect/cli/ConfectDirectory";
import { ParentChildNameCollisionError } from "@confect/cli/CodegenError";
import * as FunctionPaths from "@confect/cli/FunctionPaths";
import * as FunctionPath from "@confect/cli/FunctionPath";
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
  return yield* LeafModule.loadSpec(
    yield* LeafModule.toLeafModule(relativePath),
  );
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
  Option.getOrThrow(HashMap.get(snapshot.leaves, path.replaceAll("\\", "/")));

const fromLoadedLeaves = (leaves: ReadonlyArray<LeafModule.LoadedLeafModule>) =>
  Result.getOrThrow(GenerationSnapshot.fromLoadedLeaves(leaves));
const update = (
  snapshot: GenerationSnapshot.GenerationSnapshot,
  leaves: ReadonlyArray<LeafModule.LoadedLeafModule>,
) => Result.getOrThrow(GenerationSnapshot.update(snapshot, leaves));

const codec = Schema.toCodecJson(GenerationSnapshot.GenerationSnapshot);
const roundtrip = (snapshot: GenerationSnapshot.GenerationSnapshot) =>
  Schema.decodeUnknownSync(codec)(
    JSON.parse(JSON.stringify(Schema.encodeSync(codec)(snapshot))),
  );

const baseLayer = Layer.merge(
  NodeFileSystem.layer,
  Layer.succeed(ConfectDirectory, {
    get: Effect.succeed("/confect"),
  }),
);

const metadataGroup = (
  pathSegments: ReadonlyArray<string>,
  functionNames: ReadonlyArray<string> = [],
) => ({ path: { pathSegments }, runtime: "Convex", functionNames });

const metadataLeaf = (
  root = metadataGroup(["notes"]),
  descendants: ReadonlyArray<ReturnType<typeof metadataGroup>> = [],
) => ({ relativePath: "notes.spec.ts", root, descendants });

describe("GenerationSnapshot parsing", () => {
  test.each([
    {
      reason: "NoncanonicalFunctionNames",
      entries: [
        [
          "notes.spec.ts",
          metadataLeaf(metadataGroup(["notes"], ["nested/name"])),
        ],
      ],
    },
    {
      reason: "NoncanonicalFunctionNames",
      entries: [
        ["notes.spec.ts", metadataLeaf(metadataGroup(["notes"], ["default"]))],
      ],
    },
    {
      reason: "NoncanonicalPath",
      entries: [
        [
          "notes.spec.ts",
          metadataLeaf(metadataGroup(["notes"]), [
            metadataGroup(["notes", "not-an-identifier"]),
          ]),
        ],
      ],
    },
    { reason: "InvalidShape", entries: {} },
    {
      reason: "InvalidShape",
      entries: [
        [
          "notes.spec.ts",
          metadataLeaf({ ...metadataGroup(["notes"]), runtime: "Other" }),
        ],
      ],
    },
    {
      reason: "InvalidShape",
      entries: [["notes.spec.ts", metadataLeaf(metadataGroup([]))]],
    },
    {
      reason: "InvalidShape",
      entries: [
        ["notes.spec.ts", metadataLeaf(metadataGroup(["notes"], [""]))],
      ],
    },
    { reason: "KeyMismatch", entries: [["other.spec.ts", metadataLeaf()]] },
    {
      reason: "RootMismatch",
      entries: [["notes.spec.ts", metadataLeaf(metadataGroup(["other"]))]],
    },
    {
      reason: "RootMismatch",
      entries: [
        [
          "notes\\nested.spec.ts",
          {
            ...metadataLeaf(metadataGroup(["notes", "nested"])),
            relativePath: "notes\\nested.spec.ts",
          },
        ],
      ],
    },
    {
      reason: "NoncanonicalPath",
      entries: [
        [
          "../notes.spec.ts",
          {
            ...metadataLeaf(metadataGroup(["..", "notes"])),
            relativePath: "../notes.spec.ts",
          },
        ],
      ],
    },
    {
      reason: "NoncanonicalPath",
      entries: [["notes.spec.ts", metadataLeaf(metadataGroup(["C:notes"]))]],
    },
    {
      reason: "NoncanonicalPath",
      entries: [
        [
          "notes.spec.ts",
          metadataLeaf(metadataGroup(["notes"]), [
            metadataGroup(["notes", "nested/child"]),
          ]),
        ],
      ],
    },
    {
      reason: "DuplicateLeaf",
      entries: [
        ["notes.spec.ts", metadataLeaf()],
        ["notes.spec.ts", metadataLeaf()],
      ],
    },
    {
      reason: "DuplicateGroup",
      entries: [
        [
          "notes.spec.ts",
          metadataLeaf(metadataGroup(["notes"]), [
            metadataGroup(["notes", "child"]),
            metadataGroup(["notes", "child"]),
          ]),
        ],
      ],
    },
    {
      reason: "DescendantOutsideRoot",
      entries: [
        [
          "notes.spec.ts",
          metadataLeaf(metadataGroup(["notes"]), [
            metadataGroup(["other", "child"]),
          ]),
        ],
      ],
    },
    {
      reason: "DescendantOutsideRoot",
      entries: [
        [
          "notes.spec.ts",
          metadataLeaf(metadataGroup(["notes"]), [metadataGroup(["notes"])]),
        ],
      ],
    },
    {
      reason: "MissingParent",
      entries: [
        [
          "notes.spec.ts",
          metadataLeaf(metadataGroup(["notes"]), [
            metadataGroup(["notes", "missing", "child"]),
          ]),
        ],
      ],
    },
    {
      reason: "NoncanonicalDescendants",
      entries: [
        [
          "notes.spec.ts",
          metadataLeaf(metadataGroup(["notes"]), [
            metadataGroup(["notes", "zebra"]),
            metadataGroup(["notes", "alpha"]),
          ]),
        ],
      ],
    },
    {
      reason: "NoncanonicalFunctionNames",
      entries: [
        [
          "notes.spec.ts",
          metadataLeaf(metadataGroup(["notes"], ["list", "list"])),
        ],
      ],
    },
    {
      reason: "NoncanonicalFunctionNames",
      entries: [
        [
          "notes.spec.ts",
          metadataLeaf(metadataGroup(["notes"], ["zebra", "alpha"])),
        ],
      ],
    },
    {
      reason: "NoncanonicalFunctionNames",
      entries: [
        [
          "notes.spec.ts",
          metadataLeaf(metadataGroup(["notes"]), [
            metadataGroup(["notes", "child"], ["zebra", "alpha"]),
          ]),
        ],
      ],
    },
  ])("rejects malformed metadata: $reason", ({ reason, entries }) => {
    const result = GenerationSnapshot.parse(entries);
    assert(Result.isFailure(result));
    expect(result.failure).toMatchObject({ _tag: "SnapshotError", reason });
    expect(Result.isFailure(Schema.decodeResult(codec)(entries))).toBe(true);
  });

  test("does not accept structural maps as proof of validity", () => {
    expectTypeOf<
      HashMap.HashMap<string, GenerationSnapshot.LeafSummary>
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
      "reports malformed loaded metadata as failures rather than throwing",
      () =>
        Effect.gen(function* () {
          const leaf = yield* loadLeaf("notes.spec.ts");
          const mismatch = GenerationSnapshot.fromLoadedLeaves([
            { ...leaf, pathSegments: ["other"] },
          ]);
          assert(Result.isFailure(mismatch));
          expect(mismatch.failure).toMatchObject({
            _tag: "SnapshotError",
            reason: "RootMismatch",
            relativePath: "notes.spec.ts",
          });
          const result = GenerationSnapshot.fromLoadedLeaves([
            { ...leaf, pathSegments: [""] },
          ]);
          assert(Result.isFailure(result));
          expect(result.failure).toMatchObject({
            _tag: "SnapshotError",
            reason: "InvalidShape",
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
          assert(Result.isFailure(duplicated));
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
          expect(summary.root.path.pathSegments).toEqual(["nested", "notes"]);
          expect(summary.root.functionNames).toEqual(["alpha", "zebra"]);
          expect(
            summary.descendants.map((group) => ({
              path: group.path.pathSegments,
              runtime: group.runtime,
              names: group.functionNames,
            })),
          ).toEqual([
            {
              path: ["nested", "notes", "empty"],
              runtime: "Convex",
              names: [],
            },
            {
              path: ["nested", "notes", "empty", "node"],
              runtime: "Node",
              names: ["run"],
            },
          ]);
          const encoded = yield* Schema.encodeEffect(codec)(snapshot);
          expect(encoded).toEqual([
            [
              "nested/notes.spec.ts",
              {
                relativePath: "nested/notes.spec.ts",
                root: {
                  path: { pathSegments: ["nested", "notes"] },
                  runtime: "Convex",
                  functionNames: ["alpha", "zebra"],
                },
                descendants: [
                  {
                    path: { pathSegments: ["nested", "notes", "empty"] },
                    runtime: "Convex",
                    functionNames: [],
                  },
                  {
                    path: {
                      pathSegments: ["nested", "notes", "empty", "node"],
                    },
                    runtime: "Node",
                    functionNames: ["run"],
                  },
                ],
              },
            ],
          ]);
          const decoded = roundtrip(snapshot);
          expect(
            [...GenerationSnapshot.functionPaths(decoded)]
              .map(FunctionPath.toString)
              .sort(),
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
          expect(Object.keys(functions)).toEqual(["zebra", "alpha"]);
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
          expect(getLeaf(before, "notes.spec.ts").root.functionNames).toEqual([
            "list",
          ]);
          expect(getLeaf(after, "notes.spec.ts").root).toMatchObject({
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
            removed: [getLeaf(before, "old.spec.ts").root.path],
            changed: [getLeaf(after, "renamed.spec.ts").root],
          });
          const empty = fromLoadedLeaves([yield* loadLeaf("old.spec.ts")]);
          expect(GenerationSnapshot.diff(before, empty)).toEqual({
            removed: [getLeaf(before, "old.spec.ts").root.path],
            changed: [],
          });
          expect(GenerationSnapshot.diff(empty, before)).toEqual({
            removed: [],
            changed: [getLeaf(before, "old.spec.ts").root],
          });
          expect(GenerationSnapshot.diff(before, fromLoadedLeaves([]))).toEqual(
            {
              removed: [getLeaf(before, "old.spec.ts").root.path],
              changed: [],
            },
          );
          expect(
            GenerationSnapshot.plan(after, [
              getLeaf(before, "old.spec.ts").root.path,
            ]),
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
              getLeaf(after, "notes.spec.ts").root,
              getLeaf(after, "notes.spec.ts").descendants[0],
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
              ["nested", "notes.spec.ts"].join(sep),
              parentSpec,
            );
            const childSegments = intermediate
              ? ["nested", "notes", "archived", "deep.spec.ts"]
              : ["nested", "notes", "archived.spec.ts"];
            const child = yield* loadLeaf(
              childSegments.join(sep),
              GroupSpec.makeNode().addFunction(nodeAction("run")),
            );
            const leaves = [child, parent];
            const expected = new ParentChildNameCollisionError({
              parentSpecPath: "nested/notes.spec.ts",
              childSpecPath: childSegments.join("/"),
              collisionKind: kind,
              collisionName: "archived",
            });
            const actual = GenerationSnapshot.fromLoadedLeaves(leaves);
            assert(Result.isFailure(actual));
            expect(actual.failure).toEqual(expected);
            expect(actual.failure).toMatchObject({
              _tag: "ParentChildNameCollisionError",
              parentSpecPath: "nested/notes.spec.ts",
              childSpecPath: childSegments.join("/"),
              collisionKind: kind,
              collisionName: "archived",
            });
            const entries = [child, parent].flatMap((leaf) =>
              Schema.encodeSync(codec)(fromLoadedLeaves([leaf])),
            );
            expect(GenerationSnapshot.parse(entries)).toEqual(actual);
            const decoded = Schema.decodeResult(codec)(entries);
            assert(Result.isFailure(decoded));
            expect(decoded.failure.message).toContain("nested/notes.spec.ts");
            expect(decoded.failure.message).toContain(childSegments.join("/"));
          }),
      );

      it.effect(
        "checks updated leaves against untouched ancestors and descendants",
        () =>
          Effect.gen(function* () {
            const parent = yield* loadLeaf("notes.spec.ts");
            const child = yield* loadLeaf(
              ["notes", "archived", "deep.spec.ts"].join(sep),
            );
            const before = fromLoadedLeaves([parent, child]);
            const replacement = yield* loadLeaf(
              "notes.spec.ts",
              GroupSpec.makeNode().addFunction(nodeAction("archived")),
            );
            const result = GenerationSnapshot.update(before, [replacement]);
            assert(Result.isFailure(result));
            assert(result.failure._tag === "ParentChildNameCollisionError");
            expect(result.failure.collisionKind).toBe("function");
            expect(getLeaf(before, "notes.spec.ts").root.functionNames).toEqual(
              [],
            );
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
              ["notes", "archived.spec.ts"].join(sep),
              GroupSpec.makeNode(),
            );
            const orphan = yield* loadLeaf(
              ["missing", "archived.spec.ts"].join(sep),
            );
            const leaves = [parent, child, orphan];
            const result = GenerationSnapshot.fromLoadedLeaves(leaves);
            assert(Result.isSuccess(result));
            expect(HashMap.size(roundtrip(result.success).leaves)).toBe(3);
          }),
      );
    },
  );
}
