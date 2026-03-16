import type { DefaultFunctionArgs } from "convex/server";
import type { Schema } from "effect";
import { Data } from "effect";

export type FunctionProvenance = Data.TaggedEnum<{
  Confect: {
    args: Schema.Schema.AnyNoContext;
    returns: Schema.Schema.AnyNoContext;
  };
  Convex: {
    /** @internal */
    _args: DefaultFunctionArgs;
    /** @internal */
    _returns: any;
  };
}>;

export interface Confect<
  Args extends Schema.Schema.AnyNoContext,
  Returns extends Schema.Schema.AnyNoContext,
> {
  readonly _tag: "Confect";
  readonly args: Args;
  readonly returns: Returns;
}

export interface AnyConfect extends Confect<
  Schema.Schema.AnyNoContext,
  Schema.Schema.AnyNoContext
> {}

export interface Convex<Args extends DefaultFunctionArgs, Returns> {
  readonly _tag: "Convex";
  readonly _args: Args;
  readonly _returns: Returns;
}

export interface AnyConvex extends Convex<DefaultFunctionArgs, any> {}

export const FunctionProvenance = Data.taggedEnum<FunctionProvenance>();

export const Confect = <
  Args extends Schema.Schema.AnyNoContext,
  Returns extends Schema.Schema.AnyNoContext,
>(
  args: Args,
  returns: Returns,
) =>
  FunctionProvenance.Confect({
    args,
    returns,
  });

export const Convex = <_Args extends DefaultFunctionArgs, _Returns>() =>
  FunctionProvenance.Convex(
    {} as {
      _args: _Args;
      _returns: _Returns;
    },
  );
