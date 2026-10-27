import { type GroupSpec, Identifier } from "@confect/core";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as HashMap from "effect/HashMap";
import * as HashSet from "effect/HashSet";
import * as Match from "effect/Match";
import * as Option from "effect/Option";
import * as Record from "effect/Record";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as SchemaGetter from "effect/SchemaGetter";
import * as SchemaIssue from "effect/SchemaIssue";
import * as String from "effect/String";
import { ParentChildNameCollisionError } from "./CodegenError";
import * as FunctionPath from "./FunctionPath";
import * as FunctionPaths from "./FunctionPaths";
import * as GroupPath from "./GroupPath";
import type { LoadedLeafModule } from "./LeafModule";
import * as SpecModulePath from "./SpecModulePath";
import { SnapshotError } from "./SnapshotError";

export { SnapshotError } from "./SnapshotError";

export const GroupSummary = Schema.Struct({
  path: GroupPath.GroupPath,
  runtime: Schema.Literals(["Convex", "Node"]),
  functionNames: Schema.Array(Schema.NonEmptyString),
});
export interface GroupSummary extends Schema.Schema.Type<typeof GroupSummary> {}

export interface GroupTree {
  readonly runtime: "Convex" | "Node";
  readonly functionNames: ReadonlyArray<string>;
  readonly groups: { readonly [name: string]: GroupTree };
}

export const GroupTree: Schema.Codec<GroupTree> = Schema.Struct({
  runtime: GroupSummary.fields.runtime,
  functionNames: GroupSummary.fields.functionNames,
  groups: Schema.Record(
    Schema.String,
    Schema.suspend(() => GroupTree),
  ),
});

class Snapshot {
  readonly #leaves: HashMap.HashMap<SpecModulePath.SpecModulePath, GroupTree>;

  private constructor(
    leaves: HashMap.HashMap<SpecModulePath.SpecModulePath, GroupTree>,
  ) {
    this.#leaves = leaves;
  }

  static parseLeaves(
    leaves: HashMap.HashMap<SpecModulePath.SpecModulePath, GroupTree>,
  ): Result.Result<GenerationSnapshot, ParentChildNameCollisionError> {
    return Result.map(
      parseNoParentChildNameCollisions(leaves),
      (parsed) => new Snapshot(parsed),
    );
  }

  get leaves(): HashMap.HashMap<SpecModulePath.SpecModulePath, GroupTree> {
    return this.#leaves;
  }
}

export interface GenerationSnapshot extends Snapshot {}

const Entries = Schema.Array(Schema.Tuple([Schema.String, GroupTree]));
const CanonicalSpecPath = SpecModulePath.SpecModulePath.check(
  Schema.makeFilter((path) => !path.includes("\\")),
);
const rootPath = (path: SpecModulePath.SpecModulePath) =>
  GroupPath.make(String.split(path.slice(0, -".spec.ts".length), "/"));

const parseTree = (
  relativePath: SpecModulePath.SpecModulePath,
  path: GroupPath.GroupPath,
  tree: GroupTree,
): Result.Result<GroupTree, SnapshotError> =>
  Result.gen(function* () {
    yield* Result.try({
      try: () => {
        for (const name of tree.functionNames)
          Identifier.validateConfectFunctionIdentifier(name);
      },
      catch: () =>
        new SnapshotError({
          reason: "NoncanonicalFunctionNames",
          relativePath,
          pathSegments: path.pathSegments,
        }),
    });
    if (
      HashSet.size(HashSet.fromIterable(tree.functionNames)) !==
      tree.functionNames.length
    ) {
      return yield* Result.fail(
        new SnapshotError({
          reason: "NoncanonicalFunctionNames",
          relativePath,
          pathSegments: path.pathSegments,
        }),
      );
    }
    for (const [name, child] of Object.entries(tree.groups)) {
      yield* Result.try({
        try: () => Identifier.validateConfectFunctionIdentifier(name),
        catch: () =>
          new SnapshotError({
            reason: "NoncanonicalPath",
            relativePath,
            pathSegments: [...path.pathSegments, name],
          }),
      });
      yield* parseTree(relativePath, GroupPath.append(path, name), child);
    }
    return tree;
  });

