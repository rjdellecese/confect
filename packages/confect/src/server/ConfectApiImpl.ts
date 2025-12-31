import { Context, Effect, Layer } from "effect";
import type * as ConfectApi from "./ConfectApi";
import type * as ConfectApiGroupImpl from "./ConfectApiGroupImpl";

export class ConfectApiImpl extends Context.Tag(
  "@rjdellecese/confect/server/ConfectApiImpl",
)<
  ConfectApiImpl,
  {
    readonly api: ConfectApi.ConfectApi.AnyWithProps;
    readonly context: Context.Context<never>;
  }
>() {}

export const make = <ConfectApi_ extends ConfectApi.ConfectApi.AnyWithProps>(
  api_: ConfectApi_,
): Layer.Layer<
  ConfectApiImpl,
  never,
  ConfectApiGroupImpl.ConfectApiGroupImpl.FromGroups<
    ConfectApi.ConfectApi.Groups<ConfectApi_>
  >
> =>
  Layer.effect(
    ConfectApiImpl,
    Effect.map(Effect.context(), (context) => ({
      api: api_,
      context,
    })),
  );
