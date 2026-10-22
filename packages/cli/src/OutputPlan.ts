import * as Array from "effect/Array";
import * as Data from "effect/Data";
import * as HashSet from "effect/HashSet";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as String from "effect/String";

export type Target = Data.TaggedEnum<{
  Registry: { readonly relativePath: string };
  ConvexModule: { readonly relativePath: string };
  ConvexBinding: {
    readonly relativePath:
      | "schema.ts"
      | "http.ts"
      | "crons.ts"
      | "auth.config.ts";
  };
  TableWrapper: { readonly relativePath: string };
  ScopedRef: { readonly relativePath: string };
  Binding: {
    readonly relativePath:
      | "id.ts"
      | "schema.ts"
      | "convexSchema.ts"
      | "docs.ts"
      | "services.ts"
      | "spec.ts"
      | "refs.ts"
      | "components.ts";
  };
}>;
export const Target = Data.taggedEnum<Target>();

export type Operation = Data.TaggedEnum<{
  Write: { readonly target: Target; readonly contents: string };
  Remove: { readonly target: Target };
}>;
export const Operation = Data.taggedEnum<Operation>();
export type Write = Extract<Operation, { readonly _tag: "Write" }>;

export class PlanError extends Schema.TaggedError<PlanError>()(
  "OutputPlanError",
  {
    namespace: Schema.Literals([
      "Registry",
      "ConvexModule",
      "ConvexBinding",
      "TableWrapper",
      "ScopedRef",
      "Binding",
    ]),
    relativePath: Schema.String,
    reason: Schema.Literals([
      "InvalidPath",
      "ReservedPath",
      "ConflictingTarget",
    ]),
  },
) {
  override get message(): string {
    return `Cannot plan ${this.namespace} output '${this.relativePath}': ${this.reason}`;
  }
}

const reservedConvexNames = HashSet.make(
  "schema.ts",
  "http.ts",
  "crons.ts",
  "auth.config.ts",
  "convex.config.ts",
);

const bindingNames = HashSet.make(
  "id.ts",
  "schema.ts",
  "convexSchema.ts",
  "docs.ts",
  "services.ts",
  "spec.ts",
  "refs.ts",
  "components.ts",
);

const convexBindingNames = HashSet.make(
  "schema.ts",
  "http.ts",
  "crons.ts",
  "auth.config.ts",
);

export const isOwnedConvexModule = (relativePath: string): boolean => {
  const segments = String.split(relativePath, "/");
  return (
    relativePath.endsWith(".ts") &&
    !HashSet.has(reservedConvexNames, Array.lastNonEmpty(segments)) &&
    segments.at(-2) !== "_generated"
  );
};

const validateTarget = (target: Target): Result.Result<Target, PlanError> => {
  const { relativePath } = target;
  const segments = String.split(relativePath, "/");
  const invalid =
    relativePath.includes("\\") ||
    relativePath.includes("\0") ||
    /^[A-Za-z]:/.test(relativePath) ||
    !relativePath.endsWith(".ts") ||
    Array.lastNonEmpty(segments) === ".ts" ||
    segments.some(
      (segment) => segment === "" || segment === "." || segment === "..",
    );
  if (
    invalid ||
    (target._tag === "ConvexModule" && !isOwnedConvexModule(relativePath)) ||
    (target._tag === "ConvexBinding" &&
      !HashSet.has(convexBindingNames, relativePath)) ||
    (target._tag === "Binding" && !HashSet.has(bindingNames, relativePath))
  ) {
    return Result.fail(
      new PlanError({
        namespace: target._tag,
        relativePath,
        reason: invalid ? "InvalidPath" : "ReservedPath",
      }),
    );
  }
  return Result.succeed(target);
};

class Plan {
  readonly #operations: ReadonlyArray<Operation>;

  private constructor(operations: ReadonlyArray<Operation>) {
    this.#operations = operations;
  }

  get operations(): ReadonlyArray<Operation> {
    return this.#operations;
  }

  static make(
    this: void,
    operations: ReadonlyArray<Operation>,
  ): Result.Result<OutputPlan, PlanError> {
    return Result.gen(function* () {
      let targets = HashSet.empty<string>();
      let directories = HashSet.empty<string>();
      for (const { target } of operations) {
        yield* validateTarget(target);
        const key = `${target._tag}/${target.relativePath}`;
        const segments = key.split("/");
        const parents = segments
          .slice(0, -1)
          .map((_, index) => segments.slice(0, index + 1).join("/"));
        if (
          HashSet.has(targets, key) ||
          HashSet.has(directories, key) ||
          parents.some((parent) => HashSet.has(targets, parent))
        ) {
          return yield* Result.fail(
            new PlanError({
              namespace: target._tag,
              relativePath: target.relativePath,
              reason: "ConflictingTarget",
            }),
          );
        }
        targets = HashSet.add(targets, key);
        directories = HashSet.union(directories, HashSet.fromIterable(parents));
      }
      return new Plan(operations);
    });
  }
}

export interface OutputPlan extends Plan {}
export const make = Plan.make;

export const diff = (
  desired: ReadonlyArray<Write>,
  owned: ReadonlyArray<Target>,
): Result.Result<OutputPlan, PlanError> =>
  Result.gen(function* () {
    yield* make(Array.map(owned, (target) => Operation.Remove({ target })));
    const desiredTargets = HashSet.fromIterable(
      Array.map(
        desired,
        ({ target }) => `${target._tag}/${target.relativePath}`,
      ),
    );
    return yield* make([
      ...desired,
      ...Array.filterMap(owned, (target) =>
        HashSet.has(desiredTargets, `${target._tag}/${target.relativePath}`)
          ? Result.fail(undefined)
          : Result.succeed(Operation.Remove({ target })),
      ),
    ]);
  });