const fromEntries = (
  entries: ReadonlyArray<readonly [string, GroupTree]>,
): Result.Result<
  GenerationSnapshot,
  SnapshotError | ParentChildNameCollisionError
> =>
  Result.gen(function* () {
    let leaves = HashMap.empty<SpecModulePath.SpecModulePath, GroupTree>();
    for (const [key, tree] of entries) {
      const relativePath = yield* Schema.decodeResult(CanonicalSpecPath)(
        key,
      ).pipe(
        Result.mapError(
          (cause) =>
            new SnapshotError({
              reason: "NoncanonicalPath",
              relativePath: key,
              pathSegments: [],
              cause,
            }),
        ),
      );
      const path = rootPath(relativePath);
      yield* Result.try({
        try: () => {
          for (const segment of path.pathSegments)
            Identifier.validateConfectFunctionIdentifier(segment);
        },
        catch: () =>
          new SnapshotError({
            reason: "NoncanonicalPath",
            relativePath,
            pathSegments: path.pathSegments,
          }),
      });
      if (HashMap.has(leaves, relativePath)) {
        return yield* Result.fail(
          new SnapshotError({
            reason: "DuplicateLeaf",
            relativePath,
            pathSegments: path.pathSegments,
          }),
        );
      }
      const parsed = yield* parseTree(relativePath, path, tree);
      leaves = HashMap.set(leaves, relativePath, parsed);
    }
    return yield* Snapshot.parseLeaves(leaves);
  });

export const parse = (
  input: unknown,
): Result.Result<
  GenerationSnapshot,
  SnapshotError | ParentChildNameCollisionError
> =>
  Schema.decodeUnknownResult(Entries)(input).pipe(
    Result.mapError(
      (cause) =>
        new SnapshotError({
          reason: "InvalidShape",
          relativePath: "",
          pathSegments: [],
          cause,
        }),
    ),
    Result.flatMap(fromEntries),
  );

export const GenerationSnapshot = Entries.pipe(
  Schema.decodeTo(
    Schema.declare<GenerationSnapshot>((input) => input instanceof Snapshot),
    {
      decode: SchemaGetter.transformEffect((entries, options) =>
        Effect.fromResult(fromEntries(entries)).pipe(
          Effect.mapError(
            (error) =>
              new SchemaIssue.InvalidValue(
                {
                  message: Match.value(error).pipe(
                    Match.tagsExhaustive({
                      SnapshotError: (failure) => failure.message,
                      ParentChildNameCollisionError: (failure) =>
                        `${failure.parentSpecPath} declares a ${failure.collisionKind} named ${failure.collisionName} that collides with ${failure.childSpecPath}`,
                    }),
                  ),
                },
                entries,
                options,
              ),
          ),
        ),
      ),
      encode: SchemaGetter.transform((snapshot) =>
        HashMap.toEntries(snapshot.leaves),
      ),
    },
  ),
);

const summarize = (group: GroupSpec.AnyWithProps): GroupTree => ({
  runtime: group.runtime,
  functionNames: Record.keys(group.functions),
  groups: Record.map(group.groups, summarize),
});

export const update = (
  snapshot: GenerationSnapshot,
  leaves: ReadonlyArray<LoadedLeafModule>,
): Result.Result<
  GenerationSnapshot,
  SnapshotError | ParentChildNameCollisionError
> =>
  Result.gen(function* () {
    if (leaves.length === 0) return snapshot;
    const replacement = yield* fromLoadedLeaves(leaves);
    return yield* Snapshot.parseLeaves(
      HashMap.union(snapshot.leaves, replacement.leaves),
    );
  });

export const fromLoadedLeaves = (
  leaves: ReadonlyArray<LoadedLeafModule>,
): Result.Result<
  GenerationSnapshot,
  SnapshotError | ParentChildNameCollisionError
