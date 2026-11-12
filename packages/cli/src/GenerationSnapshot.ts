import { type GroupSpec, Identifier, Spec } from "@confect/core";
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
  experimental_reuseContext: Schema.optionalKey(Schema.Boolean),
  functionNames: Schema.Array(Schema.NonEmptyString),
});
export type GroupSummary = typeof GroupSummary.Type;

export interface GroupTree {
  readonly runtime: "Convex" | "Node";
  readonly root?: boolean;
  readonly experimental_reuseContext?: boolean;
  readonly functionNames: ReadonlyArray<string>;
  readonly groups: { readonly [name: string]: GroupTree };
}

export const GroupTree: Schema.Codec<GroupTree> = Schema.Struct({
  runtime: GroupSummary.fields.runtime,
  root: Schema.optionalKey(Schema.Boolean),
  experimental_reuseContext: GroupSummary.fields.experimental_reuseContext,
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
  ): Result.Result<
    GenerationSnapshot,
    ParentChildNameCollisionError | Spec.InvalidRootGroups
  > {
    return Result.gen(function* () {
      yield* parseNoParentChildNameCollisions(leaves);
      const entries: Array<Spec.RootGroupEntry> = [];
      const visit = (path: ReadonlyArray<string>, tree: GroupTree): void => {
        entries.push({
          path,
          root: tree.root === true,
          functionNames: tree.functionNames,
        });
        for (const [name, child] of Record.toEntries(tree.groups)) {
          visit([...path, name], child);
        }
      };
      for (const [path, tree] of leaves) {
        visit(rootPath(path).pathSegments, tree);
      }
      yield* Spec.validateRootGroups(entries).pipe(
        Result.mapError((issue) => Spec.InvalidRootGroups.make({ issue })),
      );
      return new Snapshot(leaves);
    });
  }

  get leaves(): HashMap.HashMap<SpecModulePath.SpecModulePath, GroupTree> {
    return this.#leaves;
  }
}

export interface GenerationSnapshot extends Snapshot {}

const Entries = Schema.Array(Schema.Tuple([Schema.String, GroupTree]));
const CanonicalSpecPath = SpecModulePath.SpecModulePath.check(
  Schema.makeFilter((path) => !String.includes("\\")(path)),
);
const rootPath = (path: SpecModulePath.SpecModulePath) =>
  GroupPath.make(String.split(String.slice(0, -".spec.ts".length)(path), "/"));

const parseTree = (
  relativePath: SpecModulePath.SpecModulePath,
  path: GroupPath.GroupPath,
  tree: GroupTree,
): Result.Result<GroupTree, SnapshotError> =>
  Result.gen(function* () {
    if (
      tree.experimental_reuseContext === true &&
      (tree.runtime === "Node" ||
        tree.functionNames.includes("experimental_reuseContext"))
    ) {
      return yield* Result.fail(
        SnapshotError.make({
          reason: "InvalidContextReuse",
          relativePath,
          pathSegments: path.pathSegments,
        }),
      );
    }
    yield* Result.try({
      try: () => {
        for (const name of tree.functionNames)
          Identifier.validateConfectFunctionIdentifier(name);
      },
      catch: () =>
        SnapshotError.make({
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
        SnapshotError.make({
          reason: "NoncanonicalFunctionNames",
          relativePath,
          pathSegments: path.pathSegments,
        }),
      );
    }
    for (const [name, child] of Record.toEntries(tree.groups)) {
      yield* Result.try({
        try: () => Identifier.validateConfectFunctionIdentifier(name),
        catch: () =>
          SnapshotError.make({
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
  SnapshotError | ParentChildNameCollisionError | Spec.InvalidRootGroups
> =>
  Result.gen(function* () {
    let leaves = HashMap.empty<SpecModulePath.SpecModulePath, GroupTree>();
    for (const [key, tree] of entries) {
      const relativePath = yield* Schema.decodeResult(CanonicalSpecPath)(
        key,
      ).pipe(
        Result.mapError((cause) =>
          SnapshotError.make({
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
          SnapshotError.make({
            reason: "NoncanonicalPath",
            relativePath,
            pathSegments: path.pathSegments,
          }),
      });
      if (HashMap.has(leaves, relativePath)) {
        return yield* Result.fail(
          SnapshotError.make({
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
  SnapshotError | ParentChildNameCollisionError | Spec.InvalidRootGroups
> =>
  Schema.decodeUnknownResult(Entries)(input).pipe(
    Result.mapError((cause) =>
      SnapshotError.make({
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
                      InvalidRootGroups: ({ issue }) =>
                        Spec.formatRootGroupsError(issue),
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
  ...(group.root ? { root: true } : {}),
  ...(group.experimental_reuseContext
    ? { experimental_reuseContext: true }
    : {}),
  functionNames: Record.keys(group.functions),
  groups: Record.map(group.groups, summarize),
});

export const update = (
  snapshot: GenerationSnapshot,
  leaves: ReadonlyArray<LoadedLeafModule>,
): Result.Result<
  GenerationSnapshot,
  SnapshotError | ParentChildNameCollisionError | Spec.InvalidRootGroups
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
  SnapshotError | ParentChildNameCollisionError | Spec.InvalidRootGroups
> =>
  parse(
    Array.map(
      leaves,
      (leaf) =>
        [
          String.replaceAll("\\", "/")(leaf.relativePath),
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
      ...(tree.experimental_reuseContext === true
        ? { experimental_reuseContext: true }
        : {}),
      functionNames: Array.sort(tree.functionNames, String.Order),
    },
    ...Array.flatMap(
      Array.sort(Record.keys(tree.groups), String.Order),
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
        Array.map(group.functionNames, (name) =>
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
    removed: Array.filter(
      Array.fromIterable(existing),
      (path) => !HashMap.has(current, path),
    ),
    changed: current.pipe(HashMap.values, Array.fromIterable),
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
        `${Array.join(segments.slice(0, depth), "/")}.spec.ts`,
      );
      const parent = HashMap.get(leaves, parentPath);
      if (Option.isNone(parent)) continue;
      const collisionName = segments[depth]!;
      const collisionKind = parent.value.functionNames.includes(collisionName)
        ? "function"
        : Record.has(parent.value.groups, collisionName)
          ? "group"
          : undefined;
      if (collisionKind !== undefined) {
        return Result.fail(
          ParentChildNameCollisionError.make({
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
