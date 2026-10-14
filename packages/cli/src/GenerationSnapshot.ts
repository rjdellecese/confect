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
import { SnapshotError } from "./SnapshotError";

export { SnapshotError } from "./SnapshotError";

export const GroupSummary = Schema.Struct({
  path: GroupPath.GroupPath,
  runtime: Schema.Literals(["Convex", "Node"]),
  functionNames: Schema.Array(Schema.NonEmptyString),
});
export interface GroupSummary extends Schema.Schema.Type<typeof GroupSummary> {}

export const LeafSummary = Schema.Struct({
  relativePath: Schema.String,
  root: GroupSummary,
  descendants: Schema.Array(GroupSummary),
});
export interface LeafSummary extends Schema.Schema.Type<typeof LeafSummary> {}

class Snapshot {
  readonly #leaves: HashMap.HashMap<string, LeafSummary>;

  private constructor(leaves: HashMap.HashMap<string, LeafSummary>) {
    this.#leaves = leaves;
  }

  static parseLeaves(
    leaves: HashMap.HashMap<string, LeafSummary>,
  ): Result.Result<GenerationSnapshot, ParentChildNameCollisionError> {
    return Result.map(
      parseNoParentChildNameCollisions(leaves),
      (parsed) => new Snapshot(parsed),
    );
  }

  get leaves(): HashMap.HashMap<string, LeafSummary> {
    return this.#leaves;
  }
}

export interface GenerationSnapshot extends Snapshot {}

const Entries = Schema.Array(Schema.Tuple([Schema.String, LeafSummary]));
const comparePaths = Array.makeOrder(String.Order);
const canonicalSegment = (segment: string): boolean =>
  segment.length > 0 &&
  segment !== "." &&
  segment !== ".." &&
  !/[\\/\0]/.test(segment);

const parseLeaf = (key: string, leaf: LeafSummary) =>
  Result.gen(function* () {
    const root = leaf.root.path.pathSegments;
    const failure = (
      reason: SnapshotError["reason"],
      pathSegments: ReadonlyArray<string> = root,
    ) =>
      Result.fail(
        new SnapshotError({ reason, relativePath: key, pathSegments }),
      );
    if (key !== leaf.relativePath) return yield* failure("KeyMismatch");
    if (!Array.every(root, canonicalSegment) || /^[a-z]:/i.test(root[0])) {
      return yield* failure("NoncanonicalPath");
    }
    if (key !== `${Array.join(root, "/")}.spec.ts`)
      return yield* failure("RootMismatch");
    const initial: Result.Result<
      HashSet.HashSet<string>,
      SnapshotError
    > = Result.succeed(HashSet.make(Array.join(root, "/")));
    yield* Array.reduce(leaf.descendants, initial, (result, group, index) =>
      Result.flatMap(result, (seen) => {
        const segments = group.path.pathSegments;
        if (!Array.every(segments, canonicalSegment))
          return failure("NoncanonicalPath", segments);
        if (
          segments.length <= root.length ||
          !Array.every(root, (segment, depth) => segment === segments[depth])
        ) {
          return failure("DescendantOutsideRoot", segments);
        }
        const path = Array.join(segments, "/");
        if (HashSet.has(seen, path)) return failure("DuplicateGroup", segments);
        const previous = leaf.descendants[index - 1];
        if (
          previous !== undefined &&
          comparePaths(previous.path.pathSegments, segments) >= 0
        ) {
          return failure("NoncanonicalDescendants", segments);
        }
        if (!HashSet.has(seen, Array.join(Array.dropRight(segments, 1), "/"))) {
          return failure("MissingParent", segments);
        }
        return Result.try({
          try: () => {
            Identifier.validateConfectFunctionIdentifier(
              segments[segments.length - 1]!,
            );
            return HashSet.add(seen, path);
          },
          catch: () =>
            new SnapshotError({
              reason: "NoncanonicalPath",
              relativePath: key,
              pathSegments: segments,
            }),
        });
      }),
    );
    for (const group of [leaf.root, ...leaf.descendants]) {
      if (
        !Array.every(
          group.functionNames,
          (name, index) =>
            name.length > 0 &&
            (index === 0 ||
              String.Order(group.functionNames[index - 1]!, name) < 0),
        )
      )
        return yield* failure(
          "NoncanonicalFunctionNames",
          group.path.pathSegments,
        );
      yield* Result.try({
        try: () => {
          for (const name of group.functionNames)
            Identifier.validateConfectFunctionIdentifier(name);
          return group;
        },
        catch: () =>
          new SnapshotError({
            reason: "NoncanonicalFunctionNames",
            relativePath: key,
            pathSegments: group.path.pathSegments,
          }),
      });
    }
    return leaf;
  });

const fromEntries = (
  entries: ReadonlyArray<readonly [string, LeafSummary]>,
): Result.Result<
  GenerationSnapshot,
  SnapshotError | ParentChildNameCollisionError
