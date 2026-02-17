import type { Types } from "effect";
import { Array, pipe, Record } from "effect";
import type * as FunctionSpec from "./FunctionSpec";
import * as GroupSpec from "./GroupSpec";
import * as Ref from "./Ref";
import type * as Spec from "./Spec";

export type Refs<
  ConvexSpec extends Spec.AnyWithPropsWithRuntime<"Convex">,
  NodeSpec extends Spec.AnyWithPropsWithRuntime<"Node"> = never,
  Predicate extends Ref.Any = Ref.Any,
> = Types.Simplify<
  OmitEmpty<
    Helper<
      | Spec.Groups<ConvexSpec>
      | (NodeSpec extends never
          ? never
          : GroupSpec.GroupSpec<
              "Node",
              "node",
              never,
              NodeSpec["groups"][keyof NodeSpec["groups"]]
            >),
      Predicate
    >
  >
>;

type GroupRefs<
  Group extends GroupSpec.AnyWithProps,
  Predicate extends Ref.Any,
> = Types.Simplify<
  OmitEmpty<Helper<GroupSpec.Groups<Group>, Predicate>> &
    FilteredFunctions<GroupSpec.Functions<Group>, Predicate>
>;

type OmitEmpty<T> = {
  [K in keyof T as keyof T[K] extends never ? never : K]: T[K];
};

type FilteredFunctions<
  Functions extends FunctionSpec.AnyWithProps,
  Predicate extends Ref.Any,
> = {
  [Name in FunctionSpec.Name<Functions> as FunctionSpec.WithName<
    Functions,
    Name
  > extends infer F extends FunctionSpec.AnyWithProps
    ? Ref.FromFunctionSpec<F> extends Predicate
      ? Name
      : never
    : never]: FunctionSpec.WithName<Functions, Name> extends infer F extends
    FunctionSpec.AnyWithProps
    ? Ref.FromFunctionSpec<F>
    : never;
};

type Helper<
  Groups extends GroupSpec.AnyWithProps,
  Predicate extends Ref.Any,
> = {
  [GroupName in GroupSpec.Name<Groups>]: GroupSpec.WithName<
    Groups,
    GroupName
  > extends infer Group extends GroupSpec.AnyWithProps
    ? GroupRefs<Group, Predicate>
    : never;
};

type Any =
  | {
      readonly [key: string]: Any;
    }
  | Ref.Any;

export const make = <
  ConvexSpec extends Spec.AnyWithPropsWithRuntime<"Convex">,
  NodeSpec extends Spec.AnyWithPropsWithRuntime<"Node"> = never,
>(
  convexSpec: ConvexSpec,
  nodeSpec?: NodeSpec,
): {
  public: Refs<ConvexSpec, NodeSpec, Ref.AnyPublic>;
  internal: Refs<ConvexSpec, NodeSpec, Ref.AnyInternal>;
} => {
  const nodeGroup = nodeSpec
    ? Array.reduce(
        Record.values(nodeSpec.groups),
        GroupSpec.makeNode("node"),
        (nodeGroupSpec, group) => nodeGroupSpec.addGroup(group),
      )
    : null;

  const groups = nodeGroup
    ? { ...convexSpec.groups, node: nodeGroup }
    : convexSpec.groups;
  const refs = makeHelper(groups);
  return {
    public: refs as Refs<ConvexSpec, NodeSpec, Ref.AnyPublic>,
    internal: refs as Refs<ConvexSpec, NodeSpec, Ref.AnyInternal>,
  };
};

const makeHelper = (
  groups: Record.ReadonlyRecord<string, GroupSpec.Any>,
  groupPath: string | null = null,
): Any =>
  pipe(
    groups as Record.ReadonlyRecord<string, GroupSpec.AnyWithProps>,
    Record.map((group) => {
      const currentGroupPath = groupPath
        ? `${groupPath}/${group.name}`
        : group.name;

      return Record.union(
        makeHelper(group.groups, currentGroupPath),
        Record.map(group.functions, (function_) =>
          Ref.make(`${currentGroupPath}:${function_.name}`, function_),
        ),
        (_subGroup, _function) => {
          throw new Error(
            `Group and function at same level have same name ('${Ref.getConvexFunctionName(_function)}')`,
          );
        },
      );
    }),
  );
