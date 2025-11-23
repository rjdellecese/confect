import type { Schema, Types } from "effect";
import { pipe, Record } from "effect";
import type * as ConfectApiFunction from "./ConfectApiFunction";
import type * as ConfectApiGroup from "./ConfectApiGroup";
import type * as ConfectApiSpec from "./ConfectApiSpec";

export type ConfectApiRefs<
  Spec extends ConfectApiSpec.ConfectApiSpec.AnyWithProps,
> = Types.Simplify<Helper<ConfectApiSpec.ConfectApiSpec.Groups<Spec>>>;

type Helper<Groups extends ConfectApiGroup.ConfectApiGroup.Any> = {
  [GroupName in ConfectApiGroup.ConfectApiGroup.Name<Groups>]: ConfectApiGroup.ConfectApiGroup.WithName<
    Groups,
    GroupName
  > extends infer Group extends ConfectApiGroup.ConfectApiGroup.AnyWithProps
    ? ConfectApiGroup.ConfectApiGroup.Groups<Group> extends infer SubGroups extends
        ConfectApiGroup.ConfectApiGroup.AnyWithProps
      ? Types.Simplify<
          Helper<SubGroups> & {
            [FunctionName in ConfectApiFunction.ConfectApiFunction.Name<
              ConfectApiGroup.ConfectApiGroup.Functions<Group>
            >]: ConfectApiFunction.ConfectApiFunction.WithName<
              ConfectApiGroup.ConfectApiGroup.Functions<Group>,
              FunctionName
            > extends infer Function extends
              ConfectApiFunction.ConfectApiFunction.AnyWithProps
              ? ConfectApiRef<
                  ConfectApiFunction.ConfectApiFunction.GetFunctionType<Function>,
                  ConfectApiFunction.ConfectApiFunction.GetFunctionVisibility<Function>,
                  ConfectApiFunction.ConfectApiFunction.Args<Function>,
                  ConfectApiFunction.ConfectApiFunction.Returns<Function>
                >
              : never;
          }
        >
      : never
    : never;
};

export declare namespace ConfectApiRefs {
  export interface AnyWithProps
    extends ConfectApiRefs<ConfectApiSpec.ConfectApiSpec.AnyWithProps> {}
}

const HiddenFunctionKey = Symbol.for("@rjdellecese/confect/HiddenFunctionKey");
type HiddenFunctionKey = typeof HiddenFunctionKey;
type HiddenFunction<Ref extends ConfectApiRef.Any> =
  ConfectApiFunction.ConfectApiFunction<
    ConfectApiRef.FunctionType<Ref>,
    ConfectApiRef.FunctionVisibility<Ref>,
    string,
    ConfectApiRef.Args<Ref>,
    ConfectApiRef.Returns<Ref>
  >;

export const getFunction = <
  FunctionType extends ConfectApiFunction.ConfectApiFunction.FunctionType,
  FunctionVisibility extends
    ConfectApiFunction.ConfectApiFunction.FunctionVisibility,
  Args extends Schema.Schema.AnyNoContext,
  Returns extends Schema.Schema.AnyNoContext,
  Ref extends ConfectApiRef<FunctionType, FunctionVisibility, Args, Returns>,
>(
  ref: Ref,
): HiddenFunction<Ref> => (ref as any)[HiddenFunctionKey];

const HiddenConvexFunctionNameKey = Symbol.for(
  "@rjdellecese/confect/HiddenConvexFunctionNameKey",
);
type HiddenConvexFunctionNameKey = typeof HiddenConvexFunctionNameKey;
type HiddenConvexFunctionName = string;

export const getConvexFunctionName = <
  FunctionType extends ConfectApiFunction.ConfectApiFunction.FunctionType,
  FunctionVisibility extends
    ConfectApiFunction.ConfectApiFunction.FunctionVisibility,
  Args extends Schema.Schema.AnyNoContext,
  Returns extends Schema.Schema.AnyNoContext,
>(
  ref: ConfectApiRef<FunctionType, FunctionVisibility, Args, Returns>,
): HiddenConvexFunctionName => (ref as any)[HiddenConvexFunctionNameKey];

