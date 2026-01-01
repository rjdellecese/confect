import type { Schema, Types } from "effect";
import { pipe, Record } from "effect";
import type * as FunctionSpec from "./FunctionSpec";
import type * as GroupSpec from "./GroupSpec";
import type * as Spec from "./Spec";

export type Refs<Spec_ extends Spec.Spec.AnyWithProps> = Types.Simplify<
  Helper<Spec.Spec.Groups<Spec_>>
>;

type Helper<Groups extends GroupSpec.GroupSpec.AnyWithProps> = {
  [GroupName in GroupSpec.GroupSpec.Name<Groups>]: GroupSpec.GroupSpec.WithName<
    Groups,
    GroupName
  > extends infer Group extends GroupSpec.GroupSpec.AnyWithProps
    ? GroupSpec.GroupSpec.Groups<Group> extends infer SubGroups extends
        GroupSpec.GroupSpec.AnyWithProps
      ? Types.Simplify<
          Helper<SubGroups> & {
            [FunctionName in FunctionSpec.FunctionSpec.Name<
              GroupSpec.GroupSpec.Functions<Group>
            >]: FunctionSpec.FunctionSpec.WithName<
              GroupSpec.GroupSpec.Functions<Group>,
              FunctionName
            > extends infer Function extends
              FunctionSpec.FunctionSpec.AnyWithProps
              ? Ref<
                  FunctionSpec.FunctionSpec.GetFunctionType<Function>,
                  FunctionSpec.FunctionSpec.GetFunctionVisibility<Function>,
                  FunctionSpec.FunctionSpec.Args<Function>,
                  FunctionSpec.FunctionSpec.Returns<Function>
                >
              : never;
          }
        >
      : never
    : never;
};

type FilterRefs<Refs_, Predicate> = Types.Simplify<{
  [K in keyof Refs_ as Refs_[K] extends Predicate
    ? K
    : Refs_[K] extends Ref.Any
      ? never
      : FilterRefs<Refs_[K], Predicate> extends Record<string, never>
        ? never
        : K]: Refs_[K] extends Predicate
    ? Refs_[K]
    : FilterRefs<Refs_[K], Predicate>;
}>;

export const justInternal = <Refs_ extends Refs.AnyWithProps>(
  refs: Refs_,
): FilterRefs<Refs_, Ref.AnyInternal> => refs as any;

export const justPublic = <Refs_ extends Refs.AnyWithProps>(
  refs: Refs_,
): FilterRefs<Refs_, Ref.AnyPublic> => refs as any;

export declare namespace Refs {
  export type AnyWithProps =
    | {
        readonly [key: string]: Refs.AnyWithProps;
      }
    | Ref.Any;
}

const HiddenFunctionKey = "@rjdellecese/confect/api/HiddenFunctionKey";
type HiddenFunctionKey = typeof HiddenFunctionKey;
type HiddenFunction<Ref_ extends Ref.Any> = FunctionSpec.FunctionSpec<
  Ref.FunctionType<Ref_>,
  Ref.FunctionVisibility<Ref_>,
  string,
  Ref.Args<Ref_>,
  Ref.Returns<Ref_>
>;

export const getFunction = <
  FunctionType extends FunctionSpec.FunctionSpec.FunctionType,
  FunctionVisibility extends FunctionSpec.FunctionSpec.FunctionVisibility,
  Args extends Schema.Schema.AnyNoContext,
  Returns extends Schema.Schema.AnyNoContext,
  Ref_ extends Ref<FunctionType, FunctionVisibility, Args, Returns>,
>(
  ref: Ref_,
): HiddenFunction<Ref_> => (ref as any)[HiddenFunctionKey];

const HiddenConvexFunctionNameKey =
  "@rjdellecese/confect/api/HiddenConvexFunctionNameKey";
type HiddenConvexFunctionNameKey = typeof HiddenConvexFunctionNameKey;
type HiddenConvexFunctionName = string;

export const getConvexFunctionName = <
  FunctionType extends FunctionSpec.FunctionSpec.FunctionType,
  FunctionVisibility extends FunctionSpec.FunctionSpec.FunctionVisibility,
  Args extends Schema.Schema.AnyNoContext,
  Returns extends Schema.Schema.AnyNoContext,
>(
  ref: Ref<FunctionType, FunctionVisibility, Args, Returns>,
): HiddenConvexFunctionName => (ref as any)[HiddenConvexFunctionNameKey];