> =>
  parse(
    leaves.map(
      (leaf) =>
        [
          leaf.relativePath.replaceAll("\\", "/"),
          summarize(leaf.spec),
        ] as const,
    ),
  );

const groups = (snapshot: GenerationSnapshot): ReadonlyArray<GroupSummary> => {
  const visit = (
    path: GroupPath.GroupPath,
    tree: GroupTree,
  ): ReadonlyArray<GroupSummary> => [
    {
      path,
      runtime: tree.runtime,
      functionNames: Array.sort(tree.functionNames, String.Order),
    },
    ...Array.flatMap(
      Array.sort(Object.keys(tree.groups), String.Order),
      (name: string) => visit(GroupPath.append(path, name), tree.groups[name]!),
    ),
  ];
  return Array.flatMap(Array.fromIterable(snapshot.leaves), ([path, tree]) =>
    visit(rootPath(path), tree),
  );
};

export const functionPaths = (
  snapshot: GenerationSnapshot,
): FunctionPaths.FunctionPaths =>
  FunctionPaths.FunctionPaths.make(
    HashSet.fromIterable(
      Array.flatMap(groups(snapshot), (group) =>
        group.functionNames.map((name) =>
          FunctionPath.FunctionPath.make({ groupPath: group.path, name }),
        ),
      ),
    ),
  );

const generatedGroups = (snapshot: GenerationSnapshot) =>
  HashMap.fromIterable(
    Array.filterMap(groups(snapshot), (group) =>
      group.functionNames.length === 0
        ? Result.fail(undefined)
        : Result.succeed([group.path, group] as const),
    ),
  );

export interface ModulePlan {
  readonly removed: ReadonlyArray<GroupPath.GroupPath>;
  readonly changed: ReadonlyArray<GroupSummary>;
}

export const plan = (
  snapshot: GenerationSnapshot,
  existing: Iterable<GroupPath.GroupPath>,
): ModulePlan => {
  const current = generatedGroups(snapshot);
  return {
    removed: Array.fromIterable(existing).filter(
      (path) => !HashMap.has(current, path),
    ),
    changed: Array.fromIterable(HashMap.values(current)),
  };
};

const equivalentGroup = Schema.toEquivalence(GroupSummary);

export const diff = (
  before: GenerationSnapshot,
  after: GenerationSnapshot,
): ModulePlan => {
  const previous = generatedGroups(before);
  const current = generatedGroups(after);
  return {
    removed: Array.filter(
      HashMap.keys(previous),
      (path) => !HashMap.has(current, path),
    ),
    changed: Array.filter(HashMap.values(current), (group) => {
      const old = HashMap.get(previous, group.path);
      return Option.isNone(old) || !equivalentGroup(old.value, group);
    }),
  };
};

const parseNoParentChildNameCollisions = (
  leaves: HashMap.HashMap<SpecModulePath.SpecModulePath, GroupTree>,
): Result.Result<
  HashMap.HashMap<SpecModulePath.SpecModulePath, GroupTree>,
  ParentChildNameCollisionError
> => {
  for (const childPath of HashMap.keys(leaves)) {
    const segments = rootPath(childPath).pathSegments;
    for (let depth = 1; depth < segments.length; depth++) {
      const parentPath = SpecModulePath.SpecModulePath.make(
        `${segments.slice(0, depth).join("/")}.spec.ts`,
      );
      const parent = HashMap.get(leaves, parentPath);
      if (Option.isNone(parent)) continue;
      const collisionName = segments[depth]!;
      const collisionKind = parent.value.functionNames.includes(collisionName)
        ? "function"
        : Object.hasOwn(parent.value.groups, collisionName)
          ? "group"
          : undefined;
      if (collisionKind !== undefined) {
        return Result.fail(
          new ParentChildNameCollisionError({
            parentSpecPath: parentPath,
            childSpecPath: childPath,
            collisionName,
            collisionKind,
          }),
        );
      }
    }
  }
  return Result.succeed(leaves);
};
