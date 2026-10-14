import { FunctionSpec, GroupSpec, Table } from "@confect/core";
import * as Bundler from "@confect/cli/Bundler";
import { ConfectDirectory } from "@confect/cli/ConfectDirectory";
import * as FunctionPaths from "@confect/cli/FunctionPaths";
import * as FunctionPath from "@confect/cli/FunctionPath";
import * as GenerationSnapshot from "@confect/cli/GenerationSnapshot";
import * as LeafModule from "@confect/cli/LeafModule";
import * as NodePath from "@effect/platform-node/NodePath";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import { assert, expect, layer } from "@effect/vitest";
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
) => Option.getOrThrow(HashMap.get(snapshot, path));

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

layer(Layer.merge(baseLayer, NodePath.layerPosix))(
  "GenerationSnapshot",
  (it) => {
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
          const empty = GroupSpec.makeAt("originalEmpty");
          const node = GroupSpec.makeNodeAt("originalNode").addFunction(
            nodeAction("run"),
          );
          const spec = GroupSpec.makeAt("notTheFilesystemName")
            .addFunction(fn)
            .addFunction(query("alpha"))
            .addGroupAt("empty", empty.addGroupAt("node", node));
          const functions = spec.functions;
          const authoredGroups = spec.groups;
          const leaf = yield* loadLeaf("nested/notes.spec.ts", spec);
          const leaves = [leaf];
          const snapshot = GenerationSnapshot.fromLoadedLeaves(leaves);
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
            GenerationSnapshot.validateNoParentChildNameCollisions(decoded),
          ).toEqual(Result.succeed(undefined));
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
          const before = GenerationSnapshot.fromLoadedLeaves([
            first,
            untouched,
          ]);
          const replacement = yield* loadLeaf(
            "notes.spec.ts",
            GroupSpec.makeNode().addFunction(nodeAction("run")),
          );
          const added = yield* loadLeaf("new.spec.ts");
          const after = GenerationSnapshot.update(before, [replacement, added]);
          expect(HashMap.size(before)).toBe(2);
          expect(HashMap.size(after)).toBe(3);
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
          expect(GenerationSnapshot.update(before, [])).toBe(before);
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
          const before = GenerationSnapshot.fromLoadedLeaves([old]);
          const renamed = yield* loadLeaf("new.spec.ts", old.spec);
          const after = GenerationSnapshot.fromLoadedLeaves([renamed]);
          expect(GenerationSnapshot.diff(before, after)).toEqual({
            removed: [getLeaf(before, "old.spec.ts").root],
            changed: [getLeaf(after, "new.spec.ts").root],
          });
          const empty = GenerationSnapshot.fromLoadedLeaves([
            yield* loadLeaf("old.spec.ts"),
          ]);
          expect(GenerationSnapshot.diff(before, empty)).toEqual({
            removed: [getLeaf(before, "old.spec.ts").root],
            changed: [],
          });
          expect(GenerationSnapshot.diff(empty, before)).toEqual({
            removed: [],
            changed: [getLeaf(before, "old.spec.ts").root],
          });
          expect(
            GenerationSnapshot.diff(
              before,
              GenerationSnapshot.fromLoadedLeaves([]),
            ),
          ).toEqual({
            removed: [getLeaf(before, "old.spec.ts").root],
            changed: [],
          });
        }),
    );

    it.effect(
      "ignores equivalent evaluations and empty groups but detects nested runtime and export changes",
      () =>
        Effect.gen(function* () {
          const original = GroupSpec.make()
            .addFunction(query("b"))
            .addFunction(query("a"))
            .addGroupAt("nested", GroupSpec.make().addFunction(query("run")));
          const before = GenerationSnapshot.fromLoadedLeaves([
            yield* loadLeaf("notes.spec.ts", original),
          ]);
          const equivalent = GroupSpec.make()
            .addFunction(query("a"))
            .addFunction(query("b"))
            .addGroupAt("nested", GroupSpec.make().addFunction(query("run")))
            .addGroupAt("empty", GroupSpec.makeNode());
          const reevaluated = GenerationSnapshot.fromLoadedLeaves([
            yield* loadLeaf("notes.spec.ts", equivalent),
          ]);
          expect(
            GenerationSnapshot.diff(before, roundtrip(reevaluated)),
          ).toEqual({ removed: [], changed: [] });
          const changed = GroupSpec.make()
            .addFunction(query("a"))
            .addFunction(query("renamed"))
            .addGroupAt(
              "nested",
              GroupSpec.makeNode().addFunction(nodeAction("run")),
            );
          const after = GenerationSnapshot.update(before, [
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
                : GroupSpec.make().addGroupAt("archived", GroupSpec.makeNode());
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
            const expected = yield* Effect.result(
              LeafModule.validateNoParentChildNameCollisions(leaves),
            );
            const snapshot = roundtrip(
              GenerationSnapshot.fromLoadedLeaves(leaves),
            );
            const actual =
              GenerationSnapshot.validateNoParentChildNameCollisions(snapshot);
            assert(Result.isFailure(actual));
            assert(Result.isFailure(expected));
            expect(actual.failure).toEqual(expected.failure);
            expect(actual.failure).toMatchObject({
              _tag: "ParentChildNameCollisionError",
              parentSpecPath: "nested/notes.spec.ts",
              childSpecPath: childSegments.join("/"),
              collisionKind: kind,
              collisionName: "archived",
            });
            expect(HashMap.has(snapshot, child.relativePath)).toBe(true);
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
            const before = GenerationSnapshot.fromLoadedLeaves([parent, child]);
            const replacement = yield* loadLeaf(
              "notes.spec.ts",
              GroupSpec.makeNode().addFunction(nodeAction("archived")),
            );
            const after = GenerationSnapshot.update(before, [replacement]);
            const result =
              GenerationSnapshot.validateNoParentChildNameCollisions(after);
            assert(Result.isFailure(result));
            expect(result.failure.collisionKind).toBe("function");
            expect(
              Result.isSuccess(
                GenerationSnapshot.validateNoParentChildNameCollisions(before),
              ),
            ).toBe(true);
            const parentOnly = GenerationSnapshot.fromLoadedLeaves([
              replacement,
            ]);
            expect(
              GenerationSnapshot.validateNoParentChildNameCollisions(
                GenerationSnapshot.update(parentOnly, [child]),
              ),
            ).toEqual(result);
          }),
      );

      it.effect(
        "accepts noncolliding roots, absent parents, and unrelated nested names",
        () =>
          Effect.gen(function* () {
            const parent = yield* loadLeaf(
              "notes.spec.ts",
              GroupSpec.make()
                .addFunction(query("list"))
                .addGroupAt(
                  "other",
                  GroupSpec.make().addGroupAt("archived", GroupSpec.make()),
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
            const expected = yield* Effect.result(
              LeafModule.validateNoParentChildNameCollisions(leaves),
            );
            expect(
              GenerationSnapshot.validateNoParentChildNameCollisions(
                GenerationSnapshot.fromLoadedLeaves(leaves),
              ),
            ).toEqual(expected);
            expect(Result.isSuccess(expected)).toBe(true);
          }),
      );
    },
  );
}