export interface Ref<
  _FunctionType extends FunctionSpec.FunctionSpec.FunctionType,
  _FunctionVisibility extends FunctionSpec.FunctionSpec.FunctionVisibility,
  _Args extends Schema.Schema.AnyNoContext,
  _Returns extends Schema.Schema.AnyNoContext,
> {
  readonly _FunctionType?: _FunctionType;
  readonly _FunctionVisibility?: _FunctionVisibility;
  readonly _Args?: _Args;
  readonly _Returns?: _Returns;
}

export declare namespace Ref {
  export interface Any extends Ref<any, any, any, any> {}

  export interface AnyInternal extends Ref<any, "Internal", any, any> {}

  export interface AnyPublic extends Ref<any, "Public", any, any> {}

  export interface AnyQuery
    extends Ref<
      "Query",
      FunctionSpec.FunctionSpec.FunctionVisibility,
      Schema.Schema.AnyNoContext,
      Schema.Schema.AnyNoContext
    > {}

  export interface AnyMutation
    extends Ref<
      "Query",
      FunctionSpec.FunctionSpec.FunctionVisibility,
      Schema.Schema.AnyNoContext,
      Schema.Schema.AnyNoContext
    > {}

  export interface AnyAction
    extends Ref<
      "Action",
      FunctionSpec.FunctionSpec.FunctionVisibility,
      Schema.Schema.AnyNoContext,
      Schema.Schema.AnyNoContext
    > {}

  export interface AnyPublicQuery
    extends Ref<
      "Query",
      "Public",
      Schema.Schema.AnyNoContext,
      Schema.Schema.AnyNoContext
    > {}

  export interface AnyPublicMutation
    extends Ref<
      "Mutation",
      "Public",
      Schema.Schema.AnyNoContext,
      Schema.Schema.AnyNoContext
    > {}

  export interface AnyPublicAction
    extends Ref<
      "Action",
      "Public",
      Schema.Schema.AnyNoContext,
      Schema.Schema.AnyNoContext
    > {}

  export type FunctionType<Ref_> =
    Ref_ extends Ref<
      infer FunctionType_,
      infer _FunctionVisibility,
      infer _Args,
      infer _Returns
    >
      ? FunctionType_
      : never;

  export type FunctionVisibility<Ref_> =
    Ref_ extends Ref<
      infer _FunctionType,
      infer FunctionVisibility_,
      infer _Args,
      infer _Returns
    >
      ? FunctionVisibility_
      : never;

  export type Args<Ref_> =
    Ref_ extends Ref<
      infer _FunctionType,
      infer _FunctionVisibility,
      infer Args_,
      infer _Returns
    >
      ? Args_
      : never;

  export type Returns<Ref_> =
    Ref_ extends Ref<
      infer _FunctionType,
      infer _FunctionVisibility,
      infer _Args,
      infer Returns_
    >
      ? Returns_
      : never;
}

const makeRef = <
  FunctionType extends FunctionSpec.FunctionSpec.FunctionType,
  FunctionVisibility extends FunctionSpec.FunctionSpec.FunctionVisibility,
  Args extends Schema.Schema.AnyNoContext,
  Returns extends Schema.Schema.AnyNoContext,
>(
  /**
   * This is a Convex "function name" of the format "myGroupDir/myGroupMod:myFunc".
   */
  convexFunctionName: string,
  function_: FunctionSpec.FunctionSpec<
    FunctionType,
    FunctionVisibility,
    string,
    Args,
    Returns
  >,
): Ref<FunctionType, FunctionVisibility, Args, Returns> =>
  ({
    [HiddenFunctionKey]: function_,
    [HiddenConvexFunctionNameKey]: convexFunctionName,
  }) as Ref<FunctionType, FunctionVisibility, Args, Returns>;

export const make = <Spec_ extends Spec.Spec.AnyWithProps>(
  spec: Spec_,
): Refs<Spec_> => makeHelper(spec.groups) as Refs<Spec_>;

const makeHelper = (
  groups: Record.ReadonlyRecord<string, GroupSpec.GroupSpec.Any>,
  groupPath: string | null = null,
): Refs.AnyWithProps =>
  pipe(
    groups as Record.ReadonlyRecord<string, GroupSpec.GroupSpec.AnyWithProps>,
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