> =>
  Result.gen(function* () {
    const initial: Result.Result<
      HashMap.HashMap<string, LeafSummary>,
      SnapshotError
    > = Result.succeed(HashMap.empty());
    const parsed = yield* Array.reduce(
      entries,
      initial,
      (result, [key, leaf]) =>
        Result.flatMap(result, (leaves) => {
          if (HashMap.has(leaves, key)) {
            return Result.fail(
              new SnapshotError({
                reason: "DuplicateLeaf",
                relativePath: key,
                pathSegments: leaf.root.path.pathSegments,
              }),
            );
          }
          return Result.map(parseLeaf(key, leaf), () =>
            HashMap.set(leaves, key, leaf),
          );
        }),
    );
    return yield* Snapshot.parseLeaves(parsed);
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

const summarizeGroup = (
  pathSegments: readonly [string, ...string[]],
  group: GroupSpec.AnyWithProps,
): typeof GroupSummary.Encoded => ({
  path: { pathSegments },
  runtime: group.runtime,
  functionNames: Array.sort(Record.keys(group.functions), String.Order),
});

const summarizeDescendants = (
  pathSegments: readonly [string, ...string[]],
  group: GroupSpec.AnyWithProps,
): ReadonlyArray<typeof GroupSummary.Encoded> => {
  const names = Array.sort(Record.keys(group.groups), String.Order);
  return Array.flatMap(names, (name) => {
    const child = group.groups[name]!;
    const childPath: readonly [string, ...string[]] = [...pathSegments, name];
    return [
      summarizeGroup(childPath, child),
      ...summarizeDescendants(childPath, child),
    ];
  });
};

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
    const next = HashMap.union(snapshot.leaves, replacement.leaves);
    return yield* Snapshot.parseLeaves(next);
  });

export const fromLoadedLeaves = (
  leaves: ReadonlyArray<LoadedLeafModule>,
): Result.Result<
  GenerationSnapshot,
  SnapshotError | ParentChildNameCollisionError
> =>
  parse(
    Array.map(leaves, (leaf) => {
      const relativePath = leaf.relativePath.replaceAll("\\", "/");
      return [
        relativePath,
        {
          relativePath,
          root: summarizeGroup(leaf.pathSegments, leaf.spec),
          descendants: summarizeDescendants(leaf.pathSegments, leaf.spec),
        },
      ] as const;
    }),
  );

const groups = (snapshot: GenerationSnapshot): ReadonlyArray<GroupSummary> =>
  Array.flatMap(Array.fromIterable(HashMap.values(snapshot.leaves)), (leaf) => [
    leaf.root,
    ...leaf.descendants,
  ]);

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

const equivalentGroup = Schema.toEquivalence(GroupSummary);

export const diff = (
  before: GenerationSnapshot,
  after: GenerationSnapshot,
): {
  readonly removed: ReadonlyArray<GroupSummary>;
  readonly changed: ReadonlyArray<GroupSummary>;
} => {
  const previous = generatedGroups(before);
  const current = generatedGroups(after);
  return {
    removed: Array.filter(
      HashMap.values(previous),
      (group) => !HashMap.has(current, group.path),
    ),
    changed: Array.filter(HashMap.values(current), (group) => {
      const old = HashMap.get(previous, group.path);
      return Option.isNone(old) || !equivalentGroup(old.value, group);
    }),
  };
};

const parseNoParentChildNameCollisions = (
  leaves: HashMap.HashMap<string, LeafSummary>,
): Result.Result<
  HashMap.HashMap<string, LeafSummary>,
  ParentChildNameCollisionError
> => {
  const leavesBySegments = HashMap.fromIterable(
    Array.map(
      Array.fromIterable(HashMap.values(leaves)),
      (leaf) => [leaf.root.path.pathSegments.join("/"), leaf] as const,
    ),
  );
  for (const child of HashMap.values(leaves)) {
    const segments = child.root.path.pathSegments;
    for (let depth = 1; depth < segments.length; depth++) {
      const parent = HashMap.get(
        leavesBySegments,
        segments.slice(0, depth).join("/"),
      );
      if (Option.isNone(parent)) continue;
      const collisionName = segments[depth]!;
      const collisionKind = parent.value.root.functionNames.includes(
        collisionName,
      )
        ? "function"
        : parent.value.descendants.some(
              (group) =>
                group.path.pathSegments.length === depth + 1 &&
                group.path.pathSegments[depth] === collisionName,
            )
          ? "group"
          : undefined;
      if (collisionKind !== undefined) {
        return Result.fail(
          new ParentChildNameCollisionError({
            parentSpecPath: parent.value.relativePath.replaceAll("\\", "/"),
            childSpecPath: child.relativePath.replaceAll("\\", "/"),
            collisionName,
            collisionKind,
          }),
        );
      }
    }
  }
  return Result.succeed(leaves);
};
