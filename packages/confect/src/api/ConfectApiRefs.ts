import { pipe, Record, Schema, Types } from "effect";
import * as ConfectApiFunction from "./ConfectApiFunction";
import * as ConfectApiGroup from "./ConfectApiGroup";
import * as ConfectApiSpec from "./ConfectApiSpec";

export type ConfectApiRefs<
  Spec extends ConfectApiSpec.ConfectApiSpec.AnyWithProps,
> = Helper<ConfectApiSpec.ConfectApiSpec.Groups<Spec>>;

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
                  ConfectApiFunction.ConfectApiFunction.Args<Function>["Type"],
                  ConfectApiFunction.ConfectApiFunction.Returns<Function>["Type"]
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

const HiddenFunction = Symbol.for("@rjdellecese/confect/HiddenFunction");

type HiddenFunction = typeof HiddenFunction;

export type ConfectApiRef<
  FunctionType extends ConfectApiFunction.ConfectApiFunction.FunctionType,
  FunctionVisibility extends
    ConfectApiFunction.ConfectApiFunction.FunctionVisibility,
  Args,
  Returns,
> = {
  readonly [HiddenFunction]: ConfectApiFunction.ConfectApiFunction<
    FunctionType,
    FunctionVisibility,
    string,
    Schema.Schema<Args, unknown>,
    Schema.Schema<Returns, unknown>
  >;
};

const makeFunctionRef = <
  FunctionType extends ConfectApiFunction.ConfectApiFunction.FunctionType,
  FunctionVisibility extends
    ConfectApiFunction.ConfectApiFunction.FunctionVisibility,
  Args,
  Returns,
>(
  function_: ConfectApiFunction.ConfectApiFunction<
    FunctionType,
    FunctionVisibility,
    string,
    Schema.Schema<Args, unknown>,
    Schema.Schema<Returns, unknown>
  >
): ConfectApiRef<FunctionType, FunctionVisibility, Args, Returns> => ({
  [HiddenFunction]: function_,
});

export const make = <Spec extends ConfectApiSpec.ConfectApiSpec.AnyWithProps>(
  spec: Spec
): ConfectApiRefs<Spec> => makeHelper(spec.groups);

const makeHelper = (
  groups: Record.ReadonlyRecord<
    string,
    ConfectApiGroup.ConfectApiGroup.AnyWithProps
  >
): ConfectApiRefs.AnyWithProps =>
  pipe(
    groups,
    Record.map(
      (group) =>
        [
          group.name,
          Record.union(
            makeHelper(group.groups),
            Record.map(group.functions, makeFunctionRef),
            (_subGroup, _function) => {
              throw new Error(
                `Group and function at same level have same name ('${_function[HiddenFunction].name})'`
              );
            }
          ),
        ] as const
    )
  );