export interface ConfectApiRef<
  _FunctionType extends ConfectApiFunction.ConfectApiFunction.FunctionType,
  _FunctionVisibility extends
    ConfectApiFunction.ConfectApiFunction.FunctionVisibility,
  _Args extends Schema.Schema.AnyNoContext,
  _Returns extends Schema.Schema.AnyNoContext,
> {
  readonly _FunctionType?: _FunctionType;
  readonly _FunctionVisibility?: _FunctionVisibility;
  readonly _Args?: _Args;
  readonly _Returns?: _Returns;
}

export declare namespace ConfectApiRef {
  export interface Any extends ConfectApiRef<any, any, any, any> {}

  export interface AnyPublicQuery
    extends ConfectApiRef<
      "Query",
      "Public",
      Schema.Schema.AnyNoContext,
      Schema.Schema.AnyNoContext
    > {}

  export interface AnyPublicMutation
    extends ConfectApiRef<
      "Mutation",
      "Public",
      Schema.Schema.AnyNoContext,
      Schema.Schema.AnyNoContext
    > {}

  export interface AnyPublicAction
    extends ConfectApiRef<
      "Action",
      "Public",
      Schema.Schema.AnyNoContext,
      Schema.Schema.AnyNoContext
    > {}

  export type FunctionType<Ref> =
    Ref extends ConfectApiRef<
      infer FunctionType,
      infer _FunctionVisibility,
      infer _Args,
      infer _Returns
    >
      ? FunctionType
      : never;

  export type FunctionVisibility<Ref> =
    Ref extends ConfectApiRef<
      infer _FunctionType,
      infer FunctionVisibility,
      infer _Args,
      infer _Returns
    >
      ? FunctionVisibility
      : never;

  export type Args<Ref> =
    Ref extends ConfectApiRef<
      infer _FunctionType,
      infer _FunctionVisibility,
      infer Args,
      infer _Returns
    >
      ? Args
      : never;

  export type Returns<Ref> =
    Ref extends ConfectApiRef<
      infer _FunctionType,
      infer _FunctionVisibility,
      infer _Args,
      infer Returns
    >
      ? Returns
      : never;
}

const makeRef = <
  FunctionType extends ConfectApiFunction.ConfectApiFunction.FunctionType,
  FunctionVisibility extends
    ConfectApiFunction.ConfectApiFunction.FunctionVisibility,
  Args extends Schema.Schema.AnyNoContext,
  Returns extends Schema.Schema.AnyNoContext,
>(
  /**
   * This is a Convex "function name" of the format "myGroupDir/myGroupMod:myFunc".
   */
  convexFunctionName: string,
  function_: ConfectApiFunction.ConfectApiFunction<
    FunctionType,
    FunctionVisibility,
    string,
    Args,
    Returns
  >,
): ConfectApiRef<FunctionType, FunctionVisibility, Args, Returns> =>
  ({
    [HiddenFunctionKey]: function_,
    [HiddenConvexFunctionNameKey]: convexFunctionName,
  }) as ConfectApiRef<FunctionType, FunctionVisibility, Args, Returns>;

export const make = <Spec extends ConfectApiSpec.ConfectApiSpec.AnyWithProps>(
  spec: Spec,
): ConfectApiRefs<Spec> =>
  makeHelper(spec.groups, "confect") as ConfectApiRefs<Spec>;

const makeHelper = (
  groups: Record.ReadonlyRecord<
    string,
    ConfectApiGroup.ConfectApiGroup.AnyWithProps
  >,
  groupPath: string | null,
): ConfectApiRefs.AnyWithProps =>
  pipe(
    groups,
    Record.map((group) => {
      const currentGroupPath = groupPath
        ? `${groupPath}/${group.name}`
        : group.name;

      return Record.union(
        makeHelper(group.groups, currentGroupPath),
        Record.map(group.functions, (function_) =>
          makeRef(`${currentGroupPath}:${function_.name}`, function_),
        ),
        (_subGroup, _function) => {
          throw new Error(
            `Group and function at same level have same name ('${getConvexFunctionName(_function)}')`,
          );
        },
      );
    }),
  );
